

export async function generateEmbedding(text: string): Promise<number[]> {
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
      console.warn(`[Embedding Service] Erro Ollama [${response.status}]: ${errText}. Usando Mock.`);
      return Array.from({ length: 1024 }, () => Math.random() * 2 - 1);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[Embedding Service] Ollama timeout ou erro (CPU fraca/Desligado). Retornando Mock Rápido para não travar a UI de Geração de Peças.');
    // Retorna mock (pseudo-bge-m3) pra destravar a etapa 3 de geração
    return Array.from({ length: 1024 }, () => Math.random() * 2 - 1);
  }
}
