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
//   pnpm ai:dashboard [--port 3177]      → painel web em tempo real (custos + verificações)
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
import { runPhase, runAutonomousChain } from './run.js';
import { reAuditRun } from './auditRun.js';
import { printStatus, printRelatorio, findNextEligible, approvePhase, planDryRun, resolveRunMode } from './commands.js';
import { startDashboardServer } from './dashboard.js';
import type { RunMode } from './contracts.js';

const USAGE = `Uso:
  ai:next [--print-only] [modo]            executa (ou apenas mostra) a próxima fase elegível
  ai:run --phase <ID> [modo]               executa uma fase
  ai:audit --run <run-id> [--force]        reexecuta a auditoria de um run
  ai:status                                tabela do roadmap
  ai:relatorio                             relatório de andamento (implementações + validações)
  ai:approve --phase <ID> --reason <texto> [--next] aprovação manual (humano)
  ai:retry --phase <ID> [modo]             reexecuta fase em CORRECTION_PENDING/AUDIT_FAILED
  ai:dry-run [--phase <ID>]                plano offline sem mutações
  ai:dashboard [--port 3177]               painel web em tempo real (custos + verificações)

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
  return resolveRunMode(flags, process.stdin.isTTY);
}

async function runWithMode(deps: ReturnType<typeof createRealDeps>, phaseId: string, flags: string[]): Promise<void> {
  const mode = resolveMode(flags);
  if (mode === 'autonomous') {
    const results = await runAutonomousChain(deps, phaseId);
    for (const summary of results) {
      deps.log.info(`[autonomous] ${summary.phase}: ${summary.status}${summary.continuedTo ? ` → ${summary.continuedTo}` : ''}`);
    }
    return;
  }
  await runPhase(deps, phaseId, { mode });
}

async function main(): Promise<void> {
  const { command, opts, flags } = parseArgs(process.argv);
  const env: Env = process.env as Env;
  const log = createLogger(env);
  const repoRoot = resolveRepoRoot(env, moduleDir(import.meta.url));
  const aiDevDir = resolveAiDevDir(repoRoot);
  const config = loadAutomationConfig(aiDevDir);

  const deps = () => createRealDeps({ env, config, repoRoot, aiDevDir, log });

  switch (command) {
    case 'status': {
      printStatus(deps());
      break;
    }
    case 'relatorio': {
      await printRelatorio(deps());
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
      await withLock(aiDevDir, () => runWithMode(deps(), next.id, flags));
      break;
    }
    case 'run': {
      if (!opts.phase) throw new Error('Uso: ai:run --phase <ID> [modo]');
      await withLock(aiDevDir, () => runWithMode(deps(), opts.phase, flags));
      break;
    }
    case 'retry': {
      if (!opts.phase) throw new Error('Uso: ai:retry --phase <ID> [modo]');
      await withLock(aiDevDir, () => runWithMode(deps(), opts.phase, flags));
      break;
    }
    case 'audit': {
      if (!opts.run) throw new Error('Uso: ai:audit --run <run-id>');
      await withLock(aiDevDir, () => reAuditRun(deps(), opts.run, { force: flags.includes('force') }));
      break;
    }
    case 'approve': {
      if (!opts.phase || !opts.reason) throw new Error('Uso: ai:approve --phase <ID> --reason <justificativa> [--next]');
      await withLock(aiDevDir, () => {
        approvePhase(deps(), opts.phase, { next: flags.includes('next'), reason: opts.reason });
        return Promise.resolve();
      });
      break;
    }
    case 'dashboard': {
      // Painel web em tempo real: serve o dashboard.html + /api/snapshot (leitura ao vivo).
      const port = Number(opts.port ?? env.AI_DASHBOARD_PORT ?? 3177);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('Porta inválida: ' + opts.port);
      const url = startDashboardServer({ aiDevDir, config, port, log });
      log.info(`Painel disponível em ${url}/  (Ctrl+C para encerrar)`);
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => { log.info('Painel encerrado.'); resolve(); });
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
