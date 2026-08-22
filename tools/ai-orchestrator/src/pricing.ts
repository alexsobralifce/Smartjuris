// ===========================================================================
// Precificação de LLM: estima o custo real faturado por chamada a partir dos
// tokens de `usage` + tabela interna versionada (com overhead operacional).
// Se o provedor/ modelo não tiver preço cadastrado, retorna null (nunca inventa
// custo aproximado apresentado como real).
// ===========================================================================

import type { AutomationConfig } from './contracts.js';
import type { TokenUsage } from './llm.js';

export interface CostEstimate {
  baseUsd: number;
  billedUsd: number;
  /** true quando inputHit não é detalhado pela API e foi assumido como miss. */
  inputCacheAccounting: 'DETAILED' | 'UNAVAILABLE_ASSUMED_MISS';
}

/**
 * Estima o custo de uma chamada. Assume `promptTokens` como input-miss quando a
 * API não separa cache-hit (conservador — não inventa economia de cache).
 */
export function estimateCostUsd(
  config: AutomationConfig,
  provider: string,
  model: string,
  usage: TokenUsage,
): CostEstimate | null {
  const pricing = config.pricing;
  if (!pricing) return null;
  const entry = pricing.models.find((m) => m.provider === provider && m.model === model);
  if (!entry) return null;
  const inputMissTokens = usage.promptTokens;
  const baseUsd =
    (inputMissTokens / 1_000_000) * entry.inputMissUsdPerMillion +
    (usage.completionTokens / 1_000_000) * entry.outputUsdPerMillion;
  const billedUsd = baseUsd * pricing.overheadMultiplier;
  return {
    baseUsd,
    billedUsd,
    // inputHit não é lido separadamente nesta integração; reporta como miss.
    inputCacheAccounting: 'UNAVAILABLE_ASSUMED_MISS',
  };
}

export function sumTokenUsage(items: TokenUsage[]): TokenUsage {
  return {
    promptTokens: items.reduce((acc, u) => acc + u.promptTokens, 0),
    completionTokens: items.reduce((acc, u) => acc + u.completionTokens, 0),
    totalTokens: items.reduce((acc, u) => acc + u.totalTokens, 0),
  };
}
