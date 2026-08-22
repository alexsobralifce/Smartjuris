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

// ===========================================================================
// Fase 3B — Adaptador REAL de geração com fallback Flash→Pro.
//
// `gerarOperacaoIA` é o ponto de integração PRODUÇÃO do orquestrador de
// operação de IA (runAiOperation, Fase 2F): recebe o `modelTier` escolhido
// (FLASH para a tentativa normal, PRO para a reexecução do fallback 3B),
// chama o provedor DeepSeek e NORMALIZA erros para `ErroGeracaoIA`:
//   - resposta do provedor com status HTTP de erro (4xx/5xx) →
//     `confirmadoSemProcessamento: true` (o provedor respondeu SEM gerar —
//     seguro liberar reserva e/ou reexecutar);
//   - falha sem resposta (timeout/rede/abort) → `ambigua: true` (pode ter
//     sido faturado — reserva retida para reconciliação, fail-closed).
// ===========================================================================

import { ErroGeracaoIA } from './analiseDocumental.js';
import type { ClassifierOutput } from './classifier.js';

export interface ResultadoGeracaoIA {
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

/** Extrai a narrativa do caso para o prompt de geração. */
function promptDeGeracao(payload: ClassifierOutput): string {
  const caso = payload.caseContext === 'PROCESS_LINKED'
    ? payload.caseContext
    : 'Pedido autônomo (sem processo vinculado).';
  return [
    'Você é um advogado sênior redigindo no SmartJuris.',
    `Peça: ${payload.operation} (classificação ${payload.classification}).`,
    `Contexto do caso: ${caso}`,
    'Redija a peça jurídica em texto corrido, sem Markdown.',
  ].join('\n');
}

/** Gera a peça com o modelo FLASH ou PRO e retorna o uso real. */
export async function gerarOperacaoIA(op: {
  operationId: string;
  payload: ClassifierOutput;
  modelTier: 'FLASH' | 'PRO';
}): Promise<ResultadoGeracaoIA> {
  const modelo = op.modelTier === 'PRO' ? deepseekModelPro : deepseekModel;
  try {
    const completion = await deepseekClient.chat.completions.create({
      model: modelo,
      messages: [
        { role: 'system', content: 'Você é um advogado sênior e parecerista. Redija sem Markdown.' },
        { role: 'user', content: promptDeGeracao(op.payload) },
      ],
      temperature: 0.3,
      // Não-streaming: retorna usage real (tokens) para o settle preciso.
    });
    const usage = completion.usage;
    // Uso REAL obrigatório para a liquidação: resposta sem `usage` NÃO pode
    // ser liquidada como zero tokens (subcobrança silenciosa) — tratada como
    // AMBÍGUA: o provedor pode ter processado, mas a métrica não chegou;
    // a reserva é retida para reconciliação (fail-closed).
    if (!usage || usage.prompt_tokens == null || usage.completion_tokens == null) {
      throw new ErroGeracaoIA('resposta do provedor sem métricas de uso (usage ausente)', { ambigua: true });
    }
    // Validação das métricas: tokens reais são inteiros NÃO NEGATIVOS e
    // finitos. Valores negativos/fracionários/NaN/Infinity jamais podem
    // alterar cobrança ou créditos — rejeitados como ambíguos (fail-closed).
    const valido = (n: number | undefined | null): n is number =>
      typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
    if (!valido(usage.prompt_tokens) || !valido(usage.completion_tokens)) {
      throw new ErroGeracaoIA('métricas de uso inválidas (tokens não inteiros/não finitos/negativos)', { ambigua: true });
    }
    return {
      modelUsed: modelo,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
    };
  } catch (err) {
    const e = err as { status?: number; message?: string; code?: string; cause?: unknown };
    const status = typeof e?.status === 'number' ? e.status : undefined;
    const mensagem = e?.message ? String(e.message) : String(err);
    // CONFIRMAÇÃO de não-processamento: apenas erros 4xx do CLIENTE (400-499,
    // exceto 408) — o provedor REJEITOU a requisição (validação, autenticação,
    // rate-limit 429) sem gerar. Esses permitem liberar a reserva e reexecutar.
    if (status != null && status >= 400 && status < 500 && status !== 408) {
      throw new ErroGeracaoIA(`provedor rejeitou a requisição (HTTP ${status})`, { confirmadoSemProcessamento: true });
    }
    // 5xx e 408: o provedor PODE ter processado/faturado — ambíguo (fail-closed).
    if (status != null && status >= 500) {
      throw new ErroGeracaoIA(`erro interno do provedor (HTTP ${status}); uso possivelmente processado`, { ambigua: true });
    }
    // Sem resposta (timeout/rede/DNS/abort) → ambíguo (fail-closed).
    throw new ErroGeracaoIA(`falha sem resposta do provedor: ${mensagem}`, { ambigua: true });
  }
}
