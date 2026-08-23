// ===========================================================================
// Contratos Zod — mesma semântica dos contratos JSON definidos em
// docs/ai-development/smartjuris-ai-development-chain.md e
// docs/ai-development/smartjuris-prompt-templates.md.
// ===========================================================================

import { z } from 'zod';

// --- Estados de fase (roadmap) ---

export const PHASE_STATES = [
  'PLANNED',
  'IMPLEMENTING',
  'IMPLEMENTED',
  'AUDIT_PENDING',
  'AUDIT_FAILED',
  'CORRECTION_PENDING',
  'AUDIT_APPROVED',
  'BLOCKED',
] as const;

export const PhaseState = z.enum(PHASE_STATES);
export type PhaseState = z.infer<typeof PhaseState>;

// --- Roadmap ---

export const RoadmapPhase = z.object({
  id: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()),
  status: PhaseState,
  implementer: z.string(),
  reviewer: z.string(),
});
export type RoadmapPhase = z.infer<typeof RoadmapPhase>;

export const Roadmap = z.object({
  phases: z.array(RoadmapPhase),
});
export type Roadmap = z.infer<typeof Roadmap>;

// --- Configuração de automação (automation-config.json) ---

export const PreflightMode = z.enum(['collect-all', 'fail-fast']);
export type PreflightMode = z.infer<typeof PreflightMode>;

export const AutomationConfig = z.object({
  project: z.string(),
  roadmap: z.string(),
  phasePrompts: z.string(),
  templates: z.string(),
  governance: z.string(),
  implementer: z.object({
    provider: z.string(),
    model: z.string(),
    complexModel: z.string(),
    /** A partir de quantas tentativas de correção o implementador sobe para complexModel (flash→pro). */
    escalateAfterAttempts: z.number().int().nonnegative().default(2).optional(),
  }),
  reviewer: z.object({
    provider: z.string(),
    model: z.string(),
  }),
  limits: z.object({
    maxCorrectionAttempts: z.number().int(),
    requireTests: z.boolean(),
    requireBuild: z.boolean(),
    requireDiff: z.boolean(),
    blockOnHigh: z.boolean(),
    blockOnBlocker: z.boolean(),
  }),
  preflight: z.object({
    mode: PreflightMode,
  }).default({ mode: 'collect-all' }).optional(),
  pricing: z.object({
    version: z.string(),
    overheadMultiplier: z.number().positive(),
    models: z.array(z.object({
      provider: z.string(),
      model: z.string(),
      inputMissUsdPerMillion: z.number().nonnegative(),
      inputHitUsdPerMillion: z.number().nonnegative(),
      outputUsdPerMillion: z.number().nonnegative(),
    })),
  }).default({ version: 'unconfigured', overheadMultiplier: 1, models: [] }).optional(),
  commands: z.object({
    apiTests: z.string(),
    webTests: z.string(),
    apiBuild: z.string(),
    webBuild: z.string(),
    gitStatus: z.string(),
    diffStat: z.string(),
  }),
});
export type AutomationConfig = z.infer<typeof AutomationConfig>;

// --- Auditoria (contrato do GPT-5.6 Terra) ---

export const VERDICTS = ['APPROVE', 'APPROVE_WITH_CONDITIONS', 'REJECT'] as const;
export const Verdict = z.enum(VERDICTS);
export type Verdict = z.infer<typeof Verdict>;

export const Severity = z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'PASS']);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  severity: Severity,
  file: z.string().nullable(),
  line: z.number().int().nullable(),
  requirement: z.string(),
  evidence: z.string(),
  impact: z.string(),
  action: z.string(),
});
export type Finding = z.infer<typeof Finding>;

/**
 * Schema ESTRITO do resultado de revisão: campos exatamente do contrato.
 * Campos extras fazem o parse falhar (o orquestrador tenta uma correção única
 * informando o erro ao revisor, nunca aceita JSON fora do contrato).
 */
export const AuditResult = z.object({
  phase: z.string(),
  verdict: Verdict,
  advanceAllowed: z.boolean(),
  findings: z.array(Finding),
  requiredFixes: z.array(z.string()),
  missingTests: z.array(z.string()),
  scopeViolations: z.array(z.string()),
  migrationRisks: z.array(z.string()),
  securityRisks: z.array(z.string()),
  financialRisks: z.array(z.string()),
  rollbackRisks: z.array(z.string()),
  nextPhase: z.string().nullable(),
}).strict();
export type AuditResult = z.infer<typeof AuditResult>;

// --- Relatório do implementador (informativo; gerado a partir das evidências) ---

export const TestResult = z.object({
  command: z.string(),
  result: z.enum(['PASS', 'FAIL']),
  details: z.string(),
});
export type TestResult = z.infer<typeof TestResult>;

export const ImplementerReport = z.object({
  phase: z.string(),
  status: z.enum(['IMPLEMENTED', 'BLOCKED']),
  summary: z.string(),
  filesChanged: z.array(z.string()),
  diffStat: z.string(),
  tests: z.array(TestResult),
  build: z.object({
    command: z.string(),
    result: z.enum(['PASS', 'FAIL']),
    details: z.string(),
  }),
  migrations: z.array(z.object({ file: z.string(), applied: z.boolean(), details: z.string() })),
  decisions: z.array(z.string()),
  limitations: z.array(z.string()),
  risks: z.array(z.string()),
  nextStep: z.string(),
});
export type ImplementerReport = z.infer<typeof ImplementerReport>;

// --- Resumo de execução (run.json) ---

export const RUN_MODES = ['interactive', 'auto-commit', 'no-auto-commit', 'allow-dirty', 'dry-run', 'autonomous', 'manual-approval'] as const;
export const RunMode = z.enum(RUN_MODES);
export type RunMode = z.infer<typeof RunMode>;

export const RunStatus = z.enum(['RUNNING', 'COMPLETED', 'AUDIT_APPROVED', 'CORRECTION_PENDING', 'AUDIT_FAILED', 'FAILED', 'DRY_RUN']);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunSummary = z.object({
  runId: z.string(),
  phase: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: RunStatus,
  branch: z.string().nullable(),
  implementerModel: z.string(),
  reviewerModel: z.string(),
  artifactFiles: z.array(z.string()),
  audit: AuditResult.optional(),
  error: z.string().optional(),
  // Fase de checkpoint / rastreabilidade do estado inicial.
  mode: RunMode.optional(),
  initialSha: z.string().nullable().optional(),
  finalSha: z.string().nullable().optional(),
  preRunFiles: z.array(z.string()).optional(),
  // Modo autônomo: próxima fase elegível para a qual esta fase avançou.
  continuedTo: z.string().nullable().optional(),
  // Cache de auditoria: hash do contexto de revisão (reuso de veredito) e
  // flag indicando que o veredito veio do cache (sem chamada ao revisor).
  contextHash: z.string().optional(),
  fromCache: z.boolean().optional(),
  skippedReviewer: z.boolean().optional(),
  skipReason: z.enum(['preflight_failed', 'no_diff']).optional(),
  reviewedSha: z.string().nullable().optional(),
  manualApproval: z.object({
    approvedBy: z.string(),
    reason: z.string(),
    approvedAt: z.string(),
  }).optional(),
  tokenUsage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).optional(),
  costEstimateUsd: z.number().nonnegative().nullable().optional(),
}).strict();
export type RunSummary = z.infer<typeof RunSummary>;

// --- Requisitos estruturados (entrada do orquestrador) ---
//
// O usuário entrega o requisito em linguagem natural; o orquestrador (via LLM
// estruturador) o converte neste contrato — enumerado, validável e consumível
// pelas fases (roadmap + prompts gerados a partir dele).

export const RequirementPhase = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'id de fase inválido'),
  titulo: z.string().min(1),
  descricao: z.string().min(1),
  dependencias: z.array(z.string()).default([]),
  escopo: z.string().min(1),
  foraDoEscopo: z.string().default(''),
  testesObrigatorios: z.array(z.string()).default([]),
  criteriosAceite: z.array(z.string()).min(1, 'defina ao menos 1 critério de aceite'),
}).strict();
export type RequirementPhase = z.infer<typeof RequirementPhase>;

export const RequirementsDoc = z.object({
  fases: z.array(RequirementPhase).min(1, 'nenhuma fase extraída'),
}).strict();
export type RequirementsDoc = z.infer<typeof RequirementsDoc>;
