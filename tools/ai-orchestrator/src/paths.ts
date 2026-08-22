// ===========================================================================
// Caminhos seguros: raiz do repositório, diretório ai-development e joins que
// rejeitam escape de diretório (`..`) e caminhos absolutos.
// ===========================================================================

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Env = Record<string, string | undefined>;

export function findRepoRoot(startDir: string, maxDepth = 12): string | null {
  let dir = startDir;
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function resolveRepoRoot(env: Env, moduleDir: string): string {
  const fromEnv = env.SMARTJURIS_REPO_ROOT;
  if (fromEnv) {
    if (fromEnv.trim() === '') {
      throw new Error('SMARTJURIS_REPO_ROOT está vazio.');
    }
    return resolve(fromEnv);
  }
  const found = findRepoRoot(moduleDir);
  if (!found) {
    throw new Error(
      'Não foi possível localizar a raiz do repositório (pnpm-workspace.yaml). Defina SMARTJURIS_REPO_ROOT.',
    );
  }
  return found;
}

/**
 * Caminho oficial e OBRIGATÓRIO do ai-development: `docs/ai-development`.
 * Nenhuma normalização é feita: `doc/ai-development` (singular) é rejeitado
 * com erro claro; caminhos arbitrários são rejeitados.
 */
export function resolveAiDevDir(repoRoot: string): string {
  const canonical = join(repoRoot, 'docs', 'ai-development');
  if (existsSync(canonical)) return canonical;

  const singular = join(repoRoot, 'doc', 'ai-development');
  if (existsSync(singular)) {
    throw new Error(
      'Diretório ai-development encontrado apenas como "doc/ai-development" (singular). ' +
        'O caminho oficial é "docs/ai-development". Mova os arquivos e atualize o automation-config.json.',
    );
  }
  throw new Error(
    'Diretório ai-development não encontrado na raiz do repositório. ' +
      'O caminho oficial e obrigatório é "docs/ai-development".',
  );
}

/** Join seguro: resultado precisa ficar dentro de `base`; `..` e absolutos são rejeitados. */
export function safeJoin(base: string, ...parts: string[]): string {
  for (const part of parts) {
    if (part.includes('..') || isAbsolute(part) || part.includes('\0')) {
      throw new Error(`Caminho inválido: ${part}`);
    }
  }
  const out = join(base, ...parts);
  const rel = relative(base, out);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Caminho fora do diretório base: ${parts.join('/')}`);
  }
  return out;
}

/** Diretório do módulo atual (ESM). */
export function moduleDir(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
