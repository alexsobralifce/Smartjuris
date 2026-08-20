import { db } from '../db/client.js';
import { tokenUsage, escritorios, usuarios } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../middlewares/auth.js';

export function isHorarioPico(now: Date = new Date()): boolean {
  // Horário de pico: 09:00–21:00 BRT (UTC-3) => 12:00–23:59 UTC
  const h = now.getUTCHours();
  return h >= 12 && h < 24;
}

export async function trackTokenUsage(
  usuarioId: string | undefined,
  operacao: string,
  modelo: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): Promise<void> {
  if (!usuarioId) return;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  const total = prompt + completion;
  const pico = isHorarioPico();

  let custoUsd = 0;
  if (modelo.toLowerCase().includes('deepseek')) {
    const inputCost = pico
      ? Number(process.env.DEEPSEEK_INPUT_COST_PEAK ?? '3.30')
      : Number(process.env.DEEPSEEK_INPUT_COST_OFFPEAK ?? '1.65');
    const outputCost = pico
      ? Number(process.env.DEEPSEEK_OUTPUT_COST_PEAK ?? '3.96')
      : Number(process.env.DEEPSEEK_OUTPUT_COST_OFFPEAK ?? '1.98');
    custoUsd = (prompt / 1_000_000) * inputCost + (completion / 1_000_000) * outputCost;
  }

  const usdBrl = Number(process.env.USD_BRL_RATE ?? '5.00');
  const custoBrl = custoUsd * usdBrl;

  try {
    await db.insert(tokenUsage).values({
      usuarioId,
      modelo,
      operacao,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      custoUsd: custoUsd.toFixed(6),
      custoBrl: custoBrl.toFixed(6),
      horarioPico: pico,
    });
  } catch (e) {
    console.error('[Usage] Error tracking token usage:', e);
  }
}

/**
 * Total de tokens consumidos pelo usuário no mês corrente.
 */
export async function getTokenUsageMes(usuarioId: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(SUM(total_tokens), 0) AS total
    FROM token_usage
    WHERE usuario_id = ${usuarioId}
      AND created_at >= date_trunc('month', now())
  `)) as any[];
  return Number(rows[0]?.total ?? 0);
}

export interface TokenQuota {
  status: 'ok' | 'warn' | 'blocked';
  usado: number;
  limite: number | null;
  pct: number;
}

/**
 * Verifica a cota de tokens do usuário (apenas escritórios demo têm limite).
 * - Aviso (warn) a partir de 80% do limite mensal.
 * - Bloqueio (blocked) ao atingir 100%.
 * - Escritórios não-demo e usuários sem escritório (root) não têm limite.
 */
export async function checkTokenQuota(req: AuthenticatedRequest): Promise<TokenQuota> {
  const usuarioId = req.user?.id;
  if (!usuarioId) return { status: 'ok', usado: 0, limite: null, pct: 0 };

  const rows = await db
    .select({
      isDemo: escritorios.isDemo,
      limiteTokensMes: escritorios.limiteTokensMes,
    })
    .from(usuarios)
    .innerJoin(escritorios, eq(escritorios.id, usuarios.escritorioId))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  const esc = rows[0];
  if (!esc || !esc.isDemo || esc.limiteTokensMes == null) {
    return { status: 'ok', usado: 0, limite: null, pct: 0 };
  }

  const usado = await getTokenUsageMes(usuarioId);
  const limite = Number(esc.limiteTokensMes);
  const pct = limite > 0 ? Math.round((usado / limite) * 100) : 0;

  if (pct >= 100) return { status: 'blocked', usado, limite, pct };
  if (pct >= 80) return { status: 'warn', usado, limite, pct };
  return { status: 'ok', usado, limite, pct };
}
