/**
 * Captura de logs de aplicação para o Painel Root.
 *
 * Faz monkeypatch de console.log/warn/error para (1) continuar imprimindo no
 * stdout e (2) persistir assincronamente em `app_logs` — via fila + flush em
 * lote, para não bloquear a request nem travar o servidor.
 *
 * Segurança/LGPD: toda mensagem é redigida (CPF/e-mail/telefone) e nunca
 * logamos senhas, JWT ou chaves de API.
 */
import { db } from '../db/client.js';
import { appLogs } from '../db/schema.js';
import { redactPII } from './pii.js';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogMeta {
  stack?: string | null;
  source?: string;
  method?: string;
  path?: string;
  status?: number | null;
  ip?: string;
  usuarioId?: string | null;
  escritorioId?: string | null;
  context?: Record<string, unknown> | null;
}

interface LogEntry extends LogMeta {
  level: LogLevel;
  message: string;
}

const fila: LogEntry[] = [];
let flushing = false;

/** Converte um argumento arbitrário em texto seguro (Error → message, objeto → JSON). */
function paraTexto(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Error) return v.message;
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/** Extrai a mensagem (concatenada) e o stack (se algum arg for um Error). */
function extrair(args: unknown[]): { message: string; stack?: string } {
  const partes = args.map(paraTexto);
  const primeiroErro = args.find((a): a is Error => a instanceof Error);
  return {
    message: redactPII(partes.join(' ')),
    stack: primeiroErro ? redactPII(primeiroErro.stack ?? '') : undefined,
  };
}

async function flushQueue() {
  if (flushing || fila.length === 0) return;
  flushing = true;
  const batch = fila.splice(0, fila.length);
  try {
    await db.insert(appLogs).values(batch.map((e) => ({
      level: e.level,
      message: e.message,
      stack: e.stack ?? null,
      source: e.source ?? null,
      method: e.method ?? null,
      path: e.path ?? null,
      status: e.status ?? null,
      ip: e.ip ?? null,
      usuarioId: e.usuarioId ?? null,
      escritorioId: e.escritorioId ?? null,
      context: e.context ?? null,
    })));
  } catch (e) {
    // Nunca derruba por falha de logging; usa o console ORIGINAL para evitar loop.
    console.error('[logger] falha ao persistir logs:', e);
  } finally {
    flushing = false;
    if (fila.length > 0) void flushQueue();
  }
}

/** Enfileira um log e dispara flush quando o lote atinge o tamanho mínimo. */
function enfileirar(entry: LogEntry) {
  fila.push(entry);
  if (fila.length >= 20) void flushQueue();
}

/** Registra um log estruturado com contexto opcional. */
export function log(level: LogLevel, message: string, meta: LogMeta = {}) {
  enfileirar({ level, message: redactPII(message), ...meta });
}

/** Atalho para erro. */
export function logError(message: string, meta: LogMeta = {}) {
  log('error', message, meta);
}

/**
 * Inicia a captura de console.* e o flush periódico. Deve ser chamado UMA vez
 * no boot, antes de o servidor tratar requisições.
 */
export function initLogCapture() {
  const orig = { log: console.log, warn: console.warn, error: console.error };

  console.log = (...args: unknown[]) => {
    orig.log(...args);
    enfileirar({ level: 'info', message: extrair(args).message });
  };
  console.warn = (...args: unknown[]) => {
    orig.warn(...args);
    const { message, stack } = extrair(args);
    const level = args.some((a) => a instanceof Error) ? 'error' : 'warn';
    enfileirar({ level, message, stack });
  };
  console.error = (...args: unknown[]) => {
    orig.error(...args);
    const { message, stack } = extrair(args);
    enfileirar({ level: 'error', message, stack });
  };

  // Flush periódico que não mantém o processo vivo (unref).
  setInterval(() => void flushQueue(), 5000).unref?.();
}
