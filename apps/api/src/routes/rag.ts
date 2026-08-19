import { Router } from 'express';
import { db } from '../db/client.js';
import { chunks } from '../db/schema.js';
import { generateEmbedding } from '../services/embedding.js';
import { trackTokenUsage } from '../services/usage.js';
import { deepseekClient } from '../services/ai.js';
import { cosineDistance, sql, desc } from 'drizzle-orm';

const router = Router();

router.post('/generate', async (req, res) => {
  const { tipo, area, dadosCaso } = req.body;
  
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ progress: 10, label: 'Gerando embeddings da requisição...' })}\n\n`);
    
    const queryText = `${tipo} ${area} ${dadosCaso}`;
    const embedding = await generateEmbedding(queryText, (req as any).user?.id);

    res.write(`data: ${JSON.stringify({ progress: 30, label: 'Buscando jurisprudência no RAG...' })}\n\n`);
    
    // Similarity search
    const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, embedding)})`;
    const relevantChunks = await db
      .select({
        texto: chunks.texto,
        metadata: chunks.metadata,
        similarity
      })
      .from(chunks)
      .orderBy((t) => desc(t.similarity))
      .limit(5);

    const contexto = relevantChunks.map(c => c.texto).join('\n\n');

    res.write(`data: ${JSON.stringify({ progress: 50, label: 'Enviando para o modelo DeepSeek...' })}\n\n`);

    const prompt = `Você é um assistente jurídico experiente.
Com base na jurisprudência e doutrina fornecidas abaixo, crie uma peça jurídica do tipo "${tipo}" na área "${area}".
Os dados do caso são:
${dadosCaso}

Contexto (Precedentes e Leis relevantes):
${contexto}

Gere o documento final estruturado e formal. Apenas o conteúdo do documento, sem explicações extras.
CRÍTICO: Não use formatação em Markdown (como asteriscos '**' ou '*') para destacar títulos, cabeçalhos ou seções. Se precisar destacar algo, use CAIXA ALTA (letras maiúsculas). O texto deve ser inteiramente limpo, sem caracteres de marcação.`;

    const stream = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Você é um assistente jurídico sênior especializado em redação de peças. Não utilize marcação markdown ou asteriscos na redação de forma alguma.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      stream: true,
      stream_options: { include_usage: true },
    });

    let fullText = '';
    let lastUsage: any = null;
    res.write(`data: ${JSON.stringify({ progress: 70, label: 'Gerando conteúdo...' })}\n\n`);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      // Limpa asteriscos do fluxo em tempo real
      const cleanDelta = delta.replace(/\*/g, '');
      fullText += cleanDelta;
      if ((chunk as any).usage) lastUsage = (chunk as any).usage;
      // Option to stream tokens to client if UI supports it
      res.write(`data: ${JSON.stringify({ token: cleanDelta })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ progress: 100, label: 'Concluído. Aguardando revisão.' })}\n\n`);

    if (lastUsage) {
      await trackTokenUsage((req as any).user?.id, 'rag_generate', 'deepseek-chat', {
        prompt_tokens: lastUsage.prompt_tokens,
        completion_tokens: lastUsage.completion_tokens,
      });
    }

    const finalResult = {
      done: true,
      fontes: relevantChunks.map(c => ({
        fonte: (c.metadata as any)?.fonte || 'Jurisprudência Recuperada',
        trecho: c.texto.substring(0, 100) + '...',
        relevancia: Math.round(Number(c.similarity) * 100) / 100,
      })),
      conteudo: fullText
    };
    
    res.write(`data: ${JSON.stringify(finalResult)}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Erro na rota de RAG:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

export default router;
