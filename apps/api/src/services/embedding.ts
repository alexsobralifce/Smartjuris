import { createHash } from 'node:crypto';
import { trackTokenUsage } from './usage.js';

// Cache LRU em memória: chave = sha256(texto), valor = embedding.
// Capacidade máxima ~256 entradas; ao exceder, remove a entrada mais antiga.
const CACHE_MAX = 256;
const embeddingCache = new Map<string, number[]>();

// ---------------------------------------------------------------------------
// Embeddings via OpenAI — provedor ÚNICO de embeddings.
//   Modelo: text-embedding-3-small com dimensions=1024 (compatível com pgvector)
//   Base URL: https://api.openai.com/v1
//   API Key: OPENAI_API_KEY
// ATENÇÃO: vetores de modelos diferentes não são comparáveis. Trocar o modelo
// exige REINDEXAR todos os chunks (ver services/embedding.ts e AGENTS.md).
// ---------------------------------------------------------------------------
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BASE_URL = 'https://api.openai.com/v1';
function embeddingApiKey(): string {
  return process.env.OPENAI_API_KEY || '';
}
const EMBEDDING_DIMENSIONS = 1024;

function embeddingTimeoutMs(): number {
  return Number(process.env.EMBEDDING_TIMEOUT_MS ?? '6000');
}

/** Insere no cache LRU (remove a entrada mais antiga ao exceder o máximo). */
function armazenarNoCache(cacheKey: string, embedding: number[]): void {
  embeddingCache.set(cacheKey, embedding);
  if (embeddingCache.size > CACHE_MAX) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) embeddingCache.delete(oldestKey);
  }
}

/** Embedding via API do OpenAI (DashScope/Bailian), OpenAI-compat:
 *  POST {base}/embeddings com text-embedding-v3 e dimensions 1024. */
async function gerarEmbeddingOpenAI(text: string, usuarioId?: string): Promise<number[]> {
  const apiKey = embeddingApiKey();
  if (!apiKey) {
    throw new Error('Embeddings sem OPENAI_API_KEY configurada.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), embeddingTimeoutMs());

  try {
    const response = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI embedding failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = data?.data?.[0]?.embedding;
    // Exige exatamente 1024 dimensões (coluna vector(1024) do pgvector).
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error('OpenAI embedding retornou formato inesperado (esperado 1024 dims).');
    }

    await trackTokenUsage(usuarioId, 'embedding', EMBEDDING_MODEL, {
      prompt_tokens: Math.ceil(text.length / 4),
    });

    return embedding;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateEmbedding(text: string, usuarioId?: string): Promise<number[]> {
  const cacheKey = createHash('sha256').update(text).digest('hex');
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    // Em cache hit: devolve o valor SEM chamar provedor e SEM trackTokenUsage.
    // Reinsere ao final da ordem do Map para manter a semântica LRU.
    embeddingCache.delete(cacheKey);
    embeddingCache.set(cacheKey, cached);
    return cached;
  }

  const embedding = await gerarEmbeddingOpenAI(text, usuarioId);
  armazenarNoCache(cacheKey, embedding);
  return embedding;
}
