// ===========================================================================
// Fase 3A — Unidades de análise documental (design 2D).
//
// Análise documental em blocos de até 20 páginas
// (`ANALYSIS_BLOCK_SIZE_PAGES`, fonte única em @lexia/shared). Cada bloco é
// reservado, enviado à IA (operação DOCUMENT_ANALYSIS_20_PAGES — Flash, 1
// crédito/bloco), persistido e liquidado/liberado individualmente.
//
// Garantias (design 2D):
//   - blocos de 20 páginas com ordem estável (documento por created_at/nome;
//     dentro do documento por id do chunk);
//   - `pagesAlreadyAnalyzed` descontado antes do agrupamento;
//   - escopo restrito ao escritório autenticado; documentos `unscoped`
//     (quarentena) nunca entram; nenhum bloco cruza tenants;
//   - chave de idempotência derivada NO SERVIDOR por bloco:
//     analise:{escritorioId}:{processoId|'sem-processo'}:{documentoId}:
//     {paginaInicial}-{paginaFinal}:{versaoPrompt}
//   - repetição da chave reutiliza a operação (alreadyReserved), sem novo
//     débito nem novo token_usage; o resultado do bloco é persistido em
//     ai_operations.sub_operations (jsonb, coluna da Fase 2E) para retries;
//   - falhas retryable (timeout/5xx/429/rede/vazia) → até 2 tentativas com
//     backoff curto; falhas não-retryable marcam o bloco `failed` sem retry;
//   - falha parcial: um bloco `failed` NÃO cancela os demais;
//   - falha após reserva → release devolve créditos/custo; erro de release
//     NÃO é suprimido (compensação pendente);
//   - consolidação: summariesAvailable/structuredFactsAvailable = true se ≥1
//     bloco concluiu; pagesAlreadyAnalyzed = Σ páginas de blocos concluídos.
//
// Fora de escopo desta fase: SSE, frontend, rotas (Fases 3C/3D) e migrations.
// ===========================================================================

import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { ANALYSIS_BLOCK_SIZE_PAGES, OPERATION_CATALOG, type AiOperation } from '@lexia/shared';
import { db } from '../db/client.js';
import { documentos, chunks, aiOperations } from '../db/schema.js';
import {
  estimateAiOperation,
  reserveAiUsage,
  settleAiUsage,
  releaseAiUsageReservation,
  type AiEstimateResult,
} from './usage.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const VERSAO_PROMPT_ANALISE = 'analise-documental-v1';
export const OPERACAO_ANALISE: AiOperation = 'DOCUMENT_ANALYSIS_20_PAGES';

/** Mesmo valor de CHARS_POR_PAGINA usado pela estimativa do usage.ts
 *  (não exportado lá; mantido em sincronia para fallback de páginas). */
const CHARS_POR_PAGINA_ESTIMADO = 3_000;

/** Tamanho esperado da SAÍDA de um bloco de análise (resumo + fatos):
 *  ~1.200 chars de resumo + ~600 de fatos estruturados. Mantém a estimativa
 *  dentro do teto de 4.000 tokens de saída da DOCUMENT_ANALYSIS_20_PAGES. */
const CHARS_SAIDA_ANALISE = 1_800;

export const MAX_TENTATIVAS_BLOCO = 2;
export const BACKOFF_MS_DEFAULT = [1_000, 2_000];

/** Lease de execução de um bloco: operação `running`/`reserved` mais antiga
 *  que este TTL é considerada ÓRFÃ (processo morreu após reservar) e é
 *  recuperada: a chamada seguinte a retoma (mesma chave, mesma operação,
 *  sem novo débito) ou a libera se não houver gerador. */
export const LEASE_MS_DEFAULT = 10 * 60_000; // 10 minutos

/** Lease MÍNIMO aceito (ms). O heartbeat divide o lease em 3 e precisa de
 *  margem operacional REAL (timer + round-trip ao banco) para renovar antes
 *  da expiração — valores abaixo deste não são seguros. */
export const LEASE_MS_MINIMO = 500;

// ---------------------------------------------------------------------------
// Tipos (design 2D §3)
// ---------------------------------------------------------------------------

export interface Fact {
  tipo: string;
  texto: string;
}

export interface BlocoAnaliseInput {
  blocoId: string; // UUID interno (rastreio)
  escritorioId: string;
  processoId: string | null;
  documentoId: string;
  paginaInicial: number; // 1-based
  paginaFinal: number;
  texto: string;
  versaoPrompt: string;
  idempotencyKey: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** true se nem UMA página do bloco cabe no teto de entrada da operação:
   *  o bloco NÃO é liquidado nem conta páginas (análise não íntegra). */
  excedeTeto?: boolean;
}

export type StatusBloco = 'pending' | 'processing' | 'completed' | 'failed';

export interface BlocoAnaliseOutput {
  blocoId: string;
  status: StatusBloco;
  resumo: string | null;
  fatosEstruturados: Fact[] | null;
  tokensIn: number;
  tokensOut: number;
  custoCents: number;
  erro: string | null;
  tentativas: number;
  operationId: string | null;
}

export interface ContextoProcessado {
  summariesAvailable: boolean;
  structuredFactsAvailable: boolean;
  pagesAlreadyAnalyzed: number;
  pagesToAnalyze: number;
  analysisBlocks: number;
  statusPorBloco: Record<string, StatusBloco>;
}

export interface GeradorAnaliseResult {
  resumo: string;
  fatos: Fact[];
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}

export interface AnaliseDocumentalInput {
  /** Usuário autenticado (escritorioId vem do contexto, nunca do cliente). */
  user: { id: string; role: string; escritorioId: string | null } | undefined;
  /** Restrição opcional a um processo do MESMO escritório. */
  processoId?: string | null;
  /** Restrição opcional a documentos específicos (do MESMO escritório). */
  documentoIds?: string[];
  /** Versionamento de prompt (entra na chave de idempotência). */
  versaoPrompt?: string;
  /** Páginas já analisadas POR DOCUMENTO (descontadas no agrupamento). */
  pagesAlreadyAnalyzedByDoc?: Record<string, number>;
  /** Backoff entre tentativas (testes usam valores curtos). */
  backoffMs?: number[];
  /** Lease de execução por bloco (ms). Operações `running`/`reserved` mais
   *  antigas que o lease são órfãs e recuperadas pela chamada seguinte. */
  leaseMs?: number;
  /** Geração real da análise por bloco (ponto de integração; para testes).
   *  Sem gerador → falha controlada que libera a reserva. */
  gerarAnalise?: (bloco: BlocoAnaliseInput) => Promise<GeradorAnaliseResult>;
  /** Request HTTP (opcional — auditoria nas primitivas). */
  req?: Request;
}

export type AnaliseDocumentalResult =
  | { ok: true; contexto: ContextoProcessado; blocos: BlocoAnaliseOutput[]; warnings: string[] }
  | { ok: false; code: string; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Chave de idempotência por bloco, derivada NO SERVIDOR (design 2D §8).
 *  `discriminador` é usado SOMENTE para fatias de um chunk acima do teto:
 *  posição de caractere absoluta no documento, estável entre retries —
 *  garante unicidade da chave mesmo com rótulos de página repetidos. */
export function chaveIdempotenciaBloco(params: {
  escritorioId: string;
  processoId: string | null;
  documentoId: string;
  paginaInicial: number;
  paginaFinal: number;
  versaoPrompt: string;
  discriminador?: string;
}): string {
  const processo = params.processoId ?? 'sem-processo';
  const partes = [
    'analise',
    params.escritorioId,
    processo,
    params.documentoId,
    `${params.paginaInicial}-${params.paginaFinal}`,
    params.versaoPrompt,
  ];
  if (params.discriminador) partes.push(params.discriminador);
  return partes.join(':');
}

/** Fingerprint canônico do bloco: escritório + chave + TEXTO + operação.
 *  Estável entre retries legítimos da mesma análise (o texto é derivado do
 *  mesmo documento); diferente se o texto do bloco mudar. */
export function fingerprintDoBloco(
  escritorioId: string,
  idempotencyKey: string,
  texto: string,
  operation: string,
): string {
  return createHash('sha256')
    .update([escritorioId, idempotencyKey, texto, operation].join('|'))
    .digest('hex');
}

/** Classifica um erro como retryable (alinhado ao retry do orquestrador/llm). */
export function ehErroRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|terminated|fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|429|5\d\d|vazia|empty|busy/i.test(msg);
}

/** Valida o resultado da análise. Retorna motivo de invalidez (string) ou null
 *  se estruturalmente OK. Respostas vazias/truncadas/inconsistentes NÃO podem
 *  ser persistidas nem liquidadas como sucesso; tokens acima dos tetos da
 *  operação também são rejeitados (o gerador pode reportar uso inconsistente). */
export function validarResultadoGerado(r: GeradorAnaliseResult, tetos?: { maxInputTokens?: number; maxOutputTokens?: number }): string | null {
  if (!r) return 'resultado nulo';
  const resumo = (r.resumo ?? '').trim();
  if (resumo.length === 0) return 'resumo vazio';
  if (!Array.isArray(r.fatos) || r.fatos.length === 0) return 'fatos estruturados ausentes';
  const fatosInvalidos = r.fatos.some((f) => !f || typeof f.tipo !== 'string' || typeof f.texto !== 'string' || f.texto.trim().length === 0);
  if (fatosInvalidos) return 'fato com estrutura inválida';
  if (!Number.isFinite(r.tokensIn) || r.tokensIn < 0) return 'tokensIn inválido';
  if (!Number.isFinite(r.tokensOut) || r.tokensOut < 0) return 'tokensOut inválido';
  if (tetos?.maxInputTokens != null && r.tokensIn > tetos.maxInputTokens) return `tokensIn acima do teto (${r.tokensIn} > ${tetos.maxInputTokens})`;
  if (tetos?.maxOutputTokens != null && r.tokensOut > tetos.maxOutputTokens) return `tokensOut acima do teto (${r.tokensOut} > ${tetos.maxOutputTokens})`;
  if (typeof r.modelUsed !== 'string' || r.modelUsed.trim().length === 0) return 'modelUsed ausente';
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Agrupamento (puro — testável sem banco)
// ---------------------------------------------------------------------------

export interface ChunkDoDocumento {
  id: string;
  texto: string;
}

export interface DocumentoParaBlocos {
  id: string;
  nome: string | null;
  totalPages: number | null;
  /** Processo do documento (fonte canônica do servidor) — entra na chave de
   *  idempotência dos blocos. Nunca vem do input. */
  processoId: string | null;
  /** Chunks COMPLETOS do documento, em ordem estável (por id). Cada bloco
   *  agrupa chunks INTEIROS — nunca fatia o texto de um chunk, então a análise
   *  de cada bloco cobre o conteúdo integral das unidades que o compõem. */
  chunks: ChunkDoDocumento[];
}

/** Agrupa documentos em blocos de até `ANALYSIS_BLOCK_SIZE_PAGES` páginas.
 *  Ordem estável: documento por created_at/nome (chamador ordena); dentro do
 *  documento, chunks completos por id. Páginas já analisadas (por documento)
 *  são descontadas antes do agrupamento. Determinístico e SEM lacunas:
 *  - cada bloco contém chunks INTEIROS consecutivos (nunca texto parcial);
 *  - a redução por teto de tokens fecha o bloco ANTES do chunk que estouraria
 *    (o chunk segue para o próximo bloco), nunca criando buracos;
 *  - páginas por bloco são calculadas de forma CONSERVADORA (floor da fração
 *    de caracteres) e o último bloco absorve o resto: a soma dos intervalos
 *    cobre exatamente as páginas elegíveis, sem sobreposição nem omissão. */
export function agruparBlocos(params: {
  escritorioId: string;
  versaoPrompt: string;
  docs: DocumentoParaBlocos[];
  pagesAlreadyAnalyzedByDoc?: Record<string, number>;
}): BlocoAnaliseInput[] {
  const blocos: BlocoAnaliseInput[] = [];
  const policy = OPERATION_CATALOG[OPERACAO_ANALISE];
  const maxInputTokens = policy.maxInputTokens ?? 25_000;
  // Teto de CARACTERES por bloco: compensa a margem de segurança de 15% da
  // estimativa (`MARGEM_SEGURANCA_INPUT` no usage.ts). Um bloco com exatamente
  // `charsTeto` chars gera uma estimativa com margem ≤ maxInputTokens — nunca
  // sub-reserva para blocos densos nem estoura o teto na reserva.
  const charsTeto = Math.floor(maxInputTokens / 0.25 / 1.15);

  for (const doc of params.docs) {
    const chunks = (doc.chunks ?? []).filter((c) => (c.texto ?? '').length > 0);
    const totalChars = chunks.reduce((a, c) => a + c.texto.length, 0);
    const totalPages = doc.totalPages != null && doc.totalPages > 0
      ? doc.totalPages
      : Math.max(1, Math.ceil(totalChars / CHARS_POR_PAGINA_ESTIMADO));
    if (chunks.length === 0) continue;
    const charsPorPagina = Math.max(1, totalChars / totalPages);

    // Páginas já analisadas: desconto pelo OFFSET de caracteres correspondente
    // (`jaAnalisadas * charsPorPagina`). Chunks inteiramente cobertos são
    // descartados; o chunk que CRUZA a fronteira é CORTADO no offset — o
    // conteúdo já analisado nunca é reenviado nem recobrado. Cursor e rótulo
    // andam juntos (nunca um bloco "26–45" com texto das páginas 1–25).
    const jaAnalisadas = Math.max(0, params.pagesAlreadyAnalyzedByDoc?.[doc.id] ?? 0);
    const offsetCorte = jaAnalisadas * charsPorPagina;
    let cursor = 0;
    let offsetInicio = 0;
    let prefixoCortado = 0; // chars do 1º chunk restante já analisados
    for (const c of chunks) {
      if (offsetInicio + c.texto.length > offsetCorte) {
        if (offsetInicio < offsetCorte) {
          prefixoCortado = Math.floor(offsetCorte - offsetInicio);
        }
        break;
      }
      offsetInicio += c.texto.length;
      cursor += 1;
    }
    if (cursor >= chunks.length) continue;
    if (prefixoCortado > 0) {
      offsetInicio += prefixoCortado; // rótulo acompanha o corte (página real)
    }
    const primeiroRestante = chunks[cursor];
    const chunksRestantes = prefixoCortado > 0
      ? [{ ...primeiroRestante, texto: primeiroRestante.texto.slice(prefixoCortado) }, ...chunks.slice(cursor + 1)]
      : chunks.slice(cursor);

    // Cada bloco cobre um intervalo de caracteres [offsetInicio, offsetFim):
    // o rótulo de páginas É derivado da MESMA posição de caracteres do texto
    // enviado — correspondência exata entre rótulo e conteúdo. O rótulo é
    // MONOTÔNICO e contíguo: o bloco seguinte começa na página imediatamente
    // posterior à do bloco anterior (nunca retrocede nem sobrepõe).
    let proximaPagina = Math.floor(offsetInicio / charsPorPagina) + 1;
    cursor = 0;
    while (cursor < chunksRestantes.length) {
      const paginaInicial = proximaPagina;
      const limiteChars = Math.min(charsTeto, charsPorPagina * ANALYSIS_BLOCK_SIZE_PAGES);

      // a) Chunk ÚNICO que excede o limite do bloco (20 páginas OU teto de
      //    tokens): divide o chunk em sub-blocos de `limiteChars` caracteres —
      //    cada sub-bloco cabe no teto de tokens E em ≤20 páginas (fatias por
      //    caracteres, rótulo derivado da MESMA métrica → correspondência
      //    exata). NUNCA descarta conteúdo: todo o chunk vira blocos, sem
      //    lacunas nem omissão de páginas — inclusive chunks curtos em páginas
      //    mas longos em tokens (texto denso).
      const chunkAtual = chunksRestantes[cursor];
      if (chunkAtual.texto.length > limiteChars) {
        const charsPorBloco = Math.max(1, Math.floor(Math.min(charsTeto, charsPorPagina * ANALYSIS_BLOCK_SIZE_PAGES)));
        let dentro = 0;
        while (dentro < chunkAtual.texto.length) {
          const slice = chunkAtual.texto.slice(dentro, dentro + charsPorBloco);
          if (slice.length === 0) break;
          // Rótulo MONOTÔNICO e contíguo (mesmo padrão do caso b): o slice
          // começa na página seguinte à do bloco anterior e nunca retrocede.
          // pIni e pFim LIMITADOS a totalPages: nunca inventa páginas que não
          // existem no documento (ex.: doc de 1 página → fatias 1-1, 1-1, 1-1,
          // nunca 2-2/3-3 nem intervalos inválidos como 2-1).
          const pIni = Math.min(proximaPagina, totalPages);
          const offsetSliceFim = offsetInicio + dentro + slice.length;
          const pFim = Math.min(
            totalPages,
            Math.max(pIni, Math.min(pIni + ANALYSIS_BLOCK_SIZE_PAGES - 1, Math.floor((offsetSliceFim - 1) / charsPorPagina) + 1)),
          );
          // Discriminador de fatia: posição de CARACTERE absoluta no documento
          // (estável entre retries). Garante chave de idempotência ÚNICA mesmo
          // quando várias fatias compartilham o mesmo rótulo de página (doc
          // denso com mais conteúdo que páginas declaradas).
          const idempotencyKey = chaveIdempotenciaBloco({
            escritorioId: params.escritorioId,
            processoId: doc.processoId ?? null,
            documentoId: doc.id,
            paginaInicial: pIni,
            paginaFinal: pFim,
            versaoPrompt: params.versaoPrompt,
            discriminador: `o${offsetInicio + dentro}`,
          });
          blocos.push({
            blocoId: randomUUID(),
            escritorioId: params.escritorioId,
            processoId: doc.processoId ?? null,
            documentoId: doc.id,
            paginaInicial: pIni,
            paginaFinal: pFim,
            texto: slice,
            versaoPrompt: params.versaoPrompt,
            idempotencyKey,
            maxInputTokens,
            maxOutputTokens: policy.maxOutputTokens ?? 4_000,
            excedeTeto: false,
          });
          dentro += charsPorBloco;
          proximaPagina = Math.min(pFim + 1, totalPages);
        }
        offsetInicio += chunkAtual.texto.length;
        cursor += 1;
        continue;
      }

      // b) Caso comum: acumula chunks INTEIROS até o limite (teto de tokens
      //    OU 20 páginas). Chunk que excede o teto de TOKENS sozinho →
      //    excedeTeto (irredutível: nem 1 página cabe; bloco failed).
      let charsBloco = 0;
      let j = cursor;
      let excedeTeto = false;
      // O limite considera o texto + separadores `\n\n` (2 chars por junção
      // entre chunks) — o prompt enviado nunca ultrapassa o teto de tokens.
      for (; j < chunksRestantes.length; j++) {
        const c = chunksRestantes[j];
        const acrescimo = (j > cursor ? 2 : 0) + c.texto.length;
        if (charsBloco + acrescimo > limiteChars && charsBloco > 0) break;
        if (charsBloco + acrescimo > limiteChars && charsBloco === 0) {
          excedeTeto = true;
          j += 1;
          break;
        }
        charsBloco += acrescimo;
      }

      const offsetFim = offsetInicio + (charsBloco > 0 ? charsBloco : chunksRestantes[cursor].texto.length);
      // Rótulo final: derivado do conteúdo real, mas nunca retrocede além da
      // página inicial monotônica E nunca ultrapassa 20 páginas por bloco
      // (garante contiguidade e o teto de páginas da operação — inclusive no
      // caso excedeTeto, em que o rótulo é limitado e o bloco fica failed).
      const paginaFinal = Math.min(
        paginaInicial + ANALYSIS_BLOCK_SIZE_PAGES - 1,
        totalPages,
        Math.max(paginaInicial, Math.floor((offsetFim - 1) / charsPorPagina) + 1),
      );
      const textoBloco = chunksRestantes.slice(cursor, j).map((c) => c.texto).join('\n\n');

      const idempotencyKey = chaveIdempotenciaBloco({
        escritorioId: params.escritorioId,
        processoId: doc.processoId ?? null,
        documentoId: doc.id,
        paginaInicial,
        paginaFinal,
        versaoPrompt: params.versaoPrompt,
      });

      blocos.push({
        blocoId: randomUUID(),
        escritorioId: params.escritorioId,
        processoId: doc.processoId ?? null,
        documentoId: doc.id,
        paginaInicial,
        paginaFinal,
        texto: textoBloco,
        versaoPrompt: params.versaoPrompt,
        idempotencyKey,
        maxInputTokens,
        maxOutputTokens: policy.maxOutputTokens ?? 4_000,
        excedeTeto,
      });

      offsetInicio = offsetFim;
      cursor = j;
      proximaPagina = paginaFinal + 1;
    }

  }
  return blocos;
}

// ---------------------------------------------------------------------------
// Orquestrador principal
// ---------------------------------------------------------------------------

// Total de caracteres dos chunks de um documento (para fallback de páginas).
function charsDoDocumento(d: DocumentoParaBlocos): number {
  return (d.chunks ?? []).reduce((a, c) => a + (c.texto ?? '').length, 0);
}

// Páginas do documento (total_pages ou fallback por caracteres).
function totalPaginasDoDocumento(d: DocumentoParaBlocos): number {
  const totalPages = d.totalPages;
  if (totalPages != null && totalPages > 0) return totalPages;
  return Math.max(1, Math.ceil(charsDoDocumento(d) / CHARS_POR_PAGINA_ESTIMADO));
}

export async function analisarDocumentos(input: AnaliseDocumentalInput): Promise<AnaliseDocumentalResult> {
  const escritorioId = input.user?.escritorioId ?? null;
  if (!escritorioId) {
    return { ok: false, code: 'sem-escritorio', reason: 'Usuário sem escritório vinculado.' };
  }
  const versaoPrompt = input.versaoPrompt ?? VERSAO_PROMPT_ANALISE;
  const backoffMs = input.backoffMs ?? BACKOFF_MS_DEFAULT;
  const leaseMs = Math.max(LEASE_MS_MINIMO, input.leaseMs ?? LEASE_MS_DEFAULT);
  const warnings: string[] = [];

  // 1. Documentos elegíveis: escritório autenticado, fora da quarentena
  //    (indexed_status <> 'unscoped'), opcionalmente restritos ao processo.
  const conds: ReturnType<typeof and>[] = [
    eq(documentos.escritorioId, escritorioId),
    sql`${documentos.indexedStatus} <> 'unscoped'`,
  ];
  if (input.processoId) conds.push(eq(documentos.processoId, input.processoId));
  if (input.documentoIds && input.documentoIds.length > 0) {
    conds.push(inArray(documentos.id, input.documentoIds));
  }

  const docRows = await db.select({
    id: documentos.id,
    nome: documentos.nome,
    totalPages: documentos.totalPages,
    createdAt: documentos.createdAt,
    processoId: documentos.processoId,
  }).from(documentos).where(and(...conds)).orderBy(documentos.createdAt, documentos.nome, documentos.id);

  if (docRows.length === 0) {
    warnings.push('Nenhum documento elegível no escritório para análise documental.');
    return {
      ok: true,
      contexto: {
        summariesAvailable: false,
        structuredFactsAvailable: false,
        pagesAlreadyAnalyzed: 0,
        pagesToAnalyze: 0,
        analysisBlocks: 0,
        statusPorBloco: {},
      },
      blocos: [],
      warnings,
    };
  }

  // 2. Chunks COMPLETOS por documento (do MESMO escritório, ordem por id).
  const docsComTexto: DocumentoParaBlocos[] = [];
  for (const doc of docRows) {
    const chunkRows = await db.select({ id: chunks.id, texto: chunks.texto }).from(chunks)
      .where(and(eq(chunks.escritorioId, escritorioId), eq(chunks.documentoId, doc.id)))
      .orderBy(chunks.id);
    docsComTexto.push({
      id: doc.id,
      nome: doc.nome,
      totalPages: doc.totalPages,
      processoId: doc.processoId ?? null,
      chunks: chunkRows.map((c) => ({ id: c.id, texto: c.texto })),
    });
  }

  // 3. Agrupamento em blocos de 20 páginas (desconta páginas já analisadas).
  // O processoId da chave de idempotência é o do DOCUMENTO (fonte canônica do
  // servidor): um documento vinculado a processo SEMPRE gera a mesma chave,
  // independente de o caller informar o processo ou não — sem dupla análise.
  const blocos = agruparBlocos({
    escritorioId,
    versaoPrompt,
    docs: docsComTexto,
    pagesAlreadyAnalyzedByDoc: input.pagesAlreadyAnalyzedByDoc,
  });

  if (blocos.length === 0) {
    // Clamp idêntico ao da consolidação principal: só docs elegíveis, limitado
    // ao total real de páginas de cada um.
    let jaAnalisadas = 0;
    let tot = 0;
    let docsComTextoVazio = 0;
    for (const d of docsComTexto) {
      const total = totalPaginasDoDocumento(d);
      const informado = Math.max(0, input.pagesAlreadyAnalyzedByDoc?.[d.id] ?? 0);
      jaAnalisadas += Math.min(informado, total);
      tot += total;
      if (charsDoDocumento(d) === 0) docsComTextoVazio += 1;
    }
    // Distingue "tudo já analisado" de "docs elegíveis SEM conteúdo analisável"
    // (o segundo NÃO reporta páginas pendentes como zero).
    if (docsComTextoVazio > 0 && jaAnalisadas < tot) {
      warnings.push(`${docsComTextoVazio} documento(s) elegível(is) sem conteúdo analisável (texto vazio); ${tot - jaAnalisadas} página(s) pendentes não podem ser analisadas.`);
    } else {
      warnings.push('Todas as páginas dos documentos elegíveis já foram analisadas.');
    }
    return {
      ok: true,
      contexto: {
        summariesAvailable: false,
        structuredFactsAvailable: false,
        pagesAlreadyAnalyzed: jaAnalisadas,
        pagesToAnalyze: Math.max(0, tot - jaAnalisadas),
        analysisBlocks: 0,
        statusPorBloco: {},
      },
      blocos: [],
      warnings,
    };
  }

  // 4. Processa cada bloco (falha parcial: um failed não cancela os demais).
  const outputs: BlocoAnaliseOutput[] = [];
  // Cobertura CONTÍGUA por documento, PRÉ-INICIALIZADA com as páginas já
  // analisadas (informado): um bloco `completed` só avança a última página
  // coberta se for CONTÍGUO ao que já estava coberto. Um bloco `failed`
  // inicial (ou intermediário) interrompe o avanço — as páginas do buraco
  // NUNCA são contadas, mesmo que um bloco posterior conclua (se o primeiro
  // bloco falhou, um bloco posterior 21-40 não "puxa" a cobertura de 1-40).
  const coberturaPorDoc = new Map<string, number>();
  for (const d of docsComTexto) {
    const total = totalPaginasDoDocumento(d);
    const informado = Math.max(0, Math.min(input.pagesAlreadyAnalyzedByDoc?.[d.id] ?? 0, total));
    coberturaPorDoc.set(d.id, informado);
  }
  let summariesOk = false;
  let factsOk = false;

  for (const bloco of blocos) {
    const resultado = await processarBloco({
      bloco,
      escritorioId,
      usuarioId: input.user?.id ?? null,
      versaoPrompt,
      backoffMs,
      leaseMs,
      gerarAnalise: input.gerarAnalise,
      req: input.req,
    });
    outputs.push(resultado);

    if (resultado.status === 'completed') {
      const anterior = coberturaPorDoc.get(bloco.documentoId) ?? 0;
      // A cobertura avança quando o bloco concluído é CONTÍGUO ao que já
      // estava coberto (pIni <= anterior + 1 — pode SOBREPOR parcialmente
      // quando o desconto por chunk inteiro começa antes da página informada,
      // ex.: informado=25 e primeiro bloco restante 16-30 → união 1-30).
      // Se o bloco começa APÓS um buraco (pIni > anterior + 1), a falha de
      // um bloco inicial/intermediário NÃO é contada.
      if (bloco.paginaInicial <= anterior + 1 && bloco.paginaFinal > anterior) {
        coberturaPorDoc.set(bloco.documentoId, Math.max(anterior, bloco.paginaFinal));
      }
      if (resultado.resumo) summariesOk = true;
      if (resultado.fatosEstruturados && resultado.fatosEstruturados.length > 0) factsOk = true;
    }
  }

  // 5. Consolidação (design 2D §3.3): páginas reais, contíguas, sem dupla
  //    contagem — o `informado` (páginas já analisadas) e a cobertura dos
  //    blocos concluídos se fundem pelo MÁXIMO contíguo por documento.
  const statusPorBloco: Record<string, StatusBloco> = {};
  for (const out of outputs) statusPorBloco[out.blocoId] = out.status;

  let jaAnalisadasTotais = 0;
  let pagesTotais = 0;
  for (const d of docsComTexto) {
    const total = totalPaginasDoDocumento(d);
    pagesTotais += total;
    const informado = Math.max(0, Math.min(input.pagesAlreadyAnalyzedByDoc?.[d.id] ?? 0, total));
    const coberto = Math.min(total, Math.max(informado, coberturaPorDoc.get(d.id) ?? 0));
    jaAnalisadasTotais += coberto;
  }
  const pagesToAnalyze = Math.max(0, pagesTotais - jaAnalisadasTotais);

  const contexto: ContextoProcessado = {
    summariesAvailable: summariesOk,
    structuredFactsAvailable: factsOk,
    pagesAlreadyAnalyzed: jaAnalisadasTotais,
    pagesToAnalyze,
    analysisBlocks: outputs.filter((o) => o.status !== 'completed').length,
    statusPorBloco,
  };

  return { ok: true, contexto, blocos: outputs, warnings };
}

// ---------------------------------------------------------------------------
// Processamento de um único bloco
// ---------------------------------------------------------------------------

async function processarBloco(params: {
  bloco: BlocoAnaliseInput;
  escritorioId: string;
  usuarioId: string | null;
  versaoPrompt: string;
  backoffMs: number[];
  leaseMs: number;
  gerarAnalise?: (bloco: BlocoAnaliseInput) => Promise<GeradorAnaliseResult>;
  req?: Request;
}): Promise<BlocoAnaliseOutput> {
  const { bloco, escritorioId, usuarioId, backoffMs, leaseMs, gerarAnalise, req } = params;

  // Bloco com texto acima do teto (nem 1 página cabe): NÃO reserva, NÃO
  // liquida, NÃO conta páginas — análise não é íntegra dentro dos limites da
  // operação; sinaliza falha explícita (o operador reduz o documento/processa
  // em lotes menores).
  if (bloco.excedeTeto) {
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: 'bloco-excede-teto-tokens: nem 1 página cabe no teto de entrada da operação',
      tentativas: 0,
      operationId: null,
    };
  }

  const fingerprint = fingerprintDoBloco(escritorioId, bloco.idempotencyKey, bloco.texto, OPERACAO_ANALISE);
  // A análise documental devolve resumo + fatos estruturados (saída CURTA),
  // não uma peça de N páginas: a estimativa de ENTRADA usa as páginas do bloco,
  // mas a de SAÍDA é limitada ao tamanho de um resumo (evita falso
  // outputOverLimit com o teto de 4.000 tokens da operação).
  // A estimativa reflete o CONTEÚDO REAL enviado ao provedor (chars do bloco),
  // não apenas as páginas declaradas — um bloco denso (muitos chars/página)
  // reserva o custo correspondente ao volume efetivo (sem sub-reserva).
  const estimate = estimateAiOperation({
    operation: OPERACAO_ANALISE,
    pagesRelevant: 0,
    annexPages: 0,
    ragContextChars: bloco.texto.length,
    expectedOutputChars: CHARS_SAIDA_ANALISE,
  });

  // 1. Reserva idempotente por (escritorio_id, idempotency_key).
  const reserve = await reserveAiUsage({
    escritorioId,
    usuarioId,
    idempotencyKey: bloco.idempotencyKey,
    idempotencyFingerprint: fingerprint,
    operation: OPERACAO_ANALISE,
    estimate,
    req,
  });
  if (!reserve.ok) {
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: reserve.reason ?? 'reserva-negada',
      tentativas: 0,
      operationId: null,
    };
  }

  const operationId = reserve.operationId ?? null;

  // 2. RETRY/CONCORRÊNCIA/RECUPERAÇÃO: operação já existente para a chave.
  if (reserve.alreadyReserved) {
    if (reserve.idempotencyFingerprint && reserve.idempotencyFingerprint !== fingerprint) {
      return {
        blocoId: bloco.blocoId,
        status: 'failed',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: 'idempotencia-conflito: a mesma chave foi usada com texto de bloco diferente',
        tentativas: 0,
        operationId,
      };
    }
    const status = reserve.status ?? 'reserved';

    // Já liquidado: reutiliza o resultado persistido (sem novo débito nem IA).
    if (status === 'succeeded') {
      const persistido = await lerResultadoDoBanco(operationId, bloco.idempotencyKey);
      return {
        blocoId: bloco.blocoId,
        status: 'completed',
        resumo: persistido.resumo,
        fatosEstruturados: persistido.fatos,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: persistido.custoCents,
        erro: null,
        tentativas: 0,
        operationId,
      };
    }

    // running OU reserved:
    //   - recente (idade < lease): outra requisição está processando a MESMA
    //     chave → reporta `processing`, nunca falha (sem colisão concorrente);
    //   - órfã (idade >= lease): o processo morreu após reservar sem liquidar
    //     nem liberar → esta chamada RETOMA a operação (mesma chave, mesma
    //     operação, sem novo débito) executando a geração normalmente.
    // A retomada é ATOMICA (UPDATE com guarda de lease): se duas requisições
    // concluem que a operação é órfã, apenas UMA vence a transição — a outra
    // vê 0 linhas afetadas e reporta `processing`.
    if (status === 'running' || status === 'reserved') {
      const token = randomUUID();
      const retomada = await retomarOrfaAtomico(operationId!, leaseMs, token);
      if (retomada.resultado === 'perdeu') {
        return {
          blocoId: bloco.blocoId,
          status: 'processing',
          resumo: null,
          fatosEstruturados: null,
          tokensIn: 0,
          tokensOut: 0,
          custoCents: 0,
          erro: null,
          tentativas: 0,
          operationId,
        };
      }
      if (retomada.resultado === 'falhou') {
        // Transição com guarda falhou por erro de banco: NÃO sabemos se a
        // operação é órfã — ela pode estar sendo processada normalmente por
        // outro executor. NUNCA compensamos (release) sem posse/estado
        // comprovados; reportamos `failed` com sinalização explícita para
        // reconciliação manual (não há crédito bloqueado indevido: a reserva
        // segue sob controle do executor legítimo ou será retomada depois).
        return {
          blocoId: bloco.blocoId,
          status: 'failed',
          resumo: null,
          fatosEstruturados: null,
          tokensIn: 0,
          tokensOut: 0,
          custoCents: 0,
          erro: 'retomada-de-orfa-indeterminada: falha de banco na transição; operação não compensada (requer reconciliação)',
          tentativas: 0,
          operationId,
        };
      }
      // venceu: lease renovado + token de posse gravado; executa a geração.
      return executarGeracao({
        bloco,
        operationId: operationId!,
        versaoPrompt: params.versaoPrompt,
        backoffMs,
        leaseMs,
        token: retomada.token,
        gerarAnalise,
        req,
      });
    }

    // failed: não reexecuta (a chave persiste; reprocessar exige versão de
    // prompt nova → chave nova).
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: `bloco-ja-reservado (status=${status})`,
      tentativas: 0,
      operationId,
    };
  }

  // 3. Reserva nova: transiciona reserva → running ANTES de gerar (fecha a
  //    janela em que uma chamada concorrente da MESMA chave veria `reserved`).
  //    A falha da transição NÃO é suprimida: sem ela a operação fica órfã sem
  //    registro; sinaliza compensação e libera a reserva.
  const tokenNovo = randomUUID();
  const runningOk = await marcarRunning(operationId!, tokenNovo);
  if (!runningOk) {
    const release = await releaseAiUsageReservation({ operationId: operationId!, reason: 'transicao-running-falhou', req });
    if (!release.ok && !release.alreadyReleased) {
      return {
        blocoId: bloco.blocoId,
        status: 'failed',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: `compensacao-pendente: transição para running falhou e release falhou (${release.reason ?? '?'})`,
        tentativas: 0,
        operationId,
      };
    }
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: 'transicao-running-falhou; reserva liberada',
      tentativas: 0,
      operationId,
    };
  }

  // 4. Execução da análise (com retry para falhas retryable).
  return executarGeracao({
    bloco,
    operationId: operationId!,
    versaoPrompt: params.versaoPrompt,
    backoffMs,
    leaseMs,
    token: tokenNovo,
    gerarAnalise,
    req,
  });
}

/** Retomada ATÔMICA de operação órfã (`running`/`reserved` além do lease):
 *  um único UPDATE com guarda condicional transiciona para `running`, renova o
 *  lease (updated_at) e grava um TOKEN DE POSSE (fencing) em lease_token
 *  (campo text livre nesta fase). Retornos:
 *   - {resultado:'venceu', token} → esta chamada retomou a operação (dona do
 *     lease; token de posse obrigatório para heartbeat/settle/release);
 *   - {resultado:'perdeu'} → outra requisição venceu (0 linhas: lease recente
 *     ou status mudou) — reportar `processing`, NUNCA executar em paralelo;
 *   - {resultado:'falhou'} → erro de banco (chamador compensa).
 * O fencing impede que um executor pausado além do lease renove o lease ou
 * liquide depois de perder a posse: renovarLease/liquidação exigem o token. */
async function retomarOrfaAtomico(
  operationId: string,
  leaseMs: number,
  token: string,
): Promise<{ resultado: 'venceu' | 'perdeu' | 'falhou'; token: string }> {
  try {
    const res = await db.execute(sql`
      UPDATE ai_operations
      SET status = 'running', updated_at = now(), lease_token = ${token}
      WHERE id = ${operationId}
        AND status IN ('running', 'reserved')
        AND (updated_at IS NULL OR updated_at < now() - make_interval(secs => ${leaseMs / 1000}))
      RETURNING id
    `) as any[];
    const afetadas = Array.isArray(res) ? res.length : 0;
    return afetadas > 0 ? { resultado: 'venceu', token } : { resultado: 'perdeu', token };
  } catch {
    return { resultado: 'falhou', token };
  }
}

/** Transiciona uma reserva NOVA para `running` (renova o lease) e grava o
 *  TOKEN DE POSSE (fencing). A transição é GUARDADA: só ocorre se a operação
 *  ainda estiver `reserved` E sem token de posse de outro executor. Se outra
 *  requisição retomou a operação (gravação de token B) enquanto este executor
 *  estava pausado, o UPDATE não afeta linhas e a chamada NÃO inicia geração —
 *  impede execução duplicada da mesma unidade em paralelo. Retorna false se a
 *  transição falhar (a falha é propagada ao chamador — nunca silenciada). */
async function marcarRunning(
  operationId: string,
  token: string,
): Promise<boolean> {
  try {
    const res = await db.execute(sql`
      UPDATE ai_operations
      SET status = 'running', updated_at = now(), lease_token = ${token}
      WHERE id = ${operationId}
        AND status = 'reserved'
        AND (lease_token IS NULL OR lease_token = ${token})
      RETURNING id
    `) as any[];
    const afetadas = Array.isArray(res) ? res.length : 0;
    return afetadas > 0;
  } catch {
    return false;
  }
}

/** HEARTBEAT de execução: renova o lease (updated_at) de uma operação em
 *  processamento SOMENTE se ainda somos o dono (fencing: lease_token =
 *  token de posse). Se outra requisição venceu a retomada, este UPDATE não
 *  afeta linhas e o executor atual NÃO renova — impedindo execução paralela.
 *  Falhas de banco são toleradas (o lease antigo só torna a operação retomável
 *  se a execução atual realmente morreu). */
async function renovarLease(operationId: string, token: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE ai_operations
      SET updated_at = now()
      WHERE id = ${operationId} AND lease_token = ${token}
    `);
  } catch {
    // tolerado — ver docstring
  }
}

/** Fencing: verifica se ainda somos o dono da operação (lease_token =
 *  token de posse). Se outra requisição venceu a retomada, o token mudou e
 *  este executor NÃO pode liquidar nem liberar a reserva. */
async function liberarSeDono(
  operationId: string,
  token: string,
  reason: string,
  req?: Request,
): Promise<{ ok: boolean; compensacaoPendente?: string }> {
  // Fencing ATÔMICO: o token é validado DENTRO do lock da operação no
  // releaseAiUsageReservation — se perdemos a posse (outro executor retomou
  // e trocou lease_token), o release retorna posse-perdida sem compensar.
  const release = await releaseAiUsageReservation({ operationId, reason, fencingToken: token, req });
  if (!release.ok && !release.alreadyReleased) {
    return { ok: false, compensacaoPendente: release.reason ?? 'release-falhou' };
  }
  return { ok: true };
}
async function souDonoDaOperacao(operationId: string, token: string): Promise<boolean> {
  try {
    const rows = (await db.execute(sql`
      SELECT lease_token FROM ai_operations WHERE id = ${operationId} LIMIT 1
    `)) as any[];
    return String(rows[0]?.lease_token ?? '') === token;
  } catch {
    return false;
  }
}

/** Inicia um heartbeat PERIÓDICO que renova o lease da operação a cada
 *  intervalo menor que `leaseMs` (fracionado para margem de segurança).
 *  Retorna função para parar o intervalo (chamada no finally da geração).
 *  Garante que uma geração longa nunca seja retomada em paralelo. */
function iniciarHeartbeatPeriodico(operationId: string, leaseMs: number, token: string): () => void {
  // Intervalo SEMPRE menor que leaseMs (fraciona em 3): para QUALQUER valor
  // aceito, o primeiro heartbeat ocorre antes da expiração — nunca há janela
  // em que uma geração viva possa ser retomada em paralelo.
  const intervaloMs = Math.max(1, Math.floor(leaseMs / 3));
  const timer = setInterval(() => {
    void renovarLease(operationId, token);
  }, intervaloMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// Execução de um bloco já reservado (reserva nova ou retomada de órfã)
// ---------------------------------------------------------------------------

async function executarGeracao(params: {
  bloco: BlocoAnaliseInput;
  operationId: string;
  versaoPrompt: string;
  backoffMs: number[];
  leaseMs: number;
  token: string;
  gerarAnalise?: (bloco: BlocoAnaliseInput) => Promise<GeradorAnaliseResult>;
  req?: Request;
}): Promise<BlocoAnaliseOutput> {
  const { bloco, operationId, backoffMs, leaseMs, token, gerarAnalise, req } = params;

  if (!gerarAnalise) {
    // Sem gerador: falha controlada que LIBERA a reserva (comportamento
    // seguro), desde que ainda sejamos o dono (fencing).
    const liberado = await liberarSeDono(operationId, token, 'gerador-nao-configurado', req);
    if (!liberado.ok) {
      return {
        blocoId: bloco.blocoId,
        status: 'failed',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: `compensacao-pendente: ${liberado.compensacaoPendente ?? 'desconhecido'}`,
        tentativas: 0,
        operationId,
      };
    }
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: 'gerador-nao-configurado; reserva liberada',
      tentativas: 0,
      operationId,
    };
  }

  let gerado: GeradorAnaliseResult | null = null;
  let ultimoErro: string | null = null;
  let tentativasUsadas = 0;
  // Heartbeat PERIÓDICO cobre TODO o ciclo de tentativas (geração + backoff):
  // o lease nunca expira entre tentativas — outra requisição não pode retomar
  // a operação durante o backoff. Verificação de posse antes de CADA chamada
  // ao gerador: se perdemos o token, abortamos sem gerar de novo.
  const pararHeartbeat = iniciarHeartbeatPeriodico(operationId, leaseMs, token);
  try {
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_BLOCO; tentativa++) {
      tentativasUsadas = tentativa;
      // Fencing por tentativa: se outra requisição venceu a retomada (troca
      // de lease_token), este executor NÃO chama o provedor — evita execução
      // duplicada da mesma chave entre retries e em retomadas concorrentes.
      // A janela residual (A já em voo ao provedor quando o lease expira e B
      // vence) não é cancelável neste modelo; o custo NUNCA duplica porque o
      // settle é idempotente por operationId (alreadySettled) e o fencing no
      // banco impede persistência/liquidação do executor que perdeu a posse.
      const aindaDono = await souDonoDaOperacao(operationId, token);
      if (!aindaDono) {
        return {
          blocoId: bloco.blocoId,
          status: 'processing',
          resumo: null,
          fatosEstruturados: null,
          tokensIn: 0,
          tokensOut: 0,
          custoCents: 0,
          erro: null,
          tentativas: tentativasUsadas,
          operationId,
        };
      }
      await renovarLease(operationId, token);
      try {
        const resultado = await gerarAnalise(bloco);
        // Resposta vazia ou estruturalmente inválida (incl. tokens acima dos
        // tetos da operação) é FALHA RETRYABLE (mesma política de "resposta
        // vazia" do retry do orquestrador).
        const invalido = validarResultadoGerado(resultado, {
          maxInputTokens: bloco.maxInputTokens,
          maxOutputTokens: bloco.maxOutputTokens,
        });
        if (invalido) {
          ultimoErro = `resposta-invalida: ${invalido}`;
          if (tentativa === MAX_TENTATIVAS_BLOCO) break;
          await sleep(backoffMs[tentativa - 1] ?? 1_000);
          continue;
        }
        gerado = resultado;
        break;
      } catch (err) {
        ultimoErro = err instanceof Error ? err.message : String(err);
        const retryable = ehErroRetryable(err);
        if (!retryable || tentativa === MAX_TENTATIVAS_BLOCO) break;
        await sleep(backoffMs[tentativa - 1] ?? 1_000);
      }
    }
  } finally {
    pararHeartbeat();
  }

  // Liquidação (sucesso) ou liberação (falha).
  if (gerado) {
    // FENCING: se perdemos a posse (outra requisição venceu a retomada e
    // gravou token próprio), NÃO liquidamos nem liberamos — a operação agora
    // pertence ao outro executor. Reportamos `processing` (estado em curso).
    const aindaDono = await souDonoDaOperacao(operationId, token);
    if (!aindaDono) {
      return {
        blocoId: bloco.blocoId,
        status: 'processing',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: null,
        tentativas: tentativasUsadas,
        operationId,
      };
    }
    // a) PERSISTE o resultado ANTES do settle: se a persistência falhar
    //    (retorno false por perda de posse OU exceção de banco), a operação
    //    NÃO é liquidada — a reserva é liberada (se ainda formos donos) e o
    //    bloco fica `failed`. Nunca há operação cobrada/succeeded sem
    //    resumo/fatos persistidos nem crédito reservado por erro não tratado.
    let persistiu = false;
    try {
      persistiu = await persistirResultadoDoBloco(
        operationId,
        bloco.idempotencyKey,
        {
          resumo: gerado.resumo,
          fatos: gerado.fatos,
          versaoPrompt: params.versaoPrompt,
          custoCents: 0, // custo real definido no settle abaixo
        },
        token,
      );
    } catch (err) {
      // Exceção de banco na persistência: libera a reserva (fencing) e
      // sinaliza compensação explícita — nenhum crédito fica reservado.
      const liberado = await liberarSeDono(operationId, token, 'persistencia-excecao', req);
      if (!liberado.ok) {
        return {
          blocoId: bloco.blocoId,
          status: 'failed',
          resumo: null,
          fatosEstruturados: null,
          tokensIn: 0,
          tokensOut: 0,
          custoCents: 0,
          erro: `compensacao-pendente: persistência lançou (${err instanceof Error ? err.message : '?'}) e liberação falhou (${liberado.compensacaoPendente ?? '?'})`,
          tentativas: tentativasUsadas,
          operationId,
        };
      }
      return {
        blocoId: bloco.blocoId,
        status: 'failed',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: `persistencia-excecao: ${err instanceof Error ? err.message : '?'}; reserva liberada`,
        tentativas: tentativasUsadas,
        operationId,
      };
    }
    if (!persistiu) {
      // Perdemos a posse entre a geração e a persistência: a operação
      // pertence a outro executor — NÃO liquidamos nem compensamos aqui
      // (ele fará settle/release). Reportamos estado em curso.
      return {
        blocoId: bloco.blocoId,
        status: 'processing',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: null,
        tentativas: tentativasUsadas,
        operationId,
      };
    }

    const settle = await settleAiUsage({
      operationId,
      modelUsed: gerado.modelUsed,
      inputTokens: gerado.tokensIn,
      outputTokens: gerado.tokensOut,
      fencingToken: token,
      req,
    });
    if (settle.ok || settle.alreadySettled) {
      // Atualiza o custo real no resultado persistido (idempotente). Se
      // perdemos a posse nesse intervalo, o settle já validou o token no lock
      // (posse-perdida teria falhado antes); este update é best-effort.
      await persistirResultadoDoBloco(operationId, bloco.idempotencyKey, {
        resumo: gerado.resumo,
        fatos: gerado.fatos,
        versaoPrompt: params.versaoPrompt,
        custoCents: settle.costCentsActual ?? 0,
      }, token).catch(() => {});
      return {
        blocoId: bloco.blocoId,
        status: 'completed',
        resumo: gerado.resumo,
        fatosEstruturados: gerado.fatos,
        tokensIn: gerado.tokensIn,
        tokensOut: gerado.tokensOut,
        custoCents: settle.costCentsActual ?? 0,
        erro: null,
        tentativas: tentativasUsadas,
        operationId,
      };
    }
    // Falha no settle: tenta liberar SEM suprimir erro de liberação, desde
    // que ainda sejamos o dono (fencing).
    const liberado = await liberarSeDono(operationId, token, 'settle-falhou', req);
    if (!liberado.ok) {
      return {
        blocoId: bloco.blocoId,
        status: 'failed',
        resumo: null,
        fatosEstruturados: null,
        tokensIn: 0,
        tokensOut: 0,
        custoCents: 0,
        erro: `compensacao-pendente: settle falhou (${settle.reason ?? '?'}) e liberação falhou (${liberado.compensacaoPendente ?? '?'})`,
        tentativas: tentativasUsadas,
        operationId,
      };
    }
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: settle.reason ?? 'settle-falhou',
      tentativas: tentativasUsadas,
      operationId,
    };
  }

  // Falha de geração (após retries ou não-retryable) → libera a reserva,
  // desde que ainda sejamos o dono (fencing).
  const liberado = await liberarSeDono(operationId, token, 'analise-falhou', req);
  if (!liberado.ok) {
    return {
      blocoId: bloco.blocoId,
      status: 'failed',
      resumo: null,
      fatosEstruturados: null,
      tokensIn: 0,
      tokensOut: 0,
      custoCents: 0,
      erro: `compensacao-pendente: ${liberado.compensacaoPendente ?? 'desconhecido'}`,
      tentativas: tentativasUsadas,
      operationId,
    };
  }
  return {
    blocoId: bloco.blocoId,
    status: 'failed',
    resumo: null,
    fatosEstruturados: null,
    tokensIn: 0,
    tokensOut: 0,
    custoCents: 0,
    erro: ultimoErro ?? 'analise-falhou; reserva liberada',
    tentativas: tentativasUsadas,
    operationId,
  };
}

// ---------------------------------------------------------------------------
// Persistência do resultado do bloco (ai_operations.sub_operations — coluna 2E)
// ---------------------------------------------------------------------------

interface ResultadoBlocoPersistido {
  chave: string; // idempotencyKey do bloco (estável entre retries)
  resumo: string | null;
  fatos: Fact[] | null;
  versaoPrompt: string;
  custoCents: number;
}

/** Persiste o resultado do bloco com FENCING ATÔMICO: o UPDATE só ocorre se
 *  lease_token ainda for o token de posse (ninguém retomou a operação no
 *  meio). Retorna true se persistiu; false se perdemos a posse (a operação
 *  pertence a outro executor — NÃO sobrescrevemos sub_operations). */
async function persistirResultadoDoBloco(
  operationId: string,
  chave: string,
  resultado: Omit<ResultadoBlocoPersistido, 'chave'>,
  token: string,
): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE ai_operations
    SET sub_operations = ${JSON.stringify([{ chave, ...resultado }])}::jsonb,
        prompt_version = ${resultado.versaoPrompt},
        updated_at = now()
    WHERE id = ${operationId} AND lease_token = ${token}
    RETURNING id
  `) as any[];
  const afetadas = Array.isArray(res) ? res.length : 0;
  return afetadas > 0;
}

async function lerResultadoDoBanco(
  operationId: string | null,
  chave: string,
): Promise<{ resumo: string | null; fatos: Fact[] | null; custoCents: number }> {
  if (!operationId) return { resumo: null, fatos: null, custoCents: 0 };
  const rows = (await db.execute(sql`
    SELECT sub_operations, cost_cents_actual FROM ai_operations WHERE id = ${operationId} LIMIT 1
  `)) as any[];
  const raw = rows[0]?.sub_operations;
  // Fonte da verdade financeira: cost_cents_actual da OPERAÇÃO (liquidada).
  // O valor persistido no item é apenas fallback (ex.: custo ainda não
  // atualizado em reexecuções raras); nunca reporta 0 quando houve settle.
  const custoCents = Number(rows[0]?.cost_cents_actual ?? 0);
  if (Array.isArray(raw)) {
    const item = (raw as ResultadoBlocoPersistido[]).find((r) => r.chave === chave);
    if (item) return { resumo: item.resumo ?? null, fatos: item.fatos ?? null, custoCents };
  }
  return { resumo: null, fatos: null, custoCents };
}

// Mantém o tipo da estimativa disponível para o caller (sem uso direto aqui).
export type { AiEstimateResult };
