// ===========================================================================
// IO e log: leitura/escrita de arquivos dentro do repositório e logger com
// redação de segredos (chaves de API nunca aparecem em logs).
// ===========================================================================

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { safeJoin, type Env } from './paths.js';

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function writeTextAtomic(path: string, content: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

export function mkdirRecursive(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function exists(path: string): boolean {
  return existsSync(path);
}

/** Escreve dentro de um diretório base validado (seguro contra path traversal). */
export function writeArtifact(baseDir: string, fileName: string, content: string): string {
  const path = safeJoin(baseDir, fileName);
  writeTextAtomic(path, content);
  return path;
}

export function readArtifact(baseDir: string, fileName: string): string {
  const path = safeJoin(baseDir, fileName);
  return readText(path);
}

// --- Lock de execução (evita execuções concorrentes do orquestrador) ---

export const LOCK_FILE_NAME = '.orchestrator.lock';

export function acquireLock(baseDir: string, meta: { pid: number; startedAt: string }): void {
  const path = safeJoin(baseDir, LOCK_FILE_NAME);
  if (existsSync(path)) {
    let holder = '';
    try {
      holder = readText(path).trim();
    } catch {
      holder = '(ilegível)';
    }
    throw new Error(
      `Orquestrador já em execução (lock ${LOCK_FILE_NAME} existe; detentor: ${holder}). ` +
        'Remova o arquivo apenas se nenhuma execução estiver ativa.',
    );
  }
  writeTextAtomic(path, JSON.stringify(meta));
}

export function releaseLock(baseDir: string): void {
  try {
    const path = safeJoin(baseDir, LOCK_FILE_NAME);
    rmSync(path, { force: true });
  } catch {
    // liberação é best-effort; o lock é gitignored e sobrescrevível
  }
}

/** Executa `fn` protegida pelo lock do orquestrador (release garantido). */
export async function withLock<T>(baseDir: string, fn: () => Promise<T>): Promise<T> {
  acquireLock(baseDir, { pid: process.pid, startedAt: new Date().toISOString() });
  try {
    return await fn();
  } finally {
    releaseLock(baseDir);
  }
}

// --- Logger com redação ---

const SECRET_ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'RESEND_API_KEY',
  'DATA_ENCRYPTION_KEY',
];

export function createLogger(env: Env) {
  const secrets = new Set<string>();
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (value && value.length >= 4) secrets.add(value);
  }

  function redact(text: string): string {
    let out = text;
    for (const secret of secrets) {
      out = out.split(secret).join('***');
    }
    return out;
  }

  return {
    info: (msg: string): void => console.log(`[ai-orchestrator] ${redact(msg)}`),
    warn: (msg: string): void => console.warn(`[ai-orchestrator] ⚠ ${redact(msg)}`),
    error: (msg: string): void => console.error(`[ai-orchestrator] ✖ ${redact(msg)}`),
    redact,
  };
}

export type Logger = ReturnType<typeof createLogger>;
