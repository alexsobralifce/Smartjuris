// ===========================================================================
// Classificador determinístico de operações de IA — Contrato v3 (Fase 1)
//
// O classificador APENAS RECOMENDA. Nunca autoriza sozinho uma chamada de IA:
// a autorização real só ocorre após revalidação e reserva transacional do
// backend (services/usage.ts). `canStartDrafting` significa apenas que o
// frontend pode exibir a possibilidade de iniciar a operação.
//
// Fase 2B: o catálogo de planos/operações vem de `@lexia/shared` (fonte única).
//
// Invariantes desta fase (sempre retornados):
//   estimatedCostCents = null       (o backend calcula o custo)
//   requiresBackendEstimation = true
//   canExportAfterReview = false
//   backendMustRevalidate = true
//   parentOperationId = null | isSubOperation = false | subOperations = []
//
// Autorização (Q4): role, permissão, tenancy e segurança são decididos ANTES
// de chamar o classificador, na camada de autenticação/autorização do backend
// (middlewares). O input público NÃO carrega role/workspaceId/authorized. Nesta
// fase, BLOCKED responde apenas a conteúdo inválido e documento ilegível.
//
// Nunca inventa tokens, custos, fatos, partes, pedidos ou fontes.
// ===========================================================================

import { z } from 'zod';
import {
  OPERATION_CATALOG as SHARED_OPERATION_CATALOG,
  AI_OPERATIONS as SHARED_AI_OPERATIONS,
  PLAN_CODES as SHARED_PLAN_CODES,
  type AiOperation as SharedAiOperation,
  type OperationCatalogEntry,
} from '@lexia/shared';

// ---------------------------------------------------------------------------
// Enums e tipos do contrato
// ---------------------------------------------------------------------------

/** Fonte única (Fase 2B): planos canônicos vindos de @lexia/shared. */
export const PLAN_CODES = SHARED_PLAN_CODES;
export type PlanCode = (typeof PLAN_CODES)[number];

export const OUTPUT_SIZES = ['SHORT', 'STANDARD', 'COMPLETE'] as const;
export type OutputSize = (typeof OUTPUT_SIZES)[number];

export const REVIEW_TARGETS = ['CLAUSE', 'SECTION', 'SNIPPET', 'FULL_DOCUMENT', 'PIECE_SECTION'] as const;
export type ReviewTarget = (typeof REVIEW_TARGETS)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Fonte única (Fase 2B): operações vindas de @lexia/shared. */
export const AI_OPERATIONS = SHARED_AI_OPERATIONS;
export type AiOperation = (typeof AI_OPERATIONS)[number];

export const CLASSIFIER_STATUSES = [
  'READY',
  'READY_WITH_WARNINGS',
  'NEEDS_DOCUMENT_ANALYSIS',
  'NEEDS_CLARIFICATION',
  'INSUFFICIENT_DATA',
  'REQUIRES_ADDITIONAL_CREDITS',
  'BLOCKED',
] as const;
export type ClassifierStatus = (typeof CLASSIFIER_STATUSES)[number];

export const CLASSIFICATIONS = ['SIMPLE', 'STANDARD', 'COMPLEX', ''] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const MODEL_TIERS = ['FLASH', 'PRO', 'NONE'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CASE_CONTEXTS = ['PROCESS_LINKED', 'STANDALONE_REQUEST'] as const;
export type CaseContext = (typeof CASE_CONTEXTS)[number];

export const ANALYSIS_BLOCK_SIZE = 20;
export const PROMPT_VERSION = 'classifier-v3';

// Estimativa preliminar de tokens (configuração backend — fora de qualquer
// prompt). Usada apenas como PRÉVIA; antes da reserva o backend conta/calcula
// os tokens reais pela estratégia disponível (ex.: contagem por caracteres).
export const tokenEstimationConfig = {
  wordsPerPage: 350,
  inputTokensPerWord: 1.5,
  outputTokensPerWord: 1.5,
  safetyMargin: 0.15,
  wordsPerOutputSize: { SHORT: 400, STANDARD: 800, COMPLETE: 1500 } as const,
} as const;

// Acima deste volume de caracteres, uma petição inicial deixa de ser "simples".
const PETICAO_SIMPLES_FATOS_MAX_CHARS = 800;
// Q5: acima de 20 páginas relevantes, a redação exige contexto processado
// (resumo + fatos estruturados); sem ele, a análise documental precede.
const VOLUME_ANALISE_ANTES_REDACAO_PAGES = ANALYSIS_BLOCK_SIZE;

// Q (Suboperações, Fase 1): texto oficial do warning de pesquisa como etapa.
const PESQUISA_ETAPA_INTERNA_WARNING =
  'A pesquisa jurisprudencial será executada como etapa interna da operação principal.';

// ---------------------------------------------------------------------------
// Schema de entrada (contrato v3, seção 15)
// ---------------------------------------------------------------------------

const inteiroNaoNegativo = () => z.number().int().nonnegative();

export const classifierInputSchema = z.object({
  request: z.object({
    userInstruction: z.string().max(20_000).optional(),
    operationRequested: z.string().max(200).optional(),
    pieceType: z.string().max(200).optional(),
    legalArea: z.string().max(100).optional(),
    desiredOutput: z.string().max(5_000).optional(),
    outputSize: z.enum(OUTPUT_SIZES).optional(),
    includeJurisprudence: z.boolean().optional(),
    includeDocumentAnalysis: z.boolean().optional(),
    isRegeneration: z.boolean().optional(),
    previousGenerationId: z.string().max(200).optional(),
    reviewTarget: z.enum(REVIEW_TARGETS).optional(),
  }).default({}),
  workspace: z.object({
    planCode: z.enum(PLAN_CODES),
    creditsAvailable: inteiroNaoNegativo(),
    aiBudgetAvailableCents: inteiroNaoNegativo().optional(),
    maxUsers: z.number().int().positive().optional(),
  }).default({ planCode: 'ESSENTIAL', creditsAvailable: 0 }),
  case: z.object({
    id: z.string().max(200).optional(),
    processNumber: z.string().max(200).optional(),
    caseType: z.string().max(200).optional(),
    area: z.string().max(100).optional(),
    court: z.string().max(200).optional(),
    courtDivision: z.string().max(200).optional(),
    status: z.string().max(100).optional(),
    clientName: z.string().max(200).optional(),
    adverseParty: z.string().max(200).optional(),
    claimValueCents: inteiroNaoNegativo().optional(),
    deadline: z.string().max(50).optional(),
    deadlineIsFatal: z.boolean().optional(),
    facts: z.string().max(50_000).optional(),
    claims: z.array(z.unknown()).max(100).optional(),
    requests: z.array(z.unknown()).max(100).optional(),
    partiesCount: inteiroNaoNegativo().optional(),
    polesCount: inteiroNaoNegativo().optional(),
    competingThesesCount: inteiroNaoNegativo().optional(),
    hasAnswerToChallenge: z.boolean().optional(),
    hasJudgmentToAddress: z.boolean().optional(),
    hasDecisionToAddress: z.boolean().optional(),
    hasAppealToAddress: z.boolean().optional(),
    riskLevel: z.enum(RISK_LEVELS).optional(),
  }).default({}),
  documents: z.object({
    count: inteiroNaoNegativo().default(0),
    totalPages: inteiroNaoNegativo().default(0),
    relevantPages: inteiroNaoNegativo().optional(),
    pagesAlreadyAnalyzed: inteiroNaoNegativo().optional(),
    estimatedInputTokens: inteiroNaoNegativo().optional(),
    indexedCount: inteiroNaoNegativo().default(0),
    processableCount: inteiroNaoNegativo().default(0),
    failedCount: inteiroNaoNegativo().default(0),
    hasOcrRequired: z.boolean().optional(),
    documentTypes: z.array(z.string().max(100)).max(100).optional(),
    summariesAvailable: z.boolean().optional(),
    structuredFactsAvailable: z.boolean().optional(),
  }).default({}),
  rag: z.object({
    available: z.boolean().default(false),
    relevantChunks: inteiroNaoNegativo().optional(),
    relevantSources: inteiroNaoNegativo().optional(),
    jurisprudenceResults: inteiroNaoNegativo().optional(),
    hasVerifiableSources: z.boolean().optional(),
    hasConflictingSources: z.boolean().optional(),
    retrievalConfidence: z.number().min(0).max(1).optional(),
  }).default({}),
  operationPolicy: z.unknown().default({}),
}).superRefine((data, ctx) => {
  const d = data.documents;
  const invalida = (path: string, mensagem: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: mensagem });
  if (d.failedCount > d.count) invalida('documents.failedCount', 'failedCount não pode exceder count');
  if (d.indexedCount > d.count) invalida('documents.indexedCount', 'indexedCount não pode exceder count');
  if (d.processableCount > d.count) invalida('documents.processableCount', 'processableCount não pode exceder count');
});

export type ClassifierInput = z.infer<typeof classifierInputSchema>;

// ---------------------------------------------------------------------------
// Schema de saída (contrato v3, seção 16)
// ---------------------------------------------------------------------------

export const classifierOutputSchema = z.object({
  status: z.enum(CLASSIFIER_STATUSES),
  classification: z.enum(CLASSIFICATIONS),
  operation: z.enum([...AI_OPERATIONS, ''] as const),
  recommendedModelTier: z.enum(MODEL_TIERS),
  classificationConfidence: z.enum(CONFIDENCE_LEVELS),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
  missingInformation: z.array(z.string()),
  caseContext: z.enum(CASE_CONTEXTS),
  pagesRelevant: inteiroNaoNegativo().nullable(),
  pagesAlreadyAnalyzed: inteiroNaoNegativo().nullable(),
  pagesToAnalyze: inteiroNaoNegativo().nullable(),
  analysisBlockSize: z.literal(ANALYSIS_BLOCK_SIZE),
  analysisBlocks: inteiroNaoNegativo().nullable(),
  pagesExceedingLimit: inteiroNaoNegativo().nullable(),
  estimatedInputTokens: inteiroNaoNegativo().nullable(),
  estimatedInputTokensWithSafetyMargin: inteiroNaoNegativo().nullable(),
  estimatedOutputTokens: inteiroNaoNegativo().nullable(),
  maxAllowedInputTokens: inteiroNaoNegativo().nullable(),
  maxAllowedOutputTokens: inteiroNaoNegativo().nullable(),
  recommendedOutputPages: inteiroNaoNegativo().nullable(),
  requiredCredits: inteiroNaoNegativo().nullable(),
  estimatedCostCents: z.literal(null),
  requiresBackendEstimation: z.literal(true),
  needsJurisprudenceResearch: z.boolean(),
  needsDocumentAnalysis: z.boolean(),
  needsHumanReview: z.boolean(),
  canStartAnalysis: z.boolean(),
  canStartDrafting: z.boolean(),
  canExportAfterReview: z.literal(false),
  backendMustRevalidate: z.literal(true),
  parentOperationId: z.literal(null),
  isSubOperation: z.literal(false),
  subOperations: z.tuple([]),
  decision: z.object({
    promptVersion: z.literal(PROMPT_VERSION),
    rulesApplied: z.array(z.string()),
    fallbackReason: z.literal(null),
  }),
});

export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;

// ---------------------------------------------------------------------------
// Catálogo imutável das sete operações (contrato v3, seção 5)
// ---------------------------------------------------------------------------

export interface OperationPolicy {
  operation: AiOperation;
  modelTier: Exclude<ModelTier, 'NONE'>;
  /** Créditos fixos; para análise: créditos POR BLOCO de 20 páginas. */
  credits: number;
  creditsArePerBlock: boolean;
  /** null = limite não fixado pelo contrato (backend decide/configura). */
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  maxOutputPages: number | null;
  maxAnnexPages: number | null;
  classification: Exclude<Classification, ''>;
  /** Operação que redige peça/documento final (exige revisão humana). */
  producesText: boolean;
  isAnalysis: boolean;
}

/**
 * Fase 2B — catálogo derivado da FONTE ÚNICA em @lexia/shared (nenhum valor
 * duplicado aqui). Adapta o formato do shared (contrato 2B) para a forma
 * interna OperationPolicy do classificador.
 */
function toOperationPolicy(entry: OperationCatalogEntry): OperationPolicy {
  return {
    operation: entry.operation,
    modelTier: entry.model,
    credits: entry.credits,
    creditsArePerBlock: entry.isAnalysisOperation && entry.blockSizePages != null,
    maxInputTokens: entry.maxInputTokens,
    maxOutputTokens: entry.maxOutputTokens,
    maxOutputPages: entry.maxOutputPages,
    maxAnnexPages: entry.maxAttachmentPages,
    classification: entry.classification,
    producesText: entry.isDraftingOperation,
    isAnalysis: entry.isAnalysisOperation,
  };
}

export const OPERATION_CATALOG: Record<AiOperation, OperationPolicy> = Object.fromEntries(
  SHARED_AI_OPERATIONS.map((operation: SharedAiOperation) => [
    operation,
    toOperationPolicy(SHARED_OPERATION_CATALOG[operation]),
  ]),
) as Record<AiOperation, OperationPolicy>;

// ---------------------------------------------------------------------------
// Funções auxiliares puras (contrato v3, seção 18)
// ---------------------------------------------------------------------------

export function getOperationPolicy(operation: AiOperation): OperationPolicy {
  return OPERATION_CATALOG[operation];
}

export function getClassificationForOperation(operation: AiOperation | ''): Classification {
  return operation === '' ? '' : OPERATION_CATALOG[operation].classification;
}

export function calculatePagesToAnalyze(
  pagesRelevant: number | null | undefined,
  pagesAlreadyAnalyzed: number | null | undefined
): number | null {
  if (pagesRelevant == null || pagesAlreadyAnalyzed == null) return null;
  return Math.max(pagesRelevant - pagesAlreadyAnalyzed, 0);
}

export function calculateAnalysisBlocks(pagesToAnalyze: number | null | undefined): number | null {
  if (pagesToAnalyze == null) return null;
  return Math.ceil(Math.max(pagesToAnalyze, 0) / ANALYSIS_BLOCK_SIZE);
}

export function getFixedCredits(
  operation: AiOperation,
  pagesToAnalyze: number | null | undefined
): number | null {
  const policy = OPERATION_CATALOG[operation];
  if (policy.creditsArePerBlock) {
    const blocos = calculateAnalysisBlocks(pagesToAnalyze);
    return blocos == null ? null : blocos * policy.credits;
  }
  return policy.credits;
}

export function isDraftingOperation(operation: AiOperation): boolean {
  return OPERATION_CATALOG[operation].producesText;
}

export function isAnalysisOperation(operation: AiOperation): boolean {
  return OPERATION_CATALOG[operation].isAnalysis;
}

export function isValidSectionReviewTarget(reviewTarget: ReviewTarget | undefined): boolean {
  return (
    reviewTarget === 'CLAUSE' ||
    reviewTarget === 'SECTION' ||
    reviewTarget === 'SNIPPET' ||
    reviewTarget === 'PIECE_SECTION'
  );
}

// ---------------------------------------------------------------------------
// Motor de decisão (seções 6–14, 17; decisões oficiais Q1–Q5)
// ---------------------------------------------------------------------------

type OperationIntent =
  | { kind: 'review' }
  | { kind: 'appeal'; research: boolean; analysis: boolean }
  | { kind: 'complex'; research: boolean; analysis: boolean }
  | { kind: 'analysis' }
  | { kind: 'jurisprudence' }
  | { kind: 'petition'; standard: boolean };

const PALAVRAS_REVISAO = [
  'revisar', 'revise', 'reescreva', 'reescrita', 'reescrever',
  'revisao de clausula', 'revisao de trecho', 'revisao de secao',
  'revisar clausula', 'revisar trecho', 'revisar secao', 'analise esta clausula',
] as const;

const PALAVRAS_RECURSO = [
  'apelacao', 'agravo', 'recurso ordinario', 'recurso em sentido estrito',
  'recurso de revista', 'contra-razoes', 'contra razoes',
] as const;

const PALAVRAS_COMPLEXO = [
  'parecer', 'recurso especial', 'recurso extraordinario', 'memoriais', 'minuta',
] as const;

const PALAVRAS_ANALISE = [
  'analise de contrato', 'analise de autos', 'analise integral', 'analisar contrato',
  'analise documental', 'analise do contrato', 'analisar o contrato',
  'resumo', 'indexacao', 'indexar', 'extrair', 'classificar', 'ler os autos', 'ler contrato',
] as const;

const PALAVRAS_JURISPRUDENCIA = [
  'jurisprudencia', 'precedente', 'precedentes', 'pesquisa de decisoes',
  'busca por tese', 'busca por tribunal', 'pesquisar jurisprudencia',
] as const;

const PALAVRAS_PETICAO = [
  'peticao inicial', 'peticao', 'peca', 'manifestacao', 'requerimento',
  'notificacao extrajudicial', 'revisao de beneficio', 'revisional', 'contestacao',
  'replica', 'impugnacao', 'embargos', 'excecao', 'reclamacao trabalhista',
  'mandado de seguranca', 'monitoria', 'rescisoria', 'recuperacao judicial',
  'repeticao de indebito', 'anulatoria', 'declaratoria', 'cobranca',
] as const;

const PECAS_RECURSO = [
  'apelacao', 'recurso de apelacao', 'recurso ordinario', 'recurso em sentido estrito',
  'recurso de revista', 'agravo de instrumento', 'agravo de peticao', 'contra-razoes', 'contra razoes',
] as const;

const PECAS_COMPLEXAS = [
  'parecer', 'recurso especial', 'recurso extraordinario', 'memoriais',
] as const;

const PECAS_PADRAO = [
  'contestacao', 'replica', 'impugnacao', 'embargos', 'excecao', 'reclamacao trabalhista',
  'mandado de seguranca', 'revisional', 'revisao de beneficio', 'acao monitoria',
  'acao rescisoria', 'recuperacao judicial', 'repeticao de indebito', 'anulatoria',
  'declaratoria', 'obrigacao de fazer', 'acao de cobranca', 'consignacao',
] as const;

const PECAS_SIMPLES = [
  'notificacao extrajudicial', 'manifestacao', 'requerimento', 'pedido de liberdade provisoria',
  'relaxamento de prisao', 'transacao penal', 'suspensao condicional', 'representacao criminal',
  'progressao de regime', 'livramento condicional', 'habeas corpus', 'habeas data', 'queixa-crime',
] as const;

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function vazio(texto: string | null | undefined): boolean {
  return !texto || texto.trim().length === 0;
}

function contemAlgum(texto: string, palavras: readonly string[]): boolean {
  return palavras.some(palavra => texto.includes(palavra));
}

/** Q3/Q5: contexto processado = resumo + fatos estruturados disponíveis. */
function temContextoProcessado(ctx: ClassifierInput): boolean {
  return ctx.documents.summariesAvailable === true && ctx.documents.structuredFactsAvailable === true;
}

function isStandardPetitionContext(ctx: ClassifierInput): boolean {
  const c = ctx.case;
  const tamanhoFatos = (c.facts ?? '').trim().length;
  const pedidos = c.requests?.length ?? 0;
  const claims = c.claims?.length ?? 0;
  const partes = c.partiesCount ?? 0;
  const teses = c.competingThesesCount ?? 0;
  const sinalComplexidade =
    c.riskLevel === 'HIGH' ||
    c.hasJudgmentToAddress === true ||
    c.hasDecisionToAddress === true ||
    c.hasAnswerToChallenge === true;
  return (
    tamanhoFatos > PETICAO_SIMPLES_FATOS_MAX_CHARS ||
    pedidos > 3 || claims > 3 || partes > 2 || teses > 1 || sinalComplexidade
  );
}

function resolverTextoOperacao(
  texto: string | undefined,
  explicito: boolean,
  ctx: ClassifierInput
): OperationIntent | null {
  const t = normalizar(texto);
  if (!t) return null;

  if (contemAlgum(t, PALAVRAS_REVISAO)) return { kind: 'review' };

  const complexo = contemAlgum(t, PALAVRAS_COMPLEXO);
  const recurso = contemAlgum(t, PALAVRAS_RECURSO);
  if (complexo || recurso) {
    return {
      kind: complexo && !recurso ? 'complex' : 'appeal',
      research: contemAlgum(t, PALAVRAS_JURISPRUDENCIA),
      analysis: contemAlgum(t, PALAVRAS_ANALISE),
    };
  }

  if (contemAlgum(t, PALAVRAS_ANALISE)) return { kind: 'analysis' };
  if (contemAlgum(t, PALAVRAS_JURISPRUDENCIA)) return { kind: 'jurisprudence' };

  if (contemAlgum(t, PALAVRAS_PETICAO)) {
    const explicitamenteSimples = t.includes('simples') || t.includes('curto') || t.includes('curta');
    const explicitamentePadrao = t.includes('padrao') || t.includes('completa') || t.includes('completo');
    return {
      kind: 'petition',
      standard: explicitamenteSimples ? false : (explicitamentePadrao ? true : isStandardPetitionContext(ctx)),
    };
  }

  // "revisão" como pedido explícito de operação (sem alvo delimitado → clarification).
  if (explicito && t.includes('revisao')) return { kind: 'review' };
  return null;
}

function resolverTipoPeca(pieceType: string | undefined, ctx: ClassifierInput): OperationIntent | null {
  const t = normalizar(pieceType);
  if (!t) return null;
  if (contemAlgum(t, PECAS_RECURSO)) return { kind: 'appeal', research: false, analysis: false };
  if (contemAlgum(t, PECAS_COMPLEXAS)) return { kind: 'complex', research: false, analysis: false };
  if (contemAlgum(t, PECAS_PADRAO)) return { kind: 'petition', standard: true };
  if (contemAlgum(t, PECAS_SIMPLES)) return { kind: 'petition', standard: false };
  if (contemAlgum(t, ['peticao inicial', 'peticao'])) {
    return { kind: 'petition', standard: isStandardPetitionContext(ctx) };
  }
  return null;
}

function derivarDoCaso(ctx: ClassifierInput): OperationIntent | null {
  const c = ctx.case;
  if (
    c.hasAppealToAddress === true ||
    c.hasJudgmentToAddress === true ||
    c.hasDecisionToAddress === true
  ) {
    return { kind: 'appeal', research: false, analysis: false };
  }
  if (c.competingThesesCount != null && c.competingThesesCount > 1) {
    return { kind: 'complex', research: false, analysis: false };
  }
  if (c.hasAnswerToChallenge === true) return { kind: 'petition', standard: true };
  return null;
}

/**
 * Q5 — análise documental deve preceder a redação quando faltar contexto
 * processado (resumo + fatos estruturados):
 * - páginas relevantes desconhecidas com documentos → análise;
 * - acima de 20 páginas sem contexto processado → análise;
 * - até 20 páginas sem contexto processado e sem fatos no pedido (redação
 *   depende dos autos) → análise.
 */
function precisaAnaliseAntesRedacao(ctx: ClassifierInput): boolean {
  const docs = ctx.documents;
  if (docs.relevantPages == null) {
    return (docs.count ?? 0) > 0;
  }
  const contextoPronto = temContextoProcessado(ctx);
  if (docs.relevantPages > VOLUME_ANALISE_ANTES_REDACAO_PAGES) {
    return !contextoPronto;
  }
  if (!contextoPronto && vazio(ctx.case.facts) && (docs.count ?? 0) > 0) {
    return true;
  }
  return false;
}

function contextoDoCaso(ctx: ClassifierInput): CaseContext {
  return vazio(ctx.case.id) && vazio(ctx.case.processNumber) ? 'STANDALONE_REQUEST' : 'PROCESS_LINKED';
}

// Confidence (decisão oficial): HIGH para operação explícita/regra inequívoca;
// MEDIUM para inferência clara por instrução/contexto; LOW é usado nos estados
// de dados insuficientes/ambiguidade (defaults do envelope).
function confianca(ctx: ClassifierInput): ConfidenceLevel {
  const explicito =
    !vazio(ctx.request.operationRequested) ||
    !vazio(ctx.request.pieceType) ||
    ctx.request.reviewTarget !== undefined;
  return explicito ? 'HIGH' : 'MEDIUM';
}

// Estimativas preliminares (configuração backend; nunca inventadas).

function estimarTokensEntrada(ctx: ClassifierInput): number | null {
  if (ctx.documents.estimatedInputTokens != null) return ctx.documents.estimatedInputTokens;
  const paginas = ctx.documents.relevantPages ?? ctx.documents.totalPages;
  if (paginas == null || paginas <= 0) return null;
  return Math.ceil(paginas * tokenEstimationConfig.wordsPerPage * tokenEstimationConfig.inputTokensPerWord);
}

function estimarTokensEntradaComMargem(ctx: ClassifierInput): number | null {
  const base = estimarTokensEntrada(ctx);
  return base == null ? null : Math.ceil(base * (1 + tokenEstimationConfig.safetyMargin));
}

function estimarTokensSaida(ctx: ClassifierInput): number | null {
  const tamanho = ctx.request.outputSize;
  if (!tamanho) return null;
  const palavras = tokenEstimationConfig.wordsPerOutputSize[tamanho];
  return Math.ceil(palavras * tokenEstimationConfig.outputTokensPerWord);
}

function avisosDeRedacao(ctx: ClassifierInput, operation: AiOperation): string[] {
  const avisos: string[] = [];
  if (vazio(ctx.case.id) && vazio(ctx.case.processNumber)) {
    avisos.push('Vincule a peça a um processo antes da exportação ou protocolo.');
  }
  if (operation !== 'SECTION_REVIEW') {
    if (vazio(ctx.case.clientName)) avisos.push('Parte autora não informada.');
    if (vazio(ctx.case.adverseParty)) avisos.push('Parte adversa não informada.');
    if (vazio(ctx.case.facts) && vazio(ctx.request.userInstruction) && vazio(ctx.request.desiredOutput)) {
      avisos.push('Fatos do caso não informados.');
    }
  }
  return avisos;
}

function envelopar(sobrescritas: Partial<ClassifierOutput> = {}): ClassifierOutput {
  const padrao: ClassifierOutput = {
    status: 'INSUFFICIENT_DATA',
    classification: '',
    operation: '',
    recommendedModelTier: 'NONE',
    classificationConfidence: 'LOW',
    reasons: [],
    warnings: [],
    missingInformation: [],
    caseContext: 'STANDALONE_REQUEST',
    pagesRelevant: null,
    pagesAlreadyAnalyzed: null,
    pagesToAnalyze: null,
    analysisBlockSize: ANALYSIS_BLOCK_SIZE,
    analysisBlocks: null,
    pagesExceedingLimit: null,
    estimatedInputTokens: null,
    estimatedInputTokensWithSafetyMargin: null,
    estimatedOutputTokens: null,
    maxAllowedInputTokens: null,
    maxAllowedOutputTokens: null,
    recommendedOutputPages: null,
    requiredCredits: null,
    estimatedCostCents: null,
    requiresBackendEstimation: true,
    needsJurisprudenceResearch: false,
    needsDocumentAnalysis: false,
    needsHumanReview: false,
    canStartAnalysis: false,
    canStartDrafting: false,
    canExportAfterReview: false,
    backendMustRevalidate: true,
    parentOperationId: null,
    isSubOperation: false,
    subOperations: [],
    decision: { promptVersion: PROMPT_VERSION, rulesApplied: [], fallbackReason: null },
  };
  return {
    ...padrao,
    ...sobrescritas,
    // Invariantes da Fase 1: nunca permitidos de outra forma.
    estimatedCostCents: null,
    requiresBackendEstimation: true,
    canExportAfterReview: false,
    backendMustRevalidate: true,
    parentOperationId: null,
    isSubOperation: false,
    subOperations: [],
    decision: { ...padrao.decision, ...(sobrescritas.decision ?? {}) },
  } as ClassifierOutput;
}

/**
 * Q2/Q3: análise documental. Páginas desconhecidas → status
 * NEEDS_DOCUMENT_ANALYSIS com páginas/créditos/estimativas nulos e
 * `canStartAnalysis=false` (nunca READY; o backend conta as páginas reais).
 */
function finalizarAnalise(ctx: ClassifierInput, origem: string): ClassifierOutput {
  const policy = getOperationPolicy('DOCUMENT_ANALYSIS_20_PAGES');
  const pagesRelevant = ctx.documents.relevantPages ?? null;
  const pagesAlreadyAnalyzed = ctx.documents.pagesAlreadyAnalyzed ?? null;
  const pagesToAnalyze = calculatePagesToAnalyze(pagesRelevant, pagesAlreadyAnalyzed);
  const blocos = calculateAnalysisBlocks(pagesToAnalyze);
  const credits = blocos == null ? null : blocos * policy.credits;
  const paginasConhecidas = pagesToAnalyze != null;

  const pagesExceedingLimit =
    paginasConhecidas
      ? Math.max(pagesToAnalyze! - ctx.workspace.creditsAvailable * ANALYSIS_BLOCK_SIZE, 0)
      : null;

  const creditosOk = credits == null || ctx.workspace.creditsAvailable >= credits;
  const canStartAnalysis = credits != null && paginasConhecidas && creditosOk && pagesExceedingLimit === 0;

  const avisos: string[] = [];
  if (pagesExceedingLimit != null && pagesExceedingLimit > 0) {
    avisos.push(`${pagesExceedingLimit} página(s) excedem o limite coberto pelos créditos disponíveis.`);
  }
  if (credits == null) {
    avisos.push(
      'Não foi possível determinar a quantidade de páginas a analisar. O backend deve contar as páginas reais antes de reservar créditos.'
    );
  }
  if (credits != null && !creditosOk) {
    avisos.push(
      `Saldo de créditos insuficiente para a análise (necessário ${credits}, disponível ${ctx.workspace.creditsAvailable}).`
    );
  }

  const regras = [origem, 'op-document-analysis', 'blocks-20'];
  if (credits == null) regras.push('backend-count-pages');

  return envelopar({
    status: credits != null && !creditosOk ? 'REQUIRES_ADDITIONAL_CREDITS' : 'NEEDS_DOCUMENT_ANALYSIS',
    classification: policy.classification,
    operation: 'DOCUMENT_ANALYSIS_20_PAGES',
    recommendedModelTier: policy.modelTier,
    classificationConfidence: confianca(ctx),
    reasons: credits == null ? ['paginas-desconhecidas'] : ['operacao-identificada'],
    warnings: avisos,
    missingInformation: credits == null ? ['Quantidade de páginas dos documentos'] : [],
    caseContext: contextoDoCaso(ctx),
    pagesRelevant,
    pagesAlreadyAnalyzed,
    pagesToAnalyze,
    analysisBlocks: blocos,
    pagesExceedingLimit,
    // Q2: páginas desconhecidas → estimativas sempre null (sem base confiável).
    estimatedInputTokens: paginasConhecidas ? estimarTokensEntrada(ctx) : null,
    estimatedInputTokensWithSafetyMargin: paginasConhecidas ? estimarTokensEntradaComMargem(ctx) : null,
    estimatedOutputTokens: paginasConhecidas ? estimarTokensSaida(ctx) : null,
    maxAllowedInputTokens: policy.maxInputTokens,
    maxAllowedOutputTokens: policy.maxOutputTokens,
    recommendedOutputPages: policy.maxOutputPages,
    requiredCredits: credits,
    needsDocumentAnalysis: true,
    needsHumanReview: false,
    canStartAnalysis,
    canStartDrafting: false,
    decision: { promptVersion: PROMPT_VERSION, rulesApplied: regras, fallbackReason: null },
  });
}

function finalizarPesquisa(ctx: ClassifierInput, origem: string): ClassifierOutput {
  const policy = getOperationPolicy('JURISPRUDENCE_RESEARCH');
  const credits = policy.credits;
  const saldoOk = ctx.workspace.creditsAvailable >= credits;

  return envelopar({
    status: saldoOk ? 'READY' : 'REQUIRES_ADDITIONAL_CREDITS',
    classification: policy.classification,
    operation: 'JURISPRUDENCE_RESEARCH',
    recommendedModelTier: policy.modelTier,
    classificationConfidence: confianca(ctx),
    reasons: saldoOk ? ['operacao-identificada'] : ['creditos-insuficientes'],
    warnings: saldoOk
      ? []
      : [`Saldo de créditos insuficiente para a pesquisa (necessário ${credits}, disponível ${ctx.workspace.creditsAvailable}).`],
    missingInformation: [],
    caseContext: contextoDoCaso(ctx),
    pagesRelevant: 0,
    pagesAlreadyAnalyzed: 0,
    pagesToAnalyze: 0,
    analysisBlocks: 0,
    pagesExceedingLimit: 0,
    estimatedInputTokens: estimarTokensEntrada(ctx),
    estimatedInputTokensWithSafetyMargin: estimarTokensEntradaComMargem(ctx),
    estimatedOutputTokens: estimarTokensSaida(ctx),
    maxAllowedInputTokens: policy.maxInputTokens,
    maxAllowedOutputTokens: policy.maxOutputTokens,
    recommendedOutputPages: policy.maxOutputPages,
    requiredCredits: credits,
    needsJurisprudenceResearch: true,
    needsHumanReview: false,
    canStartDrafting: false,
    decision: { promptVersion: PROMPT_VERSION, rulesApplied: [origem, 'op-jurisprudence'], fallbackReason: null },
  });
}

/**
 * Redação de peça/documento final. Se a análise documental for necessária
 * (Q3/Q5), a operação retornada é DOCUMENT_ANALYSIS_20_PAGES e a redação fica
 * pendente; créditos insuficientes → REQUIRES_ADDITIONAL_CREDITS (nunca
 * autoriza geração nem calcula custo).
 */
function finalizarRedacao(
  ctx: ClassifierInput,
  operation: AiOperation,
  intent: OperationIntent,
  origem: string
): ClassifierOutput {
  const policy = getOperationPolicy(operation);
  const credits = policy.credits;
  const avisos = avisosDeRedacao(ctx, operation);

  const temSuboperacoes = intent.kind === 'appeal' || intent.kind === 'complex';
  const pesquisaNaIntencao = temSuboperacoes && intent.research === true;
  const analiseNaIntencao = temSuboperacoes && intent.analysis === true;
  const precisaPesquisa =
    operation !== 'SECTION_REVIEW' && (pesquisaNaIntencao || ctx.request.includeJurisprudence === true);
  const precisaAnalise =
    operation !== 'SECTION_REVIEW' &&
    (analiseNaIntencao || ctx.request.includeDocumentAnalysis === true || precisaAnaliseAntesRedacao(ctx));

  if (precisaPesquisa) avisos.push(PESQUISA_ETAPA_INTERNA_WARNING);

  const regras = [origem, `op-${operation.toLowerCase()}`, policy.modelTier === 'PRO' ? 'model-pro' : 'model-flash'];
  if (precisaPesquisa) regras.push('subop-jurisprudence');

  // Q3/Q5: análise precede a redação quando faltar contexto processado.
  if (precisaAnalise) {
    const saida = finalizarAnalise(ctx, origem);
    return envelopar({
      ...saida,
      warnings: [
        ...saida.warnings,
        ...(precisaPesquisa ? [PESQUISA_ETAPA_INTERNA_WARNING] : []),
        `A redação (${operation}) será classificada após a análise documental.`,
      ],
      reasons: [...saida.reasons, 'redacao-pendente-de-analise'],
      needsJurisprudenceResearch: precisaPesquisa,
      decision: {
        promptVersion: PROMPT_VERSION,
        rulesApplied: [...saida.decision.rulesApplied, 'redacao-pendente-de-analise', ...(precisaPesquisa ? ['subop-jurisprudence'] : [])],
        fallbackReason: null,
      },
    });
  }

  const base: Partial<ClassifierOutput> = {
    classification: policy.classification,
    operation,
    recommendedModelTier: policy.modelTier,
    classificationConfidence: confianca(ctx),
    reasons: ['operacao-identificada'],
    warnings: avisos,
    missingInformation: [],
    caseContext: contextoDoCaso(ctx),
    pagesRelevant: ctx.documents.relevantPages ?? 0,
    pagesAlreadyAnalyzed: 0,
    pagesToAnalyze: 0,
    analysisBlocks: 0,
    pagesExceedingLimit: 0,
    estimatedInputTokens: estimarTokensEntrada(ctx),
    estimatedInputTokensWithSafetyMargin: estimarTokensEntradaComMargem(ctx),
    estimatedOutputTokens: estimarTokensSaida(ctx),
    maxAllowedInputTokens: policy.maxInputTokens,
    maxAllowedOutputTokens: policy.maxOutputTokens,
    recommendedOutputPages: policy.maxOutputPages,
    requiredCredits: credits,
    needsJurisprudenceResearch: precisaPesquisa,
    needsDocumentAnalysis: false,
    needsHumanReview: true,
    canStartDrafting: false,
    decision: { promptVersion: PROMPT_VERSION, rulesApplied: regras, fallbackReason: null },
  };

  // Ordem de avaliação (seção 17): NEEDS_DOCUMENT_ANALYSIS (4) antes de
  // REQUIRES_ADDITIONAL_CREDITS (5) antes de READY/READY_WITH_WARNINGS (6).
  if (ctx.workspace.creditsAvailable < credits) {
    return envelopar({
      ...base,
      status: 'REQUIRES_ADDITIONAL_CREDITS',
      reasons: ['creditos-insuficientes'],
      warnings: [
        ...avisos,
        `Saldo de créditos insuficiente para a operação (necessário ${credits}, disponível ${ctx.workspace.creditsAvailable}).`,
      ],
    });
  }
  return envelopar({
    ...base,
    status: avisos.length > 0 ? 'READY_WITH_WARNINGS' : 'READY',
    canStartDrafting: true,
  });
}

function finalizarRevisaoSecao(ctx: ClassifierInput, origem: string): ClassifierOutput {
  const temAlvo =
    !vazio(ctx.request.desiredOutput) || !vazio(ctx.request.userInstruction) || !vazio(ctx.case.facts);
  if (!temAlvo) {
    return envelopar({
      status: 'NEEDS_CLARIFICATION',
      reasons: ['revisao-sem-alvo'],
      warnings: [],
      missingInformation: ['Trecho, cláusula ou seção a revisar'],
      caseContext: contextoDoCaso(ctx),
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: [origem, 'revisao-sem-alvo'], fallbackReason: null },
    });
  }
  return finalizarRedacao(ctx, 'SECTION_REVIEW', { kind: 'review' }, origem);
}

/**
 * Q3 — reviewTarget=FULL_DOCUMENT:
 * - objetivo de ler/extrair/resumir/classificar/indexar → DOCUMENT_ANALYSIS;
 * - objetivo explícito de redigir documento final com contexto processado
 *   (resumo + fatos estruturados) → operação final (complex/padrão/simples);
 * - objetivo explícito de redigir sem contexto processado → análise precede;
 * - sem objetivo claro → NEEDS_CLARIFICATION.
 */
function finalizarDocumentoInteiro(ctx: ClassifierInput, origem: string): ClassifierOutput {
  const texto = [ctx.request.userInstruction, ctx.request.operationRequested, ctx.request.desiredOutput]
    .filter(x => !vazio(x))
    .join(' ');

  const intencao = resolverTextoOperacao(texto || undefined, false, ctx) ?? resolverTipoPeca(ctx.request.pieceType, ctx);

  if (!intencao) {
    return envelopar({
      status: 'NEEDS_CLARIFICATION',
      reasons: ['full-document-sem-objetivo'],
      warnings: [],
      missingInformation: [
        'Objetivo do processamento do documento (analisar, revisar, redigir parecer/minuta ou peça).',
      ],
      caseContext: contextoDoCaso(ctx),
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: [origem, 'full-document-sem-objetivo'], fallbackReason: null },
    });
  }

  // Leitura/extração/resumo/classificação/indexação (ou revisão integral) → análise.
  if (intencao.kind === 'analysis' || intencao.kind === 'review') {
    return finalizarAnalise(ctx, origem);
  }
  if (intencao.kind === 'jurisprudence') {
    return finalizarPesquisa(ctx, origem);
  }

  // Redação de documento final: exige resumo + fatos estruturados (Q3/Q5).
  if (!temContextoProcessado(ctx)) {
    return finalizarAnalise(ctx, origem);
  }
  switch (intencao.kind) {
    case 'complex':
      return finalizarRedacao(ctx, 'COMPLEX_DOCUMENT', intencao, origem);
    case 'appeal':
      return finalizarRedacao(ctx, 'APPEAL', intencao, origem);
    case 'petition':
      return finalizarRedacao(ctx, intencao.standard ? 'STANDARD_PETITION' : 'SIMPLE_PETITION', intencao, origem);
    default:
      return finalizarAnalise(ctx, origem);
  }
}

function finalizarIntencao(ctx: ClassifierInput, intent: OperationIntent, origem: string): ClassifierOutput {
  switch (intent.kind) {
    case 'review':
      return finalizarRevisaoSecao(ctx, origem);
    case 'appeal':
      return finalizarRedacao(ctx, 'APPEAL', intent, origem);
    case 'complex':
      return finalizarRedacao(ctx, 'COMPLEX_DOCUMENT', intent, origem);
    case 'petition':
      return finalizarRedacao(ctx, intent.standard ? 'STANDARD_PETITION' : 'SIMPLE_PETITION', intent, origem);
    case 'analysis':
      return finalizarAnalise(ctx, origem);
    case 'jurisprudence':
      return finalizarPesquisa(ctx, origem);
  }
}

function decidir(rawInput: unknown): ClassifierOutput {
  const parsed = classifierInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const problemas = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`);
    return envelopar({
      status: 'BLOCKED',
      reasons: ['conteudo-invalido'],
      missingInformation: problemas,
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: ['blocked-conteudo-invalido'], fallbackReason: null },
    });
  }
  const ctx = parsed.data;

  // 1. BLOCKED — documento ilegível exigindo OCR (Q4: role/tenancy/segurança
  //    são decididos ANTES, na camada de autenticação/autorização).
  if (ctx.documents.failedCount > 0 && ctx.documents.hasOcrRequired === true) {
    return envelopar({
      status: 'BLOCKED',
      reasons: ['documento-ilegivel'],
      warnings: ['Há documentos que falharam na leitura e requerem OCR. Processe os arquivos antes de continuar.'],
      missingInformation: ['Documentos ilegíveis'],
      pagesRelevant: ctx.documents.relevantPages ?? null,
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: ['blocked-documento-ilegivel'], fallbackReason: null },
    });
  }

  const req = ctx.request;
  const temInstrucao =
    !vazio(req.userInstruction) || !vazio(req.operationRequested) || !vazio(req.pieceType) || !vazio(req.desiredOutput);
  const temFatos = !vazio(ctx.case.facts);
  const temDocumentos = (ctx.documents.count ?? 0) > 0;
  const temProcesso = !vazio(ctx.case.id) || !vazio(ctx.case.processNumber);

  // 2. INSUFFICIENT_DATA — nenhuma informação útil.
  if (!temInstrucao && !temFatos && !temDocumentos && !temProcesso) {
    return envelopar({
      status: 'INSUFFICIENT_DATA',
      reasons: ['sem-dados-suficientes'],
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: ['insufficient-data'], fallbackReason: null },
    });
  }
  if (!temInstrucao && !temFatos) {
    return envelopar({
      status: 'NEEDS_CLARIFICATION',
      reasons: ['intencao-ambigua'],
      missingInformation: ['Descreva o que deseja fazer (peça, análise, revisão ou pesquisa).'],
      caseContext: contextoDoCaso(ctx),
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: ['intencao-ambigua'], fallbackReason: null },
    });
  }

  let resultado: ClassifierOutput;

  // Q1 — Regeneração: sem previousGenerationId válido → não classifica nova
  // operação (NEEDS_CLARIFICATION); com id válido, segue o fluxo normal.
  if (req.isRegeneration === true && vazio(req.previousGenerationId)) {
    resultado = envelopar({
      status: 'NEEDS_CLARIFICATION',
      reasons: ['regeneracao-requer-identificador'],
      warnings: ['A regeneração exige previousGenerationId válido.'],
      missingInformation: ['previousGenerationId'],
      caseContext: contextoDoCaso(ctx),
      decision: { promptVersion: PROMPT_VERSION, rulesApplied: ['regeneracao-requer-identificador'], fallbackReason: null },
    });
  } else if (req.reviewTarget !== undefined) {
    // 3. reviewTarget explícito.
    if (isValidSectionReviewTarget(req.reviewTarget)) {
      resultado = finalizarRevisaoSecao(ctx, 'review-target');
    } else {
      resultado = finalizarDocumentoInteiro(ctx, 'review-target-full-document');
    }
  } else {
    // 4–6. Intenção por precedência: operationRequested → pieceType → userInstruction.
    let intencao: OperationIntent | null = null;
    let origem = '';
    if (!vazio(req.operationRequested)) {
      intencao = resolverTextoOperacao(req.operationRequested, true, ctx);
      origem = 'operation-requested';
    }
    if (!intencao && !vazio(req.pieceType)) {
      intencao = resolverTipoPeca(req.pieceType, ctx);
      origem = 'piece-type';
    }
    if (!intencao && !vazio(req.userInstruction)) {
      intencao = resolverTextoOperacao(req.userInstruction, false, ctx);
      origem = 'user-instruction';
    }

    if (intencao) {
      resultado = finalizarIntencao(ctx, intencao, origem);
    } else {
      // 7. Derivado do caso.
      const doCaso = derivarDoCaso(ctx);
      if (doCaso) {
        resultado = finalizarIntencao(ctx, doCaso, 'case-derived');
      } else if (temDocumentos && (req.includeDocumentAnalysis === true || precisaAnaliseAntesRedacao(ctx))) {
        // 8. Documentos exigem análise.
        resultado = finalizarAnalise(ctx, 'documents-derived');
      } else {
        // 9. Intenção ambígua.
        resultado = envelopar({
          status: 'NEEDS_CLARIFICATION',
          reasons: ['intencao-ambigua'],
          missingInformation: ['Operação desejada'],
          caseContext: contextoDoCaso(ctx),
          decision: { promptVersion: PROMPT_VERSION, rulesApplied: ['intencao-ambigua'], fallbackReason: null },
        });
      }
    }
  }

  // Q1 — regeneração válida: registra a regra aplicada sem mudar a decisão.
  if (req.isRegeneration === true && !vazio(req.previousGenerationId)) {
    resultado = envelopar({
      ...resultado,
      reasons: [...resultado.reasons, 'regeneracao'],
      decision: {
        ...resultado.decision,
        rulesApplied: [...resultado.decision.rulesApplied, 'regeneracao'],
      },
    });
  }

  return resultado;
}

/**
 * Ponto de entrada: classifica a entrada bruta e devolve o envelope do
 * contrato v3. A saída é revalidada contra o schema de saída (garantia
 * estrutural); qualquer violação interna vira erro de programação nos testes.
 */
export function classifyAiOperation(rawInput: unknown): ClassifierOutput {
  return classifierOutputSchema.parse(decidir(rawInput));
}
