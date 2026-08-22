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
import { type AutomationConfig, type RunSummary, type PhaseState, type ImplementerReport, type RunMode } from './contracts.js';
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
  findNextPlannable,
  getBlockingDependencies,
  assertTransition,
  renderRoadmap,
  buildHistoryRow,
  extractAuditHistory,
  isValidPhaseId,
} from './roadmap.js';
import { extractPhasePrompts, buildImplementerEnvelope, buildReviewContext } from './prompts.js';
import { auditNextState, canAdvance, evidenceOk, type EvidenceGate } from './audit.js';
import {
  prepareWorkingTree,
  commitRoadmapUpdate,
  commitPhaseImplementation,
  type PrepareResult,
} from './worktree.js';

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

/**
 * SHA da rodada anterior da mesma fase (para diff delta). Lê o run.json mais
 * recente de `runs/` com o mesmo phaseId (excluindo o run atual) e retorna o
 * initialSha registrado. Se não houver rodada anterior, retorna null (diff HEAD).
 */
export async function previousRunBaseSha(aiDevDir: string, phaseId: string, currentRunId: string): Promise<string | null> {
  const { readdir, readFile } = await import('node:fs/promises');
  const runsDir = safeJoin(aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    return null; // sem diretório de runs ainda
  }
  const candidatos: { ts: number; sha: string }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(`-${phaseId}`) || entry === currentRunId) continue;
    try {
      const raw = await readFile(safeJoin(runsDir, entry, 'run.json'), 'utf8');
      const parsed = JSON.parse(raw) as { initialSha?: string | null };
      if (parsed.initialSha) {
        const m = entry.match(/^(\d{8}T\d{6}Z)/);
        candidatos.push({ ts: m ? Date.parse(m[1]) : 0, sha: parsed.initialSha });
      }
    } catch {
      // run.json ausente/corrompido — ignora
    }
  }
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.ts - a.ts);
  return candidatos[0].sha;
}

/**
 * Cache de auditoria: se o contexto de revisão (diff + evidências) já foi
 * auditado em uma rodada anterior da MESMA fase com resultado idêntico,
 * reusa o veredito — ZERO chamada ao revisor (economia de tokens).
 * O cache é válido apenas quando o contexto é byte-a-byte igual.
 */
export async function cachedAuditForContext(
  aiDevDir: string,
  phaseId: string,
  currentRunId: string,
  context: string,
): Promise<{ audit: import('./contracts.js').AuditResult; runId: string } | null> {
  const { createHash } = await import('node:crypto');
  const { readdir, readFile } = await import('node:fs/promises');
  const ctxHash = createHash('sha256').update(context).digest('hex');
  const runsDir = safeJoin(aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    return null;
  }
  const candidatos: { ts: number; runId: string; ctxHash: string; audit: unknown }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(`-${phaseId}`) || entry === currentRunId) continue;
    try {
      const raw = await readFile(safeJoin(runsDir, entry, 'run.json'), 'utf8');
      const parsed = JSON.parse(raw) as { audit?: unknown; contextHash?: string };
      if (!parsed.audit) continue;
      // Aceita cache se o run anterior registrou o MESMO contextHash.
      if (parsed.contextHash && parsed.contextHash === ctxHash) {
        const m = entry.match(/^(\d{8}T\d{6}Z)/);
        candidatos.push({ ts: m ? Date.parse(m[1]) : 0, runId: entry, ctxHash: parsed.contextHash, audit: parsed.audit });
      }
    } catch {
      // ignora run.json inválido
    }
  }
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.ts - a.ts);
  const best = candidatos[0];
  return { audit: best.audit as import('./contracts.js').AuditResult, runId: best.runId };
}

/**
 * LOOPGAIN (convergência): conta achados HIGH/BLOCKER de um audit e, se a
 * rodada anterior da fase teve o MESMO número (ou mais), o loop NÃO está
 * convergindo — abre o circuito antes do teto de tentativas, exigindo decisão
 * humana. Retorna a rodada anterior se a convergência falhou.
 */
export async function convergenciaFalhou(
  aiDevDir: string,
  phaseId: string,
  currentRunId: string,
  audit: import('./contracts.js').AuditResult,
): Promise<{ anterior: string; gravesAtual: number; gravesAnterior: number } | null> {
  const { readdir, readFile } = await import('node:fs/promises');
  const runsDir = safeJoin(aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    return null;
  }
  const gravesAtual = audit.findings.filter((f) => f.severity === 'HIGH' || f.severity === 'BLOCKER').length;
  if (gravesAtual === 0) return null; // convergiu (sem achados graves)

  const anteriores: { ts: number; runId: string; graves: number }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(`-${phaseId}`) || entry === currentRunId) continue;
    try {
      const raw = await readFile(safeJoin(runsDir, entry, 'run.json'), 'utf8');
      const parsed = JSON.parse(raw) as { audit?: { findings?: { severity?: string }[] } };
      if (!parsed.audit?.findings) continue;
      const m = entry.match(/^(\d{8}T\d{6}Z)/);
      anteriores.push({
        ts: m ? Date.parse(m[1]) : 0,
        runId: entry,
        graves: parsed.audit.findings.filter((f) => f.severity === 'HIGH' || f.severity === 'BLOCKER').length,
      });
    } catch {
      // ignora
    }
  }
  if (anteriores.length === 0) return null; // primeira rodada de correção
  anteriores.sort((a, b) => b.ts - a.ts);
  const ultimo = anteriores[0];
  if (gravesAtual >= ultimo.graves && ultimo.graves > 0) {
    return { anterior: ultimo.runId, gravesAtual, gravesAnterior: ultimo.graves };
  }
  return null; // reduziu achados → convergindo
}

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

export interface RunPhaseOptions {
  /** Modo de checkpoint do working tree (padrão: no-auto-commit — comportamento antigo). */
  mode?: RunMode;
  confirm?: (question: string) => Promise<boolean>;
}

export async function runPhase(deps: RunDeps, phaseId: string, opts: RunPhaseOptions = {}): Promise<RunSummary> {
  const mode: RunMode = opts.mode ?? 'no-auto-commit';
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const runId = `${compactTimestamp(new Date(startedAt))}-${phaseId}`;
  const runsDir = safeJoin(deps.aiDevDir, 'runs');
  const runDir = safeJoin(runsDir, runId);
  const roadmapFile = safeJoin(deps.aiDevDir, basename(deps.config.roadmap));
  const promptsFile = safeJoin(deps.aiDevDir, basename(deps.config.phasePrompts));
  const aiDevRel = aiDevRelative(deps.repoRoot, deps.aiDevDir);

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
    mode,
    initialSha: null,
    finalSha: null,
    preRunFiles: [],
  };
  const artifact = (name: string, content: string): void => {
    writeArtifact(runDir, name, content);
    runSummary.artifactFiles.push(name);
  };

  // dry-run não cria nada (nem o diretório do run).
  if (mode !== 'dry-run') mkdirRecursive(runDir);
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

    // 2) Teto de correções: conta rodadas anteriores da fase que terminaram em
    //    CORRECTION_PENDING/AUDIT_FAILED. Ao atingir maxCorrectionAttempts,
    //    PARA o ciclo e exige decisão humana (ai:approve ou reescopo) — evita
    //    retrabalho infinito e gasto de tokens em re-auditorias sem memória.
    if (previousState !== 'PLANNED') {
      const history = extractAuditHistory(md, phaseId);
      const falhas = history.filter((h) => {
        // Linha: | data | fase | implementador | revisor | VEREDITO | avançou | nota |
        const cells = h.split('|').map((c) => c.trim());
        return /CORRECTION|REJECT|APPROVE_WITH_CONDITIONS/i.test(cells[5] ?? '');
      }).length;
      if (falhas >= deps.config.limits.maxCorrectionAttempts) {
        throw new Error(
          `Fase ${phaseId} atingiu o limite de ${deps.config.limits.maxCorrectionAttempts} tentativas de correção (` +
            `${falhas} rodada(s) anterior(es) sem aprovação). Decisão humana requerida: ` +
            'use `pnpm ai:approve --phase ' + phaseId + '` (aprovação manual justificada) ' +
            'ou revise o escopo antes de tentar novamente.',
        );
      }
    }

    // 3) Working tree: proteções (docs/ai-development, segredos, suspeitos) +
    //    checkpoint configurável (auto-commit | interactive | allow-dirty | no-auto-commit | dry-run)
    const prep: PrepareResult = await prepareWorkingTree({
      git: deps.git,
      log: deps.log,
      aiDevRel,
      phaseId,
      mode,
      confirm: opts.confirm,
    });
    runSummary.initialSha = prep.initialSha;
    runSummary.finalSha = prep.finalSha;
    runSummary.preRunFiles = prep.preRunFiles;

    if (mode === 'dry-run') {
      deps.log.info(`[dry-run] Fase ${phaseId} validada (roadmap, dependências, working tree). Nada será executado nem modificado.`);
      runSummary.status = 'DRY_RUN';
      runSummary.finishedAt = now().toISOString();
      return runSummary;
    }

    // 4) Branch da fase
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

    // 5) Roadmap → IMPLEMENTING
    assertTransition(previousState, 'IMPLEMENTING');
    writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: 'IMPLEMENTING' }));
    roadmapMarked = true;

    // 6) Prompt da fase + implementação.
    //    Se o working tree já contém o diff da fase (allow-dirty com arquivos
    //    seguros), a implementação é externa (agente/humano): não há o que o
    //    LLM escrever. Pular a chamada ao DeepSeek nesse caso elimina a fonte
    //    de intermitência (resposta vazia / raciocínio esgotando max_tokens) e
    //    acelera o ciclo — o revisor é alimentado por git diff + testes + build,
    //    não pela resposta do implementador.
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
    const alreadyImplemented = mode === 'allow-dirty' && prep.preRunFiles.length > 0;
    let response: string;
    if (alreadyImplemented) {
      deps.log.info(
        `Diff da fase já presente no working tree (${prep.preRunFiles.length} arquivo(s)); pulando o implementador.`,
      );
      response = [
        `Implementação já presente no working tree (${prep.preRunFiles.length} arquivo(s)):`,
        ...prep.preRunFiles.map((p) => `- ${p}`),
      ].join('\n');
      artifact('01-response-implementer.txt', response);
    } else {
      deps.log.info(`Chamando implementador (${runSummary.implementerModel}) para ${phaseId}...`);
      response = await deps.llm.implementer(envelope);
      artifact('01-response-implementer.txt', response);
    }

    // 7) Evidências: testes e builds (apenas comandos permitidos)
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

    // 8) Artefatos git (diff da fase, excluindo o próprio diretório ai-development).
    //    Se é uma RODADA DE CORREÇÃO, o diff apresentado é o DELTA desde a
    //    rodada anterior (menos tokens, foco no que mudou); na primeira rodada
    //    usa HEAD (diff acumulado).
    const diffBase = previousState !== 'PLANNED'
      ? await previousRunBaseSha(deps.aiDevDir, phaseId, runId)
      : null;
    const gitArtifacts = await deps.git.collectDiffArtifacts([aiDevRel], diffBase ?? undefined);
    artifact('14-diff-base.txt', diffBase ?? '(HEAD — primeira rodada)');
    artifact('02-git-status.txt', gitArtifacts.status);
    artifact('03-git-diff-stat.txt', gitArtifacts.diffStat);
    artifact('04-git-diff.txt', gitArtifacts.diff);

    // 9) Relatório do implementador (gerado a partir das evidências)
    const report = buildImplementerReport({
      phaseId,
      response,
      tests,
      buildApi,
      buildWeb,
      diffStat: gitArtifacts.diffStat,
    });
    artifact('07-implementer-report.json', JSON.stringify(report, null, 2));

    // 10) Roadmap → IMPLEMENTED → AUDIT_PENDING
    writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: 'AUDIT_PENDING' }));

    // 11) Contexto de revisão + GPT-5.6 Terra (com validação estrita + 1 correção).
    //     MEMÓRIA: o revisor recebe o histórico de auditorias anteriores da fase
    //     (condições já pedidas) e o que mudou nesta rodada — evita o "alvo
    //     móvel" que causava 7-10 re-auditorias por fase.
    const auditHistory = extractAuditHistory(md, phaseId).slice(-6).join('\n');
    const preRunFiles = prep.preRunFiles;
    const correctionsApplied =
      previousState === 'CORRECTION_PENDING' || previousState === 'AUDIT_FAILED'
        ? 'Rodada de correção em resposta às condições anteriores. Arquivos tocados nesta rodada:\n' +
          (preRunFiles.length > 0 ? preRunFiles.map((f) => `  - ${f}`).join('\n') : '  (sem arquivos seguros — ver diff)') +
          '\nDiff completo da fase (HEAD) é apresentado acima; revise as condições pendentes, não reabra tópicos resolvidos.'
        : 'Primeira auditoria desta fase (sem rodadas anteriores).';
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
      auditHistory,
      correctionsApplied,
    });
    artifact('08-review-context.txt', context);
    artifact('12-audit-history.txt', auditHistory || '(sem histórico anterior)');
    artifact('13-corrections-applied.txt', correctionsApplied);

    // Cache de auditoria: contexto idêntico a uma rodada anterior da mesma
    // fase → reusa o veredito (economia total de tokens). O contextHash é
    // registrado no run.json para cache em rodadas futuras.
    const { createHash } = await import('node:crypto');
    const contextHash = createHash('sha256').update(context).digest('hex');
    runSummary.contextHash = contextHash;
    const cached = await cachedAuditForContext(deps.aiDevDir, phaseId, runId, context);
    let audit: import('./contracts.js').AuditResult;
    let rawResponses: string[];
    let corrected = false;
    let fromCache = false;
    if (cached) {
      audit = cached.audit;
      rawResponses = [`[cache] veredito da rodada ${cached.runId} reutilizado (contexto idêntico).`];
      fromCache = true;
      deps.log.info(`Auditoria reutilizada do cache (rodada ${cached.runId}) — sem chamada ao revisor.`);
      artifact('15-audit-cache.txt', `Contexto idêntico ao run ${cached.runId}; veredito reutilizado.`);
    } else {
      deps.log.info(`Chamando revisor (${runSummary.reviewerModel})...`);
      const res = await validateAuditWithRetry(deps.llm, context);
      audit = res.audit;
      rawResponses = res.rawResponses;
      corrected = res.corrected;
      artifact('09-review-response.txt', rawResponses.join('\n\n--- RESPOSTA CORRIGIDA ---\n\n'));
      if (corrected) deps.log.warn('Auditoria corrigida após feedback de validação (1 tentativa).');
    }
    artifact('10-audit-result.json', JSON.stringify(audit, null, 2));
    runSummary.audit = audit;
    runSummary.fromCache = fromCache;

    // 12) Gate de aprovação
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
    // LOOPGAIN: se a rodada de correção NÃO reduziu os achados graves em
    // relação à anterior, o loop não está convergindo — abre o circuito
    // (BLOCKED) e exige decisão humana em vez de gastar mais tokens.
    if (previousState === 'CORRECTION_PENDING' || previousState === 'AUDIT_FAILED') {
      const loop = await convergenciaFalhou(deps.aiDevDir, phaseId, runId, audit);
      if (loop) {
        const motivo = `Rodada de correção sem convergência: ${loop.gravesAtual} achado(s) grave(s) (HIGH/BLOCKER) agora vs. ${loop.gravesAnterior} na rodada ${loop.anterior}. O loop não está reduzindo o retrabalho — circuito aberto para decisão humana.`;
        deps.log.warn(`[loopgain] ${motivo}`);
        artifact('16-loopgain.txt', motivo);
        const loopRow = buildHistoryRow({
          date: now().toISOString().slice(0, 10),
          phase: phaseId,
          implementer: phase.implementer || 'DeepSeek',
          reviewer: 'LOOPGAIN (determinístico)',
          verdict: 'REJECT',
          advanceAllowed: false,
          note: 'Sem convergência entre rodadas (achados graves não reduziram). Decisão humana requerida.',
        });
        writeTextAtomic(roadmapFile, renderRoadmap(md, { [phaseId]: 'AUDIT_FAILED' }, [loopRow]));
        runSummary.status = 'AUDIT_FAILED';
        runSummary.finishedAt = now().toISOString();
        runSummary.error = motivo;
        artifact('run.json', JSON.stringify(runSummary, null, 2));
        throw new Error(motivo);
      }
    }

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
    if (mode === 'auto-commit' || mode === 'autonomous') {
      if (state === 'AUDIT_APPROVED') {
        const implSha = await commitPhaseImplementation({
          git: deps.git,
          log: deps.log,
          aiDevRel,
          phaseId,
          reviewerModel: deps.config.reviewer.model,
        });
        if (implSha) runSummary.finalSha = implSha;
      }
      const sha = await commitRoadmapUpdate({ git: deps.git, log: deps.log, aiDevRel, phaseId });
      if (sha) runSummary.finalSha = sha;
    } else {
      runSummary.finalSha = (await deps.git.headSha()) ?? runSummary.finalSha;
    }
    artifact('run.json', JSON.stringify(runSummary, null, 2));
    return runSummary;
  } catch (err) {
    const isAuditError = err instanceof AuditParseError;
    runSummary.status = 'FAILED';
    runSummary.finishedAt = now().toISOString();
    runSummary.error = auditErrorSummary(err);
    if (mode !== 'dry-run') {
      if (isAuditError) {
        // Roadmap permanece AUDIT_PENDING: permite ai:audit --run <id> manual.
        deps.log.error(`Auditoria inválida para ${phaseId}: ${runSummary.error}. Reenvie com ai:audit --run ${runId}.`);
        if (mode === 'auto-commit' || mode === 'autonomous') {
          const sha = await commitRoadmapUpdate({ git: deps.git, log: deps.log, aiDevRel, phaseId });
          if (sha) runSummary.finalSha = sha;
        }
      } else {
        revertRoadmap();
        deps.log.error(`Falha na execução de ${phaseId}: ${runSummary.error}`);
      }
      runSummary.finalSha = (await deps.git.headSha()) ?? runSummary.finalSha;
      artifact('run.json', JSON.stringify(runSummary, null, 2));
    }
    throw err;
  }
}

// ===========================================================================
// Cadeia autônoma: roda uma fase e, SE aprovada (AUDIT_APPROVED), continua
// automaticamente para a próxima fase elegível. Para em qualquer condição de
// risco (a próxima chamada de runPhase lança/para) e nunca faz push.
// ===========================================================================

const MAX_AUTONOMOUS_PHASES = 10;

function patchContinuedTo(deps: RunDeps, runId: string, nextPhase: string): void {
  try {
    const runJsonPath = safeJoin(deps.aiDevDir, 'runs', runId, 'run.json');
    const parsed = JSON.parse(readText(runJsonPath)) as Record<string, unknown>;
    parsed.continuedTo = nextPhase;
    writeTextAtomic(runJsonPath, JSON.stringify(parsed, null, 2));
  } catch {
    // registro é best-effort (gitignored); não interrompe a cadeia
  }
}

/**
 * Executa fases em modo autônomo, encadeando a próxima fase elegível somente
 * após aprovação. Retorna os resumos de todas as fases executadas.
 */
export async function runAutonomousChain(
  deps: RunDeps,
  phaseId: string,
  opts: { maxPhases?: number } = {},
): Promise<RunSummary[]> {
  const max = opts.maxPhases ?? MAX_AUTONOMOUS_PHASES;
  const visited = new Set<string>();
  const results: RunSummary[] = [];
  let current: string | null = phaseId;

  while (current && !visited.has(current) && results.length < max) {
    visited.add(current);
    deps.log.info(`[autonomous] Executando fase ${current}...`);
    const summary = await runPhase(deps, current, { mode: 'autonomous' });
    results.push(summary);
    if (summary.status !== 'AUDIT_APPROVED') {
      deps.log.warn(`[autonomous] Fase ${current} não aprovada (${summary.status}); cadeia interrompida.`);
      break;
    }
    const roadmapFile = safeJoin(deps.aiDevDir, basename(deps.config.roadmap));
    const next = findNextPlannable(parseRoadmap(readText(roadmapFile)).phases);
    if (!next) {
      deps.log.info('[autonomous] Nenhuma fase elegível restante; cadeia concluída.');
      break;
    }
    summary.continuedTo = next.id; // registra no objeto e no run.json
    patchContinuedTo(deps, summary.runId, next.id);
    deps.log.info(`[autonomous] Fase ${current} aprovada; continuando para ${next.id}.`);
    current = next.id;
  }

  return results;
}
