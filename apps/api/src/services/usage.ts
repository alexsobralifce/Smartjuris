import { db } from '../db/client.js';
import { tokenUsage, escritorios, usuarios, aiOperations, creditLedger } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '../middlewares/audit.js';
import type { AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request } from 'express';
import {
  OPERATION_CATALOG as SHARED_OPERATION_CATALOG,
  PLAN_LIMITS as SHARED_PLAN_LIMITS,
  PLAN_CODES as SHARED_PLAN_CODES,
  AI_OPERATIONS as SHARED_AI_OPERATIONS,
  normalizePlan,
  type PlanCode,
  type AiOperation as SharedAiOperation,
  type OperationCatalogEntry,
} from '@lexia/shared';

// ===========================================================================
// Compatibilidade preservada: isHorarioPico, trackTokenUsage, getTokenUsageMes,
// getTokenUsageMesEscritorio, TokenQuota, checkTokenQuota — assinaturas intactas.
// ===========================================================================

export function isHorarioPico(now: Date = new Date()): boolean {
  // Horário de pico: 09:00–21:00 BRT (UTC-3) => 12:00–23:59 UTC
  const h = now.getUTCHours();
  return h >= 12 && h < 24;
}

export async function trackTokenUsage(
  usuarioId: string | undefined,
  operacao: string,
  modelo: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): Promise<void> {
  if (!usuarioId) return;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  const total = prompt + completion;
  const pico = isHorarioPico();

  let custoUsd = 0;
  if (modelo.toLowerCase().includes('deepseek')) {
    const inputCost = pico
      ? Number(process.env.DEEPSEEK_INPUT_COST_PEAK ?? '0.44')
      : Number(process.env.DEEPSEEK_INPUT_COST_OFFPEAK ?? '0.22');
    const outputCost = pico
      ? Number(process.env.DEEPSEEK_OUTPUT_COST_PEAK ?? '1.32')
      : Number(process.env.DEEPSEEK_OUTPUT_COST_OFFPEAK ?? '0.66');
    custoUsd = (prompt / 1_000_000) * inputCost + (completion / 1_000_000) * outputCost;
  }

  const usdBrl = Number(process.env.USD_BRL_RATE ?? '5.00');
  const custoBrl = custoUsd * usdBrl;

  try {
    await db.insert(tokenUsage).values({
      usuarioId,
      modelo,
      operacao,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      custoUsd: custoUsd.toFixed(6),
      custoBrl: custoBrl.toFixed(6),
      horarioPico: pico,
    });
  } catch (e) {
    console.error('[Usage] Error tracking token usage:', e);
  }
}

/**
 * Total de tokens consumidos pelo usuário no mês corrente.
 */
export async function getTokenUsageMes(usuarioId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(total_tokens), 0) AS total
    FROM token_usage
    WHERE usuario_id = ${usuarioId}
      AND created_at >= date_trunc('month', now())
  `) as any[];
  return Number(rows[0]?.total ?? 0);
}

/**
 * Total de tokens consumidos por TODOS os usuários de um escritório no mês corrente.
 */
export async function getTokenUsageMesEscritorio(escritorioId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(t.total_tokens), 0) AS total
    FROM token_usage t
    JOIN usuarios u ON u.id = t.usuario_id
    WHERE u.escritorio_id = ${escritorioId}
      AND t.created_at >= date_trunc('month', now())
  `) as any[];
  return Number(rows[0]?.total ?? 0);
}

export interface TokenQuota {
  status: 'ok' | 'warn' | 'blocked';
  usado: number;
  limite: number | null;
  pct: number;
}

/**
 * Verifica a cota de tokens (créditos) do usuário no mês corrente.
 * - Limite efetivo = override individual do usuário (`usuarios.creditos_mes`)
 *   ou, na ausência, o saldo do escritório (`escritorios.limite_tokens_mes`).
 * - Aviso (warn) a partir de 80% do limite.
 * - Bloqueio (blocked) ao atingir 100%.
 * - Sem limite definido (usuário e escritório com saldo nulo) → sem restrição.
 */
export async function checkTokenQuota(req: AuthenticatedRequest): Promise<TokenQuota> {
  const usuarioId = req.user?.id;
  if (!usuarioId) return { status: 'ok', usado: 0, limite: null, pct: 0 };

  const rows = await db
    .select({
      creditosMes: usuarios.creditosMes,
      limiteTokensMes: escritorios.limiteTokensMes,
    })
    .from(usuarios)
    .innerJoin(escritorios, eq(escritorios.id, usuarios.escritorioId))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  const reg = rows[0];
  if (!reg) return { status: 'ok', usado: 0, limite: null, pct: 0 };

  const limite = reg.creditosMes != null
    ? Number(reg.creditosMes)
    : (reg.limiteTokensMes != null ? Number(reg.limiteTokensMes) : null);

  if (limite == null) return { status: 'ok', usado: 0, limite: null, pct: 0 };
  if (limite <= 0) return { status: 'blocked', usado: 0, limite, pct: 100 };

  const usado = await getTokenUsageMes(usuarioId);
  const pct = Math.round((usado / limite) * 100);

  if (pct >= 100) return { status: 'blocked', usado, limite, pct };
  if (pct >= 80) return { status: 'warn', usado, limite, pct };
  return { status: 'ok', usado, limite, pct };
}

// ===========================================================================
// Camada de créditos e controle financeiro (centavos inteiros)
// ===========================================================================

const CENTS_POR_DOLAR = 100;
const CHARS_POR_PAGINA = 3_000;
const TOKENS_POR_CHAR = 0.25;
const MARGEM_SEGURANCA_INPUT = 0.15;

export type ModeloTier = 'flash' | 'pro';

export interface PrecoModelo {
  inputCentsPerM: number;   // USD cents por 1M de tokens de entrada
  outputCentsPerM: number;  // USD cents por 1M de tokens de saída
}

export interface TabelaPrecos {
  flash: { peak: PrecoModelo; offPeak: PrecoModelo };
  pro: { peak: PrecoModelo; offPeak: PrecoModelo };
}

/**
 * Preços centralizados (env com defaults). Flash: preços atuais do sistema;
 * Pro: 3x Flash (default). Tudo convertido para centavos de dólar (integer).
 */
export function loadPricing(env: NodeJS.ProcessEnv = process.env): TabelaPrecos {
  const usdCents = (v: string | undefined, padrao: number): number =>
    Math.round(Number(v ?? padrao) * CENTS_POR_DOLAR);
  return {
    flash: {
      peak: {
        inputCentsPerM: usdCents(env.DEEPSEEK_INPUT_COST_PEAK, 0.44),
        outputCentsPerM: usdCents(env.DEEPSEEK_OUTPUT_COST_PEAK, 1.32),
      },
      offPeak: {
        inputCentsPerM: usdCents(env.DEEPSEEK_INPUT_COST_OFFPEAK, 0.22),
        outputCentsPerM: usdCents(env.DEEPSEEK_OUTPUT_COST_OFFPEAK, 0.66),
      },
    },
    pro: {
      peak: {
        inputCentsPerM: usdCents(env.DEEPSEEK_PRO_INPUT_COST_PEAK, 1.32),
        outputCentsPerM: usdCents(env.DEEPSEEK_PRO_OUTPUT_COST_PEAK, 3.96),
      },
      offPeak: {
        inputCentsPerM: usdCents(env.DEEPSEEK_PRO_INPUT_COST_OFFPEAK, 0.66),
        outputCentsPerM: usdCents(env.DEEPSEEK_PRO_OUTPUT_COST_OFFPEAK, 1.98),
      },
    },
  };
}

export function precoDoModelo(model: string, isPeak: boolean, env: NodeJS.ProcessEnv = process.env): PrecoModelo {
  const pricing = loadPricing(env);
  const tier: ModeloTier = model.toLowerCase().includes('pro') ? 'pro' : 'flash';
  return isPeak ? pricing[tier].peak : pricing[tier].offPeak;
}

export interface AiCostInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  isPeak: boolean;
}

export interface AiCostResult {
  inputCostCents: number;
  outputCostCents: number;
  usdCents: number;
  brlCents: number;
}

function calcularCustoCentavos(input: AiCostInput, arredondar: 'ceil' | 'nearest'): AiCostResult {
  const price = precoDoModelo(input.model, input.isPeak);
  const arredondarPor = (raw: number): number => (arredondar === 'ceil' ? Math.ceil(raw) : Math.round(raw));
  const inputCostCents = arredondarPor((Math.max(0, input.inputTokens) * price.inputCentsPerM) / 1_000_000);
  const outputCostCents = arredondarPor((Math.max(0, input.outputTokens) * price.outputCentsPerM) / 1_000_000);
  const usdCents = inputCostCents + outputCostCents;
  const usdBrl = Number(process.env.USD_BRL_RATE ?? '5.00');
  const brlCents = arredondarPor(usdCents * usdBrl);
  return { inputCostCents, outputCostCents, usdCents, brlCents };
}

/**
 * Custo estimado para RESERVA: arredonda sempre para cima no nível do centavo.
 */
export function calculateAiCostCents(input: AiCostInput): AiCostResult {
  return calcularCustoCentavos(input, 'ceil');
}

/**
 * Custo REAL para LIQUIDAÇÃO: arredonda para o centavo mais próximo.
 */
export function calculateAiSettlementCents(input: AiCostInput): AiCostResult {
  return calcularCustoCentavos(input, 'nearest');
}

// ---------------------------------------------------------------------------
// Catálogo de operações de IA
// ---------------------------------------------------------------------------

export type AiOperationType =
  | 'SIMPLE_PETITION'
  | 'SECTION_REVIEW'
  | 'STANDARD_PETITION'
  | 'DOCUMENT_ANALYSIS_20_PAGES'
  | 'JURISPRUDENCE_RESEARCH'
  | 'APPEAL'
  | 'COMPLEX_DOCUMENT';

export interface OperationLimits {
  model: ModeloTier;
  credits: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxOutputPages: number;
  maxAnnexPages: number;
}

export const OPERATION_LIMITS: Record<AiOperationType, OperationLimits> = Object.fromEntries(
  SHARED_AI_OPERATIONS.map((operation: SharedAiOperation) => [
    operation,
    toOperationLimits(SHARED_OPERATION_CATALOG[operation]),
  ]),
) as Record<AiOperationType, OperationLimits>;

/** Adapta a fonte única (@lexia/shared, contrato 2B) para a forma interna. */
function toOperationLimits(entry: OperationCatalogEntry): OperationLimits {
  return {
    model: entry.model.toLowerCase() as ModeloTier,
    credits: entry.credits,
    maxInputTokens: entry.maxInputTokens ?? 0,
    maxOutputTokens: entry.maxOutputTokens ?? 0,
    maxOutputPages: entry.maxOutputPages ?? 0,
    maxAnnexPages: entry.maxAttachmentPages ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

export type PlanTier = PlanCode;

export interface PlanConfig {
  creditsPerCycle: number;
  maxReserveCents: number;
  maxOpCostCents: number;
}

/** Planos derivados da FONTE ÚNICA (@lexia/shared, contrato 2B).
 *  Construídos A PARTIR de SHARED_PLAN_CODES (sem lista canônica paralela);
 *  o guard em tempo de execução garante cobertura sem casts inseguros. */
function planConfigFromShared(plan: PlanCode): PlanConfig {
  return {
    creditsPerCycle: SHARED_PLAN_LIMITS[plan].creditsMonthly,
    maxReserveCents: SHARED_PLAN_LIMITS[plan].maxReserveCents,
    maxOpCostCents: SHARED_PLAN_LIMITS[plan].maxOpCostCents,
  };
}

export const PLANS: Record<PlanTier, PlanConfig> = Object.fromEntries(
  SHARED_PLAN_CODES.map((plan) => [plan, planConfigFromShared(plan)]),
) as Record<PlanTier, PlanConfig>;

// Guard de exaustividade em tempo de execução: se o shared ganhar um plano
// novo sem entrada em PLANS (construção cega), falha imediatamente.
for (const plan of SHARED_PLAN_CODES) {
  if (!(plan in PLANS)) {
    throw new Error(`Plano ${plan} do catálogo compartilhado sem entrada em PLANS.`);
  }
}

/** Normaliza plano do banco/painel (aliases) para o canônico; desconhecido → ESSENTIAL. */
export function planoDoEscritorio(plano: string | null | undefined): PlanTier {
  return normalizePlan(plano) ?? 'ESSENTIAL';
}

// ---------------------------------------------------------------------------
// Estimativa de operação
// ---------------------------------------------------------------------------

export interface AiEstimateInput {
  operation: AiOperationType;
  pagesRelevant: number;
  annexPages: number;
  ragContextChars: number;
  expectedOutputChars?: number;
}

export interface AiEstimateResult {
  creditsRequired: number;
  estimatedCostCents: number;
  estimatedUsdCents: number;
  inputTokensEstimated: number;
  outputTokensEstimated: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxOutputPages: number;
  maxAnnexPages: number;
  inputOverLimit: boolean;
  outputOverLimit: boolean;
  pagesOverLimit: boolean;
  annexOverLimit: boolean;
  eligible: boolean;
  reason: string;
  warnings: string[];
}

/**
 * Estima a operação: tokens de entrada = páginas + contexto RAG + 15% de margem
 * de segurança; saída = páginas de saída esperadas. Custo em centavos (ceil).
 */
export function estimateAiOperation(input: AiEstimateInput): AiEstimateResult {
  const limits = OPERATION_LIMITS[input.operation];
  const warnings: string[] = [];

  const charsInput = Math.max(0, input.pagesRelevant) * CHARS_POR_PAGINA + Math.max(0, input.ragContextChars);
  const inputTokensBruto = Math.ceil(charsInput * TOKENS_POR_CHAR);
  const inputTokensEstimated = Math.ceil(inputTokensBruto * (1 + MARGEM_SEGURANCA_INPUT));

  const charsOutput = Math.max(0, input.expectedOutputChars ?? input.pagesRelevant * CHARS_POR_PAGINA * 0.6);
  const outputTokensEstimated = Math.ceil(charsOutput * TOKENS_POR_CHAR);

  const inputOverLimit = inputTokensEstimated > limits.maxInputTokens;
  const outputOverLimit = outputTokensEstimated > limits.maxOutputTokens;
  const pagesOverLimit = input.pagesRelevant > limits.maxOutputPages;
  const annexOverLimit = input.annexPages > limits.maxAnnexPages;

  const cost = calculateAiCostCents({
    model: limits.model,
    inputTokens: Math.min(inputTokensEstimated, limits.maxInputTokens),
    outputTokens: Math.min(outputTokensEstimated, limits.maxOutputTokens),
    isPeak: isHorarioPico(),
  });

  const eligible = !inputOverLimit && !outputOverLimit && !pagesOverLimit && !annexOverLimit;
  if (!eligible) {
    const excessos = [
      inputOverLimit && 'entrada acima do teto',
      outputOverLimit && 'saída acima do teto',
      pagesOverLimit && 'páginas acima do teto',
      annexOverLimit && 'anexos acima do teto',
    ].filter(Boolean).join(', ');
    warnings.push('Volumes excedem os limites da operação: ' + excessos + '. Considere DOCUMENT_ANALYSIS_20_PAGES primeiro.');
  }

  return {
    creditsRequired: limits.credits,
    estimatedCostCents: cost.brlCents,
    estimatedUsdCents: cost.usdCents,
    inputTokensEstimated,
    outputTokensEstimated,
    maxInputTokens: limits.maxInputTokens,
    maxOutputTokens: limits.maxOutputTokens,
    maxOutputPages: limits.maxOutputPages,
    maxAnnexPages: limits.maxAnnexPages,
    inputOverLimit,
    outputOverLimit,
    pagesOverLimit,
    annexOverLimit,
    eligible,
    reason: eligible ? '' : 'limites-da-operacao-ultrapassados',
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Elegibilidade
// ---------------------------------------------------------------------------

export interface CreditStateEscritorio {
  creditsAvailable: number;
  reserveCentsUsed: number;
  cycleMonth: string;
  plano: string;
}

export interface AiEligibilityResult {
  allowed: boolean;
  reason: string;
  creditsRequired: number;
  creditsAvailable: number;
  estimatedCostCents: number;
  warnings: string[];
}

export function cicloAtual(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Avaliação pura de elegibilidade (testável sem banco).
 * - Aplica o rollover do ciclo na leitura (saldo = plano quando o mês mudou).
 * - Checa créditos, teto de custo por operação e orçamento interno do ciclo.
 */
export function avaliarElegibilidade(
  state: CreditStateEscritorio,
  estimate: AiEstimateResult,
  plan: PlanConfig,
  ciclo: string = cicloAtual()
): AiEligibilityResult {
  const cicloAtivo = state.cycleMonth === ciclo;
  const creditsAvailable = cicloAtivo ? state.creditsAvailable : plan.creditsPerCycle;
  const reserveUsed = cicloAtivo ? state.reserveCentsUsed : 0;
  const warnings: string[] = [...estimate.warnings];

  let allowed = estimate.eligible;
  let reason = estimate.eligible ? '' : estimate.reason;

  if (allowed && creditsAvailable < estimate.creditsRequired) {
    allowed = false;
    reason = 'creditos-insuficientes';
  }
  if (allowed && estimate.estimatedCostCents > plan.maxOpCostCents) {
    allowed = false;
    reason = 'custo-da-operacao-excede-teto-do-plano';
  }
  if (allowed && reserveUsed + estimate.estimatedCostCents > plan.maxReserveCents) {
    allowed = false;
    reason = 'orcamento-interno-do-ciclo-insuficiente';
  }

  if (creditsAvailable - estimate.creditsRequired < Math.ceil(plan.creditsPerCycle * 0.2)) {
    warnings.push('saldo de créditos ficará abaixo de 20% do ciclo após esta operação');
  }
  if (plan.maxReserveCents > 0 && (reserveUsed + estimate.estimatedCostCents) / plan.maxReserveCents > 0.8) {
    warnings.push('reserva de custo do ciclo acima de 80%');
  }

  return { allowed, reason, creditsRequired: estimate.creditsRequired, creditsAvailable, estimatedCostCents: estimate.estimatedCostCents, warnings };
}

export interface AiEligibilityInput {
  escritorioId: string;
  operation: AiOperationType;
  estimate: AiEstimateResult;
}

/**
 * Elegibilidade sem reserva (leitura). A checagem autoritativa é a reserva.
 */
export async function checkAiOperationEligibility(input: AiEligibilityInput): Promise<AiEligibilityResult> {
  const rows = await db.execute(sql`
    SELECT plano, credits_available, reserve_cents_used, cycle_month
    FROM escritorios WHERE id = ${input.escritorioId} LIMIT 1
  `) as any[];
  const row = rows[0];
  if (!row) {
    return { allowed: false, reason: 'escritorio-nao-encontrado', creditsRequired: input.estimate.creditsRequired, creditsAvailable: 0, estimatedCostCents: input.estimate.estimatedCostCents, warnings: [] };
  }
  return avaliarElegibilidade(
    { creditsAvailable: Number(row.credits_available), reserveCentsUsed: Number(row.reserve_cents_used), cycleMonth: String(row.cycle_month), plano: String(row.plano ?? '') },
    input.estimate,
    PLANS[planoDoEscritorio(row.plano)]
  );
}

// ---------------------------------------------------------------------------
// Reserva, liquidação e liberação (transação + lock FOR UPDATE + idempotência)
// ---------------------------------------------------------------------------

export interface ReserveAiUsageInput {
  escritorioId: string;
  usuarioId: string | null;
  idempotencyKey: string;
  /** Fingerprint canônico da requisição (payload+classificação) — usado para
   *  rejeitar reutilização da mesma chave com conteúdo diferente. */
  idempotencyFingerprint?: string;
  operation: AiOperationType;
  estimate: AiEstimateResult;
  /** Vínculo de rastreabilidade financeira (fallback Flash→Pro, 3B): a
   *  operação nasce apontando para a operação original — gravado ATÔMICO no
   *  mesmo insert da reserva (nunca best-effort posterior). */
  parentOperationId?: string;
  req?: Request;
}

export interface ReserveAiUsageResult {
  ok: boolean;
  reason?: string;
  operationId?: string;
  creditsReserved?: number;
  costCentsReserved?: number;
  alreadyReserved?: boolean;
  /** Status da operação existente (retries/concorrência). */
  status?: string;
  /** Fingerprint persistido na operação existente (validação de conflito). */
  idempotencyFingerprint?: string | null;
}

interface AiOperationRow {
  id: string;
  idempotency_key: string;
  escritorio_id: string;
  operation_type: string;
  status: string;
  credits_reserved: number;
  cost_cents_reserved: number;
  cost_cents_actual: number;
  credits_settled: number;
  tokens_in: number;
  tokens_out: number;
  usuario_id: string | null;
  model: string | null;
  model_used: string | null;
  fallback_reason: string | null;
  lease_token: string | null;
  max_output_tokens: number | null;
  error: string | null;
}

/** Normaliza a linha da ai_operations lida via SQL bruto: colunas numeric do
 *  driver vêm como STRING (ex.: "10.00") — converte cost_cents_reserved para
 *  number para não quebrar cálculos nem SQL de colunas integer. */
function normalizarOperacao(row: Record<string, unknown> | undefined): AiOperationRow | null {
  if (!row) return null;
  return {
    ...(row as unknown as AiOperationRow),
    cost_cents_reserved: Number(row.cost_cents_reserved ?? 0),
  };
}

async function buscarOperacao(operationId: string): Promise<AiOperationRow | null> {
  const rows = await db.execute(sql`
    SELECT * FROM ai_operations WHERE id = ${operationId} LIMIT 1
  `) as any[];
  return normalizarOperacao(rows[0] as Record<string, unknown> | undefined);
}

/** Lê a operação com lock de linha (FOR UPDATE) — serializa settle/release
 *  concorrentes da MESMA operação (idempotência de liquidação). */
async function buscarOperacaoParaUpdate(tx: any, operationId: string): Promise<AiOperationRow | null> {
  const rows = await tx.execute(sql`
    SELECT * FROM ai_operations WHERE id = ${operationId} FOR UPDATE
  `) as any[];
  return normalizarOperacao(rows[0] as Record<string, unknown> | undefined);
}

/**
 * Reserva créditos e custo estimado de uma operação de IA.
 * - Transação com `SELECT ... FOR UPDATE` na linha do escritório (serializa
 *   usuários do mesmo escritório — impossível exceder saldo simultaneamente).
 * - Idempotente pela `idempotency_key` (UNIQUE em ai_operations).
 * - Nunca confia em valores do cliente: tudo deriva da estimativa do servidor.
 */
export async function reserveAiUsage(input: ReserveAiUsageInput): Promise<ReserveAiUsageResult> {
  const ciclo = cicloAtual();

  const resultado = await db.transaction(async (tx) => {
    const escRows = await tx.execute(sql`
      SELECT id, plano, credits_available, reserve_cents_used, cycle_month
      FROM escritorios WHERE id = ${input.escritorioId} FOR UPDATE
    `) as any[];
    const esc = escRows[0];
    if (!esc) return { ok: false, reason: 'escritorio-nao-encontrado' } as ReserveAiUsageResult;

    const plan = PLANS[planoDoEscritorio(String(esc.plano ?? ''))];

    // Rollover do ciclo sob lock.
    if (String(esc.cycle_month) !== ciclo) {
      await tx.execute(sql`
        UPDATE escritorios
        SET credits_available = ${plan.creditsPerCycle}, reserve_cents_used = 0, cycle_month = ${ciclo}
        WHERE id = ${input.escritorioId}
      `);
    }

    // Idempotência ESCopada por escritório (migration 0020): a MESMA chave em
    // escritórios distintos é independente; a mesma chave no MESMO escritório
    // devolve a operação existente (com status e fingerprint para retries).
    const existentes = await tx.execute(sql`
      SELECT id, status, credits_reserved, cost_cents_reserved, idempotency_fingerprint
      FROM ai_operations
      WHERE escritorio_id = ${input.escritorioId} AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `) as any[];
    if (existentes[0]) {
      return {
        ok: true,
        alreadyReserved: true,
        operationId: existentes[0].id,
        creditsReserved: Number(existentes[0].credits_reserved),
        costCentsReserved: Number(existentes[0].cost_cents_reserved),
        status: String(existentes[0].status),
        idempotencyFingerprint: existentes[0].idempotency_fingerprint ?? null,
      } as ReserveAiUsageResult;
    }

    const state: CreditStateEscritorio = {
      creditsAvailable: Number(esc.credits_available),
      reserveCentsUsed: Number(esc.reserve_cents_used),
      cycleMonth: String(esc.cycle_month),
      plano: String(esc.plano ?? ''),
    };
    const elegibilidade = avaliarElegibilidade(state, input.estimate, plan, ciclo);
    if (!elegibilidade.allowed) {
      return { ok: false, reason: elegibilidade.reason } as ReserveAiUsageResult;
    }

    const credits = input.estimate.creditsRequired;
    const costCents = input.estimate.estimatedCostCents;

    await tx.execute(sql`
      UPDATE escritorios
      SET credits_available = credits_available - ${credits},
          reserve_cents_used = reserve_cents_used + ${costCents}
      WHERE id = ${input.escritorioId}
    `);

    const [operacao] = await tx.insert(aiOperations).values({
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: input.idempotencyFingerprint ?? null,
      escritorioId: input.escritorioId,
      usuarioId: input.usuarioId,
      operationType: input.operation,
      status: 'reserved',
      model: OPERATION_LIMITS[input.operation].model,
      creditsReserved: credits,
      costCentsReserved: costCents,
      maxInputTokens: input.estimate.maxInputTokens,
      maxOutputTokens: input.estimate.maxOutputTokens,
      // Vínculo de fallback gravado ATÔMICO na criação (rastreabilidade 3B).
      parentOperationId: input.parentOperationId ?? null,
    }).returning({ id: aiOperations.id });

    await tx.insert(creditLedger).values({
      escritorioId: input.escritorioId,
      usuarioId: input.usuarioId,
      operationId: operacao.id,
      operationType: input.operation,
      kind: 'RESERVE',
      creditsDelta: -credits,
      costCents,
      model: OPERATION_LIMITS[input.operation].model,
      idempotencyKey: input.idempotencyKey,
      status: 'committed',
    });

    return { ok: true, operationId: operacao.id, creditsReserved: credits, costCentsReserved: costCents } as ReserveAiUsageResult;
  });

  if (resultado.ok && input.req) {
    await recordAudit(input.req, 'AI_RESERVE', {
      alvoId: resultado.operationId,
      detalhes: { operation: input.operation, credits: resultado.creditsReserved, costCents: resultado.costCentsReserved },
    });
  }
  return resultado;
}

export interface SettleAiUsageInput {
  operationId: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  isPeak?: boolean;
  /** Fencing: se informado, a liquidação só ocorre se lease_token ainda
   *  for este token (o executor ainda é o dono do lease). Validação ATÔMICA
   *  dentro do lock da operação — impede liquidação por executor que perdeu
   *  a posse para uma retomada (TOCTOU-free). */
  fencingToken?: string;
  req?: Request;
}

export interface SettleAiUsageResult {
  ok: boolean;
  reason?: string;
  operationId?: string;
  status?: string;
  costCentsActual?: number;
  creditsSettled?: number;
  alreadySettled?: boolean;
}

/**
 * Liquida a operação com o uso real observado pelo servidor:
 * converte a reserva em consumo, libera a diferença de reserva e mantém o
 * `token_usage` compatível com os dashboards existentes.
 */
export async function settleAiUsage(input: SettleAiUsageInput): Promise<SettleAiUsageResult> {
  const resultado = await db.transaction(async (tx) => {
    // Lock de linha na OPERAÇÃO: duas transações concorrentes da mesma chave
    // serializam aqui — a 2ª vê status já 'succeeded' e retorna alreadySettled
    // sem duplicar credit_ledger nem token_usage.
    const op = await buscarOperacaoParaUpdate(tx, input.operationId);
    if (!op) return { ok: false, reason: 'operacao-nao-encontrada' } as SettleAiUsageResult;
    // Fencing ATÔMICO ANTES de qualquer caminho de sucesso (incl. já liquidada
    // por OUTRO executor): se o token de posse não confere, esta chamada NÃO
    // é dona da liquidação — nunca recebe alreadySettled/completed por
    // liquidação realizada por outro executor (evita sucesso indevido).
    if (input.fencingToken != null && String(op.lease_token ?? '') !== input.fencingToken) {
      return { ok: false, reason: 'posse-perdida', status: op.status } as SettleAiUsageResult;
    }
    if (op.status === 'succeeded') return { ok: true, alreadySettled: true, operationId: op.id, status: op.status } as SettleAiUsageResult;
    if (op.status !== 'reserved' && op.status !== 'running') {
      return { ok: false, reason: 'operacao-ja-finalizada', status: op.status } as SettleAiUsageResult;
    }

    await tx.execute(sql`SELECT id FROM escritorios WHERE id = ${op.escritorio_id} FOR UPDATE`);

    const pico = input.isPeak ?? isHorarioPico();
    const custoReal = calculateAiSettlementCents({
      model: input.modelUsed,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      isPeak: pico,
    });

    // Libera a diferença: reserva - custo real (pode ser negativo → consome mais reserva).
    // cost_cents_reserved agora é numeric(10,2) (fase 5E); reserve_cents_used é
    // integer — arredonda o resultado para evitar erro de cast.
    await tx.execute(sql`
      UPDATE escritorios
      SET reserve_cents_used = GREATEST(0, ROUND(reserve_cents_used - ${op.cost_cents_reserved} + ${custoReal.brlCents})::int)
      WHERE id = ${op.escritorio_id}
    `);

    await tx.update(aiOperations).set({
      status: 'succeeded',
      modelUsed: input.modelUsed,
      tokensIn: input.inputTokens,
      tokensOut: input.outputTokens,
      costCentsActual: custoReal.brlCents,
      creditsSettled: op.credits_reserved,
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(aiOperations.id, input.operationId));

    await tx.insert(creditLedger).values({
      escritorioId: op.escritorio_id,
      usuarioId: op.usuario_id,
      operationId: op.id,
      operationType: op.operation_type,
      kind: 'SETTLE',
      creditsDelta: 0,
      costCents: custoReal.brlCents - op.cost_cents_reserved,
      model: input.modelUsed,
      idempotencyKey: `${op.idempotency_key}:settle`,
      status: 'committed',
    });

    return {
      ok: true,
      operationId: op.id,
      status: 'succeeded',
      costCentsActual: custoReal.brlCents,
      creditsSettled: op.credits_reserved,
    } as SettleAiUsageResult;
  });

  if (resultado.ok && !resultado.alreadySettled) {
    const op = await buscarOperacao(input.operationId);
    await trackTokenUsage(op?.usuario_id ?? undefined, op?.operation_type ?? 'ai', input.modelUsed, {
      prompt_tokens: input.inputTokens,
      completion_tokens: input.outputTokens,
    });
    if (input.req) {
      await recordAudit(input.req, 'AI_SETTLE', { alvoId: input.operationId, detalhes: { status: 'succeeded' } });
    }
    // Fase 4B — observabilidade do piloto: alerta de custo por escritório
    // (best-effort, NUNCA bloqueia nem quebra o fluxo de liquidação).
    if (op?.escritorio_id) {
      const { checarAlertaCustoPiloto } = await import('./pilotObservability.js');
      await checarAlertaCustoPiloto(op.escritorio_id, input.req).catch(() => {});
    }
  }
  return resultado;
}

export interface ReleaseAiUsageInput {
  operationId: string;
  reason?: string;
  partialInputTokens?: number;
  partialOutputTokens?: number;
  /** Fencing: se informado, a liberação só ocorre se lease_token ainda
   *  for este token (o executor ainda é o dono do lease). Validação ATÔMICA
   *  dentro do lock — impede compensação por executor que perdeu a posse. */
  fencingToken?: string;
  req?: Request;
}

export interface ReleaseAiUsageResult {
  ok: boolean;
  reason?: string;
  operationId?: string;
  status?: string;
  creditsReleased?: number;
  costCentsReleased?: number;
  alreadyReleased?: boolean;
}

/**
 * Libera a reserva em falha, sem consumo (ou com ajuste de consumo parcial).
 * Não permite dupla liberação (guarda de status).
 */
export async function releaseAiUsageReservation(input: ReleaseAiUsageInput): Promise<ReleaseAiUsageResult> {
  const resultado = await db.transaction(async (tx) => {
    // Lock de linha na operação: serializa releases concorrentes (dupla
    // liberação é impedida pela guarda de status sob lock).
    const op = await buscarOperacaoParaUpdate(tx, input.operationId);
    if (!op) return { ok: false, reason: 'operacao-nao-encontrada' } as ReleaseAiUsageResult;
    // Fencing ATÔMICO ANTES dos caminhos idempotentes: executor com token
    // obsoleto NUNCA recebe alreadyReleased nem compensa operação de outro.
    if (input.fencingToken != null && String(op.lease_token ?? '') !== input.fencingToken) {
      return { ok: false, reason: 'posse-perdida', status: op.status } as ReleaseAiUsageResult;
    }
    if (op.status === 'failed' || op.status === 'released') {
      return { ok: true, alreadyReleased: true, operationId: op.id, status: op.status } as ReleaseAiUsageResult;
    }
    if (op.status === 'succeeded') {
      return { ok: false, reason: 'operacao-ja-liquidada' } as ReleaseAiUsageResult;
    }

    await tx.execute(sql`SELECT id FROM escritorios WHERE id = ${op.escritorio_id} FOR UPDATE`);

    const temConsumoParcial = (input.partialInputTokens ?? 0) > 0 || (input.partialOutputTokens ?? 0) > 0;
    const custoParcial = temConsumoParcial
      ? calculateAiSettlementCents({
          model: op.model ?? 'flash',
          inputTokens: input.partialInputTokens ?? 0,
          outputTokens: input.partialOutputTokens ?? 0,
          isPeak: isHorarioPico(),
        }).brlCents
      : 0;

    const custoLiberado = Math.max(0, op.cost_cents_reserved - custoParcial);

    await tx.execute(sql`
      UPDATE escritorios
      SET credits_available = credits_available + ${op.credits_reserved},
          reserve_cents_used = GREATEST(0, reserve_cents_used - ${custoLiberado})
      WHERE id = ${op.escritorio_id}
    `);

    await tx.update(aiOperations).set({
      status: 'failed',
      error: input.reason ?? 'liberada-sem-consumo',
      tokensIn: input.partialInputTokens ?? 0,
      tokensOut: input.partialOutputTokens ?? 0,
      costCentsActual: custoParcial,
      creditsSettled: 0,
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(aiOperations.id, input.operationId));

    if (temConsumoParcial) {
      await tx.insert(creditLedger).values({
        escritorioId: op.escritorio_id,
        usuarioId: op.usuario_id,
        operationId: op.id,
        operationType: op.operation_type,
        kind: 'ADJUST',
        creditsDelta: 0,
        costCents: custoParcial,
        model: op.model,
        idempotencyKey: `${op.idempotency_key}:adjust`,
        status: 'committed',
      });
    }
    await tx.insert(creditLedger).values({
      escritorioId: op.escritorio_id,
      usuarioId: op.usuario_id,
      operationId: op.id,
      operationType: op.operation_type,
      kind: 'RELEASE',
      creditsDelta: op.credits_reserved,
      costCents: -custoLiberado,
      model: op.model,
      idempotencyKey: `${op.idempotency_key}:release`,
      status: 'committed',
    });

    return {
      ok: true,
      operationId: op.id,
      status: 'failed',
      creditsReleased: op.credits_reserved,
      costCentsReleased: custoLiberado,
    } as ReleaseAiUsageResult;
  });

  if (resultado.ok && !resultado.alreadyReleased && input.req) {
    await recordAudit(input.req, 'AI_RELEASE', { alvoId: input.operationId, detalhes: { reason: input.reason ?? 'liberada' } });
  }
  return resultado;
}
