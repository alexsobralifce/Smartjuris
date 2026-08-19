

export async function generateEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = 'bge-m3'; // O modelo de embeddings que usaremos via Ollama

  try {
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro Ollama [${response.status}]: ${errText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  } catch (error) {
    console.error('[Embedding Service] Error generating embedding:', error);
    throw error;
  }
}
