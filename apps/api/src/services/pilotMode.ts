// ===========================================================================
// Fase 4B — Camada de controle do PILOTO CONTROLADO.
//
// Tudo é derivado de variáveis de ambiente (default: piloto DESLIGADO):
//   PILOTO_ATIVO=true                     liga a camada;
//   PILOTO_MAX_ESCRITORIOS                limite de escritórios ativos (registo);
//   PILOTO_MAX_USUARIOS                   teto adicional de usuários por escritório;
//   PILOTO_MAX_DOCUMENTOS                 teto de documentos por escritório (upload);
//   PILOTO_ALERTA_CUSTO_CENTS             limiar de custo do ciclo p/ alerta (cents);
//   ROOT_NOTIFICATION_EMAIL               destinatário do alerta (best-effort).
//
// Rollback: desligar PILOTO_ATIVO (ou remover as vars) — nenhum efeito em
// produção sem piloto explícito.
// ===========================================================================

import { count, eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios, usuarios, documentos } from '../db/schema.js';

/** Erro de teto do piloto — o handler mapeia para 403 com o código. */
export class ErroPilotoLimite extends Error {
  code: string;
  constructor(code: string) {
    super(`Limite do piloto atingido (${code})`);
    this.name = 'ErroPilotoLimite';
    this.code = code;
  }
}

/**
 * Executa `fn` dentro de uma transação que segura um ADVISORY LOCK global
 * (`pg_advisory_xact_lock`) — serializa verificações+criações concorrentes do
 * MESMO teto do piloto. Sem o lock, duas requisições simultâneas contariam
 * antes de qualquer insert e ultrapassariam o teto (check-then-act racy).
 */
export async function comSlotPiloto<T>(chave: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${chave}))`);
    return fn(tx);
  });
}

/** Conta escritórios ativos (tx-aware; usado sob o lock do piloto). */
export async function contarEscritoriosAtivosTx(tx: any): Promise<number> {
  const [cnt] = await tx.execute(sql`SELECT count(*)::int AS total FROM escritorios WHERE ativo = true`);
  return Number(cnt?.total ?? 0);
}

/** Verifica o teto de USUÁRIOS ativos por escritório sob advisory lock POR
 *  ESCRITÓRIO (`piloto:usuarios:<id>`) — serializa ativações/criações
 *  concorrentes do mesmo escritório. Lança ErroPilotoLimite se exceder.
 *  Com `maxUsuarios == null` (limite não configurado) não faz nada. */
export async function verificarTetoUsuariosTx(tx: any, escritorioId: string, maxUsuarios: number | null): Promise<void> {
  if (maxUsuarios == null) return;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'piloto:usuarios:' + escritorioId}))`);
  const [cnt] = await tx.execute(sql`
    SELECT count(*)::int AS total FROM usuarios WHERE escritorio_id = ${escritorioId} AND ativo = true
  `);
  if (Number(cnt?.total ?? 0) >= maxUsuarios) {
    throw new ErroPilotoLimite('PILOTO_LIMITE_USUARIOS');
  }
}

/**
 * Ativação de escritório (OTP/reativação) com o teto do piloto verificado
 * ATOMICAMENTE sob o MESMO advisory lock do registro: a contagem de ATIVOS é
 * checada e a ativação persistida na mesma transação — ativações concorrentes
 * não ultrapassam PILOTO_MAX_ESCRITORIOS. Com piloto desligado, executa `fn`
 * sem lock (caminho original). Lança ErroPilotoLimite quando o teto impede.
 */
export async function comTetoEscritoriosAtivos<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const cfg = configPiloto();
  if (!cfg.ativo) return db.transaction((tx) => fn(tx)); // sem lock quando desligado
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('piloto:escritorios'))`);
    const ativos = await contarEscritoriosAtivosTx(tx);
    if (ativos >= cfg.maxEscritorios) {
      throw new ErroPilotoLimite('PILOTO_LIMITE_ESCRITORIOS');
    }
    return fn(tx);
  });
}

export interface ConfigPiloto {
  ativo: boolean;
  maxEscritorios: number;
  maxUsuariosPorEscritorio: number | null;
  maxDocumentosPorEscritorio: number | null;
  /** Limiar de custo (cents) como string de dígitos — validado por regex e
   *  comparado como bigint NO PostgreSQL (sem conversão imprecisa em JS). */
  alertaCustoCents: string | null;
  emailNotificacao: string | null;
}

/** Inteiro de ambiente VALIDADO ESTRITAMENTE: string completa de dígitos
 *  (`/^\d+$/` — rejeita '1abc', '1.9', '-1', espaços), 0 é válido, e valores
 *  acima de Number.MAX_SAFE_INTEGER são rejeitados (não seguros). Retorna null
 *  para config ausente/ausente-válida (limite não se aplica). */
function envIntNullable(chave: string): number | null {
  const raw = (process.env[chave] ?? '').trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null; // inválido/parcial → limite não se aplica
  if (raw.length > 15) return null; // salvaguarda antes do Number()
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** Limiar de custo como string de dígitos (bigint-safe, sem perda de
 *  precisão; a comparação acontece no Postgres). Validação estrita:
 *  `/^\d+$/` — rejeita '1abc', '1.9', '-1', espaços e vazio. */
function envBigIntStringNullable(chave: string): string | null {
  const raw = (process.env[chave] ?? '').trim();
  if (!raw) return null;
  return /^\d+$/.test(raw) ? raw : null;
}

/** Configuração do piloto lida em TEMPO DE CHAMADA (rollback por env a quente). */
export function configPiloto(): ConfigPiloto {
  return {
    ativo: process.env.PILOTO_ATIVO === 'true',
    maxEscritorios: envIntNullable('PILOTO_MAX_ESCRITORIOS') ?? 10,
    maxUsuariosPorEscritorio: envIntNullable('PILOTO_MAX_USUARIOS'),
    maxDocumentosPorEscritorio: envIntNullable('PILOTO_MAX_DOCUMENTOS'),
    alertaCustoCents: envBigIntStringNullable('PILOTO_ALERTA_CUSTO_CENTS'),
    emailNotificacao: (process.env.ROOT_NOTIFICATION_EMAIL ?? '').trim() || null,
  };
}

export async function contarEscritoriosAtivos(): Promise<number> {
  const [r] = await db.select({ total: count() }).from(escritorios).where(eq(escritorios.ativo, true));
  return Number(r?.total ?? 0);
}

export async function contarUsuariosAtivos(escritorioId: string): Promise<number> {
  const [r] = await db
    .select({ total: count() })
    .from(usuarios)
    .where(and(eq(usuarios.escritorioId, escritorioId), eq(usuarios.ativo, true)));
  return Number(r?.total ?? 0);
}

export async function contarDocumentos(escritorioId: string): Promise<number> {
  const [r] = await db.select({ total: count() }).from(documentos).where(eq(documentos.escritorioId, escritorioId));
  return Number(r?.total ?? 0);
}

/** Bloqueio do cadastro/registo quando o teto de escritórios ativos é atingido. */
export async function excedeLimiteEscritoriosPiloto(): Promise<boolean> {
  const cfg = configPiloto();
  if (!cfg.ativo) return false;
  return (await contarEscritoriosAtivos()) >= cfg.maxEscritorios;
}

/** Teto ADICIONAL de usuários por escritório (piloto). Se PILOTO_MAX_USUARIOS
 *  não for definido, o limite existente do plano (escritorios.limiteUsuarios)
 *  continua valendo. */
export async function excedeLimiteUsuariosPiloto(escritorioId: string): Promise<boolean> {
  const cfg = configPiloto();
  if (!cfg.ativo || cfg.maxUsuariosPorEscritorio == null) return false;
  return (await contarUsuariosAtivos(escritorioId)) >= cfg.maxUsuariosPorEscritorio;
}

export async function excedeLimiteDocumentosPiloto(escritorioId: string): Promise<boolean> {
  const cfg = configPiloto();
  if (!cfg.ativo || cfg.maxDocumentosPorEscritorio == null) return false;
  return (await contarDocumentos(escritorioId)) >= cfg.maxDocumentosPorEscritorio;
}

export interface StatusPiloto {
  status: 'READY_FOR_PILOT';
  pilotoAtivo: boolean;
  limites: {
    maxEscritorios: number;
    maxUsuariosPorEscritorio: number | null;
    maxDocumentosPorEscritorio: number | null;
    alertaCustoCents: string | null;
  };
  contagens: {
    escritoriosAtivos: number;
  };
}

/** Acompanhamento manual: relatório do estado do piloto (endpoint root). */
export async function statusPiloto(): Promise<StatusPiloto> {
  const cfg = configPiloto();
  return {
    status: 'READY_FOR_PILOT',
    pilotoAtivo: cfg.ativo,
    limites: {
      maxEscritorios: cfg.maxEscritorios,
      maxUsuariosPorEscritorio: cfg.maxUsuariosPorEscritorio,
      maxDocumentosPorEscritorio: cfg.maxDocumentosPorEscritorio,
      alertaCustoCents: cfg.alertaCustoCents,
    },
    contagens: {
      escritoriosAtivos: await contarEscritoriosAtivos(),
    },
  };
}
