// ===========================================================================
// Orquestrador: executa o ciclo completo de uma fase —
//   roadmap → working tree → branch → prompt DeepSeek → evidências (git,
//   testes, build) → artefatos → contexto de revisão → GPT-5.6 Terra →
//   validação estrita → gate → atualização do roadmap.
//
// Segurança:
//   - respostas de modelos NUNCA são executadas (executor tem allowlist);
//   - o roadmap só muda via transições validadas + auditoria validada;
//   - sem merge/push automáticos (o fluxo entrega a branch para revisão humana);
//   - falha de infraestrutura reverte o roadmap; auditoria inválida mantém
//     AUDIT_PENDING para re-auditoria manual (ai:audit).
// ===========================================================================

import { basename, relative } from 'node:path';
import { safeJoin, type Env } from './paths.js';
import { type AutomationConfig, type RunSummary, type PhaseState, type ImplementerReport } from './contracts.js';
import { type Executor, type ExecResult } from './executor.js';
import { type GitOps } from './git.js';
import { type LlmClient, AuditParseError, auditErrorSummary, validateAuditWithRetry } from './llm.js';
import {
  readText,
  writeTextAtomic,
  writeArtifact,
  mkdirRecursive,
  type Logger,
} from './io.js';
import {
  parseRoadmap,
  findPhase,
  getBlockingDependencies,
  assertTransition,
  renderRoadmap,
  buildHistoryRow,
  isValidPhaseId,
} from './roadmap.js';
import { extractPhasePrompts, buildImplementerEnvelope, buildReviewContext } from './prompts.js';
import { auditNextState, canAdvance, evidenceOk, type EvidenceGate } from './audit.js';

export interface RunDeps {
  exec: Executor;
  git: GitOps;
  llm: LlmClient;
  repoRoot: string;
  aiDevDir: string;
  config: AutomationConfig;
  env: Env;
  now?: () => Date;
  log: Logger;
}

const OUT_OF_SCOPE = [
  'Classificador, catálogo compartilhado, reserva de créditos, geração, fallback, SSE, frontend e migrations',
  '— exceto se explicitamente parte desta fase. Nenhuma alteração fora do escopo da fase.',
].join('\n');

const COMPLETION_CRITERIA = [
  '- Testes executados e verdes;',
  '- Build TypeScript verde;',
  '- Diff restrito ao escopo;',
  '- Dados legados preservados;',
  '- Isolamento multi-tenant preservado;',
  '- Auditoria das operações sensíveis.',
].join('\n');

export function compactTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function runDirForRunId(aiDevDir: string, runId: string): string {
  if (!/^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`run-id inválido: ${runId}`);
  }
  return safeJoin(aiDevDir, 'runs', runId);
}

export function aiDevRelative(repoRoot: string, aiDevDir: string): string {
  return relative(repoRoot, aiDevDir);
}

export function formatEvidence(results: ExecResult[]): string {
  return results
    .map((r) => {
      const head = r.stdout.trim().split('\n').slice(0, 40).join('\n');
      const tail = r.stderr.trim().split('\n').slice(0, 10).join('\n');
      return [
        `$ ${r.command}`,
        `resultado: ${r.ok ? 'PASS' : 'FAIL'} (exit ${r.code ?? 'killed'}, ${r.durationMs}ms)`,
        head ? head : '(sem stdout)',
        tail ? `stderr:\n${tail}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function buildImplementerReport(opts: {
  phaseId: string;
  response: string;
  tests: ExecResult;
  buildApi: ExecResult;
  buildWeb: ExecResult;
  diffStat: string;
}): ImplementerReport {
  return {
    phase: opts.phaseId,
    status: 'IMPLEMENTED',
    summary: opts.response.slice(0, 2000),
    filesChanged: [],
    diffStat: opts.diffStat,
    tests: [
      {
        command: opts.tests.command,
        result: opts.tests.ok ? 'PASS' : 'FAIL',
        details: opts.tests.stdout.slice(0, 2000),
      },
    ],
    build: {
      command: `${opts.buildApi.command}; ${opts.buildWeb.command}`,
      result: opts.buildApi.ok && opts.buildWeb.ok ? 'PASS' : 'FAIL',
      details: `${opts.buildApi.stdout.slice(0, 1000)}\n${opts.buildWeb.stdout.slice(0, 1000)}`,
    },
    migrations: [],
    decisions: [],
    limitations: [],
    risks: [],
    nextStep: 'Aguardando auditoria',
  };
}

export async function runPhase(deps: RunDeps, phaseId: string): Promise<RunSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const runId = `${compactTimestamp(new Date(startedAt))}-${phaseId}`;
  const runsDir = safeJoin(deps.aiDevDir, 'runs');
  const runDir = safeJoin(runsDir, runId);
  const roadmapFile = safeJoin(deps.aiDevDir, basename(deps.config.roadmap));
  const promptsFile = safeJoin(deps.aiDevDir, basename(deps.config.phasePrompts));

  const runSummary: RunSummary = {
    runId,
    phase: phaseId,
    startedAt,
    finishedAt: null,
    status: 'RUNNING',
    branch: null,
    implementerModel: deps.config.implementer.model,
    reviewerModel: deps.config.reviewer.model,
    artifactFiles: [],
  };
  const artifact = (name: string, content: string): void => {
    writeArtifact(runDir, name, content);
    runSummary.artifactFiles.push(name);
  };

  mkdirRecursive(runDir);
  let roadmapMarked = false;
  let previousState: PhaseState | null = null;

  const revertRoadmap = (): void => {
    if (!roadmapMarked || previousState === null) return;
    try {
      const current = readText(roadmapFile);
      writeTextAtomic(roadmapFile, renderRoadmap(current, { [phaseId]: previousState }));
    } catch (revertErr) {
      deps.log.error(`Falha ao reverter roadmap: ${(revertErr as Error).message}`);
    }
  };

  try {
    // 1) Roadmap e dependências
    const md = readText(roadmapFile);
    const { phases } = parseRoadmap(md);
    const phase = findPhase(phases, phaseId);
    if (!phase) throw new Error(`Fase ${phaseId} não existe no roadmap.`);
    if (!isValidPhaseId(phaseId)) throw new Error(`Id de fase inválido: ${phaseId}`);
    if (!['PLANNED', 'CORRECTION_PENDING', 'AUDIT_FAILED'].includes(phase.status)) {
      throw new Error(
        `Fase ${phaseId} em estado ${phase.status}; execução permitida apenas de PLANNED, CORRECTION_PENDING ou AUDIT_FAILED.`,
      );
    }
    previousState = phase.status;
    const blocking = getBlockingDependencies(phases, phase);
    if (blocking.length > 0) {
      throw new Error(`Dependências não aprovadas para ${phaseId}: ${blocking.join(', ')}.`);
    }

    // 2) Working tree limpo (o próprio diretório ai-development é excluído)
    const aiDevRel = aiDevRelative(deps.repoRoot, deps.aiDevDir);
    const dirty = await deps.git.dirtyFilesExcept([aiDevRel]);
    if (dirty.length > 0) {
      throw new Error(
        `Working tree sujo fora de ${aiDevRel}: ${dirty.slice(0, 20).join(', ')}. Faça commit ou descarte antes de executar.`,
      );
    }

    // 3) Branch da fase
    const branch = `phase/${phaseId}`;
    const createRes = await deps.git.createBranch(branch);
    if (!createRes.ok) {
      const co = await deps.git.checkoutBranch(branch);
      if (!co.ok) {
        throw new Error(
          `Não foi possível criar/entrar na branch ${branch}: ${createRes.stderr || createRes.stdout}`,
        );
      }
    }
    runSummary.branch = branch;

    // 4) Roadmap → IMPLEMENTING
    assertTransition(previousState, 'IMPLEMENTING');
    writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: 'IMPLEMENTING' }));
    roadmapMarked = true;

    // 5) Prompt da fase + chamada ao implementador (DeepSeek)
    const prompts = extractPhasePrompts(readText(promptsFile), phaseId);
    const envelope = buildImplementerEnvelope({
      phaseId,
      phaseName: prompts.name,
      approvedDependencies: phase.dependencies,
      objective: phase.description,
      scopePrompt: prompts.implementer,
      outOfScope: OUT_OF_SCOPE,
      completionCriteria: COMPLETION_CRITERIA,
    });
    artifact('00-prompt-implementer.txt', envelope);
    deps.log.info(`Chamando implementador (${runSummary.implementerModel}) para ${phaseId}...`);
    const response = await deps.llm.implementer(envelope);
    artifact('01-response-implementer.txt', response);

    // 6) Evidências: testes e builds (apenas comandos permitidos)
    const tests = await deps.exec.runConfigCommand(deps.config.commands.apiTests, {
      cwd: deps.repoRoot,
      timeoutMs: 600_000,
    });
    const buildApi = await deps.exec.runConfigCommand(deps.config.commands.apiBuild, {
      cwd: deps.repoRoot,
      timeoutMs: 600_000,
    });
    const buildWeb = await deps.exec.runConfigCommand(deps.config.commands.webBuild, {
      cwd: deps.repoRoot,
      timeoutMs: 900_000,
    });
    const testsText = formatEvidence([tests]);
    const buildText = formatEvidence([buildApi, buildWeb]);
    artifact('05-tests.txt', testsText);
    artifact('06-build.txt', buildText);

    // 7) Artefatos git (diff da fase, excluindo o próprio diretório ai-development)
    const gitArtifacts = await deps.git.collectDiffArtifacts([aiDevRel]);
    artifact('02-git-status.txt', gitArtifacts.status);
    artifact('03-git-diff-stat.txt', gitArtifacts.diffStat);
    artifact('04-git-diff.txt', gitArtifacts.diff);

    // 8) Relatório do implementador (gerado a partir das evidências)
    const report = buildImplementerReport({
      phaseId,
      response,
      tests,
      buildApi,
      buildWeb,
      diffStat: gitArtifacts.diffStat,
    });
    artifact('07-implementer-report.json', JSON.stringify(report, null, 2));

    // 9) Roadmap → IMPLEMENTED → AUDIT_PENDING
    writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: 'AUDIT_PENDING' }));

    // 10) Contexto de revisão + GPT-5.6 Terra (com validação estrita + 1 correção)
    const context = buildReviewContext({
      phaseId,
      phaseName: prompts.name,
      objective: phase.description,
      approvedDependencies: phase.dependencies,
      filesChanged: gitArtifacts.status,
      diff: gitArtifacts.diff,
      tests: testsText,
      build: buildText,
      migrations: '(não coletada nesta execução)',
      decisions: '',
      limitations: '',
      risks: '',
    });
    artifact('08-review-context.txt', context);
    deps.log.info(`Chamando revisor (${runSummary.reviewerModel})...`);
    const { audit, rawResponses, corrected } = await validateAuditWithRetry(deps.llm, context);
    artifact('09-review-response.txt', rawResponses.join('\n\n--- RESPOSTA CORRIGIDA ---\n\n'));
    artifact('10-audit-result.json', JSON.stringify(audit, null, 2));
    runSummary.audit = audit;
    if (corrected) deps.log.warn('Auditoria corrigida após feedback de validação (1 tentativa).');

    // 11) Gate de aprovação
    const gate: EvidenceGate = {
      testsPass: tests.ok,
      buildsPass: buildApi.ok && buildWeb.ok,
      hasDiff: gitArtifacts.diff.trim().length > 0,
      requireTests: deps.config.limits.requireTests,
      requireBuild: deps.config.limits.requireBuild,
      requireDiff: deps.config.limits.requireDiff,
    };
    artifact(
      '11-evidence.json',
      JSON.stringify(
        { testsPass: gate.testsPass, buildsPass: gate.buildsPass, hasDiff: gate.hasDiff },
        null,
        2,
      ),
    );
    const approved = canAdvance(audit) && evidenceOk(gate);
    const { state, advanceAllowed, reason } = auditNextState(audit, gate);
    assertTransition('AUDIT_PENDING', state);
    const historyRow = buildHistoryRow({
      date: now().toISOString().slice(0, 10),
      phase: phaseId,
      implementer: phase.implementer || 'DeepSeek',
      reviewer: phase.reviewer || 'GPT-5.6 Terra',
      verdict: audit.verdict,
      advanceAllowed,
      note: reason,
    });
    writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: state }, [historyRow]));

    runSummary.status = state === 'AUDIT_APPROVED' ? 'AUDIT_APPROVED' : state === 'CORRECTION_PENDING' ? 'CORRECTION_PENDING' : 'AUDIT_FAILED';
    runSummary.finishedAt = now().toISOString();
    if (!approved) {
      deps.log.warn(`Fase ${phaseId}: ${state} (${reason}).`);
    } else {
      deps.log.info(`Fase ${phaseId}: ${state}. Próxima fase só via ai:next (após merge manual da branch).`);
    }
    artifact('run.json', JSON.stringify(runSummary, null, 2));
    return runSummary;
  } catch (err) {
    const isAuditError = err instanceof AuditParseError;
    runSummary.status = 'FAILED';
    runSummary.finishedAt = now().toISOString();
    runSummary.error = auditErrorSummary(err);
    if (isAuditError) {
      // Roadmap permanece AUDIT_PENDING: permite ai:audit --run <id> manual.
      deps.log.error(`Auditoria inválida para ${phaseId}: ${runSummary.error}. Reenvie com ai:audit --run ${runId}.`);
    } else {
      revertRoadmap();
      deps.log.error(`Falha na execução de ${phaseId}: ${runSummary.error}`);
    }
    artifact('run.json', JSON.stringify(runSummary, null, 2));
    throw err;
  }
}
