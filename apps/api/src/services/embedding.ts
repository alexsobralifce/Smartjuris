import { createHash } from 'node:crypto';
import { trackTokenUsage } from './usage.js';

// Cache LRU em memória: chave = sha256(texto), valor = embedding.
// Capacidade máxima ~256 entradas; ao exceder, remove a entrada mais antiga.
const CACHE_MAX = 256;
const embeddingCache = new Map<string, number[]>();

export async function generateEmbedding(text: string, usuarioId?: string): Promise<number[]> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = 'bge-m3'; // O modelo de embeddings que usaremos via Ollama

  const cacheKey = createHash('sha256').update(text).digest('hex');
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    // Em cache hit: devolve o valor SEM chamar Ollama e SEM trackTokenUsage.
    // Reinsere ao final da ordem do Map para manter a semântica LRU.
    embeddingCache.delete(cacheKey);
    embeddingCache.set(cacheKey, cached);
    return cached;
  }

  // Timeout configurável via env (default 6s) para tolerar cold-start do Ollama.
  const timeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS ?? '6000');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama embedding failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json() as { embedding: number[] };
    await trackTokenUsage(usuarioId, 'embedding', 'bge-m3', {
      prompt_tokens: Math.ceil(text.length / 4),
    });

    // Armazena no cache antes de retornar.
    embeddingCache.set(cacheKey, data.embedding);
    if (embeddingCache.size > CACHE_MAX) {
      const oldestKey = embeddingCache.keys().next().value;
      if (oldestKey !== undefined) embeddingCache.delete(oldestKey);
    }

    return data.embedding;
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error('Ollama indisponível. Verifique se o serviço de embeddings está rodando.');
  }
}
