// ===========================================================================
// Testes do fluxo de working tree / checkpoint com GIT REAL em repositórios
// temporários. Nenhum commit é feito no repositório do projeto.
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SafeExecutor, type ExecResult, type ExecOptions, type Executor } from '../src/executor.js';
import { createGitOps, type GitOps } from '../src/git.js';
import {
  prepareWorkingTree,
  inspectWorktree,
  classifyEntry,
  parsePorcelain,
  isConflictStatus,
  CheckpointAbortError,
  CHECKPOINT_MSG_PREFIX,
  ROADMAP_COMMIT_MSG_PREFIX,
} from '../src/worktree.js';
import { runPhase, runAutonomousChain } from '../src/run.js';
import type { LlmClient } from '../src/llm.js';
import type { AutomationConfig, RunSummary } from '../src/contracts.js';
import type { Logger } from '../src/io.js';

const silentLog: Logger = { info: () => {}, warn: () => {}, error: () => {}, redact: (s: string) => s };

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

const ROADMAP = `# Roadmap

## Roadmap geral

| Fase | Descrição | Dependências | Estado | Implementador | Revisor |
|---|---|---|---|---|---|
| 2A | Segurança documental | — | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Terra |
| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |
| 2A.2 | Correção da exportação | 2A.1 | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |

## Fases detalhadas

### 2A.1 — Testes HTTP de tenancy

**Estado:** \`PLANNED\`

**Dependência:** 2A aprovada.

**Objetivo:**

Validar o fluxo completo por HTTP.

### 2A.2 — Correção da exportação

**Estado:** \`PLANNED\`

**Dependência:** 2A.1 aprovada.

**Objetivo:**

Aplicar a regra de validação humana antes da exportação.

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |
|---|---|---|---|---|---|---|
| — | 2A | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | aprovada |
`;

const PROMPTS = `# Prompts

# 2A.1 — Testes HTTP de tenancy

## DeepSeek — implementação

\`\`\`text
Fase atual: 2A.1 — testes HTTP de tenancy.

Implemente somente testes de integração HTTP.
\`\`\`

## GPT-5.6 Terra — revisão

\`\`\`text
Fase: 2A.1. Retorne somente o JSON do contrato.
\`\`\`

# 2A.2 — Correção da exportação

## DeepSeek — implementação

\`\`\`text
Fase atual: 2A.2 — correção da exportação.

Aplique as regras de exportação por status.
\`\`\`

## GPT-5.6 Terra — revisão

\`\`\`text
Fase: 2A.2. Retorne somente o JSON do contrato.
\`\`\`
`;

const CONFIG: AutomationConfig = {
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

interface TempRepo {
  root: string;
  aiDevRel: string;
  aiDevDir: string;
  baselineSha: string;
}

const repos: TempRepo[] = [];

/** Cria um repo git temporário com baseline commitado (docs + código). */
function makeRepo(opts: { withDocs?: boolean } = {}): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'ai-orb-git-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Tester']);
  git(root, ['config', 'user.email', 'tester@example.com']);
  const aiDevDir = join(root, 'docs', 'ai-development');
  if (opts.withDocs !== false) {
    mkdirSync(aiDevDir, { recursive: true });
    writeFileSync(join(aiDevDir, 'implementation-roadmap.md'), ROADMAP, 'utf8');
    writeFileSync(join(aiDevDir, 'smartjuris-phase-prompts.md'), PROMPTS, 'utf8');
    writeFileSync(join(aiDevDir, 'automation-config.json'), JSON.stringify(CONFIG, null, 2), 'utf8');
  }
  mkdirSync(join(root, 'apps', 'api', 'src'), { recursive: true });
  writeFileSync(join(root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 1;\n', 'utf8');
  writeFileSync(join(root, 'README.md'), 'repo\n', 'utf8');
  // Regras esperadas de artefatos locais/gerados + saída do orquestrador.
  writeFileSync(
    join(root, '.gitignore'),
    'node_modules/\ndist/\n.pnpm-store/\n.reasonix/\ndocs/ai-development/runs/\n',
    'utf8',
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'baseline']);
  const baselineSha = git(root, ['rev-parse', 'HEAD']);
  const repo: TempRepo = { root, aiDevRel: 'docs/ai-development', aiDevDir, baselineSha };
  repos.push(repo);
  return repo;
}

after(() => {
  for (const repo of repos) rmSync(repo.root, { recursive: true, force: true });
});

function gitOps(root: string): GitOps {
  return createGitOps(new SafeExecutor(), root);
}

// Executor híbrido: git real, evidências (pnpm) simuladas como PASS.
class HybridExecutor implements Executor {
  calls: string[][] = [];
  constructor(private real: SafeExecutor) {}
  async run(argv: string[], opts?: ExecOptions): Promise<ExecResult> {
    this.calls.push(argv);
    if (argv[0] === 'git') return this.real.run(argv, opts);
    return { command: argv.join(' '), ok: true, code: 0, stdout: 'OK', stderr: '', durationMs: 1 };
  }
  async runConfigCommand(commandLine: string, _opts?: ExecOptions): Promise<ExecResult> {
    return { command: commandLine, ok: true, code: 0, stdout: 'PASS', stderr: '', durationMs: 1 };
  }
}

function makeFakeLlm(repoRoot?: string): LlmClient {
  let counter = 1000;
  return {
    async implementer() {
      if (repoRoot) {
        // Simula a implementação modificando um arquivo RASTREADO com conteúdo
        // DIFERENTE a cada fase (o diff da fase precisa ser não-vazio).
        counter += 1;
        writeFileSync(join(repoRoot, 'apps', 'api', 'src', 'code.ts'), `export const a = ${counter}; // implementado\n`, 'utf8');
      }
      return { content: 'Fase implementada. Testes: PASS. Build: PASS.', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
    async reviewer() {
      return {
        content: JSON.stringify({
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
        }),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    },
    async structurer() {
      return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
  };
}

function prepareOpts(repo: TempRepo, phaseId: string, mode: Parameters<typeof prepareWorkingTree>[0]['mode'], confirm?: () => Promise<boolean>) {
  return {
    git: gitOps(repo.root),
    log: silentLog,
    aiDevRel: repo.aiDevRel,
    phaseId,
    mode,
    confirm,
  };
}

describe('classificação e parsing (unitário)', () => {
  test('classifyEntry categoriza caminhos', () => {
    assert.equal(classifyEntry('apps/api/src/server.ts', 'docs/ai-development'), 'safe');
    assert.equal(classifyEntry('docs/ai-development/implementation-roadmap.md', 'docs/ai-development'), 'protected');
    assert.equal(classifyEntry('docs/ai-development/runs/x/run.json', 'docs/ai-development'), 'protected');
    assert.equal(classifyEntry('.env', 'docs/ai-development'), 'secret');
    assert.equal(classifyEntry('apps/api/.env.local', 'docs/ai-development'), 'secret');
    assert.equal(classifyEntry('id_rsa', 'docs/ai-development'), 'secret');
    assert.equal(classifyEntry('node_modules/x/index.js', 'docs/ai-development'), 'artifact');
    assert.equal(classifyEntry('dist/assets/a.js', 'docs/ai-development'), 'artifact');
    assert.equal(classifyEntry('.pnpm-store/v11/x', 'docs/ai-development'), 'artifact');
    assert.equal(classifyEntry('.reasonix/tasks/x', 'docs/ai-development'), 'artifact');
    assert.equal(classifyEntry('.ignore', 'docs/ai-development'), 'suspicious');
    assert.equal(classifyEntry('pps/api/package.json', 'docs/ai-development'), 'suspicious');
    assert.equal(classifyEntry('../fora.js', 'docs/ai-development'), 'suspicious');
    assert.equal(classifyEntry('/absoluto', 'docs/ai-development'), 'suspicious');
  });

  test('parsePorcelain trata renomeação (usa o caminho novo)', () => {
    const entries = parsePorcelain(' M apps/api/src/a.ts\n?? apps/api/src/novo.ts\nR  apps/api/old.ts -> apps/api/new.ts\n');
    assert.deepEqual(entries, [
      { path: 'apps/api/src/a.ts', status: ' M' },
      { path: 'apps/api/src/novo.ts', status: '??' },
      { path: 'apps/api/new.ts', status: 'R ' },
    ]);
  });
});

describe('prepareWorkingTree (git real)', () => {
  test('working tree limpo: nada a commitar', async () => {
    const repo = makeRepo();
    const res = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit'));
    assert.equal(res.committed, false);
    assert.equal(res.initialSha, repo.baselineSha);
    assert.deepEqual(res.preRunFiles, []);
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha, 'HEAD inalterado');
  });

  test('código modificado + --auto-commit: checkpoint com apenas os arquivos seguros', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 2;\n', 'utf8');
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'novo.ts'), 'export const novo = 1;\n', 'utf8');
    // artefato e segredo NUNCA entram no checkpoint
    mkdirSync(join(repo.root, 'node_modules'), { recursive: true });
    writeFileSync(join(repo.root, 'node_modules', 'x.js'), 'x', 'utf8');

    const res = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit'));
    assert.equal(res.committed, true);
    assert.equal(res.initialSha, repo.baselineSha);
    assert.deepEqual(res.preRunFiles.sort(), ['apps/api/src/code.ts', 'apps/api/src/novo.ts']);

    const log = git(repo.root, ['log', '--oneline', '-2']);
    assert.ok(log.includes(CHECKPOINT_MSG_PREFIX + '2A.1'), `mensagem do checkpoint: ${log}`);
    const stat = git(repo.root, ['show', '--stat', '--format=', 'HEAD']);
    assert.ok(stat.includes('apps/api/src/code.ts') && stat.includes('apps/api/src/novo.ts'), stat);
    assert.ok(!stat.includes('node_modules'), 'artefato não commitado');
    assert.ok(!stat.includes('docs/ai-development'), 'docs não commitado');
    // após o checkpoint, árvore limpa
    assert.equal(git(repo.root, ['status', '--porcelain']), '');
  });

  test('docs/ai-development modificado bloqueia a fase (proteção)', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), ROADMAP + '// edição local\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit')),
      (err: unknown) => err instanceof CheckpointAbortError && /docs\/ai-development contém alterações/.test(err.message),
    );
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha, 'nenhum commit');
  });

  test('.env / segredo bloqueia sem commitar', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, '.env'), 'DEEPSEEK_API_KEY=secret\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit')),
      (err: unknown) => err instanceof CheckpointAbortError && /sensíveis/.test(err.message),
    );
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha);
  });

  test('--dry-run não modifica nada', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 3;\n', 'utf8');
    const before = git(repo.root, ['status', '--porcelain']);
    const res = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'dry-run'));
    assert.equal(res.committed, false);
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha);
    assert.equal(git(repo.root, ['status', '--porcelain']), before, 'status inalterado');
  });

  test('--no-auto-commit mantém o comportamento antigo (bloqueia árvore suja)', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 4;\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'no-auto-commit')),
      (err: unknown) => err instanceof CheckpointAbortError && /Working tree sujo/.test(err.message),
    );
  });

  test('--allow-dirty executa sem commit e registra o SHA inicial', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 5;\n', 'utf8');
    const res = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'allow-dirty'));
    assert.equal(res.committed, false);
    assert.equal(res.initialSha, repo.baselineSha);
    assert.deepEqual(res.preRunFiles, ['apps/api/src/code.ts']);
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha);
  });

  test('interativo: confirmação negada bloqueia sem commit', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 6;\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'interactive', async () => false)),
      (err: unknown) => err instanceof CheckpointAbortError && /Checkpoint recusado/.test(err.message),
    );
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha);
  });

  test('interativo: confirmação aceita cria o checkpoint', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 7;\n', 'utf8');
    const res = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'interactive', async () => true));
    assert.equal(res.committed, true);
    assert.ok(git(repo.root, ['log', '-1', '--oneline']).includes(CHECKPOINT_MSG_PREFIX + '2A.1'));
  });

  test('ausência de identidade Git bloqueia o checkpoint', async () => {
    const repo = makeRepo();
    git(repo.root, ['config', 'user.name', '']);
    git(repo.root, ['config', 'user.email', '']);
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 8;\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit')),
      (err: unknown) => err instanceof CheckpointAbortError && /Identidade Git ausente/.test(err.message),
    );
  });

  test('HEAD detached bloqueia o checkpoint', async () => {
    const repo = makeRepo();
    git(repo.root, ['checkout', '--detach', 'HEAD']);
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 9;\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit')),
      (err: unknown) => err instanceof CheckpointAbortError && /detached/.test(err.message),
    );
  });

  test('checkpoint já existente: segunda execução sem mudanças não cria commit', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 10;\n', 'utf8');
    const first = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit'));
    assert.equal(first.committed, true);
    const shaAfterFirst = git(repo.root, ['rev-parse', 'HEAD']);
    const second = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'auto-commit'));
    assert.equal(second.committed, false, 'nada novo a commitar');
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), shaAfterFirst);
  });

  test('erro de permissão (EACCES no git add) interrompe com mensagem e sem commit', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 11;\n', 'utf8');
    const base = createGitOps(new SafeExecutor(), repo.root);
    const failingGit: GitOps = {
      ...base,
      async addPaths() {
        return {
          command: 'git add',
          ok: false,
          code: 128,
          stdout: '',
          stderr: 'fatal: unable to read apps/api/src/code.ts: Permission denied (EACCES)',
          durationMs: 1,
        };
      },
    };
    await assert.rejects(
      prepareWorkingTree({
        git: failingGit,
        log: silentLog,
        aiDevRel: repo.aiDevRel,
        phaseId: '2A.1',
        mode: 'auto-commit',
      }),
      (err: unknown) => err instanceof CheckpointAbortError && /Falha ao adicionar/.test(err.message),
    );
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha, 'nenhum commit criado');
  });
});

describe('runPhase end-to-end com git real (--auto-commit)', () => {
  test('checkpoint → fase → gate aprovado → roadmap commitado; run.json com SHAs e modo', async () => {
    const repo = makeRepo();
    // Alterações de código válidas pendentes antes da fase.
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 99;\n', 'utf8');

    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: makeFakeLlm(repo.root),
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      log: silentLog,
    };

    const summary = await runPhase(deps, '2A.1', { mode: 'auto-commit' });
    assert.equal(summary.status, 'AUDIT_APPROVED', summary.error);
    assert.equal(summary.mode, 'auto-commit');
    assert.equal(summary.initialSha, repo.baselineSha);
    assert.deepEqual((summary.preRunFiles ?? []).sort(), ['apps/api/src/code.ts']);

    // Commits esperados: baseline → checkpoint → implementação da fase → roadmap update.
    const log = git(repo.root, ['log', '--oneline', '-4']);
    assert.ok(log.includes(CHECKPOINT_MSG_PREFIX + '2A.1'), log);
    assert.ok(log.includes('feat(phase/2A.1): implementation approved'), log);
    assert.ok(log.includes(ROADMAP_COMMIT_MSG_PREFIX + '2A.1'), log);

    // Checkpoint não inclui docs; roadmap commitado separadamente.
    const checkpointStat = git(repo.root, ['show', '--stat', '--format=', 'HEAD~1']);
    assert.ok(checkpointStat.includes('apps/api/src/code.ts'), checkpointStat);
    assert.ok(!checkpointStat.includes('docs/ai-development'), checkpointStat);
    const roadmapStat = git(repo.root, ['show', '--stat', '--format=', 'HEAD']);
    assert.ok(roadmapStat.includes('implementation-roadmap.md'), roadmapStat);

    // Roadmap final aprovado no working tree.
    const roadmapText = readFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), 'utf8');
    assert.ok(roadmapText.includes('`AUDIT_APPROVED`'));

    // run.json com rastreabilidade.
    const runsDir = join(repo.aiDevDir, 'runs');
    const runDirNames = execFileSync('ls', ['-1', runsDir], { cwd: repo.root, encoding: 'utf8' }).trim().split('\n');
    const runJson = JSON.parse(
      readFileSync(join(runsDir, runDirNames[0], 'run.json'), 'utf8'),
    ) as RunSummary;
    assert.equal(runJson.status, 'AUDIT_APPROVED');
    assert.equal(runJson.mode, 'auto-commit');
    assert.equal(runJson.initialSha, repo.baselineSha);
    assert.equal(runJson.finalSha, git(repo.root, ['rev-parse', 'HEAD']));
    assert.ok((runJson.preRunFiles ?? []).includes('apps/api/src/code.ts'));
  });

  test('reexecução da mesma fase é bloqueada (estado final AUDIT_APPROVED) e não cria commits', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 100;\n', 'utf8');
    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: makeFakeLlm(repo.root),
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-02T00:00:00.000Z'),
      log: silentLog,
    };
    await runPhase(deps, '2A.1', { mode: 'auto-commit' });
    const headAfterFirst = git(repo.root, ['rev-parse', 'HEAD']);

    const hybrid2 = new HybridExecutor(new SafeExecutor());
    await assert.rejects(
      runPhase(
        {
          exec: hybrid2,
          git: createGitOps(hybrid2, repo.root),
          llm: makeFakeLlm(repo.root),
          repoRoot: repo.root,
          aiDevDir: repo.aiDevDir,
          config: CONFIG,
          env: {},
          now: () => new Date('2026-01-02T00:00:01.000Z'),
          log: silentLog,
        },
        '2A.1',
        { mode: 'auto-commit' },
      ),
      /AUDIT_APPROVED/,
    );
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), headAfterFirst, 'nenhum commit novo');
  });

  test('runPhase --dry-run com git real não cria nada', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 101;\n', 'utf8');
    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: makeFakeLlm(repo.root),
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-03T00:00:00.000Z'),
      log: silentLog,
    };
    const summary = await runPhase(deps, '2A.1', { mode: 'dry-run' });
    assert.equal(summary.status, 'DRY_RUN');
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), repo.baselineSha);
    assert.equal(git(repo.root, ['status', '--porcelain']).includes('apps/api/src/code.ts'), true, 'alteração preservada');
    assert.ok(!existsSync(join(repo.aiDevDir, 'runs')), 'runs não criado');
  });

  test('inspectWorktree registra artefatos separadamente', async () => {
    const repo = makeRepo();
    // coverage não está no .gitignore do repo de teste, mas é classificado como artefato.
    mkdirSync(join(repo.root, 'coverage'), { recursive: true });
    writeFileSync(join(repo.root, 'coverage', 'lcov.info'), 'TN:', 'utf8');
    const plan = await inspectWorktree(gitOps(repo.root), repo.aiDevRel);
    assert.ok(plan.artifactPaths.includes('coverage/lcov.info'));
    assert.equal(plan.safePaths.length, 0);
    assert.equal(plan.initialSha, repo.baselineSha);
  });
});

describe('teto de correções (memória contra retrabalho)', () => {
  test('fase em CORRECTION_PENDING com histórico >= maxCorrectionAttempts é BLOQUEADA', async () => {
    const repo = makeRepo();
    // Código válido pendente (simula correção em andamento).
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 500; // correcao\n', 'utf8');

    // Roadmap: fase 2A.1 em CORRECTION_PENDING + 2 rodadas anteriores falhas no histórico.
    const roadmapComHistorico = ROADMAP
      .replace('| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |', '| 2A.1 | Testes HTTP de tenancy | 2A | \`CORRECTION_PENDING\` | DeepSeek | GPT-5.6 Terra |')
      .replace('**Estado:** \`PLANNED\`\n\n**Dependência:** 2A aprovada.', '**Estado:** \`CORRECTION_PENDING\`\n\n**Dependência:** 2A aprovada.')
      + [
        '| 2026-08-20 | 2A.1 | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |',
        '| 2026-08-21 | 2A.1 | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |',
      ].join('\n') + '\n';
    writeFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), roadmapComHistorico, 'utf8');
    // Rodadas anteriores em DISCO (fonte canônica da contagem de tentativas).
    const runsDir = join(repo.aiDevDir, 'runs');
    for (const [runId, status] of [
      ['20260820T000000Z-2A.1', 'AUDIT_FAILED'],
      ['20260821T000000Z-2A.1', 'CORRECTION_PENDING'],
    ] as const) {
      mkdirSync(join(runsDir, runId), { recursive: true });
      writeFileSync(join(runsDir, runId, 'run.json'), JSON.stringify({
        runId, phase: '2A.1', startedAt: '2026-08-20T00:00:00.000Z', finishedAt: '2026-08-20T00:00:01.000Z',
        status, branch: 'phase/2A.1', implementerModel: 'x', reviewerModel: 'y', artifactFiles: [],
      }), 'utf8');
    }
    // Roadmap modificado é protegido: commita antes de rodar a fase.
    git(repo.root, ['add', '-A']);
    git(repo.root, ['commit', '-q', '-m', 'roadmap historico']);

    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: makeFakeLlm(repo.root),
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-04T00:00:00.000Z'),
      log: silentLog,
    };

    await assert.rejects(
      runPhase(deps, '2A.1', { mode: 'auto-commit' }),
      /atingiu o limite de 2 tentativas de correção/i,
      'teto de correções bloqueia a fase antes de gastar chamadas de revisor',
    );
  });

  test('fase em CORRECTION_PENDING com histórico ABAIXO do limite executa normalmente', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 501; // correcao2\n', 'utf8');

    // Só 1 rodada anterior falha → abaixo do limite (2).
    const roadmapCom1Falha = ROADMAP
      .replace('| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |', '| 2A.1 | Testes HTTP de tenancy | 2A | \`CORRECTION_PENDING\` | DeepSeek | GPT-5.6 Terra |')
      .replace('**Estado:** \`PLANNED\`\n\n**Dependência:** 2A aprovada.', '**Estado:** \`CORRECTION_PENDING\`\n\n**Dependência:** 2A aprovada.')
      + '| 2026-08-20 | 2A.1 | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |\n';
    writeFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), roadmapCom1Falha, 'utf8');
    git(repo.root, ['add', '-A']);
    git(repo.root, ['commit', '-q', '-m', 'roadmap 1 falha']);

    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: makeFakeLlm(repo.root),
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-05T00:00:00.000Z'),
      log: silentLog,
    };

    const summary = await runPhase(deps, '2A.1', { mode: 'auto-commit' });
    assert.equal(summary.status, 'AUDIT_APPROVED', 'abaixo do limite executa normalmente');
  });
});

describe('cache de auditoria + loopgain (economia)', () => {
  test('cache: segunda execução com MESMO contexto reutiliza veredito (sem chamar revisor)', async () => {
    const repo = makeRepo();
    // Código pendente idêntico nas duas execuções → mesmo diff/contexto.
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 600;\n', 'utf8');

    const mkDeps = (when: Date) => {
      const hybrid = new HybridExecutor(new SafeExecutor());
      return {
        exec: hybrid,
        git: createGitOps(hybrid, repo.root),
        llm: makeFakeLlm(repo.root),
        repoRoot: repo.root,
        aiDevDir: repo.aiDevDir,
        config: CONFIG,
        env: {},
        now: () => when,
        log: silentLog,
      };
    };

    // 1ª execução: fase PLANNED → auditoria real (não há cache).
    const s1 = await runPhase(mkDeps(new Date('2026-01-06T00:00:00.000Z')), '2A.1', { mode: 'auto-commit' });
    assert.equal(s1.status, 'AUDIT_APPROVED');
    assert.equal(s1.fromCache, false, 'primeira execução não vem do cache');

    // Zera o código para um estado pendente idêntico e reexecuta a MESMA fase
    // (fase agora está AUDIT_APPROVED → precisa de um repo novo com o mesmo
    // contexto de auditoria). Para simplificar: rodamos de novo no mesmo repo
    // após resetar o roadmap para PLANNED e limpar o código, e verificamos
    // que o run.json da 2ª vez registra fromCache=true.
    // (Cenário simplificado: validamos apenas que cachedAuditForContext
    //  encontra o run anterior quando o contextHash é igual.)
    const { cachedAuditForContext } = await import('../src/run.js');
    const ctx = 'ctx-igual';
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(ctx).digest('hex');
    // Grava um run.json de "rodada anterior" com o MESMO hash.
    const runsDir = join(repo.aiDevDir, 'runs');
    const prevRun = '20260106T000000Z-2A.1';
    mkdirSync(join(runsDir, prevRun), { recursive: true });
    writeFileSync(join(runsDir, prevRun, 'run.json'), JSON.stringify({
      runId: prevRun, phase: '2A.1', startedAt: '2026-01-06T00:00:00.000Z', finishedAt: '2026-01-06T00:00:01.000Z',
      status: 'AUDIT_APPROVED', branch: 'phase/2A.1', implementerModel: 'x', reviewerModel: 'y',
      artifactFiles: [], audit: { phase: '2A.1', verdict: 'APPROVE', advanceAllowed: true, findings: [], requiredFixes: [], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: null },
      contextHash: hash,
    }), 'utf8');

    const cached = await cachedAuditForContext(repo.aiDevDir, '2A.1', 'run-atual', ctx);
    assert.ok(cached, 'cache encontrado para contexto idêntico');
    assert.equal(cached!.runId, prevRun);
    assert.equal(cached!.audit.verdict, 'APPROVE');
  });

  test('loopgain: sem redução de achados graves entre rodadas → circuito aberto', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 601;\n', 'utf8');

    // Roadmap: fase em CORRECTION_PENDING com 1 falha anterior (abaixo do teto).
    const roadmapFase = ROADMAP
      .replace('| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |', '| 2A.1 | Testes HTTP de tenancy | 2A | \`CORRECTION_PENDING\` | DeepSeek | GPT-5.6 Terra |')
      .replace('**Estado:** \`PLANNED\`\n\n**Dependência:** 2A aprovada.', '**Estado:** \`CORRECTION_PENDING\`\n\n**Dependência:** 2A aprovada.')
      + '| 2026-08-20 | 2A.1 | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |\n';
    writeFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), roadmapFase, 'utf8');
    git(repo.root, ['add', '-A']);
    git(repo.root, ['commit', '-q', '-m', 'roadmap fase correcao']);

    // Run anterior com 2 achados HIGH (mesma fase).
    const runsDir = join(repo.aiDevDir, 'runs');
    const prevRun = '20260106T000000Z-2A.1';
    mkdirSync(join(runsDir, prevRun), { recursive: true });
    writeFileSync(join(runsDir, prevRun, 'run.json'), JSON.stringify({
      runId: prevRun, phase: '2A.1', startedAt: '2026-01-06T00:00:00.000Z', finishedAt: '2026-01-06T00:00:01.000Z',
      status: 'AUDIT_FAILED', branch: 'phase/2A.1', implementerModel: 'x', reviewerModel: 'y',
      artifactFiles: [],
      audit: { phase: '2A.1', verdict: 'REJECT', advanceAllowed: false, findings: [
        { severity: 'HIGH', file: 'a', line: 1, requirement: 'r1', evidence: 'e', impact: 'i', action: 'a' },
        { severity: 'HIGH', file: 'b', line: 2, requirement: 'r2', evidence: 'e', impact: 'i', action: 'a' },
      ], requiredFixes: ['x'], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: null },
    }), 'utf8');

    // Fake LLM com veredito REJECT + 2 HIGH (não reduziu vs. anterior).
    const hybrid = new HybridExecutor(new SafeExecutor());
    const fakeLlm: LlmClient = {
      async implementer() {
        writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 699; // correcao\n', 'utf8');
        return { content: 'ok', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      },
      async reviewer() {
        return {
          content: JSON.stringify({
            phase: '2A.1', verdict: 'REJECT', advanceAllowed: false,
            findings: [
              { severity: 'HIGH', file: 'a', line: 1, requirement: 'r1', evidence: 'e', impact: 'i', action: 'a' },
              { severity: 'HIGH', file: 'b', line: 2, requirement: 'r2', evidence: 'e', impact: 'i', action: 'a' },
            ],
            requiredFixes: ['x'], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: null,
          }),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
      async structurer() {
        return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      },
    };
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: fakeLlm,
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-06T00:00:10.000Z'),
      log: silentLog,
    };

    await assert.rejects(
      runPhase(deps, '2A.1', { mode: 'allow-dirty' }),
      /Sem convergência|sem convergência|não está reduzindo|não está convergindo/i,
      'loopgain abre o circuito quando os achados graves não reduzem',
    );
  });
});

  test('loopgain NÃO abre circuito quando achado anterior foi resolvido (progresso real)', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 602;\n', 'utf8');

    // Roadmap em CORRECTION_PENDING com 1 falha anterior.
    const roadmapFase = ROADMAP
      .replace('| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |', '| 2A.1 | Testes HTTP de tenancy | 2A | \`CORRECTION_PENDING\` | DeepSeek | GPT-5.6 Terra |')
      .replace('**Estado:** \`PLANNED\`\n\n**Dependência:** 2A aprovada.', '**Estado:** \`CORRECTION_PENDING\`\n\n**Dependência:** 2A aprovada.')
      + '| 2026-08-20 | 2A.1 | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |\n';
    writeFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), roadmapFase, 'utf8');
    git(repo.root, ['add', '-A']);
    git(repo.root, ['commit', '-q', '-m', 'roadmap fase correcao2']);

    // Run anterior com 2 HIGH (r1, r2).
    const runsDir = join(repo.aiDevDir, 'runs');
    const prevRun = '20260107T000000Z-2A.1';
    mkdirSync(join(runsDir, prevRun), { recursive: true });
    writeFileSync(join(runsDir, prevRun, 'run.json'), JSON.stringify({
      runId: prevRun, phase: '2A.1', startedAt: '2026-01-07T00:00:00.000Z', finishedAt: '2026-01-07T00:00:01.000Z',
      status: 'AUDIT_FAILED', branch: 'phase/2A.1', implementerModel: 'x', reviewerModel: 'y',
      artifactFiles: [],
      audit: { phase: '2A.1', verdict: 'REJECT', advanceAllowed: false, findings: [
        { severity: 'HIGH', file: 'a', line: 1, requirement: 'r1', evidence: 'e', impact: 'i', action: 'a' },
        { severity: 'HIGH', file: 'b', line: 2, requirement: 'r2', evidence: 'e', impact: 'i', action: 'a' },
      ], requiredFixes: ['x'], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: null },
    }), 'utf8');

    // Fake LLM: veredito REJECT com r1 RESOLVIDO (sumiu) e r2 ainda presente
    // (progresso real: 1 resolvido, 1 novo equivalente) → NÃO abre circuito.
    const hybrid = new HybridExecutor(new SafeExecutor());
    const fakeLlm: LlmClient = {
      async implementer() {
        writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 700; // correcao\n', 'utf8');
        return { content: 'ok', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      },
      async reviewer() {
        return {
          content: JSON.stringify({
            phase: '2A.1', verdict: 'REJECT', advanceAllowed: false,
            findings: [
              { severity: 'HIGH', file: 'b', line: 2, requirement: 'r2', evidence: 'e', impact: 'i', action: 'a' },
              { severity: 'HIGH', file: 'c', line: 3, requirement: 'r3', evidence: 'e', impact: 'i', action: 'a' },
            ],
            requiredFixes: ['y'], missingTests: [], scopeViolations: [], migrationRisks: [], securityRisks: [], financialRisks: [], rollbackRisks: [], nextPhase: null,
          }),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
      async structurer() {
        return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      },
    };
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: fakeLlm,
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date('2026-01-07T00:00:10.000Z'),
      log: silentLog,
    };

    // r1 foi resolvido → o loop está progredindo → NÃO deve lançar circuito.
    const summary = await runPhase(deps, '2A.1', { mode: 'allow-dirty' });
    assert.ok(summary.status === 'AUDIT_FAILED' || summary.status === 'CORRECTION_PENDING',
      `progresso permite continuar (status=${summary.status})`);
  });

describe('modo autônomo (--autonomous)', () => {
  test('autonomous com código modificado cria checkpoint e commit sem confirmação', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 200;\n', 'utf8');
    const res = await prepareWorkingTree(prepareOpts(repo, '2A.1', 'autonomous'));
    assert.equal(res.committed, true, 'checkpoint automático sem confirmação');
    assert.ok(git(repo.root, ['log', '-1', '--oneline']).includes(CHECKPOINT_MSG_PREFIX + '2A.1'));
  });

  test('autonomous para diante de segredo (.env)', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, '.env'), 'OPENAI_API_KEY=segredo\n', 'utf8');
    await assert.rejects(
      prepareWorkingTree(prepareOpts(repo, '2A.1', 'autonomous')),
      (err: unknown) => err instanceof CheckpointAbortError && /sensíveis/.test(err.message),
    );
  });

  test('conflito de merge (status UU) para com intervenção humana', async () => {
    const repo = makeRepo();
    const base = createGitOps(new SafeExecutor(), repo.root);
    const conflictingGit: GitOps = {
      ...base,
      async porcelain() {
        return 'UU apps/api/src/x.ts\n';
      },
    };
    await assert.rejects(
      prepareWorkingTree({
        git: conflictingGit,
        log: silentLog,
        aiDevRel: repo.aiDevRel,
        phaseId: '2A.1',
        mode: 'autonomous',
      }),
      (err: unknown) => err instanceof CheckpointAbortError && /Conflito de merge/.test(err.message),
    );
  });

  test('isConflictStatus identifica status de conflito', () => {
    assert.equal(isConflictStatus('UU'), true);
    assert.equal(isConflictStatus('AA'), true);
    assert.equal(isConflictStatus('DD'), true);
    assert.equal(isConflictStatus('UD'), true);
    assert.equal(isConflictStatus(' M'), false);
    assert.equal(isConflictStatus('??'), false);
  });

  test('cadeia autônoma: 2A.1 aprovada → continua para 2A.2 automaticamente', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 300;\n', 'utf8');

    let clock = Date.parse('2026-02-01T00:00:00.000Z');
    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: makeFakeLlm(repo.root),
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date((clock += 1000)),
      log: silentLog,
    };

    const results = await runAutonomousChain(deps, '2A.1', { maxPhases: 5 });
    assert.equal(results.length, 2, `fases executadas: ${results.map((r) => r.phase).join(', ')}`);
    assert.equal(results[0].phase, '2A.1');
    assert.equal(results[0].status, 'AUDIT_APPROVED');
    assert.equal(results[0].continuedTo, '2A.2', 'run.json registra a continuação');
    assert.equal(results[1].phase, '2A.2');
    assert.equal(results[1].status, 'AUDIT_APPROVED');

    // Roadmap: ambas aprovadas.
    const roadmapText = readFileSync(join(repo.aiDevDir, 'implementation-roadmap.md'), 'utf8');
    const countApproved = (roadmapText.match(/`AUDIT_APPROVED`/g) ?? []).length;
    assert.ok(countApproved >= 3, `2A + 2A.1 + 2A.2 aprovadas: ${countApproved}`);

    // Dois run dirs distintos (ignora o subdiretório `ledger` do findings ledger).
    const runsDir = join(repo.aiDevDir, 'runs');
    const dirs = execFileSync('ls', ['-1', runsDir], { cwd: repo.root, encoding: 'utf8' })
      .trim().split('\n')
      .filter((d) => d && d !== 'ledger');
    assert.equal(dirs.length, 2, `run dirs: ${dirs.join(', ')}`);

    // Commits de roadmap das duas fases presentes no histórico.
    const log = git(repo.root, ['log', '--oneline', '-8']);
    assert.ok(log.includes(ROADMAP_COMMIT_MSG_PREFIX + '2A.1'), log);
    assert.ok(log.includes(ROADMAP_COMMIT_MSG_PREFIX + '2A.2'), log);
  });

  test('cadeia autônoma para quando a auditoria tem BLOCKER', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 400;\n', 'utf8');
    let clock = Date.parse('2026-02-02T00:00:00.000Z');
    const hybrid = new HybridExecutor(new SafeExecutor());
    const deps = {
      exec: hybrid,
      git: createGitOps(hybrid, repo.root),
      llm: {
        async implementer() {
          writeFileSync(join(repo.root, 'apps', 'api', 'src', 'code.ts'), 'export const a = 401;\n', 'utf8');
          return { content: 'implementado', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
        },
        async reviewer() {
          return {
            content: JSON.stringify({
              phase: '2A.1',
              verdict: 'APPROVE',
              advanceAllowed: true,
              findings: [{ severity: 'BLOCKER', file: 'x', line: 1, requirement: 'r', evidence: 'e', impact: 'i', action: 'a' }],
              requiredFixes: [],
              missingTests: [],
              scopeViolations: [],
              migrationRisks: [],
              securityRisks: [],
              financialRisks: [],
              rollbackRisks: [],
              nextPhase: null,
            }),
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        },
        async structurer() {
          return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
        },
      } as LlmClient,
      repoRoot: repo.root,
      aiDevDir: repo.aiDevDir,
      config: CONFIG,
      env: {},
      now: () => new Date((clock += 1000)),
      log: silentLog,
    };
    const results = await runAutonomousChain(deps, '2A.1', { maxPhases: 5 });
    assert.equal(results.length, 1, 'cadeia interrompida após BLOCKER');
    assert.equal(results[0].status, 'AUDIT_FAILED', 'BLOCKER → AUDIT_FAILED, sem avanço');
  });
});
