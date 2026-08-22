// ===========================================================================
// Operações git via executor seguro. Nenhum merge/push/reset — apenas leitura
// (status/diff), checkpoint (add/commit de caminhos filtrados), identidade e
// branch de fase.
// ===========================================================================

import type { Executor, ExecResult } from './executor.js';

export interface GitOps {
  dirtyFilesExcept(excludes: string[]): Promise<string[]>;
  createBranch(branch: string): Promise<ExecResult>;
  checkoutBranch(branch: string): Promise<ExecResult>;
  currentBranch(): Promise<string>;
  collectDiffArtifacts(excludes: string[]): Promise<{
    status: string;
    diffStat: string;
    diff: string;
  }>;
  /** `git status --porcelain=v1 --untracked-files=all` (saída bruta). */
  porcelain(): Promise<string>;
  /** SHA do HEAD atual, ou null quando não há commits. */
  headSha(): Promise<string | null>;
  /** `git add -- <paths>` (apenas caminhos validados pela allowlist). */
  addPaths(paths: string[]): Promise<ExecResult>;
  /** `git commit -m <msg>`. */
  commit(message: string): Promise<ExecResult>;
  /** user.name e user.email configurados localmente? */
  hasGitIdentity(): Promise<boolean>;
  /** HEAD detached? */
  isDetachedHead(): Promise<boolean>;
}

export function createGitOps(exec: Executor, repoRoot: string): GitOps {
  const opts = { cwd: repoRoot, timeoutMs: 120_000 };

  return {
    async dirtyFilesExcept(excludes: string[]): Promise<string[]> {
      const res = await exec.run(['git', 'status', '--porcelain'], opts);
      if (!res.ok) {
        throw new Error(`git status falhou: ${res.stderr || res.stdout}`);
      }
      const dirty: string[] = [];
      for (const line of res.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const path = trimmed.slice(3).trim();
        const isExcluded = excludes.some(
          (ex) => path === ex || path.startsWith(`${ex}/`),
        );
        if (!isExcluded) dirty.push(path);
      }
      return dirty;
    },

    async createBranch(branch: string): Promise<ExecResult> {
      return exec.run(['git', 'checkout', '-b', branch], opts);
    },

    async checkoutBranch(branch: string): Promise<ExecResult> {
      return exec.run(['git', 'checkout', branch], opts);
    },

    async currentBranch(): Promise<string> {
      const res = await exec.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], opts);
      return res.ok ? res.stdout.trim() : 'desconhecido';
    },

    async collectDiffArtifacts(excludes: string[]): Promise<{
      status: string;
      diffStat: string;
      diff: string;
    }> {
      const statusRes = await exec.run(['git', 'status', '--porcelain'], opts);
      const diffStatRes = await exec.run(['git', 'diff', 'HEAD', '--stat'], opts);
      // `git diff HEAD` inclui staged e unstaged (arquivos novos staged ficam
      // visíveis ao revisor; untracked não aparecem — ver allow-dirty).
      const diffRes = await exec.run(
        ['git', 'diff', 'HEAD', '--', '.', ...excludes.map((e) => `:(exclude)${e}`)],
        opts,
      );
      return {
        status: statusRes.stdout,
        diffStat: diffStatRes.stdout,
        diff: diffRes.stdout,
      };
    },

    async porcelain(): Promise<string> {
      const res = await exec.run(['git', 'status', '--porcelain=v1', '--untracked-files=all'], opts);
      if (!res.ok) {
        throw new Error(`git status --porcelain falhou: ${res.stderr || res.stdout}`);
      }
      return res.stdout;
    },

    async headSha(): Promise<string | null> {
      const res = await exec.run(['git', 'rev-parse', 'HEAD'], opts);
      if (!res.ok) return null;
      const sha = res.stdout.trim();
      return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
    },

    async addPaths(paths: string[]): Promise<ExecResult> {
      if (paths.length === 0) {
        throw new Error('Nenhum caminho para adicionar ao índice.');
      }
      return exec.run(['git', 'add', '--', ...paths], opts);
    },

    async commit(message: string): Promise<ExecResult> {
      return exec.run(['git', 'commit', '-m', message], opts);
    },

    async hasGitIdentity(): Promise<boolean> {
      const name = await exec.run(['git', 'config', 'user.name'], opts);
      const email = await exec.run(['git', 'config', 'user.email'], opts);
      return (
        name.ok && name.stdout.trim() !== '' &&
        email.ok && email.stdout.trim() !== ''
      );
    },

    async isDetachedHead(): Promise<boolean> {
      const res = await exec.run(['git', 'symbolic-ref', '-q', 'HEAD'], opts);
      return !res.ok;
    },
  };
}
