// Testes dos contratos Zod (estritos): auditoria, relatório, run summary.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AuditResult,
  ImplementerReport,
  RunSummary,
  AutomationConfig,
} from '../src/contracts.js';
import { parseAudit, extractJson, AuditParseError } from '../src/llm.js';

function validAuditJson(): Record<string, unknown> {
  return {
    phase: '2A.1',
    verdict: 'APPROVE',
    advanceAllowed: true,
    findings: [
      {
        severity: 'PASS',
        file: 'src/routes/documentos.ts',
        line: 55,
        requirement: 'tenancy',
        evidence: 'teste HTTP',
        impact: 'isolamento',
        action: 'nenhuma',
      },
    ],
    requiredFixes: [],
    missingTests: [],
    scopeViolations: [],
    migrationRisks: [],
    securityRisks: [],
    financialRisks: [],
    rollbackRisks: [],
    nextPhase: '2A.2',
  };
}

describe('AuditResult (contrato estrito do revisor)', () => {
  test('aceita JSON válido completo', () => {
    const parsed = AuditResult.parse(validAuditJson());
    assert.equal(parsed.verdict, 'APPROVE');
    assert.equal(parsed.findings.length, 1);
  });

  test('rejeita campos extras (schema estrito)', () => {
    assert.throws(
      () => AuditResult.parse({ ...validAuditJson(), extraField: 1 }),
      /Unrecognized key/,
    );
  });

  test('rejeita verdict fora do enum', () => {
    assert.throws(
      () => AuditResult.parse({ ...validAuditJson(), verdict: 'MAYBE' }),
      /Invalid enum value/,
    );
  });

  test('rejeita severidade fora do enum', () => {
    assert.throws(
      () =>
        AuditResult.parse({
          ...validAuditJson(),
          findings: [{ ...(validAuditJson() as any).findings[0], severity: 'CRITICAL' }],
        }),
      /Invalid enum value/,
    );
  });

  test('rejeita campos obrigatórios ausentes', () => {
    const { advanceAllowed: _omit, ...semAdvance } = validAuditJson() as Record<string, unknown>;
    void _omit;
    assert.throws(() => AuditResult.parse(semAdvance), /advanceAllowed/);
  });
});

describe('extractJson / parseAudit', () => {
  test('extrai JSON mesmo com cerca de código markdown', () => {
    const raw = 'Analisando...\n```json\n' + JSON.stringify(validAuditJson()) + '\n```\nfim';
    const audit = parseAudit(raw);
    assert.equal(audit.verdict, 'APPROVE');
  });

  test('lança AuditParseError para JSON ausente', () => {
    assert.throws(() => parseAudit('nenhum json aqui'), AuditParseError);
  });

  test('lança AuditParseError para JSON fora do contrato', () => {
    assert.throws(() => parseAudit(JSON.stringify({ oi: 1 })), AuditParseError);
    assert.throws(() => parseAudit(JSON.stringify({ ...validAuditJson(), verdict: 42 })), AuditParseError);
  });

  test('extractJson pega o primeiro objeto balanceado', () => {
    const json = extractJson('texto { "a": { "b": 1 } } resto');
    assert.deepEqual(json, { a: { b: 1 } });
  });
});

describe('ImplementerReport / RunSummary / AutomationConfig', () => {
  test('relatório do implementador válido', () => {
    const parsed = ImplementerReport.parse({
      phase: '2A.1',
      status: 'IMPLEMENTED',
      summary: 'resumo',
      filesChanged: ['a.ts'],
      diffStat: '1 file',
      tests: [{ command: 'pnpm test', result: 'PASS', details: 'ok' }],
      build: { command: 'pnpm build', result: 'PASS', details: 'ok' },
      migrations: [],
      decisions: [],
      limitations: [],
      risks: [],
      nextStep: 'aguardando auditoria',
    });
    assert.equal(parsed.phase, '2A.1');
  });

  test('relatório com resultado de teste inválido é rejeitado', () => {
    assert.throws(() =>
      ImplementerReport.parse({
        phase: '2A.1',
        status: 'IMPLEMENTED',
        summary: 'x',
        filesChanged: [],
        diffStat: '',
        tests: [{ command: 'x', result: 'PASSED', details: '' }],
        build: { command: 'x', result: 'PASS', details: '' },
        migrations: [],
        decisions: [],
        limitations: [],
        risks: [],
        nextStep: '',
      }),
    );
  });

  test('run summary estrito: campos extras rejeitados', () => {
    assert.throws(
      () =>
        RunSummary.parse({
          runId: 'x',
          phase: '2A.1',
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: null,
          status: 'RUNNING',
          branch: null,
          implementerModel: 'm',
          reviewerModel: 'r',
          artifactFiles: [],
          extra: 1,
        }),
      /Unrecognized key/,
    );
  });

  test('run summary aceita rastreabilidade de checkpoint (mode/initialSha/finalSha/preRunFiles)', () => {
    const parsed = RunSummary.parse({
      runId: 'x',
      phase: '2A.1',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      status: 'AUDIT_APPROVED',
      branch: 'phase/2A.1',
      implementerModel: 'm',
      reviewerModel: 'r',
      artifactFiles: ['run.json'],
      mode: 'auto-commit',
      initialSha: 'a'.repeat(40),
      finalSha: 'b'.repeat(40),
      preRunFiles: ['apps/api/src/server.ts'],
    });
    assert.equal(parsed.mode, 'auto-commit');
    assert.equal(parsed.initialSha, 'a'.repeat(40));
    assert.equal(parsed.preRunFiles?.length, 1);
  });

  test('AutomationConfig aceita o arquivo real do repositório', () => {
    const here = new URL('.', import.meta.url).pathname;
    const cfgPath = join(here, '..', '..', '..', 'docs', 'ai-development', 'automation-config.json');
    if (existsSync(cfgPath)) {
      const parsed = AutomationConfig.parse(JSON.parse(readFileSync(cfgPath, 'utf8')));
      assert.equal(parsed.reviewer.model, 'gpt-5.6-terra');
    }
  });
});
