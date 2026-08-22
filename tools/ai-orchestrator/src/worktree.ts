// ===========================================================================
// Working tree: inspeção (porcelain v1), classificação, proteções e checkpoint.
//
// Ciclo: inspecionar → validar → checkpoint → executar fase → registrar.
//
// Segurança:
//   - nunca `git reset --hard` / `git clean` / `rm -rf` / sudo;
//   - checkpoint via `git add -- <caminhos filtrados>` (nunca `git add .`);
//   - `docs/ai-development` é protegido: alterações locais lá bloqueiam a fase;
//   - segredos (`.env*`, chaves) e suspeitos (`.ignore`, `pps/`, binários)
//     NUNCA entram em commit automático e bloqueiam com mensagem clara;
//   - artefatos/gerados (node_modules, dist, .pnpm-store, .reasonix) são
//     excluídos do checkpoint e apenas reportados.
// ===========================================================================

import { createInterface } from 'node:readline';
import type { GitOps } from './git.js';
import type { Logger } from './io.js';
import type { RunMode } from './contracts.js';

export interface WorktreeEntry {
  path: string;
  status: string;
}

export interface WorktreeInspection {
  porcelain: string;
  entries: WorktreeEntry[];
  safePaths: string[];
  artifactPaths: string[];
  protectedPaths: string[];
  suspiciousPaths: string[];
  secretPaths: string[];
  conflictPaths: string[];
  initialSha: string | null;
}

export interface PrepareResult {
  mode: RunMode;
  initialSha: string | null;
  finalSha: string | null;
  preRunFiles: string[];
  committed: boolean;
}

/** Erro de checkpoint/proteção: interrompe a fase SEM apagar nada. */
export class CheckpointAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointAbortError';
  }
}

export const CHECKPOINT_MSG_PREFIX = 'chore(ai-orchestrator): checkpoint before phase ';
export const ROADMAP_COMMIT_MSG_PREFIX = 'chore(ai-orchestrator): roadmap update after phase ';
export const ROADMAP_FILE_NAME = 'implementation-roadmap.md';

const SECRET_PATH =
  /(^|\/)(\.env.*|\.git-credentials|.*\.(pem|key|p12|pfx|keystore)|id_[re]dsa|id_ed25519|id_rsa)$/i;
const SUSPICIOUS_PATH = /(^|\/)\.ignore$|(^|\/)pps\/|\.(exe|dll|so|bin)$/i;
const ARTIFACT_PATH = /(^|\/)(node_modules|dist|build|\.pnpm-store|\.reasonix|\.cache|coverage|\.vite|\.tmp-.*)(\/|$)/;

export type EntryKind = 'safe' | 'artifact' | 'protected' | 'suspicious' | 'secret';

/** Status de conflito de merge no porcelain v1 (U = unmerged, AA/DD duplicado). */
export function isConflictStatus(status: string): boolean {
  return status.includes('U') || status === 'AA' || status === 'DD';
}

export function classifyEntry(path: string, aiDevRel: string): EntryKind {
  if (path === aiDevRel || path.startsWith(`${aiDevRel}/`)) return 'protected';
  if (path.startsWith('/') || path.includes('..')) return 'suspicious'; // fora da raiz do repo
  if (SECRET_PATH.test(path)) return 'secret';
  if (ARTIFACT_PATH.test(path)) return 'artifact';
  if (SUSPICIOUS_PATH.test(path)) return 'suspicious';
  return 'safe';
}

export function parsePorcelain(raw: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  for (const line of raw.split('\n')) {
    if (line.length < 4) continue;
    const status = line.slice(0, 2);
    let path = line.slice(3);
    const arrow = path.indexOf(' -> ');
    if (arrow >= 0) path = path.slice(arrow + 4); // rename: usa o caminho novo
    if (!path) continue;
    out.push({ path, status });
  }
  return out;
}

export async function inspectWorktree(git: GitOps, aiDevRel: string): Promise<WorktreeInspection> {
  const porcelain = await git.porcelain();
  const entries = parsePorcelain(porcelain);
  const buckets: Omit<WorktreeInspection, 'porcelain' | 'entries' | 'initialSha'> = {
    safePaths: [],
    artifactPaths: [],
    protectedPaths: [],
    suspiciousPaths: [],
    secretPaths: [],
    conflictPaths: [],
  };
  for (const entry of entries) {
    if (isConflictStatus(entry.status)) {
      buckets.conflictPaths.push(entry.path);
      continue;
    }
    switch (classifyEntry(entry.path, aiDevRel)) {
      case 'safe':
        buckets.safePaths.push(entry.path);
        break;
      case 'artifact':
        buckets.artifactPaths.push(entry.path);
        break;
      case 'protected':
        buckets.protectedPaths.push(entry.path);
        break;
      case 'suspicious':
        buckets.suspiciousPaths.push(entry.path);
        break;
      case 'secret':
        buckets.secretPaths.push(entry.path);
        break;
    }
  }
  const initialSha = await git.headSha();
  return { porcelain, entries, ...buckets, initialSha };
}

async function defaultConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

export interface PrepareOptions {
  git: GitOps;
  log: Logger;
  aiDevRel: string;
  phaseId: string;
  mode: RunMode;
  confirm?: (question: string) => Promise<boolean>;
}

/**
 * Valida proteções e cria o checkpoint (se o modo permitir). Nunca descarta
 * alterações; nunca adiciona segredos/artefatos/suspeitos ao índice.
 */
export async function prepareWorkingTree(opts: PrepareOptions): Promise<PrepareResult> {
  const { git, log, aiDevRel, phaseId, mode } = opts;
  const plan = await inspectWorktree(git, aiDevRel);

  if (plan.protectedPaths.length > 0) {
    throw new CheckpointAbortError(
      `docs/ai-development contém alterações locais não commitadas (${plan.protectedPaths.join(', ')}). ` +
        `A fase reescreve ${ROADMAP_FILE_NAME}; faça commit ou descarte desses arquivos antes de executar.`,
    );
  }
  if (plan.secretPaths.length > 0) {
    throw new CheckpointAbortError(
      `Arquivos sensíveis detectados e NÃO serão commitados: ${plan.secretPaths.join(', ')}. ` +
        'Remova-os ou mova-os para fora do repositório antes de prosseguir.',
    );
  }
  if (plan.suspiciousPaths.length > 0) {
    throw new CheckpointAbortError(
      `Arquivos suspeitos detectados (não commitados automaticamente): ${plan.suspiciousPaths.join(', ')}. ` +
        'Analise a finalidade antes de prosseguir (ex.: .ignore, pps/, binários).',
    );
  }
  if (plan.conflictPaths.length > 0) {
    throw new CheckpointAbortError(
      `Conflito de merge detectado (resolva antes de executar): ${plan.conflictPaths.join(', ')}. `,
    );
  }
  if (plan.artifactPaths.length > 0) {
    log.warn(`Artefatos/gerados excluídos do checkpoint: ${plan.artifactPaths.join(', ')}`);
  }

  if (mode === 'dry-run') {
    log.info(
      '[dry-run] Nenhuma alteração será feita (git ou arquivos). ' +
        (plan.safePaths.length > 0
          ? `Checkpoint incluiria: ${plan.safePaths.join(', ')}`
          : 'Nada a commitar no checkpoint.'),
    );
    return { mode, initialSha: plan.initialSha, finalSha: null, preRunFiles: plan.safePaths, committed: false };
  }

  if (mode === 'no-auto-commit') {
    const dirty = plan.entries.filter((e) => classifyEntry(e.path, aiDevRel) !== 'protected');
    if (dirty.length > 0) {
      throw new CheckpointAbortError(
        `Working tree sujo fora de docs/ai-development: ${dirty.map((e) => e.path).join(', ')}. ` +
          'Use --auto-commit (checkpoint automático) ou --allow-dirty (executar sem commit) para prosseguir.',
      );
    }
    return { mode, initialSha: plan.initialSha, finalSha: null, preRunFiles: [], committed: false };
  }

  if (mode === 'allow-dirty') {
    if (plan.safePaths.length > 0) {
      log.warn(
        `Working tree não consolidado (${plan.safePaths.length} arquivo(s) sem commit). ` +
          `Nenhum commit será criado; SHA inicial registrado: ${plan.initialSha ?? '(sem commits)'}.`,
      );
    }
    return { mode, initialSha: plan.initialSha, finalSha: null, preRunFiles: plan.safePaths, committed: false };
  }

  // interactive | auto-commit | autonomous (autonomous = automático, sem confirmação)
  if (plan.safePaths.length === 0) {
    log.info('Nenhuma alteração de código para checkpoint; prosseguindo.');
    return { mode, initialSha: plan.initialSha, finalSha: null, preRunFiles: [], committed: false };
  }

  if (!(await git.hasGitIdentity())) {
    throw new CheckpointAbortError(
      'Identidade Git ausente (user.name/user.email). Configure `git config user.name` e `git config user.email` antes de usar o checkpoint automático.',
    );
  }
  if (await git.isDetachedHead()) {
    throw new CheckpointAbortError(
      'HEAD está em estado detached. Faça checkout de uma branch antes de criar o checkpoint.',
    );
  }

  log.info(`Checkpoint proposto (${plan.safePaths.length} arquivo(s)):\n${plan.safePaths.map((p) => `  ${p}`).join('\n')}`);

  if (mode === 'interactive') {
    const ok = await (opts.confirm ?? defaultConfirm)(`Criar checkpoint antes da fase ${phaseId}? (y/N) `);
    if (!ok) {
      throw new CheckpointAbortError(
        'Checkpoint recusado. Nenhum commit foi criado; use --auto-commit para automatizar ou --no-auto-commit para exigir árvore limpa.',
      );
    }
  }

  const addRes = await git.addPaths(plan.safePaths);
  if (!addRes.ok) {
    throw new CheckpointAbortError(
      `Falha ao adicionar arquivos ao índice: ${addRes.stderr || addRes.stdout}. Nenhum commit foi criado.`,
    );
  }
  const commitRes = await git.commit(`${CHECKPOINT_MSG_PREFIX}${phaseId}`);
  const output = commitRes.stdout + commitRes.stderr;
  if (!commitRes.ok && !/nothing to commit/i.test(output)) {
    throw new CheckpointAbortError(`Falha ao criar checkpoint: ${output}. Nenhum commit foi criado.`);
  }
  const finalSha = await git.headSha();
  log.info(`Checkpoint criado: ${finalSha ?? '(sem HEAD)'}`);
  return { mode, initialSha: plan.initialSha, finalSha, preRunFiles: plan.safePaths, committed: true };
}

/**
 * Commit do roadmap atualizado pela fase (auto-commit). Apenas o arquivo do
 * roadmap é incluído — o orquestrador é o autor das transições de estado.
 */
export async function commitRoadmapUpdate(opts: {
  git: GitOps;
  log: Logger;
  aiDevRel: string;
  phaseId: string;
}): Promise<string | null> {
  const { git, log, aiDevRel, phaseId } = opts;
  const roadmapPath = `${aiDevRel}/${ROADMAP_FILE_NAME}`;
  const addRes = await git.addPaths([roadmapPath]);
  if (!addRes.ok) {
    log.warn(`Não foi possível adicionar o roadmap ao índice: ${addRes.stderr || addRes.stdout}`);
    return null;
  }
  const commitRes = await git.commit(`${ROADMAP_COMMIT_MSG_PREFIX}${phaseId}`);
  const output = commitRes.stdout + commitRes.stderr;
  if (!commitRes.ok && !/nothing to commit/i.test(output)) {
    log.warn(`Não foi possível commitar a atualização do roadmap: ${output}`);
    return null;
  }
  const sha = await git.headSha();
  log.info(`Roadmap commitado após a fase: ${sha ?? '(sem HEAD)'}`);
  return sha;
}
