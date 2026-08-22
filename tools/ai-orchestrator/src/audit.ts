// ===========================================================================
// Gate de aprovação — mesma lógica do contrato em smartjuris-ai-development-chain.md:
// canAdvance exige APPROVE, advanceAllowed=true, nenhum BLOCKER/HIGH,
// requiredFixes vazio e scopeViolations vazio.
// ===========================================================================

import { type AuditResult, type PhaseState, type Verdict } from './contracts.js';

export function hasBlockingFinding(audit: AuditResult): boolean {
  return audit.findings.some(
    (f) => f.severity === 'BLOCKER' || f.severity === 'HIGH',
  );
}

export function canAdvance(audit: AuditResult): boolean {
  return (
    audit.verdict === 'APPROVE' &&
    audit.advanceAllowed === true &&
    !hasBlockingFinding(audit) &&
    audit.requiredFixes.length === 0 &&
    audit.scopeViolations.length === 0
  );
}

export interface EvidenceGate {
  testsPass: boolean;
  buildsPass: boolean;
  hasDiff: boolean;
  requireTests: boolean;
  requireBuild: boolean;
  requireDiff: boolean;
}

/**
 * Evidências locais (testes/build/diff) também bloqueiam o avanço, mesmo que o
 * revisor diga APPROVE (governança: "Não avance quando testes/build falhando").
 */
export function evidenceOk(gate: EvidenceGate): boolean {
  if (gate.requireTests && !gate.testsPass) return false;
  if (gate.requireBuild && !gate.buildsPass) return false;
  if (gate.requireDiff && !gate.hasDiff) return false;
  return true;
}

export function auditNextState(
  audit: AuditResult,
  gate: EvidenceGate,
): { state: PhaseState; advanceAllowed: boolean; reason: string } {
  if (audit.verdict === 'APPROVE' && canAdvance(audit) && evidenceOk(gate)) {
    return { state: 'AUDIT_APPROVED', advanceAllowed: true, reason: 'gate aprovado' };
  }
  if (audit.verdict === 'APPROVE' && (!canAdvance(audit) || !evidenceOk(gate))) {
    const reason = !canAdvance(audit)
      ? 'revisor aprovou, mas o gate detectou BLOCKER/HIGH, requiredFixes ou scopeViolations'
      : 'revisor aprovou, mas testes/build/diff não passaram';
    return { state: 'AUDIT_FAILED', advanceAllowed: false, reason };
  }
  if (audit.verdict === 'APPROVE_WITH_CONDITIONS') {
    return { state: 'CORRECTION_PENDING', advanceAllowed: false, reason: 'condições pendentes' };
  }
  return { state: 'AUDIT_FAILED', advanceAllowed: false, reason: 'reprovado' };
}

export function verdictLabel(verdict: Verdict): string {
  return verdict;
}
