// ===========================================================================
// Fase 4B — Observabilidade do piloto: alerta de custo por escritório.
//
// Quando o custo CONSUMIDO do ciclo (soma de ai_operations.cost_cents_actual
// de operações liquidadas no mês corrente) ultrapassa PILOTO_ALERTA_CUSTO_CENTS,
// registra auditoria + app_log e notifica o e-mail raiz (best-effort — NUNCA
// bloqueia geração nem quebra o fluxo). O alerta é emitido UMA vez por
// escritório por ciclo (idempotente via audit_log).
// ===========================================================================

import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db/client.js';
import { auditLog, appLogs } from '../db/schema.js';
import { configPiloto } from './pilotMode.js';

export function cicloAtual(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Compara o custo consumido do ciclo com o limiar DENTRO do PostgreSQL
 * (bigint) — nenhuma conversão imprecisa em JS. Devolve também o total
 * serializado como texto exato (para apresentação). A comparação `> limiar`
 * é estrita: igualdade NÃO dispara. `exec` opcional: quando fornecido (a
 * transação que detém o advisory lock), TODAS as consultas usam a MESMA
 * conexão da transação — sem risco de deadlock por pool saturado.
 */
export async function custoDoCicloVsLimiar(escritorioId: string, limiarCents: bigint, exec?: any): Promise<{ excede: boolean; totalTexto: string }> {
  const q = exec ?? db;
  const ciclo = cicloAtual();
  const rows = await q.execute(sql`
    SELECT COALESCE(SUM(cost_cents_actual), 0)::text AS total,
           (COALESCE(SUM(cost_cents_actual), 0) > ${limiarCents}) AS excede
    FROM ai_operations
    WHERE escritorio_id = ${escritorioId}
      AND status = 'succeeded'
      AND to_char(COALESCE(finished_at, updated_at, created_at), 'YYYY-MM') = ${ciclo}
  `);
  return {
    totalTexto: String(rows[0]?.total ?? '0'),
    excede: Boolean(rows[0]?.excede),
  };
}

/** Custo consumido do ciclo (cents) — apenas para apresentação (Number pode
 *  perder precisão acima de 2^53; a COMPARAÇÃO usa bigint no Postgres). */
export async function custoConsumidoCiclo(escritorioId: string): Promise<number> {
  const { totalTexto } = await custoDoCicloVsLimiar(escritorioId, 0n);
  const numero = Number(totalTexto);
  return Number.isFinite(numero) ? numero : 0;
}

async function alertaJaEmitido(exec: any, escritorioId: string, ciclo: string): Promise<boolean> {
  const rows = await exec.execute(sql`
    SELECT id FROM audit_log
    WHERE acao = 'AI_ALERTA_CUSTO_PILOTO'
      AND detalhes->>'escritorioId' = ${escritorioId}
      AND detalhes->>'ciclo' = ${ciclo}
    LIMIT 1
  `);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Checa e emite o alerta de custo do piloto (UMA vez por escritório/ciclo,
 * mesmo sob liquidações CONCORRENTES — advisory lock serializa a checagem e o
 * insert). Best-effort: qualquer falha é engolida (observabilidade NUNCA
 * bloqueia o fluxo de geração). `req` opcional para auditoria (actor).
 */
export async function checarAlertaCustoPiloto(escritorioId: string, req?: Request | null): Promise<void> {
  try {
    const cfg = configPiloto();
    if (!cfg.ativo || cfg.alertaCustoCents == null) return;
    const limiarCents = BigInt(cfg.alertaCustoCents); // validação regex em pilotMode
    const actorId = (req as { user?: { id?: string | null } } | null | undefined)?.user?.id ?? null;
    const ciclo = cicloAtual();
    const chave = `piloto:alerta:${escritorioId}:${ciclo}`;
    // OUTBOX: o EVENTO idempotente (auditoria + log, chave única por
    // escritório/ciclo sob advisory lock) é persistido NA TRANSAÇÃO. A
    // NOTIFICAÇÃO (e-mail) dispara SOMENTE APÓS o commit — falha de commit
    // nunca deixa e-mail órfão; retry não duplica (alertaJaEmitido bloqueia).
    const novoAlerta = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${chave}))`);
      // TODAS as consultas da transação usam a MESMA conexão (`tx`) que detém
      // o advisory lock — nunca `db.execute` aqui (deadlock com pool saturado).
      if (await alertaJaEmitido(tx, escritorioId, ciclo)) return null;
      // Comparação bigint NO POSTGRES (sem conversão imprecisa em JS).
      const { excede, totalTexto } = await custoDoCicloVsLimiar(escritorioId, limiarCents, tx);
      if (!excede) return null;

      await tx.insert(auditLog).values({
        actorId,
        acao: 'AI_ALERTA_CUSTO_PILOTO',
        detalhes: { escritorioId, ciclo, custoCents: totalTexto, limiarCents: cfg.alertaCustoCents },
      });
      await tx.insert(appLogs).values({
        level: 'warning',
        message: `[Piloto] Escritório ${escritorioId} ultrapassou o limiar de custo do ciclo ${ciclo}: ${totalTexto} cents (limiar ${cfg.alertaCustoCents}).`,
        source: 'pilot-observability',
        escritorioId,
        context: { ciclo, custoCents: totalTexto },
      });
      return { custoCents: totalTexto };
    });

    // Notificação PÓS-COMMIT (best-effort; falha NÃO afeta o fluxo e retry não
    // duplica — o evento já está persistido e idempotente).
    if (novoAlerta && cfg.emailNotificacao) {
      try {
        const { sendPilotCostAlert } = await import('./email.js');
        await sendPilotCostAlert({ to: cfg.emailNotificacao, escritorioId, ciclo, custoCents: novoAlerta.custoCents });
      } catch {
        // observabilidade: notificação é best-effort
      }
    }
  } catch {
    // observabilidade: nunca quebra o fluxo de geração
  }
}
