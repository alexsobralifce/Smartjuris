// ===========================================================================
// Operações git via executor seguro. Nenhum merge/push/reset — apenas leitura
// (status/diff) e criação/checkout de branch de fase.
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
      const diffStatRes = await exec.run(['git', 'diff', '--stat'], opts);
      const diffRes = await exec.run(
        ['git', 'diff', '--', '.', ...excludes.map((e) => `:(exclude)${e}`)],
        opts,
      );
      return {
        status: statusRes.stdout,
        diffStat: diffStatRes.stdout,
        diff: diffRes.stdout,
      };
    },
  };
}
