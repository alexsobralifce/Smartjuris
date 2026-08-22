// ===========================================================================
// Comandos de status, aprovação manual, próximo elegível e dry-run (offline).
// ===========================================================================

import { basename } from 'node:path';
import { safeJoin } from './paths.js';
import {
  parseRoadmap,
  findPhase,
  findNextPlannable,
  getBlockingDependencies,
  assertTransition,
  renderRoadmap,
  buildHistoryRow,
} from './roadmap.js';
import { extractPhasePrompts } from './prompts.js';
import { readText, writeTextAtomic, mkdirRecursive, writeArtifact } from './io.js';
import { tokenizeCommand } from './executor.js';
import { compactTimestamp, type RunDeps } from './run.js';
import type { PhaseState, RoadmapPhase, RunMode } from './contracts.js';

const MANUAL_APPROVE_STATES: PhaseState[] = ['AUDIT_PENDING', 'CORRECTION_PENDING', 'IMPLEMENTED', 'AUDIT_FAILED'];

/**
 * Precedência de modos (a primeira flag presente vence):
 *   --dry-run → --no-auto-commit → --autonomous → --auto-commit → --allow-dirty
 * Sem flag: interativo (pergunta) se TTY; senão preserva o comportamento antigo.
 */
export function resolveRunMode(flags: string[], isTty: boolean): RunMode {
  if (flags.includes('dry-run')) return 'dry-run';
  if (flags.includes('no-auto-commit')) return 'no-auto-commit';
  if (flags.includes('autonomous')) return 'autonomous';
  if (flags.includes('auto-commit')) return 'auto-commit';
  if (flags.includes('allow-dirty')) return 'allow-dirty';
  return isTty ? 'interactive' : 'no-auto-commit';
}

export function printStatus(deps: RunDeps): void {
  const md = readText(safeJoin(deps.aiDevDir, basename(deps.config.roadmap)));
  const { phases } = parseRoadmap(md);
  const next = findNextPlannable(phases);

  console.log('\n=== SmartJuris — Roadmap de Implementação ===\n');
  console.log('Fase        Estado               Dependências            Próxima?');
  for (const phase of phases) {
    const depsStr = phase.dependencies.length > 0 ? phase.dependencies.join(',') : '—';
    const isNext = next && phase.id === next.id ? ' *' : '';
    console.log(
      `${phase.id.padEnd(11)} ${phase.status.padEnd(20)} ${depsStr.padEnd(22)}${isNext}`,
    );
  }
  if (next) {
    console.log(`\nPróxima fase elegível: ${next.id} — ${next.description}`);
  } else {
    console.log('\nNenhuma fase PLANNED com dependências aprovadas.');
  }
  console.log('');
}

export function findNextEligible(deps: RunDeps): RoadmapPhase {
  const md = readText(safeJoin(deps.aiDevDir, basename(deps.config.roadmap)));
  const { phases } = parseRoadmap(md);
  const next = findNextPlannable(phases);
  if (!next) {
    throw new Error('Nenhuma fase PLANNED com dependências aprovadas.');
  }
  return next;
}

/**
 * Relatório de ANDAMENTO (implementações + validações do orquestrador):
 * agrega o roadmap com o histórico REAL de runs de auditoria por fase
 * (rounds, veredito final, revisor usado, achados graves), a configuração
 * atual do revisor/gate e o estado do working tree. Demo de progresso
 * auditável, sem tocar em nenhum estado.
 */
export async function printRelatorio(deps: RunDeps): Promise<void> {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const md = readText(safeJoin(deps.aiDevDir, basename(deps.config.roadmap)));
  const { phases } = parseRoadmap(md);

  const runsDir = safeJoin(deps.aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = readdirSync(runsDir);
  } catch {
    entries = [];
  }

  const porFase = new Map<string, Array<{
    id: string;
    ts: number;
    status: string;
    reviewer: string;
    verdict: string | null;
    graves: number | null;
    achados: number | null;
    costUsd: number | null;
    promptTokens: number;
    completionTokens: number;
  }>>();
  for (const entry of entries) {
    const m = entry.match(/^(\d{8}T\d{6}Z)-(.+)$/);
    if (!m) continue;
    const fase = m[2];
    const dir = safeJoin(runsDir, entry);
    let run: { status?: string; reviewerModel?: string; costEstimateUsd?: number | null; tokenUsage?: { promptTokens?: number; completionTokens?: number } } = {};
    try {
      run = JSON.parse(readFileSync(safeJoin(dir, 'run.json'), 'utf8'));
    } catch {
      // run parcial (sem run.json) — ignora
    }
    let audit: { verdict?: string; findings?: Array<{ severity?: string }>; missingTests?: unknown[] } | null = null;
    const auditPath = safeJoin(dir, '10-audit-result.json');
    if (existsSync(auditPath)) {
      try {
        audit = JSON.parse(readFileSync(auditPath, 'utf8'));
      } catch {
        audit = null;
      }
    }
    const achados = audit?.findings?.filter((f) => f.severity && f.severity !== 'PASS') ?? [];
    const item = {
      id: entry,
      ts: Date.parse(m[1]) || 0,
      status: run.status ?? '?',
      reviewer: run.reviewerModel ?? '?',
      verdict: audit?.verdict ?? null,
      graves: audit ? achados.filter((f) => f.severity === 'HIGH' || f.severity === 'BLOCKER').length : null,
      achados: audit ? achados.length : null,
      costUsd: typeof run.costEstimateUsd === 'number' ? run.costEstimateUsd : null,
      promptTokens: run.tokenUsage?.promptTokens ?? 0,
      completionTokens: run.tokenUsage?.completionTokens ?? 0,
    };
    const lista = porFase.get(fase) ?? [];
    lista.push(item);
    porFase.set(fase, lista);
  }
  for (const lista of porFase.values()) lista.sort((a, b) => a.ts - b.ts);

  console.log('\n=== SmartJuris — Relatório de Andamento (implementações + validações) ===\n');
  console.log(`Revisor atual   : ${deps.config.reviewer.model} (${deps.config.reviewer.provider})`);
  console.log(`Teto correções  : ${deps.config.limits.maxCorrectionAttempts}`);
  console.log(`Gate de avanço  : testes=${deps.config.limits.requireTests ? 'obrigatórios' : 'não'} · build=${deps.config.limits.requireBuild ? 'obrigatório' : 'não'} · diff=${deps.config.limits.requireDiff ? 'obrigatório' : 'não'}`);
  console.log('');

  const custoTotalFase = (runs: Array<{ costUsd: number | null }>): string => {
    const sum = runs.reduce((acc, r) => acc + (r.costUsd ?? 0), 0);
    const any = runs.some((r) => r.costUsd !== null);
    return any ? `$${sum.toFixed(4)}` : '—';
  };
  const tokensTotalFase = (runs: Array<{ promptTokens: number; completionTokens: number }>): string => {
    const p = runs.reduce((a, r) => a + r.promptTokens, 0);
    const c = runs.reduce((a, r) => a + r.completionTokens, 0);
    return p + c > 0 ? `${p}/${c}` : '—';
  };

  console.log('Fase        Estado               Rounds  Verdict    Revisor     Tokens(in/out)  Custo (USD)');
  for (const phase of phases) {
    const runs = porFase.get(phase.id) ?? [];
    const ultimo = runs.length > 0 ? runs[runs.length - 1] : null;
    const rounds = runs.length > 0 ? String(runs.length) : '—';
    const veredito = ultimo?.verdict ?? '—';
    const revisor = ultimo && ultimo.reviewer !== '?' ? ultimo.reviewer : '—';
    const tokens = tokensTotalFase(runs);
    const custo = custoTotalFase(runs);
    console.log(
      `${phase.id.padEnd(11)} ${phase.status.padEnd(20)} ${rounds.padEnd(7)} ${String(veredito).padEnd(10)} ${String(revisor).padEnd(11)} ${tokens.padEnd(14)} ${custo}`,
    );
  }

  console.log('\n--- Últimas validações por fase (run → veredito [HIGH]) ---');
  for (const phase of phases) {
    const runs = (porFase.get(phase.id) ?? []).filter((r) => r.verdict);
    if (runs.length === 0) continue;
    const ultimos = runs.slice(-3);
    console.log(
      `${phase.id}: ${ultimos
        .map((r) => {
          const ts = r.id.slice(9, 15);
          return `${ts} ${r.verdict}${r.graves ? `(${r.graves}H)` : ''}`;
        })
        .join(' → ')}`,
    );
  }

  // Estado do working tree (sem mutar nada).
  try {
    const git = await import('./git.js');
    if (git && typeof deps.git?.porcelain === 'function') {
      const porc = await deps.git.porcelain();
      const dirty = porc.split('\n').filter(Boolean).length;
      console.log(`\nWorking tree: ${dirty === 0 ? 'limpo' : `${dirty} arquivo(s) alterado(s) fora do roadmap`}`);
    }
  } catch {
    // sem git disponível — omite
  }
  console.log('');
}

/**
 * Aprovação MANUAL (gate humano) via CLI. O roadmap só muda depois de
 * validação do estado atual e da transição permitida.
 */
export function approvePhase(deps: RunDeps, phaseId: string, opts: { next?: boolean; reason: string }): void {
  if (!opts.reason.trim()) throw new Error('A aprovação manual exige --reason <justificativa>.');
  const roadmapFile = safeJoin(deps.aiDevDir, basename(deps.config.roadmap));
  const md = readText(roadmapFile);
  const { phases } = parseRoadmap(md);
  const phase = findPhase(phases, phaseId);
  if (!phase) throw new Error(`Fase ${phaseId} não existe no roadmap.`);
  if (!MANUAL_APPROVE_STATES.includes(phase.status)) {
    throw new Error(
      `Aprovação manual só é permitida a partir de ${MANUAL_APPROVE_STATES.join('/')}; fase está em ${phase.status}.`,
    );
  }
  assertTransition(phase.status, 'AUDIT_APPROVED');
  const approvedAt = new Date().toISOString();
  const runId = `${compactTimestamp(new Date(approvedAt))}-${phaseId}`;
  const runDir = safeJoin(deps.aiDevDir, 'runs', runId);
  const audit = {
    phase: phaseId,
    verdict: 'APPROVE' as const,
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
  };
  const manualApproval = { approvedBy: 'Humano (CLI)', reason: opts.reason.trim(), approvedAt };
  mkdirRecursive(runDir);
  writeArtifact(runDir, '10-audit-result.json', JSON.stringify(audit, null, 2));
  writeArtifact(runDir, '17-manual-approval.json', JSON.stringify(manualApproval, null, 2));
  writeArtifact(runDir, 'run.json', JSON.stringify({
    runId,
    phase: phaseId,
    startedAt: approvedAt,
    finishedAt: approvedAt,
    status: 'AUDIT_APPROVED',
    branch: null,
    implementerModel: 'N/A',
    reviewerModel: 'Humano (CLI)',
    artifactFiles: ['10-audit-result.json', '17-manual-approval.json', 'run.json'],
    mode: 'manual-approval',
    manualApproval,
  }, null, 2));
  const historyRow = buildHistoryRow({
    date: approvedAt.slice(0, 10),
    phase: phaseId,
    implementer: phase.implementer || 'DeepSeek',
    reviewer: 'Humano (CLI)',
    verdict: 'APPROVE',
    advanceAllowed: true,
    note: `Aprovação manual: ${opts.reason.trim()}`,
  });
  writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: 'AUDIT_APPROVED' }, [historyRow]));
  deps.log.info(`Fase ${phaseId} marcada como AUDIT_APPROVED (aprovação manual).`);

  if (opts.next) {
    const next = findNextPlannable(
      parseRoadmap(readText(roadmapFile)).phases,
    );
    deps.log.info(
      next
        ? `Próxima fase elegível: ${next.id} — execute pnpm ai:run --phase ${next.id}`
        : 'Nenhuma fase elegível no momento.',
    );
  }
}

/**
 * Dry-run offline: valida configuração, roadmap, dependências, prompt e
 * comandos da configuração, e imprime o plano — sem mutar arquivos, sem git,
 * sem chamadas LLM.
 */
export function planDryRun(deps: RunDeps, phaseId?: string): void {
  const roadmapFile = safeJoin(deps.aiDevDir, basename(deps.config.roadmap));
  const promptsFile = safeJoin(deps.aiDevDir, basename(deps.config.phasePrompts));
  const md = readText(roadmapFile);
  const { phases } = parseRoadmap(md);

  const phase = phaseId ? findPhase(phases, phaseId) : findNextPlannable(phases);
  if (!phase) {
    throw new Error(
      phaseId
        ? `Fase ${phaseId} não existe no roadmap.`
        : 'Nenhuma fase PLANNED com dependências aprovadas.',
    );
  }
  if (phaseId && phase.status !== 'PLANNED' && phase.status !== 'CORRECTION_PENDING' && phase.status !== 'AUDIT_FAILED') {
    throw new Error(`Fase ${phase.id} em ${phase.status}; execução permitida apenas de PLANNED/CORRECTION_PENDING/AUDIT_FAILED.`);
  }
  const blocking = getBlockingDependencies(phases, phase);
  if (blocking.length > 0) {
    throw new Error(`Dependências não aprovadas para ${phase.id}: ${blocking.join(', ')}.`);
  }

  // Valida contratos de forma offline.
  for (const cmd of [deps.config.commands.apiTests, deps.config.commands.apiBuild, deps.config.commands.webBuild]) {
    tokenizeCommand(cmd); // lança se não estiver na allowlist
  }

  const prompts = extractPhasePrompts(readText(promptsFile), phase.id);

  console.log('\n=== Dry-run — plano de execução (sem alterações) ===');
  console.log(`Fase:            ${phase.id} — ${phase.description}`);
  console.log(`Estado:          ${phase.status}`);
  console.log(`Dependências:    ${phase.dependencies.length > 0 ? phase.dependencies.join(', ') : '—'}`);
  console.log(`Branch:          phase/${phase.id}`);
  console.log(`Run dir:         ${deps.aiDevDir}/runs/<timestamp>-${phase.id}`);
  console.log(`Implementador:   ${deps.config.implementer.provider}/${deps.config.implementer.model}`);
  console.log(`Revisor:         ${deps.config.reviewer.provider}/${deps.config.reviewer.model}`);
  console.log('Prompt da fase (implementação) — trecho inicial:');
  console.log(
    prompts.implementer
      .split('\n')
      .slice(0, 6)
      .map((l) => `  ${l}`)
      .join('\n'),
  );
  console.log('Passos:');
  console.log('  1. validar roadmap e dependências');
  console.log('  2. inspecionar working tree (porcelain v1) e classificar arquivos');
  console.log('  3. proteger docs/ai-development e detectar segredos/suspeitos');
  console.log('  4. criar checkpoint (auto-commit | interativo | allow-dirty) — nunca git add .');
  console.log(`  5. criar branch phase/${phase.id}`);
  console.log('  6. marcar IMPLEMENTING no roadmap');
  console.log('  7. chamar DeepSeek (implementador)');
  console.log('  8. coletar git status/diff e executar testes e builds');
  console.log('  9. salvar artefatos em runs/<timestamp>-<fase>');
  console.log(' 10. chamar GPT-5.6 Terra (revisor) com contrato JSON estrito');
  console.log(' 11. aplicar gate e atualizar roadmap (AUDIT_APPROVED | CORRECTION_PENDING | AUDIT_FAILED)');
  console.log(' 12. registrar run.json (SHA inicial/final, modo, arquivos) — nunca merge/push automáticos');
  console.log('');
}
