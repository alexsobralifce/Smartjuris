// ===========================================================================
// Catálogo compartilhado — FONTE ÚNICA de planos e operações de IA.
//
// `classifier.ts` e `usage.ts` (apps/api) importam ESTA fonte. Nenhum catálogo
// duplicado deve permanecer nos consumidores. Valores seguem o contrato aprovado
// (roadmap Fase 2B) e todas as quantias financeiras são em centavos inteiros.
// ===========================================================================

// --- Planos canônicos ---

export const PLAN_CODES = ['ESSENTIAL', 'PROFESSIONAL', 'OFFICE'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Aliases de plano (banco/painel legado) → plano canônico. NUNCA alteram dados. */
export const PLAN_ALIASES: Record<string, PlanCode> = {
  basico: 'ESSENTIAL',
  starter: 'ESSENTIAL',
  pro: 'PROFESSIONAL',
  profissional: 'PROFESSIONAL',
  office: 'OFFICE',
  enterprise: 'OFFICE',
};

export function normalizePlan(value: string | null | undefined): PlanCode | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if ((PLAN_CODES as readonly string[]).includes(upper)) return upper as PlanCode;
  return PLAN_ALIASES[value.trim().toLowerCase()] ?? null;
}

export interface PlanLimits {
  creditsMonthly: number;
  maxReserveCents: number;
  maxOpCostCents: number;
}

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  ESSENTIAL: { creditsMonthly: 20, maxReserveCents: 4_500, maxOpCostCents: 240 },
  PROFESSIONAL: { creditsMonthly: 50, maxReserveCents: 7_500, maxOpCostCents: 400 },
  OFFICE: { creditsMonthly: 100, maxReserveCents: 12_500, maxOpCostCents: 600 },
};

// --- Operações de IA ---

export const AI_OPERATIONS = [
  'SIMPLE_PETITION',
  'SECTION_REVIEW',
  'STANDARD_PETITION',
  'DOCUMENT_ANALYSIS_20_PAGES',
  'JURISPRUDENCE_RESEARCH',
  'APPEAL',
  'COMPLEX_DOCUMENT',
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

export type ModelTier = 'FLASH' | 'PRO';
export type Classification = 'SIMPLE' | 'STANDARD' | 'COMPLEX';

export interface OperationCatalogEntry {
  operation: AiOperation;
  classification: Classification;
  model: ModelTier;
  credits: number;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  maxOutputPages: number | null;
  maxAttachmentPages: number | null;
  /** Limite de resultados (ex.: pesquisa jurisprudencial → 8). */
  resultLimit: number | null;
  /** Páginas por bloco (análise documental → 20). */
  blockSizePages: number | null;
  isDraftingOperation: boolean;
  requiresHumanReview: boolean;
  isAnalysisOperation: boolean;
  isStandaloneSearch: boolean;
}

/** Bloco padrão da análise documental (20 páginas). */
export const ANALYSIS_BLOCK_SIZE_PAGES = 20;

export const OPERATION_CATALOG: Record<AiOperation, OperationCatalogEntry> = {
  SIMPLE_PETITION: {
    operation: 'SIMPLE_PETITION',
    classification: 'SIMPLE',
    model: 'FLASH',
    credits: 1,
    maxInputTokens: 8_000,
    maxOutputTokens: 2_500,
    maxOutputPages: 3,
    maxAttachmentPages: 10,
    resultLimit: null,
    blockSizePages: null,
    isDraftingOperation: true,
    requiresHumanReview: true,
    isAnalysisOperation: false,
    isStandaloneSearch: false,
  },
  SECTION_REVIEW: {
    operation: 'SECTION_REVIEW',
    classification: 'SIMPLE',
    model: 'FLASH',
    credits: 1,
    maxInputTokens: 8_000,
    maxOutputTokens: 2_000,
    maxOutputPages: 3,
    maxAttachmentPages: 10,
    resultLimit: null,
    blockSizePages: null,
    isDraftingOperation: true,
    requiresHumanReview: true,
    isAnalysisOperation: false,
    isStandaloneSearch: false,
  },
  STANDARD_PETITION: {
    operation: 'STANDARD_PETITION',
    classification: 'STANDARD',
    model: 'FLASH',
    credits: 1,
    maxInputTokens: 25_000,
    maxOutputTokens: 10_000,
    maxOutputPages: 12,
    maxAttachmentPages: 20,
    resultLimit: null,
    blockSizePages: null,
    isDraftingOperation: true,
    requiresHumanReview: true,
    isAnalysisOperation: false,
    isStandaloneSearch: false,
  },
  DOCUMENT_ANALYSIS_20_PAGES: {
    operation: 'DOCUMENT_ANALYSIS_20_PAGES',
    classification: 'STANDARD',
    model: 'FLASH',
    credits: 1,
    maxInputTokens: 25_000,
    maxOutputTokens: 4_000,
    maxOutputPages: 20,
    maxAttachmentPages: 20,
    resultLimit: null,
    blockSizePages: ANALYSIS_BLOCK_SIZE_PAGES,
    isDraftingOperation: false,
    requiresHumanReview: false,
    isAnalysisOperation: true,
    isStandaloneSearch: false,
  },
  JURISPRUDENCE_RESEARCH: {
    operation: 'JURISPRUDENCE_RESEARCH',
    classification: 'SIMPLE',
    model: 'FLASH',
    credits: 1,
    maxInputTokens: 12_000,
    maxOutputTokens: 3_000,
    maxOutputPages: 8,
    maxAttachmentPages: 8,
    resultLimit: 8,
    blockSizePages: null,
    isDraftingOperation: false,
    requiresHumanReview: false,
    isAnalysisOperation: false,
    isStandaloneSearch: true,
  },
  APPEAL: {
    operation: 'APPEAL',
    classification: 'COMPLEX',
    model: 'PRO',
    credits: 1,
    maxInputTokens: 35_000,
    maxOutputTokens: 13_000,
    maxOutputPages: 15,
    maxAttachmentPages: 40,
    resultLimit: null,
    blockSizePages: null,
    isDraftingOperation: true,
    requiresHumanReview: true,
    isAnalysisOperation: false,
    isStandaloneSearch: false,
  },
  COMPLEX_DOCUMENT: {
    operation: 'COMPLEX_DOCUMENT',
    classification: 'COMPLEX',
    model: 'PRO',
    credits: 1,
    maxInputTokens: 45_000,
    maxOutputTokens: 18_000,
    maxOutputPages: 20,
    maxAttachmentPages: 60,
    resultLimit: null,
    blockSizePages: null,
    isDraftingOperation: true,
    requiresHumanReview: true,
    isAnalysisOperation: false,
    isStandaloneSearch: false,
  },
};
