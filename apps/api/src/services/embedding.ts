import { createHash } from 'node:crypto';
import { trackTokenUsage } from './usage.js';

// Cache LRU em memória: chave = sha256(texto), valor = embedding.
// Capacidade máxima ~256 entradas; ao exceder, remove a entrada mais antiga.
const CACHE_MAX = 256;
const embeddingCache = new Map<string, number[]>();

// ---------------------------------------------------------------------------
// Embeddings via Token Plan (DashScope/Bailian) — provedor ÚNICO de embeddings.
//   Modelo: text-embedding-v3 (dimensão 1024, compatível com o pgvector)
//   Base URL: AI_BASE_URL / DEEPSEEK_BASE_URL (Token Plan compatible-mode)
//   API Key: DEEP_SEEK_API (mesma usada pelo provedor de chat)
// ---------------------------------------------------------------------------
const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIMENSIONS = 1024;

function embeddingTimeoutMs(): number {
  return Number(process.env.EMBEDDING_TIMEOUT_MS ?? '6000');
}

function fallbackBaseUrl(): string {
  return (
    process.env.AI_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
  );
}

function fallbackApiKey(): string {
  return process.env.DEEP_SEEK_API || process.env.DEEPSEEK_API_KEY || '';
}

/** Insere no cache LRU (remove a entrada mais antiga ao exceder o máximo). */
function armazenarNoCache(cacheKey: string, embedding: number[]): void {
  embeddingCache.set(cacheKey, embedding);
  if (embeddingCache.size > CACHE_MAX) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) embeddingCache.delete(oldestKey);
  }
}

/** Embedding via API do Token Plan (DashScope/Bailian), OpenAI-compat:
 *  POST {base}/embeddings com text-embedding-v3 e dimensions 1024. */
async function gerarEmbeddingTokenPlan(text: string, usuarioId?: string): Promise<number[]> {
  const apiKey = fallbackApiKey();
  if (!apiKey) {
    throw new Error('Embeddings do Token Plan sem API key configurada (DEEP_SEEK_API).');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), embeddingTimeoutMs());

  try {
    const response = await fetch(`${fallbackBaseUrl()}/embeddings`, {
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
      throw new Error(`Token Plan embedding failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = data?.data?.[0]?.embedding;
    // Exige exatamente 1024 dimensões (coluna vector(1024) do pgvector).
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error('Token Plan embedding retornou formato inesperado (esperado 1024 dims).');
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

  const embedding = await gerarEmbeddingTokenPlan(text, usuarioId);
  armazenarNoCache(cacheKey, embedding);
  return embedding;
}
