

import { trackTokenUsage } from './usage.js';

export async function generateEmbedding(text: string, usuarioId?: string): Promise<number[]> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = 'bge-m3'; // O modelo de embeddings que usaremos via Ollama
  
  // Timeout controller para acelerar a demonstração caso o Ollama fique travado sem GPU local
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

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
    return data.embedding;
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error('Ollama indisponível. Verifique se o serviço de embeddings está rodando.');
  }
}
