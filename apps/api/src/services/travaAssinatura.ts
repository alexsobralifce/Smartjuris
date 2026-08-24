// ===========================================================================
// travaAssinatura.ts — Trava de uso para escritórios NÃO assinantes
// (cadastrados por self-service — isDemo=true).
//
// Regra (quando TRAVA_ASSINATURA ativa):
//   - ASSINANTES (assinatura_status = 'ativa') → liberados sempre;
//   - escritórios NÃO-demo (criados pelo root/legados) → isentos sempre;
//   - self-service não assinante → limites: 1 peça gerada e 10 clientes.
//
// Implementação mínima e reversível: não altera billing/webhook/migrations —
// apenas consultas de contagem nos pontos de criação.
// ===========================================================================

import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios, pecas, clientes } from '../db/schema.js';

/** Flag global da trava (desligada por padrão — liga sem deploy). */
export function travaAssinaturaAtiva(): boolean {
  const raw = process.env.TRAVA_ASSINATURA ?? '';
  return raw === 'true' || raw === '1';
}

export interface DecisaoTrava {
  liberado: boolean;
  /** false quando a trava não se aplica (flag off / isento / assinante). */
  aplica: boolean;
  motivo: string | null;
}

/**
 * Decide se a trava se aplica ao escritório:
 *   - flag off → não aplica (fluxo atual inalterado);
 *   - assinatura ativa → liberado;
 *   - escritório NÃO-demo (criado pelo root / legado) → isento;
 *   - self-service não assinante → trava APLICA (limites abaixo).
 */
export async function decidirTrava(escritorioId: string): Promise<DecisaoTrava> {
  if (!travaAssinaturaAtiva()) {
    return { liberado: true, aplica: false, motivo: null };
  }
  const [esc] = await db.select({
    isDemo: escritorios.isDemo,
    assinaturaStatus: escritorios.assinaturaStatus,
  }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) {
    return { liberado: false, aplica: true, motivo: 'escritorio-nao-encontrado' };
  }
  if (esc.assinaturaStatus === 'ativa') {
    return { liberado: true, aplica: false, motivo: null };
  }
  if (esc.isDemo !== true) {
    // Criado pelo root / legado: isento (protege escritórios do operador).
    return { liberado: true, aplica: false, motivo: null };
  }
  return { liberado: false, aplica: true, motivo: 'sem-assinatura' };
}

/** Conta peças do escritório (todas — geradas e salvas). */
export async function contarPecasEscritorio(escritorioId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM pecas WHERE escritorio_id = ${escritorioId}
  `);
  return Number((rows as any)[0]?.n ?? 0);
}

/** Conta clientes do escritório. */
export async function contarClientesEscritorio(escritorioId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM clientes WHERE escritorio_id = ${escritorioId}
  `);
  return Number((rows as any)[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Limites configuráveis (env, defaults: 1 peça / 10 clientes)
// ---------------------------------------------------------------------------

export const LIMITE_PECAS_DEMO = () => {
  const raw = Number(process.env.TRAVA_LIMITE_PECAS ?? 1);
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
};

export const LIMITE_CLIENTES_DEMO = () => {
  const raw = Number(process.env.TRAVA_LIMITE_CLIENTES ?? 10);
  return Number.isInteger(raw) && raw >= 1 ? raw : 10;
};

/**
 * Verifica a trava de PEÇAS (1 peça para self-service não assinante).
 * Retorna a decisão final + motivo legível para o cliente.
 */
export async function verificarTravaPecas(escritorioId: string): Promise<DecisaoTrava> {
  const base = await decidirTrava(escritorioId);
  if (!base.aplica) return base;
  const total = await contarPecasEscritorio(escritorioId);
  if (total >= LIMITE_PECAS_DEMO()) {
    return {
      liberado: false,
      aplica: true,
      motivo: `limite-do-plano-demo`,
    };
  }
  return { liberado: true, aplica: true, motivo: null };
}

/**
 * Verifica a trava de CLIENTES (10 clientes para self-service não assinante).
 */
export async function verificarTravaClientes(escritorioId: string): Promise<DecisaoTrava> {
  const base = await decidirTrava(escritorioId);
  if (!base.aplica) return base;
  const total = await contarClientesEscritorio(escritorioId);
  if (total >= LIMITE_CLIENTES_DEMO()) {
    return {
      liberado: false,
      aplica: true,
      motivo: `limite-do-plano-demo`,
    };
  }
  return { liberado: true, aplica: true, motivo: null };
}
