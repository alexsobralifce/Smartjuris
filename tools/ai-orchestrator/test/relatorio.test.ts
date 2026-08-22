// ===========================================================================
// Relatório de andamento (`printRelatorio` / `ai:relatorio`) — deve ser
// robusto a runs ausentes, runs parciais, auditorias inválidas e múltiplas
// fases. Também cobre o parsing do cabeçalho `GPT-5.6 Luna — revisão`.
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { printRelatorio } from '../src/commands.js';
import { extractPhasePrompts } from '../src/prompts.js';
import type { RunDeps } from '../src/run.js';

function fakeDeps(aiDevDir: string): RunDeps {
  return {
    repoRoot: aiDevDir,
    aiDevDir,
    config: {
      project: 'smartjuris',
      roadmap: 'implementation-roadmap.md',
      phasePrompts: 'docs/ai-development/smartjuris-phase-prompts.md',
      templates: 'docs/ai-development/smartjuris-prompt-templates.md',
      governance: 'docs/ai-development/smartjuris-ai-development-chain.md',
      implementer: { provider: 'deepseek', model: 'deepseek-v4-flash', complexModel: 'deepseek-v4-pro' },
      reviewer: { provider: 'openai', model: 'gpt-5.6-luna' },
      limits: { maxCorrectionAttempts: 20, requireTests: true, requireBuild: true, requireDiff: true, blockOnHigh: true, blockOnBlocker: true },
      commands: {
        apiTests: 'pnpm --filter @lexia/api test',
        webTests: 'pnpm --filter @lexia/web test',
        apiBuild: 'pnpm --filter @lexia/api build',
        webBuild: 'pnpm --filter @lexia/web build',
        gitStatus: 'git status --short',
        diffStat: 'git diff --stat',
      },
    },
    env: {},
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    exec: {} as any,
    git: { porcelain: async () => ' M src/x.ts\n', headSha: async () => 'a'.repeat(40) } as any,
    llm: {} as any,
  } as unknown as RunDeps;
}

const ROADMAP = `## Roadmap geral

| Fase | Descrição | Dependências | Estado | Implementador | Revisor |
|------|-----------|--------------|--------|---------------|---------|
| 2A | Segurança documental | — | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Luna |
| 3D | Integração frontend | 3C | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Luna |
| 4B | Piloto controlado | 4A | \`CORRECTION_PENDING\` | DeepSeek | GPT-5.6 Luna |

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avançou | Nota |
|------|------|---------------|---------|----------|---------|------|
| 2026-08-22 | 4B | DeepSeek | GPT-5.6 Luna | REJECT | não | — |
`;

let tmpRoot = '';
let runsDir = '';

before(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'relatorio-'));
  mkdirSync(join(tmpRoot, 'runs'), { recursive: true });
  runsDir = join(tmpRoot, 'runs');
  writeFileSync(join(tmpRoot, 'implementation-roadmap.md'), ROADMAP);
});

after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function criaRun(id: string, fase: string, runJson?: string | null, auditJson?: string | null): void {
  const dir = join(runsDir, id);
  mkdirSync(dir, { recursive: true });
  if (runJson !== null) writeFileSync(join(dir, 'run.json'), runJson ?? '');
  if (auditJson !== null) writeFileSync(join(dir, '10-audit-result.json'), auditJson ?? '');
}

describe('printRelatorio (ai:relatorio)', () => {
  test('com runs AUSENTES, PARCIAIS e auditoria INVÁLIDA: não quebra e lista as fases', async () => {
    // 1) run sem run.json (parcial) e sem auditoria.
    criaRun('20260822T100000Z-2A', '2A', null, null);
    // 2) run com run.json mas auditoria INVÁLIDA (JSON quebrado).
    criaRun('20260822T110000Z-3D', '3D', JSON.stringify({ status: 'AUDIT_PENDING', reviewerModel: 'gpt-5.6-luna' }), '{invalido');
    // 3) run completo com veredito REJECT + achados HIGH.
    criaRun(
      '20260822T120000Z-4B',
      '4B',
      JSON.stringify({ status: 'AUDIT_FAILED', reviewerModel: 'gpt-5.6-luna' }),
      JSON.stringify({ verdict: 'REJECT', findings: [{ severity: 'HIGH', file: 'x.ts', requirement: 'r' }, { severity: 'LOW', file: 'y.ts', requirement: 'z' }], missingTests: [] }),
    );
    // 4) run completo com APPROVE (sem achados).
    criaRun(
      '20260822T130000Z-4B',
      '4B',
      JSON.stringify({ status: 'AUDIT_APPROVED', reviewerModel: 'gpt-5.6-luna' }),
      JSON.stringify({ verdict: 'APPROVE', findings: [{ severity: 'PASS', file: null, requirement: 'ok' }], missingTests: [] }),
    );

    const saidas: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => saidas.push(a.join(' '));
    try {
      await printRelatorio(fakeDeps(tmpRoot));
    } finally {
      console.log = orig;
    }
    const texto = saidas.join('\n');
    // Fases listadas.
    assert.match(texto, /2A/, 'fase 2A listada (run parcial não quebra)');
    assert.match(texto, /3D/, 'fase 3D listada (auditoria inválida não quebra)');
    assert.match(texto, /4B/, 'fase 4B listada');
    // Revisor atual do config.
    assert.match(texto, /gpt-5.6-luna/, 'revisor atual exibido');
    // Último veredito da 4B = APPROVE (run mais recente vence) com achados 0.
    assert.match(texto, /4B\s+CORRECTION_PENDING\s+2\s+APPROVE/, '4B mostra 2 rounds e APPROVE como último veredito');
    // Validações por fase: 4B com APPROVE (e sem (H)).
    assert.match(texto, /4B: .*APPROVE(?!\([1-9]H\))/, 'histórico de validações da 4B termina em APPROVE');
    // Working tree não quebra (porcelain fake).
    assert.match(texto, /Working tree/, 'estado do working tree exibido');
  });

  test('sem diretório runs: não quebra e lista fases sem rounds', async () => {
    const semRuns = mkdtempSync(join(tmpdir(), 'relatorio-semruns-'));
    mkdirSync(join(semRuns, 'runs'), { recursive: true });
    writeFileSync(join(semRuns, 'implementation-roadmap.md'), ROADMAP);
    const saidas: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => saidas.push(a.join(' '));
    try {
      await printRelatorio(fakeDeps(semRuns));
    } finally {
      console.log = orig;
    }
    const texto = saidas.join('\n');
    assert.match(texto, /4B\s+CORRECTION_PENDING\s+—/, 'fase sem rounds mostra "—"');
  });
});

describe('extractPhasePrompts — cabeçalho do revisor (GPT-5.6 Luna)', () => {
  test('extrai a seção de revisão do cabeçalho `## GPT-5.6 Luna — revisão`', () => {
    const md = [
      '# 4B — Piloto controlado',
      '',
      '## DeepSeek — implementação',
      '',
      '```text',
      'implemente',
      '```',
      '',
      '## GPT-5.6 Luna — revisão',
      '',
      '```text',
      'analise e retorne o veredito',
      '```',
      '',
    ].join('\n');
    const r = extractPhasePrompts(md, '4B');
    assert.equal(r.name, 'Piloto controlado');
    assert.match(r.implementer, /implemente/);
    assert.match(r.reviewer, /retorne o veredito/, 'seção de revisão Luna extraída');
  });
});
