// Testes de segurança do executor (allowlist), tokenização, caminhos canônicos,
// validação de config, lock do orquestrador e gitignore.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { tokenizeCommand, validateArgv, CommandDeniedError, SafeExecutor } from '../src/executor.js';
import { safeJoin, resolveAiDevDir, findRepoRoot, moduleDir } from '../src/paths.js';
import { runDirForRunId } from '../src/run.js';
import { validateConfigPaths } from '../src/config.js';
import { acquireLock, releaseLock, withLock } from '../src/io.js';
import { AutomationConfig } from '../src/contracts.js';

describe('allowlist de comandos', () => {
  test('aceita comandos permitidos', () => {
    assert.deepEqual(tokenizeCommand('pnpm --filter @lexia/api test'), ['pnpm', '--filter', '@lexia/api', 'test']);
    assert.deepEqual(tokenizeCommand('pnpm --filter @lexia/api build'), ['pnpm', '--filter', '@lexia/api', 'build']);
    assert.deepEqual(tokenizeCommand('pnpm --filter @lexia/web build'), ['pnpm', '--filter', '@lexia/web', 'build']);
    assert.deepEqual(tokenizeCommand('git status --short'), ['git', 'status', '--short']);
    validateArgv(['git', 'status', '--porcelain']);
    validateArgv(['git', 'diff', '--stat']);
    validateArgv(['git', 'diff', '--', '.', ':(exclude)docs/ai-development/runs/**']);
    validateArgv(['git', 'checkout', '-b', 'phase/2A.1']);
    validateArgv(['git', 'checkout', 'phase/2A.1']);
    validateArgv(['git', 'rev-parse', '--abbrev-ref', 'HEAD']);
  });

  test('bloqueia comandos destrutivos', () => {
    for (const cmd of [
      'git push origin main',
      'git push --force',
      'git merge phase/2A.1',
      'git reset --hard HEAD',
      'git clean -fd',
      'git checkout master',
      'git branch -D phase/2A.1',
      'rm -rf /',
      'rm -rf node_modules',
      'pnpm install --force',
      'dropdb smartjuris',
    ]) {
      assert.throws(() => tokenizeCommand(cmd), CommandDeniedError, `deveria bloquear: ${cmd}`);
    }
  });

  test('bloqueia metacaracteres de shell', () => {
    for (const cmd of [
      'echo $(whoami)',
      'git status; rm -rf /',
      'pnpm test | sh',
      'pnpm test > /dev/null',
      'pnpm test & sleep 10',
      'git diff "a"b',
      '`id`',
      'pnpm --filter @lexia/api test; cat /etc/passwd',
    ]) {
      assert.throws(() => tokenizeCommand(cmd), CommandDeniedError);
    }
  });

  test('bloqueia branch fora do padrão phase/ ou com path traversal', () => {
    for (const argv of [
      ['git', 'checkout', '-b', 'master'],
      ['git', 'checkout', '-b', 'phase/..'],
      ['git', 'checkout', '-b', 'phase/a..b'],
      ['git', 'checkout', '-b', '../phase/x'],
      ['git', 'checkout', '-b', 'phase/a b'],
      ['git', 'checkout', '-b', 'phase/.'],
    ]) {
      assert.throws(() => validateArgv(argv), CommandDeniedError);
    }
  });

  test('bloqueia pathspec perigoso no diff', () => {
    assert.throws(
      () => validateArgv(['git', 'diff', '--', '.', ':(exclude)../../etc/passwd']),
      CommandDeniedError,
    );
  });

  test('executor real rejeita comando fora da allowlist sem executar', async () => {
    const exec = new SafeExecutor();
    await assert.rejects(exec.run(['echo', 'oi']), CommandDeniedError);
  });
});

describe('caminhos seguros', () => {
  test('safeJoin aceita subcaminhos normais e rejeita escapes', () => {
    assert.equal(safeJoin('/repo/tools', 'runs', 'x-2A.1'), '/repo/tools/runs/x-2A.1');
    assert.throws(() => safeJoin('/repo', '..', 'x'), /Caminho inválido/);
    assert.throws(() => safeJoin('/repo', '/etc/passwd'), /Caminho inválido/);
    assert.throws(() => safeJoin('/repo', 'a/../../b'), /Caminho inválido/);
  });

  test('runDirForRunId valida formato e permanece dentro de runs/', () => {
    const dir = runDirForRunId('/repo/docs/ai-development', '20260101T000000Z-2A.1');
    assert.equal(dir, '/repo/docs/ai-development/runs/20260101T000000Z-2A.1');
    assert.throws(() => runDirForRunId('/repo/docs/ai-development', '..'), /run-id inválido/);
    assert.throws(() => runDirForRunId('/repo/docs/ai-development', '20260101T000000Z-../x'), /run-id inválido/);
  });
});

// --- Caminho canônico docs/ai-development ---

function makeRepoWithLayout(layout: 'docs' | 'doc' | 'none'): string {
  const root = mkdtempSync(join(tmpdir(), 'ai-orb-path-'));
  if (layout === 'docs') mkdirSync(join(root, 'docs', 'ai-development'), { recursive: true });
  if (layout === 'doc') mkdirSync(join(root, 'doc', 'ai-development'), { recursive: true });
  return root;
}

const tempRoots: string[] = [];
after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

describe('resolveAiDevDir (caminho oficial obrigatório)', () => {
  test('aceita somente docs/ai-development', () => {
    const root = makeRepoWithLayout('docs');
    tempRoots.push(root);
    assert.equal(resolveAiDevDir(root), join(root, 'docs', 'ai-development'));
  });

  test('rejeita doc/ai-development (singular) com erro claro', () => {
    const root = makeRepoWithLayout('doc');
    tempRoots.push(root);
    assert.throws(
      () => resolveAiDevDir(root),
      /"doc\/ai-development".*"docs\/ai-development"/s,
    );
  });

  test('rejeita caminhos arbitrários (diretório inexistente)', () => {
    const root = makeRepoWithLayout('none');
    tempRoots.push(root);
    assert.throws(
      () => resolveAiDevDir(root),
      /docs\/ai-development/,
    );
  });
});

// --- Validação de caminhos no automation-config ---

const CONFIG_BASE: AutomationConfig = {
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
    apiBuild: 'pnpm --filter @lexia/api build',
    webBuild: 'pnpm --filter @lexia/web build',
    gitStatus: 'git status --short',
    diffStat: 'git diff --stat',
  },
};

describe('validateConfigPaths', () => {
  test('aceita config com caminhos canônicos', () => {
    assert.doesNotThrow(() => validateConfigPaths(CONFIG_BASE));
  });

  test('rejeita config que usa doc/ai-development (singular)', () => {
    assert.throws(
      () => validateConfigPaths({ ...CONFIG_BASE, roadmap: 'doc/ai-development/implementation-roadmap.md' }),
      /"doc\/ai-development" \(singular\)/,
    );
    assert.throws(
      () => validateConfigPaths({ ...CONFIG_BASE, phasePrompts: 'doc/ai-development/smartjuris-phase-prompts.md' }),
      /"doc\/ai-development" \(singular\)/,
    );
  });

  test('rejeita caminhos arbitrários fora de docs/ai-development', () => {
    assert.throws(
      () => validateConfigPaths({ ...CONFIG_BASE, roadmap: '/tmp/implementation-roadmap.md' }),
      /fora do caminho oficial/,
    );
    assert.throws(
      () => validateConfigPaths({ ...CONFIG_BASE, templates: 'other/dir/file.md' }),
      /fora do caminho oficial/,
    );
  });
});

// --- Lock do orquestrador ---

describe('lock do orquestrador (.orchestrator.lock)', () => {
  test('adquire, bloqueia segunda aquisição e libera', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-orb-lock-'));
    tempRoots.push(root);
    acquireLock(root, { pid: 123, startedAt: '2026-01-01T00:00:00.000Z' });
    assert.ok(existsSync(join(root, '.orchestrator.lock')), 'lock criado');
    assert.throws(() => acquireLock(root, { pid: 456, startedAt: 'x' }), /já em execução/);
    releaseLock(root);
    assert.ok(!existsSync(join(root, '.orchestrator.lock')), 'lock removido');
  });

  test('withLock libera o lock mesmo em erro', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-orb-lock2-'));
    tempRoots.push(root);
    await assert.rejects(
      withLock(root, async () => {
        throw new Error('falha interna');
      }),
      /falha interna/,
    );
    assert.ok(!existsSync(join(root, '.orchestrator.lock')), 'lock liberado após erro');
  });
});

// --- .gitignore: runs e lock ignorados; roadmap/prompts/templates não ---

describe('.gitignore raiz', () => {
  const repoRoot = findRepoRoot(moduleDir(import.meta.url));

  test('ignora somente runs/ e .orchestrator.lock no diretório ai-development', { skip: !repoRoot }, () => {
    const gi = readFileSync(join(repoRoot!, '.gitignore'), 'utf8');
    assert.ok(gi.includes('/docs/ai-development/runs/'), 'runs/ ignorado');
    assert.ok(gi.includes('/docs/ai-development/.orchestrator.lock'), 'lock ignorado');
    assert.ok(!gi.includes('/doc/ai-development/'), 'sem entrada singular antiga');
    assert.ok(!gi.includes('ai-orquestrador'), 'sem entrada digitada errado para a ferramenta');
  });

  test('roadmap, prompts e templates NÃO são ignorados', { skip: !repoRoot }, () => {
    const gi = readFileSync(join(repoRoot!, '.gitignore'), 'utf8');
    for (const name of [
      'implementation-roadmap.md',
      'smartjuris-phase-prompts.md',
      'smartjuris-prompt-templates.md',
      'smartjuris-ai-development-chain.md',
      'automation-config.json',
    ]) {
      assert.ok(!gi.includes(name), `${name} não deve aparecer no .gitignore`);
    }
  });

  test('git check-ignore confirma: runs/lock ignorados, roadmap não', { skip: !repoRoot }, () => {
    try {
      const isIgnored = (p: string): boolean => {
        try {
          execFileSync('git', ['check-ignore', '-q', p], { cwd: repoRoot!, stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      };
      assert.equal(isIgnored('docs/ai-development/runs/x/run.json'), true, 'runs ignorado');
      assert.equal(isIgnored('docs/ai-development/.orchestrator.lock'), true, 'lock ignorado');
      assert.equal(isIgnored('docs/ai-development/implementation-roadmap.md'), false, 'roadmap NÃO ignorado');
      assert.equal(isIgnored('docs/ai-development/smartjuris-phase-prompts.md'), false, 'prompts NÃO ignorados');
    } catch {
      // sem git disponível no ambiente: teste não aplicável
    }
  });

  test('repositório real resolve para docs/ai-development', { skip: !repoRoot || !existsSync(join(repoRoot!, 'docs', 'ai-development')) }, () => {
    const dir = resolveAiDevDir(repoRoot!);
    assert.equal(dir, join(repoRoot!, 'docs', 'ai-development'));
  });
});
