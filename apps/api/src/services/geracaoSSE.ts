// ===========================================================================
// Fase 3C — Geração de peças com Streaming SSE integrada ao orquestrador de
// operação de IA (2F) e ao fallback Flash→Pro (3B).
//
// Fluxo (roadmap 3C):
//   estimativa → confirmação → reserva → fila → análise → RAG → redação →
//   revisão → settle → saldo atualizado
//
// O `runAiOperation` (2F) executa: payload real → classificação → estimativa →
// reserva idempotente → GERAÇÃO (callback injetado) → settle/release. Este
// serviço injeta o gerador de PRODUÇÃO que faz RAG + streaming do provedor
// (Qwen via Token Plan), emite eventos SSE tipados e devolve o uso real
// (tokens do stream) para o settle — nunca zero sem confirmação (política 3B).
// ===========================================================================

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.js';
import { runAiOperation } from './aiOperation.js';
import { deepseekClient, deepseekModel, deepseekModelPro, normalizarErroProvedor, opcoesQwen } from './ai.js';
import { generateEmbedding } from './embedding.js';
import { buscarChunksPorEmbedding, buscarChunksPorKeywords } from './documento.js';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import type { ClassifierOutput } from './classifier.js';
import { ErroGeracaoIA } from './analiseDocumental.js';
import { buscarJurisprudenciaSeNecessario, anexarBlocoAoContexto, montarEventoJurisprudencia, type ResultadoJurisprudencia } from './jurisprudenciaRag.js';

// ---------------------------------------------------------------------------
// Eventos SSE (tipados e estáveis)
// ---------------------------------------------------------------------------

export type EventoSSE =
  | { type: 'progresso'; progresso: number; label: string }
  | { type: 'texto'; delta: string }
  | { type: 'operacao'; operationId: string | null; status: string }
  | { type: 'concluido'; operationId: string | null; modeloUsado: string | null; tokens: { in: number; out: number }; saldo: { credits: number | null; reserveCents: number | null } }
  | { type: 'erro'; code: string; reason: string; reconciliacao?: boolean }
  // Fase 6B — aviso estruturado de jurisprudência (fallback/cache/ao vivo).
  | { type: 'jurisprudencia'; status: string; aviso: string; decisoesUsadas: number; tribunais: string[]; fromCache: boolean };

/** Escreve um evento SSE (data: JSON). Exportado para testes validarem a
 *  serialização do protocolo real. */
export function emitir(res: Response, evento: EventoSSE): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(evento)}\n\n`);
}

/** Fase 6B — emite o evento `jurisprudencia` estruturado (status + aviso). */
export function emitirJurisprudencia(res: Response, resultado: ResultadoJurisprudencia): void {
  emitir(res, { type: 'jurisprudencia', ...montarEventoJurisprudencia(resultado) });
}

/**
 * Fase 6B — monta o `sub_operations` persistido na operação: texto gerado +
 * metadados estruturados da jurisprudência (status, aviso, decisões, tribunais,
 * origem cache) — rastreável pela operationId, sem termos/conteúdo sensível.
 */
export function montarSubOperacoesJurisprudencia(texto: string, modelo: string, jurisprudencia: ResultadoJurisprudencia): unknown[] {
  return [
    { tipo: 'texto-gerado', texto, modelo },
    { tipo: 'jurisprudencia', ...montarEventoJurisprudencia(jurisprudencia) },
  ];
}

/** Fase 6B — persiste o conteúdo gerado + metadados de jurisprudência na
 *  operação (replay idempotente). Retorna false se a operação não existe. */
export async function persistirSubOperacoes(operationId: string, subOps: unknown[]): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE ai_operations
    SET sub_operations = ${JSON.stringify(subOps)}::jsonb,
        updated_at = now()
    WHERE id = ${operationId}
    RETURNING id
  `) as any[];
  return Array.isArray(res) && res.length > 0;
}

/** Saldo atual do escritório (créditos + reserva em uso). */
async function saldoDoEscritorio(escritorioId: string): Promise<{ credits: number | null; reserveCents: number | null }> {
  try {
    const rows = (await db.execute(sql`
      SELECT credits_available, reserve_cents_used FROM escritorios WHERE id = ${escritorioId} LIMIT 1
    `)) as any[];
    return {
      credits: rows[0] ? Number(rows[0].credits_available) : null,
      reserveCents: rows[0] ? Number(rows[0].reserve_cents_used) : null,
    };
  } catch {
    return { credits: null, reserveCents: null };
  }
}

/** Modelo concreto por tier (mesma fonte do ai.ts). */
function modeloPorTier(tier: 'FLASH' | 'PRO'): string {
  return tier === 'PRO' ? deepseekModelPro : deepseekModel;
}

/** Monta o prompt de redação com o contexto RAG do escritório e o TAMANHO
 *  de saída solicitado (outputSize): SHORT = resumo/requerimento objetivo,
 *  STANDARD = peça completa, COMPLETE = peça extensa. Mantém coerência com a
 *  estimativa/reserva da operação (o orquestrador reserva créditos pelo volume
 *  classificado; o max_tokens da chamada reflete o outputSize). Exportado para
 *  testes validarem o prompt final (inclui o bloco de jurisprudência). */
export function montarPrompt(payload: ClassifierOutput, dadosCaso: string, contexto: string, outputSize?: 'SHORT' | 'STANDARD' | 'COMPLETE'): string {
  const diretrizExtensao = outputSize === 'SHORT'
    ? 'Redija uma peça CURTA e objetiva (resumo + requerimento), sem alongar fundamentos.'
    : outputSize === 'COMPLETE'
      ? 'Redija uma peça EXTENSA e detalhada, com fundamentação completa.'
      : 'Redija uma peça completa e bem fundamentada (padrão).';
  return [
    'Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Redija a peça jurídica com altíssima qualidade técnica.',
    `Tarefa: redija a peça do tipo "${payload.operation}" (classificação ${payload.classification}).`,
    diretrizExtensao,
    'Os dados do caso são:',
    dadosCaso,
    'Contexto (Precedentes e Leis relevantes):',
    contexto,
    'DIRETRIZES:',
    '1. Fundamente pedidos e alegações exclusivamente nas leis, doutrinas e jurisprudências fornecidas no contexto.',
    '2. Não invente precedentes, números de processos ou artigos de lei que não estejam nos documentos de suporte.',
    '3. Retorne APENAS o texto da peça, sem Markdown.',
  ].join('\n');
}

/** max_tokens de SAÍDA por outputSize (alinhado aos tetos do catálogo). */
function maxTokensPorOutputSize(outputSize?: 'SHORT' | 'STANDARD' | 'COMPLETE'): number {
  if (outputSize === 'SHORT') return 1_500;
  if (outputSize === 'COMPLETE') return 6_000;
  return 3_500; // STANDARD (padrão)
}

/** Valida que o processo informado pertence ao escritório autenticado. */
async function validarProcessoDoEscritorioSSE(processoId: string, escritorioId: string): Promise<boolean> {
  try {
    const rows = (await db.execute(sql`
      SELECT id FROM processos WHERE id = ${processoId} AND escritorio_id = ${escritorioId} LIMIT 1
    `)) as any[];
    return (rows as any[]).length > 0;
  } catch {
    return false;
  }
}

/** Busca o contexto RAG do escritório (embeddings; fallback por keywords).
 *  Quando `processoId` é informado (e validado como do escritório), a
 *  recuperação é RESTRITA aos chunks desse processo — nunca amplia para o
 *  escritório inteiro indevidamente. */
async function buscarContextoRag(
  req: AuthenticatedRequest,
  escritorioId: string,
  payload: ClassifierOutput,
  dadosCaso: string,
  processoId: string | null | undefined,
  area: string | null | undefined,
  includeJurisprudence: boolean | undefined,
  res: Response,
): Promise<string> {
  // includeJurisprudence=false → SEM contexto RAG no prompt (geração autônoma).
  if (includeJurisprudence === false) return '';
  // Validação de pertencimento realizada NO INÍCIO do fluxo (gerarPecaComSSE):
  // aqui apenas aplicamos o filtro quando o processo foi validado.
  const filtroProcesso: string | null | undefined = processoId ?? null;
  try {
    const queryText = `${payload.operation} ${payload.caseContext ?? ''} ${dadosCaso}`;
    const embedding = await generateEmbedding(queryText, req.user?.id);
    let chunks = await buscarChunksPorEmbedding(escritorioId, area ?? null, embedding, 5, filtroProcesso);
    if (chunks.length === 0) {
      // Embeddings sem correspondência: cai para a busca por PALAVRAS-CHAVE
      // (mesmo escritório e processo) — nunca devolve vazio nem repete a
      // mesma busca.
      emitir(res, { type: 'progresso', progresso: 40, label: 'Sem correspondência vetorial — busca por palavras-chave' });
      const keywords = dadosCaso.split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
      const rows = await buscarChunksPorKeywords(escritorioId, area ?? null, keywords.length > 0 ? keywords : ['jurisprudencia'], 5, filtroProcesso);
      return rows.map((c) => c.texto).join('\n\n');
    }
    return chunks.map((c) => c.texto).join('\n\n');
  } catch {
    // Fallback por palavras-chave (embeddings indisponíveis).
    emitir(res, { type: 'progresso', progresso: 40, label: 'Embeddings indisponíveis — busca por palavras-chave' });
    const keywords = dadosCaso.split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
    const rows = await buscarChunksPorKeywords(escritorioId, area ?? null, keywords.length > 0 ? keywords : ['jurisprudencia'], 5, filtroProcesso);
    return rows.map((c) => c.texto).join('\n\n');
  }
}

// ---------------------------------------------------------------------------
// Geração SSE
// ---------------------------------------------------------------------------

export interface GeracaoSSEInput {
  pieceType?: string;
  area?: string;
  dadosCaso?: string;
  processoId?: string | null;
  outputSize?: 'SHORT' | 'STANDARD' | 'COMPLETE';
  includeJurisprudence?: boolean;
  idempotencyKey: string;
}

/**
 * Executa o fluxo completo de geração com SSE:
 *   estimativa → reserva → RAG → redação (streaming) → settle → saldo.
 * Emite eventos tipados e encerra a resposta SSE. Nunca lança para fora —
 * erros viram eventos `erro` (com `reconciliacao: true` para falhas ambíguas).
 */
/** Identifica falha ambígua (sem resposta do provedor) em rejeições lançadas
 *  de dentro do gerador/stream — sinaliza reconciliação sem expor detalhes. */
function ehFalhaAmbíguaInterna(err: unknown): boolean {
  if (err instanceof ErroGeracaoIA && err.ambigua === true) return true;
  if (err instanceof ErroGeracaoIA && err.confirmadoSemProcessamento === true) return false;
  const e = err as { status?: number; message?: string } | null;
  if (e?.status != null && e.status >= 400 && e.status < 500 && e.status !== 408) return false;
  return true; // sem evidência estruturada → ambíguo (fail-closed)
}

/** Gerador de produção injetável (testes usam stub; padrão: streaming real). */
export type GeradorSSE = NonNullable<Parameters<typeof runAiOperation>[0]['generate']>;

export async function gerarPecaComSSE(
  req: AuthenticatedRequest,
  res: Response,
  input: GeracaoSSEInput,
  generateOverride?: GeradorSSE,
): Promise<void> {
  const escritorioId = req.user?.escritorioId ?? null;

  // VALIDAÇÕES ANTES de qualquer header SSE (nunca enviamos 200 para um
  // bloqueio de tenancy — a resposta 403 é a única resposta do stream):
  //   - usuário sem escritório → 403;
  //   - processo de OUTRO escritório → 403 + auditoria (proteção 2A).
  if (!escritorioId) {
    res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    return;
  }
  if (input.processoId) {
    const pertence = await validarProcessoDoEscritorioSSE(input.processoId, escritorioId);
    if (!pertence) {
      try {
        const { recordAudit } = await import('../middlewares/audit.js');
        await recordAudit(req, 'SSE_PROCESSO_OUTRO_ESCRITORIO', {
          alvoId: input.processoId,
          detalhes: { rota: 'gerar-sse', motivo: 'processo-de-outro-escritorio' },
        });
      } catch {
        // auditoria best-effort
      }
      res.status(403).json({ error: 'Processo informado não pertence ao escritório do usuário.' });
      return;
    }
  }

  // 1. Headers SSE + controle de desconexão: se o cliente desistir, a geração
  //    remota é ABORTADA (não mantém stream faturável sem consumidor).
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const abortController = new AbortController();
  // Desconexão do consumidor SSE: `res.on('close')` na RESPOSTA é o sinal
  // confiável de que o cliente desistiu do stream (o `close` do req pode
  // ocorrer ao término do parsing do POST). Aborta a geração remota para não
  // manter stream faturável sem consumidor.
  const aoDesconectar = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };
  res.on('close', aoDesconectar);

  // 2. Fluxo completo via orquestrador (2F) com gerador de PRODUÇÃO (SSE).
  //    Nunca lança para fora: qualquer rejeição inesperada vira evento `erro`
  //    e a resposta é encerrada de forma controlada.
  let resultado: Awaited<ReturnType<typeof runAiOperation>> | undefined;
  try {
  resultado = await runAiOperation({
    user: { id: req.user!.id, role: req.user!.role, escritorioId },
    input: {
      pieceType: input.pieceType,
      area: input.area,
      dadosCaso: input.dadosCaso,
      processoId: input.processoId ?? null,
      outputSize: input.outputSize,
      includeJurisprudence: input.includeJurisprudence,
    },
    idempotencyKey: input.idempotencyKey,
    req,
    generate: generateOverride ?? (async ({ operationId, payload, modelTier }) => {
      emitir(res, { type: 'operacao', operationId, status: 'running' });
      emitir(res, { type: 'progresso', progresso: 20, label: 'Buscando jurisprudência no RAG...' });

      // RAG (escopo por escritório + processo/área quando informados e
      // validados; incluído apenas se includeJurisprudence !== false).
      const contexto = await buscarContextoRag(req, escritorioId, payload, input.dadosCaso ?? '', input.processoId ?? null, input.area, input.includeJurisprudence, res);

      // Fases 5A/5B/5C/5D — jurisprudência AO VIVO (best-effort): quando
      // includeJurisprudence está ativo e não é SECTION_REVIEW, consulta a
      // Jurisprudências.ai, respeita cache/rate limit por escritório, e anexa o
      // bloco formatado (fonte rastreável) ao contexto com separação clara do
      // RAG local. Falhas NUNCA derrubam a geração nem expõem detalhes internos.
      const jurisprudenciaAoVivo = await buscarJurisprudenciaSeNecessario({
        includeJurisprudence: input.includeJurisprudence,
        sectionReview: payload.operation === 'SECTION_REVIEW',
        area: input.area,
        fatos: input.dadosCaso ?? '',
        escritorioId,
        // Fase 6A — metadados de auditoria persistida (app_logs).
        usuarioId: req.user?.id ?? null,
        operationId,
        operation: payload.operation,
        log: (msg: string) => console.log(msg),
      });
      if (jurisprudenciaAoVivo.decisoesUsadas > 0) {
        console.log(`[jurisprudenciaRag] rastreabilidade: ${jurisprudenciaAoVivo.decisoesUsadas} decisão(ões) de ${jurisprudenciaAoVivo.tribunais.join(', ')} usadas na geração (${jurisprudenciaAoVivo.fromCache ? 'cache' : 'ao vivo'})`);
      }
      const contextoFinal = anexarBlocoAoContexto(contexto, jurisprudenciaAoVivo.bloco);

      // Fase 6B — aviso estruturado no SSE: status + motivo legível quando a
      // peça sai sem jurisprudência ao vivo (fallback/pausa/sem termos/etc.),
      // para o frontend exibir sem quebrar o contrato dos eventos existentes.
      emitirJurisprudencia(res, jurisprudenciaAoVivo);

      emitir(res, { type: 'progresso', progresso: 50, label: `Enviando para o modelo ${modeloPorTier(modelTier)}...` });

      // Streaming real do provedor (Qwen) com outputSize efetivo (prompt +
      // max_tokens).
      const prompt = montarPrompt(payload, input.dadosCaso ?? '', contextoFinal, input.outputSize);
      // Streaming com USO REAL: `stream_options.include_usage` faz o provedor
      // retornar um chunk final com `usage` (tokens reais) — a liquidação usa
      // essas métricas, NUNCA uma aproximação (Math.ceil/contagem de chunks)
      // que possa cobrar incorretamente (política 3B).
      let stream;
      try {
        stream = await deepseekClient.chat.completions.create(
          {
            model: modeloPorTier(modelTier),
            ...opcoesQwen(modeloPorTier(modelTier)),
            messages: [
              { role: 'system', content: 'Você é um advogado sênior e parecerista. Redija sem Markdown.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: maxTokensPorOutputSize(input.outputSize),
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: abortController.signal },
        );
      } catch (err) {
        // Política 3B: normaliza erros do provedor (4xx confirmado / 5xx/408
        // e rede ambíguos) — o orquestrador decide fallback, liberação ou
        // retenção da reserva conforme a confirmação.
        throw normalizarErroProvedor(err);
      }

      let tokensIn = 0;
      let tokensOut = 0;
      const deltas: string[] = [];
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          deltas.push(delta);
          emitir(res, { type: 'texto', delta });
        }
        // Chunk final (choices vazio) carrega o usage real do provedor.
        const usage = chunk.usage;
        if (usage && usage.prompt_tokens != null && usage.completion_tokens != null) {
          tokensIn = usage.prompt_tokens;
          tokensOut = usage.completion_tokens;
        }
      }
      // Sem usage real no stream (provedor não enviou) → AMBÍGUO: não
      // liquidamos com aproximação; a reserva fica retida para reconciliação.
      if (tokensIn === 0 && tokensOut === 0) {
        throw new ErroGeracaoIA('stream sem métricas de uso (usage ausente)', { ambigua: true });
      }
      // PERSISTE o conteúdo gerado (replay idempotente) ANTES da liquidação:
      // uma operação SÓ é liquidada/reportada concluída se o texto estiver
      // persistido de forma recuperável. Se a persistência FALHAR, lança erro
      // AMBÍGUO — a reserva é retida para reconciliação (nunca cobra uma peça
      // que não possa ser recuperada no replay).
      try {
        // Fase 6B — metadados da peça/operação: o status da jurisprudência é
        // persistido junto do texto gerado (rastreável pela operationId).
        const persistido = await persistirSubOperacoes(
          operationId,
          montarSubOperacoesJurisprudencia(deltas.join(''), modeloPorTier(modelTier), jurisprudenciaAoVivo),
        );
        if (!persistido) {
          throw new Error('operação não encontrada para persistência do conteúdo');
        }
      } catch (errPersist) {
        throw new ErroGeracaoIA(
          `falha ao persistir o conteúdo gerado (${errPersist instanceof Error ? errPersist.message : 'desconhecido'}); uso possivelmente processado`,
          { ambigua: true },
        );
      }
      emitir(res, { type: 'progresso', progresso: 85, label: 'Finalizando...' });
      return { modelUsed: modeloPorTier(modelTier), inputTokens: tokensIn, outputTokens: tokensOut };
    }),
  });
  } catch (err) {
    // Rejeição inesperada (banco/classificação/RAG/infra) APÓS headers SSE:
    // emite evento erro genérico (sem expor detalhes internos) e encerra.
    const ambigua = ehFalhaAmbíguaInterna(err);
    emitir(res, {
      type: 'erro',
      code: ambigua ? 'falha-ambigua-reconciliacao-pendente' : 'falha-interna',
      reason: ambigua
        ? 'Falha sem resposta do provedor; o uso pode ter sido faturado e está em reconciliação.'
        : 'Falha interna durante a geração; tente novamente.',
      reconciliacao: ambigua,
    });
    // Um ÚNICO evento terminal por falha: encerra a resposta e retorna para
    // não emitir outro `erro` no bloco final (resultado permanece undefined).
    res.end();
    return;
  } finally {
    res.removeListener('close', aoDesconectar);
  }

  // 3. Evento final: sucesso (com saldo atualizado) ou erro (com
  //    sinalização de reconciliação para falhas ambíguas).
  if (resultado?.ok) {
    // REPLAY idempotente: se a operação já estava LIQUIDADA (retry da mesma
    // chave), reemite o evento `operacao` + o texto persistido — sem
    // reexecutar nem recobrar. Protocolo SSE consistente em toda requisição.
    if (resultado.phase === 'ja-liquidado' && resultado.operationId) {
      emitir(res, { type: 'operacao', operationId: resultado.operationId, status: 'succeeded' });
      try {
        const rows = (await db.execute(sql`
          SELECT sub_operations FROM ai_operations WHERE id = ${resultado.operationId} LIMIT 1
        `)) as any[];
        const raw = rows[0]?.sub_operations;
        if (Array.isArray(raw)) {
          for (const item of raw as { tipo?: string; texto?: string }[]) {
            if (item?.tipo === 'texto-gerado' && item.texto) emitir(res, { type: 'texto', delta: item.texto });
          }
        }
      } catch {
        // replay best-effort: segue para o evento concluido
      }
    }
    const saldo = await saldoDoEscritorio(escritorioId);
    emitir(res, {
      type: 'concluido',
      operationId: resultado.operationId,
      modeloUsado: resultado.modelUsed,
      tokens: { in: resultado.tokensIn, out: resultado.tokensOut },
      saldo,
    });
  } else {
    const codigo = resultado ? resultado.code : 'falha-interna';
    const motivo = resultado ? resultado.reason : 'Falha interna durante a geração; tente novamente.';
    const reconciliacao =
      codigo === 'falha-ambigua-reconciliacao-pendente' ||
      codigo === 'fallback-pro-ambigua-reconciliacao-pendente' ||
      codigo === 'compensacao-pendente';
    emitir(res, { type: 'erro', code: codigo, reason: motivo, reconciliacao });
  }
  res.end();
}
