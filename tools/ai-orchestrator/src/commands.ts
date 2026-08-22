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
import { readText, writeTextAtomic } from './io.js';
import { tokenizeCommand } from './executor.js';
import { type RunDeps } from './run.js';
import type { PhaseState, RoadmapPhase } from './contracts.js';

const MANUAL_APPROVE_STATES: PhaseState[] = ['AUDIT_PENDING', 'CORRECTION_PENDING', 'IMPLEMENTED', 'AUDIT_FAILED'];

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
 * Aprovação MANUAL (gate humano) via CLI. O roadmap só muda depois de
 * validação do estado atual e da transição permitida.
 */
export function approvePhase(deps: RunDeps, phaseId: string, opts: { next?: boolean } = {}): void {
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
  const historyRow = buildHistoryRow({
    date: new Date().toISOString().slice(0, 10),
    phase: phaseId,
    implementer: phase.implementer || 'DeepSeek',
    reviewer: 'Humano (CLI)',
    verdict: 'APPROVE',
    advanceAllowed: true,
    note: 'Aprovação manual via ai:approve',
  });
  writeTextAtomic(
    roadmapFile,
    renderRoadmap(md, { [phaseId]: 'AUDIT_APPROVED' }, [historyRow]),
  );
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
  console.log('  2. verificar working tree limpo (exceto docs/ai-development)');
  console.log(`  3. criar branch phase/${phase.id}`);
  console.log('  4. marcar IMPLEMENTING no roadmap');
  console.log('  5. chamar DeepSeek (implementador)');
  console.log('  6. coletar git status/diff e executar testes e builds');
  console.log('  7. salvar artefatos em runs/<timestamp>-<fase>');
  console.log('  8. chamar GPT-5.6 Terra (revisor) com contrato JSON estrito');
  console.log('  9. aplicar gate e atualizar roadmap (AUDIT_APPROVED | CORRECTION_PENDING | AUDIT_FAILED)');
  console.log(' 10. nunca avançar automaticamente; nunca merge/push automáticos');
  console.log('');
}
