// ===========================================================================
// Testes do findings ledger: IDs estáveis, reconciliação entre rodadas e
// eliminação do "goalpost moving" (o MESMO achado reescrito mantém o mesmo ID).
// ===========================================================================

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { reconcileLedger, readLedger, openFindings, findingId, findingSimilarity, normalizeForMatching } from '../src/ledger.js';
import type { AuditResult } from '../src/contracts.js';

const tmpRoots: string[] = [];

function makeAiDev(): string {
  const root = mkdtempSync(join(tmpdir(), 'ledger-'));
  const aiDev = join(root, 'docs', 'ai-development');
  mkdirSync(join(aiDev, 'runs'), { recursive: true });
  tmpRoots.push(root);
  return aiDev;
}

after(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
});

function finding(severity: 'BLOCKER' | 'HIGH', requirement: string, file = 'x.ts'): AuditResult['findings'][number] {
  return { severity, file, line: 1, requirement, evidence: 'e', impact: 'i', action: 'a' };
}

function audit(findings: AuditResult['findings']): AuditResult {
  return {
    phase: '3A',
    verdict: 'REJECT',
    advanceAllowed: false,
    findings,
    requiredFixes: [],
    missingTests: [],
    scopeViolations: [],
    migrationRisks: [],
    securityRisks: [],
    financialRisks: [],
    rollbackRisks: [],
    nextPhase: null,
  };
}

describe('ledger — normalização e similaridade', () => {
  test('redações diferentes do MESMO achado são similares', () => {
    const a = 'Cada unidade deve representar no máximo 20 páginas reais e respeitar os limites de entrada';
    const b = 'Cada bloco deve representar no máximo 20 páginas sem lacunas';
    assert.ok(findingSimilarity(a, b) >= 0.35, `similaridade ${findingSimilarity(a, b)} deveria ser >= 0.35`);
  });

  test('achados distintos têm baixa similaridade', () => {
    const a = 'Cada unidade deve representar no máximo 20 páginas';
    const b = 'A reserva financeira deve refletir o volume real enviado ao provedor';
    assert.ok(findingSimilarity(a, b) < 0.35);
  });

  test('normalização remove acentos e capitalização', () => {
    assert.equal(normalizeForMatching('Idempotência concorrente'), 'idempotencia concorrente');
  });

  test('findingId é estável para o mesmo conteúdo', () => {
    const f = finding('HIGH', 'blocos de no máximo 20 páginas');
    assert.equal(findingId(f), findingId({ ...f }));
  });
});

describe('ledger — reconciliação entre rodadas', () => {
  test('mesmo achado reescrito mantém o ID (fim do goalpost moving)', async () => {
    const aiDev = makeAiDev();
    // Rodada 1: cria 2 achados.
    await reconcileLedger(aiDev, '3A', 'run-1', audit([
      finding('HIGH', 'Cada unidade deve representar no máximo 20 páginas reais'),
      finding('BLOCKER', 'A idempotência por bloco deve impedir geração duplicada sob concorrência'),
    ]));
    const after1 = openFindings(await readLedger(aiDev, '3A'));
    assert.equal(after1.length, 2);

    // Rodada 2: MESMO tema com redação diferente → mantém o ID, não duplica.
    await reconcileLedger(aiDev, '3A', 'run-2', audit([
      finding('HIGH', 'Os blocos devem ter no máximo 20 páginas sem lacunas', 'x.ts'),
    ]));
    const after2 = await readLedger(aiDev, '3A');
    const open2 = openFindings(after2);
    // 1 resolvido (idempotência sumiu) + 1 ainda aberto (blocos) = 1 aberto.
    assert.equal(open2.length, 1);
    assert.equal(open2[0].requirement, 'Os blocos devem ter no máximo 20 páginas sem lacunas');
    // O id do achado de blocos é o MESMO da rodada 1.
    const blockId1 = after1.find((e) => e.requirement.includes('20 páginas'))!.id;
    assert.equal(open2[0].id, blockId1, 'mesmo ID preservado entre redações diferentes');
  });

  test('achado resolvido vira RESOLVED e registra o run', async () => {
    const aiDev = makeAiDev();
    await reconcileLedger(aiDev, '3A', 'run-1', audit([finding('HIGH', 'idempotência por bloco')]));
    // Rodada 2: sem achados graves → item anterior RESOLVED.
    await reconcileLedger(aiDev, '3A', 'run-2', audit([]));
    const ledger = await readLedger(aiDev, '3A');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].status, 'RESOLVED');
    assert.equal(ledger[0].resolvedRunId, 'run-2');
  });

  test('MEDIUM/LOW nunca entram no ledger', async () => {
    const aiDev = makeAiDev();
    await reconcileLedger(aiDev, '3A', 'run-1', audit([
      { severity: 'MEDIUM', file: 'x', line: 1, requirement: 'melhorar nome', evidence: 'e', impact: 'i', action: 'a' },
      { severity: 'LOW', file: 'y', line: 2, requirement: 'cosmético', evidence: 'e', impact: 'i', action: 'a' },
    ]));
    const ledger = await readLedger(aiDev, '3A');
    assert.equal(ledger.length, 0, 'MEDIUM/LOW são débito técnico, não entram no ledger');
  });

  test('novo HIGH legítimo cria novo ID', async () => {
    const aiDev = makeAiDev();
    await reconcileLedger(aiDev, '3A', 'run-1', audit([finding('HIGH', 'blocos de 20 páginas')]));
    await reconcileLedger(aiDev, '3A', 'run-2', audit([
      finding('HIGH', 'blocos de 20 páginas'),
      finding('HIGH', 'fencing do lease impede liquidação duplicada'),
    ]));
    const open = openFindings(await readLedger(aiDev, '3A'));
    assert.equal(open.length, 2, '1 reaberto + 1 novo legítimo');
  });
});
