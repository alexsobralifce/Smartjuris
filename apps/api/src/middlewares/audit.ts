import { Request } from 'express';
import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export async function recordAudit(
  req: Request,
  acao: string,
  opts: { alvoId?: string | null; alvoEmail?: string | null; detalhes?: unknown } = {}
): Promise<void> {
  try {
    const user = (req as any).user;
    await db.insert(auditLog).values({
      actorId: user?.id ?? null,
      acao,
      alvoId: opts.alvoId ?? null,
      alvoEmail: opts.alvoEmail ?? null,
      detalhes: opts.detalhes ?? null,
      ipAddress: req.ip || null,
    });
  } catch (e) {
    console.error('[Audit] Error recording audit log:', e);
  }
}

/** Variante para fluxos sem sessão HTTP (ex.: webhooks do Mercado Pago). */
export async function recordAuditWebhook(opts: {
  acao: string;
  alvoId?: string | null;
  detalhes?: unknown;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: null,
      acao: opts.acao,
      alvoId: opts.alvoId ?? null,
      detalhes: opts.detalhes ?? null,
      ipAddress: null,
    });
  } catch (e) {
    console.error('[Audit] Error recording audit log:', e);
  }
}
