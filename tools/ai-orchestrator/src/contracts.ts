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
  commands: z.object({
    apiTests: z.string(),
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

export const RunStatus = z.enum(['RUNNING', 'COMPLETED', 'AUDIT_APPROVED', 'CORRECTION_PENDING', 'AUDIT_FAILED', 'FAILED']);
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
}).strict();
export type RunSummary = z.infer<typeof RunSummary>;
