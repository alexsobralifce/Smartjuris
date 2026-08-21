import OpenAI from 'openai';
import { z } from 'zod';

export const deepseekClient = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEP_SEEK_API || '',
});

export const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
export const deepseekModelPro = process.env.DEEPSEEK_MODEL_PRO || 'deepseek-v4-pro';

// Seleção dinâmica de modelo por complexidade da peça:
// peças complexas (Recurso/Contestação) usam o Pro; demais usam o Flash.
export function selecionarModeloDeepSeek(isComplex: boolean): string {
  return isComplex ? deepseekModelPro : deepseekModel;
}

export async function generatePecaWithDeepSeek(
  tipo: string,
  area: string,
  dadosCaso: string,
  contexto: string
): Promise<string> {
  const prompt = `Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica.

DIRETRIZES DE REDAÇÃO E CORREÇÃO (AUTOCORRETOR):
1. Linguagem Jurídica: Utilize o padrão culto da língua portuguesa e o jargão jurídico adequado (ex: vênia, exordial, proêmio). Evite coloquialismos.
2. Correção Gramatical: Atue como um revisor ortográfico implacável. Certifique-se de que há estrita concordância verbal e nominal, regência correta e pontuação impecável.
3. Clareza e Concisão: Apesar da formalidade, evite o "juridiquês" excessivo ou prolixo que dificulte a compreensão do juízo.

Tarefa: Com base na jurisprudência e doutrina fornecidas abaixo, crie uma peça jurídica do tipo "${tipo}" na área "${area}".

Os dados do caso são:
${dadosCaso}

Contexto (Precedentes e Leis relevantes):
${contexto}

DIRETRIZES DE FUNDAMENTAÇÃO (RAG):
1. Você receberá blocos de contexto (chunks) contendo teses, jurisprudência e fatos do caso.
2. É OBRIGATÓRIO fundamentar todos os pedidos e alegações exclusivamente nas leis, doutrinas e jurisprudências fornecidas no contexto.
3. Não invente ou alucine precedentes, números de processos ou artigos de lei que não estejam nos documentos de suporte.
4. Se o contexto fornecido for insuficiente para fundamentar uma tese complexa, adicione uma nota ao advogado sugerindo a inclusão de mais documentos comprobatórios.

REGRAS DE FORMAÇÃO DO SISTEMA:
- Retorne APENAS o texto da peça.
- Não inclua saudações, explicações ou texto em Markdown, pois o sistema processará a saída via streaming SSE diretamente para o editor rico.`;

  try {
    const completion = await deepseekClient.chat.completions.create({
      model: deepseekModel,
      messages: [
        { role: 'system', content: 'Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica. Não utilize marcação markdown ou asteriscos na redação de forma alguma.' },
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
  contexto: string,
  isComplex: boolean = false
) {
  const prompt = `Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica.

DIRETRIZES DE REDAÇÃO E CORREÇÃO (AUTOCORRETOR):
1. Linguagem Jurídica: Utilize o padrão culto da língua portuguesa e o jargão jurídico adequado (ex: vênia, exordial, proêmio). Evite coloquialismos.
2. Correção Gramatical: Atue como um revisor ortográfico implacável. Certifique-se de que há estrita concordância verbal e nominal, regência correta e pontuação impecável.
3. Clareza e Concisão: Apesar da formalidade, evite o "juridiquês" excessivo ou prolixo que dificulte a compreensão do juízo.

Tarefa: Com base na jurisprudência e doutrina fornecidas abaixo, crie uma peça jurídica do tipo "${tipo}" na área "${area}".

Os dados do caso são:
${dadosCaso}

Contexto (Precedentes e Leis relevantes):
${contexto}

DIRETRIZES DE FUNDAMENTAÇÃO (RAG):
1. Você receberá blocos de contexto (chunks) contendo teses, jurisprudência e fatos do caso.
2. É OBRIGATÓRIO fundamentar todos os pedidos e alegações exclusivamente nas leis, doutrinas e jurisprudências fornecidas no contexto.
3. Não invente ou alucine precedentes, números de processos ou artigos de lei que não estejam nos documentos de suporte.
4. Se o contexto fornecido for insuficiente para fundamentar uma tese complexa, adicione uma nota ao advogado sugerindo a inclusão de mais documentos comprobatórios.

REGRAS DE FORMAÇÃO DO SISTEMA:
- Retorne APENAS o texto da peça.
- Não inclua saudações, explicações ou texto em Markdown, pois o sistema processará a saída via streaming SSE diretamente para o editor rico.`;

  try {
    const stream = await deepseekClient.chat.completions.create({
      model: selecionarModeloDeepSeek(isComplex),
      messages: [
        { role: 'system', content: 'Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica. Não utilize marcação markdown ou asteriscos na redação de forma alguma.' },
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
