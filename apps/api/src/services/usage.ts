import { db } from '../db/client.js';
import { tokenUsage } from '../db/schema.js';

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
