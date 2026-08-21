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
      ? Number(process.env.DEEPSEEK_INPUT_COST_PEAK ?? '0.44')
      : Number(process.env.DEEPSEEK_INPUT_COST_OFFPEAK ?? '0.22');
    const outputCost = pico
      ? Number(process.env.DEEPSEEK_OUTPUT_COST_PEAK ?? '1.32')
      : Number(process.env.DEEPSEEK_OUTPUT_COST_OFFPEAK ?? '0.66');
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
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(total_tokens), 0) AS total
    FROM token_usage
    WHERE usuario_id = ${usuarioId}
      AND created_at >= date_trunc('month', now())
  `) as any[];
  return Number(rows[0]?.total ?? 0);
}

/**
 * Total de tokens consumidos por TODOS os usuários de um escritório no mês corrente.
 */
export async function getTokenUsageMesEscritorio(escritorioId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(t.total_tokens), 0) AS total
    FROM token_usage t
    JOIN usuarios u ON u.id = t.usuario_id
    WHERE u.escritorio_id = ${escritorioId}
      AND t.created_at >= date_trunc('month', now())
  `) as any[];
  return Number(rows[0]?.total ?? 0);
}

export interface TokenQuota {
  status: 'ok' | 'warn' | 'blocked';
  usado: number;
  limite: number | null;
  pct: number;
}

/**
 * Verifica a cota de tokens (créditos) do usuário no mês corrente.
 * - Limite efetivo = override individual do usuário (`usuarios.creditos_mes`)
 *   ou, na ausência, o saldo do escritório (`escritorios.limite_tokens_mes`).
 * - Aviso (warn) a partir de 80% do limite.
 * - Bloqueio (blocked) ao atingir 100%.
 * - Sem limite definido (usuário e escritório com saldo nulo) → sem restrição.
 */
export async function checkTokenQuota(req: AuthenticatedRequest): Promise<TokenQuota> {
  const usuarioId = req.user?.id;
  if (!usuarioId) return { status: 'ok', usado: 0, limite: null, pct: 0 };

  const rows = await db
    .select({
      creditosMes: usuarios.creditosMes,
      limiteTokensMes: escritorios.limiteTokensMes,
    })
    .from(usuarios)
    .innerJoin(escritorios, eq(escritorios.id, usuarios.escritorioId))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  const reg = rows[0];
  if (!reg) return { status: 'ok', usado: 0, limite: null, pct: 0 };

  const limite = reg.creditosMes != null
    ? Number(reg.creditosMes)
    : (reg.limiteTokensMes != null ? Number(reg.limiteTokensMes) : null);

  if (limite == null) return { status: 'ok', usado: 0, limite: null, pct: 0 };
  if (limite <= 0) return { status: 'blocked', usado: 0, limite, pct: 100 };

  const usado = await getTokenUsageMes(usuarioId);
  const pct = Math.round((usado / limite) * 100);

  if (pct >= 100) return { status: 'blocked', usado, limite, pct };
  if (pct >= 80) return { status: 'warn', usado, limite, pct };
  return { status: 'ok', usado, limite, pct };
}
