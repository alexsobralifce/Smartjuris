// Testes do gate de aprovação (canAdvance, evidenceOk, auditNextState).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canAdvance, hasBlockingFinding, evidenceOk, auditNextState, type EvidenceGate } from '../src/audit.js';
import type { AuditResult } from '../src/contracts.js';

function audit(overrides: Partial<AuditResult>): AuditResult {
  return {
    phase: '2A.1',
    verdict: 'APPROVE',
    advanceAllowed: true,
    findings: [],
    requiredFixes: [],
    missingTests: [],
    scopeViolations: [],
    migrationRisks: [],
    securityRisks: [],
    financialRisks: [],
    rollbackRisks: [],
    nextPhase: null,
    ...overrides,
  };
}

const GATE_OK: EvidenceGate = {
  testsPass: true,
  buildsPass: true,
  hasDiff: true,
  requireTests: true,
  requireBuild: true,
  requireDiff: true,
};

describe('canAdvance', () => {
  test('aprova quando contrato atendido', () => {
    assert.equal(canAdvance(audit({})), true);
  });

  test('rejeita verdict diferente de APPROVE', () => {
    assert.equal(canAdvance(audit({ verdict: 'APPROVE_WITH_CONDITIONS' })), false);
    assert.equal(canAdvance(audit({ verdict: 'REJECT' })), false);
  });

  test('rejeita advanceAllowed=false', () => {
    assert.equal(canAdvance(audit({ advanceAllowed: false })), false);
  });

  test('rejeita BLOCKER e HIGH em findings', () => {
    assert.equal(hasBlockingFinding(audit({ findings: [{ severity: 'BLOCKER', file: 'x', line: 1, requirement: 'r', evidence: 'e', impact: 'i', action: 'a' }] })), true);
    assert.equal(hasBlockingFinding(audit({ findings: [{ severity: 'HIGH', file: 'x', line: 1, requirement: 'r', evidence: 'e', impact: 'i', action: 'a' }] })), true);
    assert.equal(canAdvance(audit({ findings: [{ severity: 'HIGH', file: 'x', line: 1, requirement: 'r', evidence: 'e', impact: 'i', action: 'a' }] })), false);
  });

  test('rejeita requiredFixes ou scopeViolations não vazios', () => {
    assert.equal(canAdvance(audit({ requiredFixes: ['x'] })), false);
    assert.equal(canAdvance(audit({ scopeViolations: ['y'] })), false);
  });
});

describe('evidenceOk', () => {
  test('testes/build/diff exigidos devem passar', () => {
    assert.equal(evidenceOk(GATE_OK), true);
    assert.equal(evidenceOk({ ...GATE_OK, testsPass: false }), false);
    assert.equal(evidenceOk({ ...GATE_OK, buildsPass: false }), false);
    assert.equal(evidenceOk({ ...GATE_OK, hasDiff: false }), false);
  });

  test('requisitos desligados não bloqueiam', () => {
    assert.equal(
      evidenceOk({ testsPass: false, buildsPass: false, hasDiff: false, requireTests: false, requireBuild: false, requireDiff: false }),
      true,
    );
  });
});

describe('auditNextState', () => {
  test('APPROVE + gate + evidências → AUDIT_APPROVED', () => {
    const r = auditNextState(audit({}), GATE_OK);
    assert.equal(r.state, 'AUDIT_APPROVED');
    assert.equal(r.advanceAllowed, true);
  });

  test('APPROVE com BLOCKER → AUDIT_FAILED (nunca avança)', () => {
    const r = auditNextState(
      audit({ findings: [{ severity: 'BLOCKER', file: 'x', line: 1, requirement: 'r', evidence: 'e', impact: 'i', action: 'a' }] }),
      GATE_OK,
    );
    assert.equal(r.state, 'AUDIT_FAILED');
    assert.equal(r.advanceAllowed, false);
  });

  test('APPROVE com testes falhando → AUDIT_FAILED', () => {
    const r = auditNextState(audit({}), { ...GATE_OK, testsPass: false });
    assert.equal(r.state, 'AUDIT_FAILED');
  });

  test('APPROVE_WITH_CONDITIONS → CORRECTION_PENDING', () => {
    const r = auditNextState(audit({ verdict: 'APPROVE_WITH_CONDITIONS' }), GATE_OK);
    assert.equal(r.state, 'CORRECTION_PENDING');
  });

  test('REJECT → AUDIT_FAILED', () => {
    const r = auditNextState(audit({ verdict: 'REJECT' }), GATE_OK);
    assert.equal(r.state, 'AUDIT_FAILED');
  });
});
