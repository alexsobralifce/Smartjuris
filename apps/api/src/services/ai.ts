import OpenAI from 'openai';
import { z } from 'zod';

// Provedor de IA: Token Plan (Alibaba Model Studio / Bailian) — OpenAI-compat.
// Substitui o DeepSeek oficial; endpoint e chave configuráveis por env.
// `AI_BASE_URL` é o nome canônico no código; `DEEPSEEK_BASE_URL` também é
// aceito por compatibilidade com o .env existente.
export const deepseekClient = new OpenAI({
  baseURL:
    process.env.AI_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DEEP_SEEK_API || '',
});

// Modelos do Token Plan (Qwen): padrão = qwen3.7-plus (melhor custo/benefício
// vs o antigo deepseek-v4-flash); complexas = qwen3.8-max (topo do plano).
export const deepseekModel = process.env.DEEPSEEK_MODEL || 'qwen3.7-plus';
export const deepseekModelPro = process.env.DEEPSEEK_MODEL_PRO || 'qwen3.8-max';

// Raciocínio explícito (reasoning tokens) dos modelos Qwen: o "pensamento" do
// modelo é COBRADO como tokens de saída e consome o saldo do plano muito
// rápido (num teste trivial foram ~200 tokens de raciocínio para 1 de texto).
// Por padrão fica DESLIGADO (`enable_thinking: false`); ligue com
// `QWEN_ENABLE_THINKING=true` se quiser qualidade máxima de raciocínio.
// Só é enviado para modelos Qwen — provedores OpenAI puros rejeitam
// parâmetros desconhecidos no corpo.
export function opcoesQwen(model: string): { enable_thinking?: false } {
  return model.toLowerCase().startsWith('qwen') && process.env.QWEN_ENABLE_THINKING !== 'true'
    ? { enable_thinking: false }
    : {};
}

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
      ...opcoesQwen(deepseekModel),
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
    console.error('[AI Service] Erro ao chamar o provedor de IA:', err);
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
      ...opcoesQwen(selecionarModeloDeepSeek(isComplex)),
      messages: [
        { role: 'system', content: 'Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica. Não utilize marcação markdown ou asteriscos na redação de forma alguma.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      stream: true,
    });

    return stream;
  } catch (err) {
    console.error('[AI Service] Erro ao chamar o provedor de IA:', err);
    throw err;
  }
}

// ===========================================================================
// Fase 3B — Adaptador REAL de geração com fallback Flash→Pro.
//
// `gerarOperacaoIA` é o ponto de integração PRODUÇÃO do orquestrador de
// operação de IA (runAiOperation, Fase 2F): recebe o `modelTier` escolhido
// (FLASH para a tentativa normal, PRO para a reexecução do fallback 3B),
// chama o provedor (Qwen via Token Plan) e NORMALIZA erros para
// `ErroGeracaoIA`:
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
/** Normaliza um erro do provedor na política 3B (fail-closed):
 *  - 4xx do CLIENTE (400-499 exceto 408): confirmado SEM processamento →
 *    autoriza fallback/liberação;
 *  - 5xx/408: PODE ter processado → ambíguo (reserva retida p/ reconciliação);
 *  - sem resposta (timeout/rede/abort): ambíguo.
 * Usada pelo adaptador de geração e pelo streaming SSE. */
export function normalizarErroProvedor(err: unknown): ErroGeracaoIA {
  const e = err as { status?: number; message?: string; code?: string; cause?: unknown };
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const mensagem = e?.message ? String(e.message) : String(err);
  if (status != null && status >= 400 && status < 500 && status !== 408) {
    return new ErroGeracaoIA(`provedor rejeitou a requisição (HTTP ${status})`, { confirmadoSemProcessamento: true });
  }
  if (status != null && status >= 500) {
    return new ErroGeracaoIA(`erro interno do provedor (HTTP ${status}); uso possivelmente processado`, { ambigua: true });
  }
  return new ErroGeracaoIA(`falha sem resposta do provedor: ${mensagem}`, { ambigua: true });
}

export async function gerarOperacaoIA(op: {
  operationId: string;
  payload: ClassifierOutput;
  modelTier: 'FLASH' | 'PRO';
}): Promise<ResultadoGeracaoIA> {
  const modelo = op.modelTier === 'PRO' ? deepseekModelPro : deepseekModel;
  try {
    const completion = await deepseekClient.chat.completions.create({
      model: modelo,
      ...opcoesQwen(modelo),
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
    throw normalizarErroProvedor(err);
  }
}
