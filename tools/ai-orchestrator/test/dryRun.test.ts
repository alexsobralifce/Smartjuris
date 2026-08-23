// ===========================================================================
// Dry-run COMPLETO do pipeline: execução integral de runPhase com dependências
// falsas (executor, git e LLM) em um diretório temporário — sem rede, sem git
// real, sem mutação do repositório real. Cobre: fluxo feliz, rejeição,
// BLOCKER apesar de APPROVE, auditoria inválida com correção única, falha de
// infraestrutura com rollback do roadmap, evidência falhando (gate) e dry-run
// offline sem mutação.
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ExecResult, ExecOptions } from '../src/executor.js';
import type { GitOps } from '../src/git.js';
import type { LlmClient } from '../src/llm.js';
import type { AutomationConfig, RunSummary } from '../src/contracts.js';
import { runPhase } from '../src/run.js';
import { planDryRun } from '../src/commands.js';
import type { Logger } from '../src/io.js';
import type { RunDeps } from '../src/run.js';

// --- Fakes ---

class FakeExecutor {
  calls: string[][] = [];
  failCommands = new Set<string>();
  results = new Map<string, ExecResult>();

  private resultFor(argv: string[]): ExecResult {
    const key = argv.join(' ');
    const canned = this.results.get(key);
    if (canned) return canned;
    return {
      command: key,
      ok: !this.failCommands.has(key),
      code: this.failCommands.has(key) ? 1 : 0,
      stdout: this.failCommands.has(key) ? '' : `${key}\nOK`,
      stderr: '',
      durationMs: 1,
    };
  }

  async run(argv: string[], _opts?: ExecOptions): Promise<ExecResult> {
    this.calls.push(argv);
    return this.resultFor(argv);
  }

  async runConfigCommand(commandLine: string, _opts?: ExecOptions): Promise<ExecResult> {
    const argv = commandLine.trim().split(/\s+/);
    return this.run(argv);
  }
}

class FakeGit implements GitOps {
  calls: string[][] = [];
  dirty: string[] = [];
  statusOut = '';
  diffOut = 'diff da fase\n';
  diffStatOut = '1 file changed\n';
  porcelainOut = '';
  headShaOut = 'f'.repeat(40);
  identity = true;
  detached = false;

  async dirtyFilesExcept(): Promise<string[]> {
    return this.dirty;
  }
  async porcelain(): Promise<string> {
    this.calls.push(['git', 'status', '--porcelain=v1', '--untracked-files=all']);
    return this.porcelainOut;
  }
  async headSha(): Promise<string | null> {
    return this.headShaOut;
  }
  async addPaths(paths: string[]): Promise<ExecResult> {
    this.calls.push(['git', 'add', '--', ...paths]);
    return { command: 'git add', ok: true, code: 0, stdout: '', stderr: '', durationMs: 1 };
  }
  async commit(message: string): Promise<ExecResult> {
    this.calls.push(['git', 'commit', '-m', message]);
    return { command: 'git commit', ok: true, code: 0, stdout: '', stderr: '', durationMs: 1 };
  }
  async hasGitIdentity(): Promise<boolean> {
    return this.identity;
  }
  async isDetachedHead(): Promise<boolean> {
    return this.detached;
  }
  async createBranch(branch: string): Promise<ExecResult> {
    this.calls.push(['git', 'checkout', '-b', branch]);
    return { command: 'git checkout -b', ok: true, code: 0, stdout: '', stderr: '', durationMs: 1 };
  }
  async checkoutBranch(branch: string): Promise<ExecResult> {
    this.calls.push(['git', 'checkout', branch]);
    return { command: 'git checkout', ok: true, code: 0, stdout: '', stderr: '', durationMs: 1 };
  }
  async currentBranch(): Promise<string> {
    return 'main';
  }
  async collectDiffArtifacts(): Promise<{ status: string; diffStat: string; diff: string }> {
    this.calls.push(['git', 'status', '--porcelain']);
    return { status: this.statusOut, diffStat: this.diffStatOut, diff: this.diffOut };
  }
}

class FakeLlm implements LlmClient {
  reviewerResponses: string[] = [];
  implementerCalls = 0;
  reviewerCalls = 0;
  implementerError?: Error;

  async implementer(_prompt: string): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    this.implementerCalls += 1;
    if (this.implementerError) throw this.implementerError;
    return { content: 'Fase implementada. Testes: PASS. Build: PASS.', usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } };
  }
  async reviewer(_context: string, correctionHint?: string): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    this.reviewerCalls += 1;
    const content = (correctionHint && this.reviewerResponses.length > 1)
      ? this.reviewerResponses[1]
      : this.reviewerResponses[0] ?? '{}';
    return { content, usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 } };
  }
  async structurer(): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }
}

const silentLog: Logger = { info: () => {}, warn: () => {}, error: () => {}, redact: (s: string) => s };

function validApproveJson(): string {
  return JSON.stringify({
    phase: '2A.1',
    verdict: 'APPROVE',
    advanceAllowed: true,
    findings: [{ severity: 'PASS', file: null, line: null, requirement: 'tenancy', evidence: 'teste', impact: 'nenhum', action: 'nenhuma' }],
    requiredFixes: [],
    missingTests: [],
    scopeViolations: [],
    migrationRisks: [],
    securityRisks: [],
    financialRisks: [],
    rollbackRisks: [],
    nextPhase: '2A.2',
  });
}

const ROADMAP_FIXTURE = `# SmartJuris — Roadmap de Implementação

## Roadmap geral

| Fase | Descrição | Dependências | Estado | Implementador | Revisor |
|---|---|---|---|---|---|
| 2A | Segurança documental e metadados | — | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Terra |
| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |
| 2A.2 | Correção da exportação | 2A.1 | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |

## Fases detalhadas

### 2A.1 — Testes HTTP de tenancy

**Estado:** \`PLANNED\`

**Dependência:** 2A aprovada.

**Objetivo:**

Validar o fluxo completo por HTTP.

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |
|---|---|---|---|---|---|---|
| — | 2A | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | Segurança documental aprovada |
`;

const PROMPTS_FIXTURE = `# SmartJuris — Prompts por Fase

# 2A.1 — Testes HTTP de tenancy

## DeepSeek — implementação

\`\`\`text
Fase atual: 2A.1 — testes HTTP de tenancy.

Implemente somente testes de integração HTTP.
\`\`\`

## GPT-5.6 Terra — revisão

\`\`\`text
Fase: 2A.1.

Analise o diff e os testes. Retorne somente o JSON do contrato.
\`\`\`

# 2A.2 — Correção da exportação

## DeepSeek — implementação

\`\`\`text
Fase atual: 2A.2.
\`\`\`
`;

const CONFIG_FIXTURE: AutomationConfig = {
  project: 'smartjuris',
  roadmap: 'docs/ai-development/implementation-roadmap.md',
  phasePrompts: 'docs/ai-development/smartjuris-phase-prompts.md',
  templates: 'docs/ai-development/smartjuris-prompt-templates.md',
  governance: 'docs/ai-development/smartjuris-ai-development-chain.md',
  implementer: { provider: 'deepseek', model: 'deepseek-v4-flash', complexModel: 'deepseek-v4-pro' },
  reviewer: { provider: 'openai', model: 'gpt-5.6-terra' },
  limits: {
    maxCorrectionAttempts: 2,
    requireTests: true,
    requireBuild: true,
    requireDiff: true,
    blockOnHigh: true,
    blockOnBlocker: true,
  },
  commands: {
    apiTests: 'pnpm --filter @lexia/api test',
    webTests: 'pnpm --filter @lexia/web test',
    apiBuild: 'pnpm --filter @lexia/api build',
    webBuild: 'pnpm --filter @lexia/web build',
    gitStatus: 'git status --short',
    diffStat: 'git diff --stat',
  },
};

let tmpRoot = '';
let aiDevDir = '';
let roadmapPath = '';

before(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'ai-orch-'));
  aiDevDir = join(tmpRoot, 'docs', 'ai-development');
  mkdirSync(aiDevDir, { recursive: true });
  roadmapPath = join(aiDevDir, 'implementation-roadmap.md');
  writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
  writeFileSync(join(aiDevDir, 'smartjuris-phase-prompts.md'), PROMPTS_FIXTURE, 'utf8');
  writeFileSync(join(aiDevDir, 'automation-config.json'), JSON.stringify(CONFIG_FIXTURE, null, 2), 'utf8');
});

after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeDeps(exec: FakeExecutor, git: FakeGit, llm: FakeLlm): RunDeps {
  return {
    exec,
    git,
    llm,
    repoRoot: tmpRoot,
    aiDevDir,
    config: CONFIG_FIXTURE,
    env: {},
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    log: silentLog,
  };
}

function readRoadmap(): string {
  return readFileSync(roadmapPath, 'utf8');
}

function listRunDir(runId: string): string[] {
  const dir = join(aiDevDir, 'runs', runId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

describe('dry-run completo do pipeline (runPhase)', () => {
  test('fluxo feliz: IMPLEMENTING → artefatos → revisor → AUDIT_APPROVED + roadmap/histórico', async () => {
    const exec = new FakeExecutor();
    const git = new FakeGit();
    const llm = new FakeLlm();
    llm.reviewerResponses = [validApproveJson()];
    const deps = makeDeps(exec, git, llm);

    const summary = await runPhase(deps, '2A.1');
    assert.equal(summary.status, 'AUDIT_APPROVED');
    assert.equal(summary.phase, '2A.1');
    assert.equal(summary.branch, 'phase/2A.1');

    // Roadmap atualizado (estado + histórico), demais linhas preservadas.
    const md = readRoadmap();
    assert.match(md, /^\| 2A\.1 \| Testes HTTP de tenancy \| 2A \| `AUDIT_APPROVED` \| DeepSeek \| GPT-5\.6 Terra \|$/m);
    assert.ok(md.includes('**Estado:** `AUDIT_APPROVED`'));
    assert.ok(md.includes('| 2026-01-01 | 2A.1 | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | gate aprovado |'));
    assert.ok(md.includes('| 2A.2 | Correção da exportação | 2A.1 | `PLANNED` |'));

    // Artefatos completos no run dir.
    const files = listRunDir(summary.runId);
    for (const f of [
      '00-prompt-implementer.txt',
      '01-response-implementer.txt',
      '02-git-status.txt',
      '03-git-diff-stat.txt',
      '04-git-diff.txt',
      '05-tests.txt',
      '06-build.txt',
      '07-implementer-report.json',
      '08-review-context.txt',
      '09-review-response.txt',
      '10-audit-result.json',
      '11-evidence.json',
      'run.json',
    ]) {
      assert.ok(files.includes(f), `artefato ausente: ${f}`);
    }
    const runJson = JSON.parse(readFileSync(join(aiDevDir, 'runs', summary.runId, 'run.json'), 'utf8')) as RunSummary;
    assert.equal(runJson.status, 'AUDIT_APPROVED');
    assert.equal(runJson.audit?.verdict, 'APPROVE');

    // Chamadas registradas.
    assert.ok(
      git.calls.some((c) => c[0] === 'git' && c[1] === 'checkout' && c[2] === '-b' && c[3] === 'phase/2A.1'),
      `branch phase criada: ${JSON.stringify(git.calls)}`,
    );
    assert.equal(llm.implementerCalls, 1);
    assert.equal(llm.reviewerCalls, 1);
    const promptTxt = readFileSync(join(aiDevDir, 'runs', summary.runId, '00-prompt-implementer.txt'), 'utf8');
    assert.ok(promptTxt.includes('Fase atual: 2A.1 — Testes HTTP de tenancy'));
    assert.ok(promptTxt.includes('Dependências aprovadas:'));
  });

  test('REJECT → AUDIT_FAILED, sem avanço', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const exec = new FakeExecutor();
    const llm = new FakeLlm();
    llm.reviewerResponses = [
      JSON.stringify({ phase: '2A.1', verdict: 'REJECT', advanceAllowed: false, findings: [{ severity: 'HIGH', file: 'x', line: 1, requirement: 'r', evidence: 'e', impact: 'i', action: 'a' }], requiredFixes: ['corrigir'], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: null }),
    ];
    const summary = await runPhase(makeDeps(exec, new FakeGit(), llm), '2A.1');
    assert.equal(summary.status, 'AUDIT_FAILED');
    assert.match(readRoadmap(), /^\| 2A\.1 \| Testes HTTP de tenancy \| 2A \| `AUDIT_FAILED` \| DeepSeek \| GPT-5\.6 Terra \|$/m);
  });

  test('APPROVE com BLOCKER → gate bloqueia (nunca avança)', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const llm = new FakeLlm();
    llm.reviewerResponses = [
      JSON.stringify({ phase: '2A.1', verdict: 'APPROVE', advanceAllowed: true, findings: [{ severity: 'BLOCKER', file: 'x', line: 1, requirement: 'tenancy', evidence: 'vazamento', impact: 'alto', action: 'corrigir' }], requiredFixes: [], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: '2A.2' }),
    ];
    const summary = await runPhase(makeDeps(new FakeExecutor(), new FakeGit(), llm), '2A.1');
    assert.equal(summary.status, 'AUDIT_FAILED');
  });

  test('auditoria inválida → 1 correção com feedback → aprovado', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const llm = new FakeLlm();
    llm.reviewerResponses = ['isto não é JSON', validApproveJson()];
    const summary = await runPhase(makeDeps(new FakeExecutor(), new FakeGit(), llm), '2A.1');
    assert.equal(llm.reviewerCalls, 2, 'segunda chamada com hint de correção');
    assert.equal(summary.status, 'AUDIT_APPROVED');
  });

  test('auditoria inválida persistente → run FAILED, roadmap permanece AUDIT_PENDING', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const llm = new FakeLlm();
    llm.reviewerResponses = ['não é JSON', 'ainda não é JSON'];
    await assert.rejects(
      runPhase(makeDeps(new FakeExecutor(), new FakeGit(), llm), '2A.1'),
      /Contrato de auditoria inválido|JSON/,
    );
    assert.match(readRoadmap(), /^\| 2A\.1 \| Testes HTTP de tenancy \| 2A \| `AUDIT_PENDING` \| DeepSeek \| GPT-5\.6 Terra \|$/m);
  });

  test('falha de infraestrutura do implementador → roadmap revertido para PLANNED', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const llm = new FakeLlm();
    llm.implementerError = new Error('boom do provedor');
    await assert.rejects(
      runPhase(makeDeps(new FakeExecutor(), new FakeGit(), llm), '2A.1'),
      /boom do provedor/,
    );
    assert.match(readRoadmap(), /^\| 2A\.1 \| Testes HTTP de tenancy \| 2A \| `PLANNED` \| DeepSeek \| GPT-5\.6 Terra \|$/m);
  });

  test('evidências falhando (testes FAIL) bloqueiam e POUPAM o revisor', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const exec = new FakeExecutor();
    exec.failCommands.add('pnpm --filter @lexia/api test');
    const llm = new FakeLlm();
    llm.reviewerResponses = [validApproveJson()];
    const summary = await runPhase(makeDeps(exec, new FakeGit(), llm), '2A.1');
    assert.equal(summary.status, 'CORRECTION_PENDING');
    assert.equal(summary.skippedReviewer, true, 'revisor poupado quando testes falham');
    assert.equal(summary.skipReason, 'preflight_failed');
    assert.equal(llm.reviewerCalls, 0, 'nenhuma chamada ao revisor com teste falhando');
  });

  test('working tree sujo (fora do ai-development) aborta sem mutar o roadmap', async () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const git = new FakeGit();
    git.porcelainOut = ' M apps/api/src/server.ts';
    const llm = new FakeLlm();
    llm.reviewerResponses = [validApproveJson()];
    await assert.rejects(
      runPhase(makeDeps(new FakeExecutor(), git, llm), '2A.1'),
      /Working tree sujo/,
    );
    assert.equal(readRoadmap(), ROADMAP_FIXTURE, 'roadmap intacto');
  });
});

describe('dry-run offline (planDryRun)', () => {
  test('gera plano sem mutar arquivos nem exigir chaves', () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const beforeMd = readRoadmap();
    const exec = new FakeExecutor();
    const llm = new FakeLlm();
    llm.reviewerResponses = [validApproveJson()];
    planDryRun(makeDeps(exec, new FakeGit(), llm), '2A.1');
    assert.equal(readRoadmap(), beforeMd, 'roadmap não mutado');
    assert.equal(exec.calls.length, 0, 'nenhum comando executado');
    assert.equal(llm.implementerCalls + llm.reviewerCalls, 0, 'nenhuma chamada LLM');
  });

  test('rejeita fase inexistente e dependência não aprovada', () => {
    writeFileSync(roadmapPath, ROADMAP_FIXTURE, 'utf8');
    const deps = makeDeps(new FakeExecutor(), new FakeGit(), new FakeLlm());
    assert.throws(() => planDryRun(deps, '9X'), /não existe/);
    assert.throws(() => planDryRun(deps, '2A.2'), /Dependências não aprovadas/);
  });
});
