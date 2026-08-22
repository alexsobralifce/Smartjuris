// ===========================================================================
// Executor seguro: child_process apenas para comandos permitidos. Nunca usa
// shell, nunca executa string arbitrária (respostas de modelos jamais chegam
// aqui). Comandos destrutivos (push, merge, reset, rm, drop...) são negados.
// ===========================================================================

import { spawn } from 'node:child_process';

export interface ExecResult {
  command: string;
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}

export interface Executor {
  run(argv: string[], opts?: ExecOptions): Promise<ExecResult>;
  /** Executa um comando definido na configuração (tokenizado e validado). */
  runConfigCommand(commandLine: string, opts?: ExecOptions): Promise<ExecResult>;
}

const MAX_OUTPUT_BYTES_DEFAULT = 10 * 1024 * 1024;

export function runSpawn(argv: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const maxOutput = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES_DEFAULT;
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(argv[0], argv.slice(1), {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (code: number | null, signal: string | null, killed: boolean): void => {
      if (settled) return;
      settled = true;
      resolve({
        command: argv.join(' '),
        ok: !killed && code === 0,
        code: killed ? null : code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
      void signal;
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null, null, true);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString('utf8').slice(0, maxOutput - stdout.length);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString('utf8').slice(0, maxOutput - stderr.length);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      stderr += `\nspawn error: ${err.message}`;
      finish(null, null, false);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      finish(code, signal, false);
    });
  });
}

// --- Validação de argumentos (allowlist) ---

export class CommandDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandDeniedError';
  }
}

const BRANCH_NAME = /^phase\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GIT_DIFF_EXCLUDE = /^:\(exclude\)[A-Za-z0-9/._*\-]+$/;
const PNPM_SCRIPTS = new Set(['test', 'build']);
const GIT_STATUS_ARGS = new Set(['--short', '--porcelain', '--porcelain=v1', '--untracked-files=all']);

function assertBranchName(name: string): void {
  if (!BRANCH_NAME.test(name) || name.includes('..') || name.endsWith('.')) {
    throw new CommandDeniedError(`Nome de branch inválido: ${name}`);
  }
}

function assertPathspec(arg: string): void {
  if (arg.startsWith('-') && !GIT_DIFF_EXCLUDE.test(arg)) {
    throw new CommandDeniedError(`Pathspec inválido: ${arg}`);
  }
  if (arg.includes('..') || arg.includes('\0')) {
    throw new CommandDeniedError(`Pathspec inválido: ${arg}`);
  }
}

/** Caminho para `git add`: relativo, sem `..`, sem absoluto, sem opção/glob mágico. */
function assertAddPath(p: string): void {
  if (
    p === '' ||
    p === '.' ||
    p === '..' ||
    p.startsWith('-') ||
    p.startsWith(':') ||
    p.includes('..') ||
    p.includes('\0') ||
    p.startsWith('/')
  ) {
    throw new CommandDeniedError(`Caminho inválido para git add: ${p}`);
  }
}

/** Mensagem de commit: linha única, curta, sem começar com `-`. */
function assertCommitMessage(msg: string): void {
  if (!msg || msg.length > 200 || /[\r\n]/.test(msg) || msg.startsWith('-')) {
    throw new CommandDeniedError('Mensagem de commit inválida (linha única, máx. 200 chars, sem hífen inicial).');
  }
}

/**
 * Valida argv contra a allowlist. Lança CommandDeniedError para qualquer
 * comando fora dela.
 */
export function validateArgv(argv: string[]): void {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new CommandDeniedError('Comando vazio.');
  }
  for (const arg of argv) {
    if (arg.includes('\0')) throw new CommandDeniedError('Argumento com byte nulo.');
  }
  const [head, ...rest] = argv;

  if (head === 'git') {
    const sub = rest[0];
    if (sub === 'status' && rest.length >= 1 && rest.slice(1).every((a) => GIT_STATUS_ARGS.has(a))) {
      return;
    }
    if (sub === 'diff' && rest.length === 1) return;
    if (sub === 'diff' && rest.length === 2 && rest[1] === '--stat') return;
    if (sub === 'diff' && rest.length === 3 && rest[1] === 'HEAD' && rest[2] === '--stat') return;
    if (sub === 'diff' && rest.length === 3 && rest[1] === '--' && rest[2] === '.') return;
    if (
      sub === 'diff' &&
      rest[1] === '--' &&
      rest[2] === '.' &&
      rest.slice(3).length >= 1 &&
      rest.slice(3).every((p) => GIT_DIFF_EXCLUDE.test(p))
    ) {
      for (const p of rest.slice(3)) assertPathspec(p);
      return;
    }
    if (
      sub === 'diff' &&
      rest[1] === 'HEAD' &&
      rest[2] === '--' &&
      rest[3] === '.' &&
      rest.slice(4).length >= 1 &&
      rest.slice(4).every((p) => GIT_DIFF_EXCLUDE.test(p))
    ) {
      for (const p of rest.slice(4)) assertPathspec(p);
      return;
    }
    if (sub === 'checkout') {
      if (rest.length === 3 && rest[1] === '-b') {
        assertBranchName(rest[2]);
        return;
      }
      if (rest.length === 2) {
        assertBranchName(rest[1]);
        return;
      }
    }
    if (sub === 'rev-parse') {
      if (rest.length === 2 && rest[1] === 'HEAD') return;
      if (rest.length === 3 && rest[1] === '--abbrev-ref' && rest[2] === 'HEAD') return;
    }
    if (sub === 'add') {
      if (rest.length >= 3 && rest[1] === '--') {
        for (const p of rest.slice(2)) assertAddPath(p);
        return;
      }
    }
    if (sub === 'commit') {
      if (rest.length === 3 && rest[1] === '-m') {
        assertCommitMessage(rest[2]);
        return;
      }
    }
    if (sub === 'config' && rest.length === 2 && (rest[1] === 'user.name' || rest[1] === 'user.email')) return;
    if (sub === 'symbolic-ref' && rest.length === 3 && rest[1] === '-q' && rest[2] === 'HEAD') return;
    throw new CommandDeniedError(`Comando git não permitido: ${argv.join(' ')}`);
  }

  if (head === 'pnpm') {
    if (rest.length === 3 && rest[0] === '--filter' && rest[1].startsWith('@') && PNPM_SCRIPTS.has(rest[2])) return;
    throw new CommandDeniedError(`Comando pnpm não permitido: ${argv.join(' ')}`);
  }

  throw new CommandDeniedError(`Comando não permitido: ${argv.join(' ')}`);
}

/**
 * Tokeniza uma linha de comando da configuração (sem aspas, sem metacaracteres
 * de shell) e valida contra a allowlist.
 */
export function tokenizeCommand(cmd: string): string[] {
  if (/["'`;$&|<>()[\]{}*?\\\r\n]/.test(cmd)) {
    throw new CommandDeniedError(`Comando com caracteres proibidos: ${cmd}`);
  }
  const parts = cmd.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new CommandDeniedError('Comando vazio.');
  validateArgv(parts);
  return parts;
}

export class SafeExecutor implements Executor {
  async run(argv: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    validateArgv(argv);
    return runSpawn(argv, opts);
  }

  runConfigCommand(commandLine: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const argv = tokenizeCommand(commandLine);
    return runSpawn(argv, opts);
  }
}
