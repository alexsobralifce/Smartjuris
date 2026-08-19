import OpenAI from 'openai';
import { z } from 'zod';

export const deepseekClient = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEP_SEEK_API || process.env.ANTHROPIC_API_KEY || '',
});

export async function generatePecaWithDeepSeek(
  tipo: string,
  area: string,
  dadosCaso: string,
  contexto: string
): Promise<string> {
  const prompt = `Você é um assistente jurídico experiente.
Com base na jurisprudência e doutrina fornecidas abaixo, crie uma peça jurídica do tipo "${tipo}" na área "${area}".
Os dados do caso são:
${dadosCaso}

Contexto (Precedentes e Leis relevantes):
${contexto}

Gere o documento final estruturado e formal.`;

  try {
    const completion = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Você é um assistente jurídico sênior especializado em redação de peças.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      // In a real SSE stream we would yield this back, but for now we'll accumulate 
      // or implement an async generator.
    }
    return fullText;
  } catch (err) {
    console.error('[AI Service] Error calling DeepSeek:', err);
    throw err;
  }
}

export async function generateStreamWithDeepSeek(
  tipo: string,
  area: string,
  dadosCaso: string,
  contexto: string
) {
  const prompt = `Você é um assistente jurídico experiente.
Com base na jurisprudência e doutrina fornecidas abaixo, crie uma peça jurídica do tipo "${tipo}" na área "${area}".
Os dados do caso são:
${dadosCaso}

Contexto (Precedentes e Leis relevantes):
${contexto}

Gere o documento final estruturado e formal.`;

  try {
    const stream = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Você é um assistente jurídico sênior especializado em redação de peças.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      stream: true,
    });

    return stream;
  } catch (err) {
    console.error('[AI Service] Error calling DeepSeek:', err);
    throw err;
  }
}
