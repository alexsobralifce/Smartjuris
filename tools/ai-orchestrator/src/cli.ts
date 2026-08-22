#!/usr/bin/env node
// ===========================================================================
// CLI do orquestrador local do SmartJuris.
//
//   pnpm ai:next [--print-only] [modo]   → executa a próxima fase elegível
//   pnpm ai:run --phase 2A.1 [modo]      → executa uma fase específica
//   pnpm ai:audit --run <run-id>         → reexecuta só a auditoria de um run
//   pnpm ai:status                       → tabela do roadmap
//   pnpm ai:approve --phase 2A.1         → gate de aprovação manual (humano)
//   pnpm ai:retry --phase 2A.1 [modo]    → reexecuta fase em CORRECTION/AUDIT_FAILED
//   pnpm ai:dry-run --phase 2A.1         → plano offline, sem mutações
//
// Modos de working tree (run/next/retry):
//   --auto-commit     checkpoint automático antes da fase
//   --no-auto-commit  comportamento antigo: exige working tree limpo
//   --allow-dirty     executa sem commit, registrando o SHA inicial
//   --dry-run         valida sem modificar nada
//   (sem flag)        pergunta antes do checkpoint (interativo; sem TTY, vira --no-auto-commit)
// ===========================================================================

import { moduleDir, resolveRepoRoot, resolveAiDevDir, type Env } from './paths.js';
import { loadAutomationConfig } from './config.js';
import { createLogger, withLock } from './io.js';
import { createRealDeps } from './deps.js';
import { runPhase, type RunPhaseOptions } from './run.js';
import { reAuditRun } from './auditRun.js';
import { printStatus, findNextEligible, approvePhase, planDryRun } from './commands.js';
import type { RunMode } from './contracts.js';

const USAGE = `Uso:
  ai:next [--print-only] [modo]            executa (ou apenas mostra) a próxima fase elegível
  ai:run --phase <ID> [modo]               executa uma fase
  ai:audit --run <run-id> [--force]        reexecuta a auditoria de um run
  ai:status                                tabela do roadmap
  ai:approve --phase <ID> [--next]         aprovação manual (humano)
  ai:retry --phase <ID> [modo]             reexecuta fase em CORRECTION_PENDING/AUDIT_FAILED
  ai:dry-run [--phase <ID>]                plano offline sem mutações

Modos de working tree (run/next/retry):
  --auto-commit       cria checkpoint automático (git add filtrado + commit) antes da fase
  --no-auto-commit    (padrão antigo) exige working tree limpo
  --allow-dirty       executa sem commit, registrando o SHA inicial
  --dry-run           valida sem modificar nada (git ou arquivos)
  (sem flag)          pergunta antes de criar o checkpoint (interativo; sem TTY, vira --no-auto-commit)`;

interface CliArgs {
  command: string;
  opts: Record<string, string>;
  flags: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  // pnpm repassa os argumentos após `--` (ex.: `start -- status`)
  if (args[0] === '--') args.shift();
  const command = args[0];
  if (!command) throw new Error(USAGE);
  const opts: Record<string, string> = {};
  const flags: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) throw new Error(`Argumento inesperado: ${arg}`);
    const name = arg.slice(2);
    const eq = name.indexOf('=');
    if (eq > 0) {
      opts[name.slice(0, eq)] = name.slice(eq + 1);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      opts[name] = next;
      i += 1;
    } else {
      flags.push(name);
    }
  }
  return { command, opts, flags };
}

function resolveMode(flags: string[]): RunMode {
  if (flags.includes('auto-commit')) return 'auto-commit';
  if (flags.includes('no-auto-commit')) return 'no-auto-commit';
  if (flags.includes('allow-dirty')) return 'allow-dirty';
  if (flags.includes('dry-run')) return 'dry-run';
  // Padrão: pergunta antes do checkpoint; sem TTY, preserva o comportamento antigo.
  return process.stdin.isTTY ? 'interactive' : 'no-auto-commit';
}

async function main(): Promise<void> {
  const { command, opts, flags } = parseArgs(process.argv);
  const env: Env = process.env as Env;
  const log = createLogger(env);
  const repoRoot = resolveRepoRoot(env, moduleDir(import.meta.url));
  const aiDevDir = resolveAiDevDir(repoRoot);
  const config = loadAutomationConfig(aiDevDir);

  const deps = () => createRealDeps({ env, config, repoRoot, aiDevDir, log });
  const runOptions = (): RunPhaseOptions => ({ mode: resolveMode(flags) });

  switch (command) {
    case 'status': {
      printStatus(deps());
      break;
    }
    case 'dry-run': {
      planDryRun(deps(), opts.phase);
      break;
    }
    case 'next': {
      const next = findNextEligible(deps());
      if (flags.includes('print-only')) {
        log.info(`Próxima fase elegível: ${next.id}`);
        break;
      }
      await withLock(aiDevDir, () => runPhase(deps(), next.id, runOptions()));
      break;
    }
    case 'run': {
      if (!opts.phase) throw new Error('Uso: ai:run --phase <ID> [modo]');
      await withLock(aiDevDir, () => runPhase(deps(), opts.phase, runOptions()));
      break;
    }
    case 'retry': {
      if (!opts.phase) throw new Error('Uso: ai:retry --phase <ID> [modo]');
      await withLock(aiDevDir, () => runPhase(deps(), opts.phase, runOptions()));
      break;
    }
    case 'audit': {
      if (!opts.run) throw new Error('Uso: ai:audit --run <run-id>');
      await withLock(aiDevDir, () => reAuditRun(deps(), opts.run, { force: flags.includes('force') }));
      break;
    }
    case 'approve': {
      if (!opts.phase) throw new Error('Uso: ai:approve --phase <ID> [--next]');
      await withLock(aiDevDir, () => {
        approvePhase(deps(), opts.phase, { next: flags.includes('next') });
        return Promise.resolve();
      });
      break;
    }
    default: {
      throw new Error(USAGE);
    }
  }
}

main().catch((err: unknown) => {
  const log = createLogger(process.env as Env);
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = err instanceof Error && /Uso:/.test(err.message) ? 2 : 1;
});
