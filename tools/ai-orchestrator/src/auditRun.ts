// ===========================================================================
// Re-auditoria manual: `pnpm ai:audit --run <run-id>` reexecuta SOMENTE o passo
// de revisão de uma execução existente (útil após auditoria inválida ou para
// reavaliar com contexto preservado). Nunca reexecuta código do implementador.
// ===========================================================================

import { basename, join } from 'node:path';
import { safeJoin } from './paths.js';
import { RunSummary } from './contracts.js';
import { validateAuditWithRetry, AuditParseError } from './llm.js';
import { readText, readArtifact, writeArtifact, writeTextAtomic, exists } from './io.js';
import { parseRoadmap, findPhase, assertTransition, renderRoadmap, buildHistoryRow } from './roadmap.js';
import { buildReviewContext } from './prompts.js';
import { auditNextState, canAdvance, evidenceOk, type EvidenceGate } from './audit.js';
import { runDirForRunId, type RunDeps } from './run.js';

export interface ReAuditOptions {
  force?: boolean;
}

export async function reAuditRun(deps: RunDeps, runId: string, opts: ReAuditOptions = {}): Promise<void> {
  const runDir = runDirForRunId(deps.aiDevDir, runId);
  const roadmapFile = safeJoin(deps.aiDevDir, basename(deps.config.roadmap));

  const runRaw = readArtifact(runDir, 'run.json');
  const runSummary = RunSummary.parse(JSON.parse(runRaw));
  const phaseId = runSummary.phase;

  if (!opts.force && ['AUDIT_APPROVED', 'CORRECTION_PENDING', 'AUDIT_FAILED'].includes(runSummary.status)) {
    throw new Error(`Run ${runId} já finalizado (${runSummary.status}). Use --force para reauditar.`);
  }

  const md = readText(roadmapFile);
  const { phases } = parseRoadmap(md);
  const phase = findPhase(phases, phaseId);
  if (!phase) throw new Error(`Fase ${phaseId} não existe no roadmap.`);
  if (!opts.force && phase.status !== 'AUDIT_PENDING') {
    throw new Error(
      `Fase ${phaseId} em ${phase.status}; reauditoria exige AUDIT_PENDING (ou --force).`,
    );
  }

  // Contexto: usa o armazenado no run; se ausente, reconstrói minimamente.
  let context: string;
  if (exists(join(runDir, '08-review-context.txt'))) {
    context = readArtifact(runDir, '08-review-context.txt');
  } else {
    const diff = exists(join(runDir, '04-git-diff.txt')) ? readArtifact(runDir, '04-git-diff.txt') : '';
    const tests = exists(join(runDir, '05-tests.txt')) ? readArtifact(runDir, '05-tests.txt') : '';
    const build = exists(join(runDir, '06-build.txt')) ? readArtifact(runDir, '06-build.txt') : '';
    const status = exists(join(runDir, '02-git-status.txt')) ? readArtifact(runDir, '02-git-status.txt') : '';
    context = buildReviewContext({
      phaseId,
      phaseName: '',
      objective: phase.description,
      approvedDependencies: phase.dependencies,
      filesChanged: status,
      diff,
      tests,
      build,
      migrations: '',
      decisions: '',
      limitations: '',
      risks: '',
      auditHistory: '',
      correctionsApplied: '',
    });
  }

  deps.log.info(`Reauditando ${runId} (fase ${phaseId}) com ${runSummary.reviewerModel}...`);
  const { audit, rawResponses, corrected } = await validateAuditWithRetry(deps.llm, context);
  writeArtifact(runDir, '09-review-response.txt', rawResponses.join('\n\n--- RESPOSTA CORRIGIDA ---\n\n'));
  writeArtifact(runDir, '10-audit-result.json', JSON.stringify(audit, null, 2));
  if (corrected) deps.log.warn('Auditoria corrigida após feedback de validação (1 tentativa).');

  // Gate com evidências armazenadas no run.
  let gate: EvidenceGate;
  if (exists(join(runDir, '11-evidence.json'))) {
    const ev = JSON.parse(readArtifact(runDir, '11-evidence.json')) as {
      testsPass: boolean;
      buildsPass: boolean;
      hasDiff: boolean;
    };
    gate = {
      testsPass: ev.testsPass,
      buildsPass: ev.buildsPass,
      hasDiff: ev.hasDiff,
      requireTests: deps.config.limits.requireTests,
      requireBuild: deps.config.limits.requireBuild,
      requireDiff: deps.config.limits.requireDiff,
    };
  } else {
    if (!opts.force) {
      throw new Error('Evidências (11-evidence.json) não encontradas no run; use --force para ignorar.');
    }
    gate = {
      testsPass: true,
      buildsPass: true,
      hasDiff: true,
      requireTests: deps.config.limits.requireTests,
      requireBuild: deps.config.limits.requireBuild,
      requireDiff: deps.config.limits.requireDiff,
    };
  }

  const approved = canAdvance(audit) && evidenceOk(gate);
  const { state, advanceAllowed, reason } = auditNextState(audit, gate);
  assertTransition('AUDIT_PENDING', state);

  const historyRow = buildHistoryRow({
    date: new Date().toISOString().slice(0, 10),
    phase: phaseId,
    implementer: phase.implementer || 'DeepSeek',
    reviewer: phase.reviewer || 'GPT-5.6 Terra',
    verdict: audit.verdict,
    advanceAllowed,
    note: `reauditoria ${runId}: ${reason}`,
  });
  writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: state }, [historyRow]));

  runSummary.status = state === 'AUDIT_APPROVED' ? 'AUDIT_APPROVED' : state === 'CORRECTION_PENDING' ? 'CORRECTION_PENDING' : 'AUDIT_FAILED';
  runSummary.audit = audit;
  runSummary.finishedAt = new Date().toISOString();
  writeArtifact(runDir, 'run.json', JSON.stringify(runSummary, null, 2));

  if (approved) deps.log.info(`Fase ${phaseId}: ${state}.`);
  else deps.log.warn(`Fase ${phaseId}: ${state} (${reason}).`);
}

// Re-export usado pelo cli
export { AuditParseError };
