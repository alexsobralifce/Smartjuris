// ===========================================================================
// Fase 2C — Builder do payload real (input do classificador).
//
// Monta o input do classificador (services/classifier.ts) usando dados
// autenticados e do banco. O cliente pode enviar APENAS:
//   - pieceType/tipo, area, dadosCaso, processoId, includeJurisprudence,
//     outputSize, idempotencyKey.
// O backend DERIVA do contexto autenticado + banco: escritório, usuário, plano,
// saldo, processo, número real, documentos, páginas, indexação, RAG, limites e
// modelo.
//
// NUNCA aceita do cliente: créditos, custo, modelo, páginas, limites,
// escritório, número real do processo ou permissões. Campos indisponíveis são
// deixados nulos ou com warning — nunca inventados.
//
// Esta fase NÃO conecta à geração, reserva, SSE ou frontend: é um serviço puro
// que retorna o payload (e um relatório de derivação) para a camada que fará a
// classificação/reserva.
// ===========================================================================

import { z } from 'zod';
import { db } from '../db/client.js';
import { escritorios, processos, documentos, chunks, usuarios } from '../db/schema.js';
import { and, eq, sql, count } from 'drizzle-orm';
import {
  planoDoEscritorio,
  PLANS,
  cicloAtual,
} from './usage.js';
import type { ClassifierInput } from './classifier.js';
import { ANALYSIS_BLOCK_SIZE_PAGES } from '@lexia/shared';

// ---------------------------------------------------------------------------
// Schema de entrada restrito — únicos campos que o FRONTEND pode enviar.
// Tudo o mais é derivado no backend (nunca aceito do cliente).
// ---------------------------------------------------------------------------
export const builderInputSchema = z.object({
  pieceType: z.string().trim().max(200).optional(),
  area: z.string().trim().max(100).optional(),
  dadosCaso: z.string().trim().max(50_000).optional(),
  processoId: z.string().uuid().optional().nullable(),
  includeJurisprudence: z.boolean().optional(),
  outputSize: z.enum(['SHORT', 'STANDARD', 'COMPLETE']).optional(),
  idempotencyKey: z.string().trim().max(200).optional(),
});
export type BuilderInput = z.infer<typeof builderInputSchema>;

/** Campos que o cliente NUNCA pode controlar (defesa: são ignorados se enviados). */
export const CAMPOS_PROIBIDOS_DO_CLIENTE = [
  'credits', 'cost', 'model', 'modelTier', 'pages', 'maxPages', 'limits',
  'escritorioId', 'workspaceId', 'processNumber', 'numero', 'permissions',
  'planCode', 'creditsAvailable', 'maxInputTokens', 'maxOutputTokens',
] as const;

// ---------------------------------------------------------------------------
// Resultado da derivação
// ---------------------------------------------------------------------------

export type PayloadDerivation =
  | { ok: true; payload: ClassifierInput; warnings: string[]; derived: Record<string, string> }
  | { ok: false; reason: string; code: string };

export interface BuildPayloadInput {
  /** Usuário autenticado (escritorioId vem do JWT, nunca do cliente). */
  user: { id: string; role: string; escritorioId: string | null } | undefined;
  /** Input restrito do cliente (validado em runtime dentro do builder). */
  input: BuilderInput | Record<string, unknown>;
  /** Injetável para testes (padrão: agora). */
  now?: () => Date;
}

/** Extrai `dadosCaso`/narrativa (fonte: input do cliente — não é dado crítico). */
function narrativaDoCliente(input: BuilderInput): string {
  return input.dadosCaso?.trim() ?? '';
}

/** Conversão best-effort de valores monetários textuais → centavos.
 *  Suporta formato brasileiro (`R$ 87.500,00` → 8_750_000) e internacional
 *  (`87500.50` → 8_750_050), distinguindo milhares do separador decimal.
 *  Retorna null quando não-parseável (nunca inventa). */
export function valorParaCentavos(valor: string | null | undefined): number | null {
  if (!valor) return null;
  let s = String(valor).trim();
  if (!s) return null;
  // Remove símbolos e mantém apenas dígitos, vírgula, ponto e sinal.
  s = s.replace(/[^\d,.-]/g, '');
  if (!s || s === '-' || s === '.') return null;

  const temVirgula = s.includes(',');
  if (temVirgula) {
    // Formato brasileiro: vírgula = separador decimal; pontos = milhares.
    const [inteiro, decimalRaw] = s.split(',');
    const inteiroLimpo = (inteiro ?? '').replace(/\./g, '') || '0';
    const decimalLimpo = (decimalRaw ?? '').replace(/\./g, '').slice(0, 2).padEnd(2, '0');
    const num = Number(`${inteiroLimpo}.${decimalLimpo}`);
    return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : null;
  }

  // Sem vírgula: ponto pode ser decimal (internacional) ou milhar (BR).
  const partes = s.split('.');
  const ehDecimalInternacional = partes.length === 2 && partes[1].length > 0 && partes[1].length <= 2;
  if (ehDecimalInternacional) {
    const num = Number(s);
    return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : null;
  }
  // Milhar brasileiro (ex.: "87.500") ou número inteiro puro.
  const inteiroLimpo = s.replace(/\./g, '');
  const num = Number(inteiroLimpo);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : null;
}

/**
 * Monta o input do classificador derivando tudo de dados autenticados/banco.
 *
 * Regras de segurança:
 *  - escritório, plano, saldo, processo e limites vêm do BANCO + JWT;
 *  - processo (se enviado) é filtrado por `escritorio_id` — de outro escritório
 *    ou inexistente → rejeitado;
 *  - documentos SEM escopo (quarentena `unscoped`) são excluídos das contagens;
 *  - campos indisponíveis ficam nulos + warning (nunca inventados);
 *  - idempotencyKey ausente → warning (reserva exige, mas não bloqueia a montagem).
 */
export async function buildClassifierPayload(opts: BuildPayloadInput): Promise<PayloadDerivation> {
  const { user, input: rawInput } = opts;
  const now = opts.now ?? (() => new Date());
  const warnings: string[] = [];
  const derived: Record<string, string> = {};

  // 0. Valida runtime do contrato de entrada (fail-closed): tipos/campos não
  //    confiáveis são rejeitados aqui, independente do chamador HTTP.
  const parsed = builderInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const problemas = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return { ok: false, reason: `Entrada inválida: ${problemas}`, code: 'entrada-invalida' };
  }
  const input = parsed.data;

  // 1. Escritório do CONTEXTO AUTENTICADO (nunca do cliente).
  const escritorioId = user?.escritorioId ?? null;
  if (!escritorioId) {
    return { ok: false, reason: 'Usuário sem escritório vinculado.', code: 'sem-escritorio' };
  }

  // 1.1 Valida o USUÁRIO no banco (fail-closed): existente, ativo e vinculado
  //     ao MESMO escritorioId do claim. Claims desatualizados não bastam.
  const [usr] = await db.select({
    id: usuarios.id,
    ativo: usuarios.ativo,
    escritorioId: usuarios.escritorioId,
  }).from(usuarios).where(eq(usuarios.id, user!.id)).limit(1);
  if (!usr) {
    return { ok: false, reason: 'Usuário não encontrado.', code: 'usuario-nao-encontrado' };
  }
  if (usr.ativo !== true) {
    return { ok: false, reason: 'Usuário inativo.', code: 'usuario-inativo' };
  }
  if (usr.escritorioId !== escritorioId) {
    return { ok: false, reason: 'Vínculo de usuário com o escritório inválido.', code: 'vinculo-invalido' };
  }

  // 1.2 Valida o ESCRITÓRIO no banco (fail-closed): existente e ativo.
  const [esc] = await db.select({
    id: escritorios.id,
    ativo: escritorios.ativo,
    plano: escritorios.plano,
    limiteUsuarios: escritorios.limiteUsuarios,
    creditsAvailable: escritorios.creditsAvailable,
    reserveCentsUsed: escritorios.reserveCentsUsed,
    cycleMonth: escritorios.cycleMonth,
  }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) {
    return { ok: false, reason: 'Escritório não encontrado.', code: 'escritorio-nao-encontrado' };
  }
  if (esc.ativo !== true) {
    return { ok: false, reason: 'Escritório inativo.', code: 'escritorio-inativo' };
  }

  // 2. Plano canônico (normaliza plano legado/aliases) e saldo real com rollover.
  const planCode = planoDoEscritorio(esc.plano);
  const plan = PLANS[planCode];
  const ciclo = cicloAtual(now());
  const cicloAtivo = esc.cycleMonth === ciclo;
  const creditsAvailable = cicloAtivo ? esc.creditsAvailable : plan.creditsPerCycle;
  const reserveUsed = cicloAtivo ? esc.reserveCentsUsed : 0;
  derived.planCode = planCode;
  derived.creditsAvailable = String(creditsAvailable);
  derived.cycleMonth = ciclo;

  // 3. Processo (se enviado) — filtrado por escritório.
  let processRow: typeof processos.$inferSelect | null = null;
  if (input.processoId) {
    const [row] = await db.select().from(processos)
      .where(and(eq(processos.id, input.processoId), eq(processos.escritorioId, escritorioId)))
      .limit(1);
    if (!row) {
      return { ok: false, reason: 'Processo informado não pertence ao escritório do usuário.', code: 'processo-de-outro-escritorio' };
    }
    processRow = row;
    derived.processId = processRow.id;
    if (processRow.numero) derived.processNumber = processRow.numero;
  }

  // 4. Documentos do escritório — SEM escopo (quarentena `unscoped`) excluídos.
  //    Filtro explícito por indexed_status <> 'unscoped' (defesa em profundidade,
  //    mesmo se um registro unscoped inconsistente tiver escritorio_id preenchido).
  const elegivel = and(
    eq(documentos.escritorioId, escritorioId),
    sql`${documentos.indexedStatus} <> 'unscoped'`,
  );
  const docCounts = await db
    .select({
      count: count(),
      totalPages: sql<number | null>`COALESCE(SUM(${documentos.totalPages}), 0)`,
      indexedCount: sql<number>`COUNT(*) FILTER (WHERE ${documentos.indexedStatus} = 'indexed')`,
      failedCount: sql<number>`COUNT(*) FILTER (WHERE ${documentos.indexedStatus} = 'failed')`,
      processableCount: sql<number>`COUNT(*) FILTER (WHERE ${documentos.indexedStatus} IN ('indexed','processing'))`,
    })
    .from(documentos)
    .where(elegivel)
    .limit(1);
  const docs = docCounts[0] ?? { count: 0, totalPages: 0, indexedCount: 0, failedCount: 0, processableCount: 0 };
  derived.documentCount = String(Number(docs.count ?? 0));

  // 5. RAG disponível: chunks de documentos ELEGÍVEIS do escritório. Defesa em
  //    profundidade: exige chunks.escritorioId = escritorioId E documento com
  //    escritorioId = escritorioId (rejeita chunk com escopo inconsistente) e
  //    indexedStatus <> 'unscoped'.
  const chunkRows = await db.select({ n: count() }).from(chunks)
    .innerJoin(documentos, eq(chunks.documentoId, documentos.id))
    .where(and(
      eq(chunks.escritorioId, escritorioId),
      eq(documentos.escritorioId, escritorioId),
      sql`${documentos.indexedStatus} <> 'unscoped'`,
    )).limit(1);
  const relevantChunks = Number(chunkRows[0]?.n ?? 0);

  // 6. Área canônica: com processo vinculado, a área do PROCESSO é a fonte
  //    confiável (o cliente não pode apresentar área contraditória); sem
  //    processo, usa a área informada pelo cliente (pedido autônomo).
  const legalArea = processRow?.area || input.area;

  const payload: ClassifierInput = {
    request: {
      pieceType: input.pieceType?.trim() || undefined,
      legalArea: legalArea || undefined,
      userInstruction: narrativaDoCliente(input) || undefined,
      outputSize: input.outputSize,
      includeJurisprudence: input.includeJurisprudence,
    },
    workspace: {
      planCode,
      creditsAvailable,
      aiBudgetAvailableCents: Math.max(0, plan.maxReserveCents - reserveUsed),
      maxUsers: esc.limiteUsuarios ?? undefined,
    },
    case: {
      id: processRow?.id ?? undefined,
      processNumber: processRow?.numero ?? undefined,
      caseType: processRow?.tipo ?? undefined,
      area: legalArea || undefined,
      court: processRow?.vara ?? undefined,
      status: processRow?.status ?? undefined,
      clientName: processRow?.cliente ?? undefined,
      adverseParty: processRow?.adverso ?? undefined,
      claimValueCents: valorParaCentavos(processRow?.valor) ?? undefined,
      deadline: typeof processRow?.prazo === 'string' ? processRow.prazo.slice(0, 10) : undefined,
      facts: narrativaDoCliente(input) || undefined,
    },
    documents: {
      count: Number(docs.count ?? 0),
      totalPages: Number(docs.totalPages ?? 0),
      relevantPages: Number(docs.totalPages ?? 0) || undefined,
      pagesAlreadyAnalyzed: undefined,
      estimatedInputTokens: undefined,
      indexedCount: Number(docs.indexedCount ?? 0),
      processableCount: Number(docs.processableCount ?? 0),
      failedCount: Number(docs.failedCount ?? 0),
      hasOcrRequired: Number(docs.failedCount ?? 0) > 0,
      documentTypes: undefined,
      summariesAvailable: false,
      structuredFactsAvailable: false,
    },
    rag: {
      available: relevantChunks > 0,
      relevantChunks,
      relevantSources: undefined,
      jurisprudenceResults: undefined,
      hasVerifiableSources: undefined,
      hasConflictingSources: undefined,
      retrievalConfidence: undefined,
    },
    operationPolicy: { analysisBlockSize: ANALYSIS_BLOCK_SIZE_PAGES },
  };

  // 7. Avisos de derivação.
  if (!input.idempotencyKey) warnings.push('idempotencyKey ausente: a reserva exigirá uma chave para evitar dupla cobrança.');
  if (!processRow && (input.processoId === undefined || input.processoId === null)) {
    warnings.push('Nenhum processo vinculado: payload como pedido autônomo (processNumber indisponível).');
  }
  if (!processRow?.numero) warnings.push('Número real do processo indisponível.');
  if (!legalArea) warnings.push('Área da peça não informada.');
  if (Number(docs.count ?? 0) === 0) warnings.push('Nenhum documento indexado no escritório para contexto RAG.');
  if (Number(docs.failedCount ?? 0) > 0) warnings.push('Há documentos com falha de indexação (OCR pode ser necessário).');

  return { ok: true, payload, warnings, derived };
}
