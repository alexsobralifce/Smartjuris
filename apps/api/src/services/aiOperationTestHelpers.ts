// Helpers de teste para a Fase 2F (idempotência e reserva).
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export async function saldoEscritorio(escritorioId: string): Promise<{ credits: number; reserveCents: number }> {
  const rows = (await db.execute(sql`
    SELECT credits_available, reserve_cents_used FROM escritorios WHERE id = ${escritorioId} LIMIT 1
  `)) as any[];
  return {
    credits: Number(rows[0]?.credits_available ?? 0),
    reserveCents: Number(rows[0]?.reserve_cents_used ?? 0),
  };
}

export async function tokenUsageCount(usuarioId: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM token_usage WHERE usuario_id = ${usuarioId}
  `)) as any[];
  return Number(rows[0]?.n ?? 0);
}
