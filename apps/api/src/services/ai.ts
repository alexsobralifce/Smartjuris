import OpenAI from 'openai';

// Provedor de IA: OpenAI — endpoint e chave configuráveis por env.
// `AI_BASE_URL`/`OPENAI_API_KEY` são os nomes canônicos; `DEEPSEEK_BASE_URL`/
// `DEEP_SEEK_API`/`DEEPSEEK_API_KEY` continuam aceitos por compatibilidade
// (provedor anterior: Token Plan/Qwen).

/** URL base do provedor principal (fonte única: `AI_BASE_URL` → `DEEPSEEK_BASE_URL`). */
export function tokenPlanBaseUrl(): string {
  return (
    process.env.AI_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    'https://api.openai.com/v1'
  );
}

/** Chave de API do provedor principal (fonte única). */
export function tokenPlanApiKey(): string {
  return process.env.OPENAI_API_KEY || process.env.DEEP_SEEK_API || process.env.DEEPSEEK_API_KEY || '';
}

export const deepseekClient = new OpenAI({
  baseURL: tokenPlanBaseUrl(),
  apiKey: tokenPlanApiKey(),
});

/** Backup (OpenCode Go) não configurado: sem OPENCODE_API_KEY não há reserva. */
export class BackupIndisponivelError extends Error {}

// Sem a chave o SDK lança na construção e derruba o módulo inteiro: o cliente
// só existe quando configurado.
export const opencodeClient = process.env.OPENCODE_API_KEY
  ? new OpenAI({
      baseURL: process.env.OPENCODE_BASE_URL || 'https://api.opencode.ai/v1',
      apiKey: process.env.OPENCODE_API_KEY,
    })
  : null;

// Modelos OpenAI: padrão = gpt-4o-mini (operações simples); complexas =
// gpt-5.6-luna (decisão de produto: ver AGENTS.md / plano da migração).
export const deepseekModel = process.env.DEEPSEEK_MODEL || 'gpt-4o-mini';
export const deepseekModelPro = process.env.DEEPSEEK_MODEL_PRO || 'gpt-5.6-luna';

// Modelos OpenCode Go (Fallback/Reserva)
export const opencodeModel = process.env.OPENCODE_MODEL_FLASH || 'deepseek-v4-flash';
export const opencodeModelPro = process.env.OPENCODE_MODEL_PRO || 'deepseek-v4-pro';

/** Tier do modelo (mesma inferência de `precoDoModelo` em usage.ts): compara
 *  primeiro contra os modelos PRO CONFIGURADOS (qualquer provedor) — nomes
 *  como `gpt-5.6-luna` não contêm "pro"/"max" e não seriam detectados pela
 *  heurística de substring. O substring fica como fallback para nomes não
 *  previstos (ex.: modelo retornado por um provedor de reserva desconhecido).
 *  Usado pelo roteamento do fallback — independe de qual constante o
 *  chamador passou. */
export function ehModeloPro(model: string): boolean {
  const nome = model.toLowerCase();
  const prosConhecidos = [deepseekModelPro, opencodeModelPro].map((m) => m.toLowerCase());
  if (prosConhecidos.includes(nome)) return true;
  return nome.includes('pro') || nome.includes('max');
}

/** Modelo do Token Plan por tier (FONTE ÚNICA FLASH/PRO → modelo). */
export function modeloPorTier(tier: 'FLASH' | 'PRO'): string {
  return tier === 'PRO' ? deepseekModelPro : deepseekModel;
}

/** Modelo do OpenCode Go por tier. */
function modeloReservaPorTier(tier: 'FLASH' | 'PRO'): string {
  return tier === 'PRO' ? opencodeModelPro : opencodeModel;
}

export type ProvedorCreate = (params: any, options?: any) => Promise<any>;

export interface ProvedorAlvo {
  client: ProvedorCreate;
  model: string;
}

/**
 * Erros do CLIENTE (4xx exceto 429) são config/conteúdo — NÃO transbordam.
 * Transbordam apenas 429 (créditos/cota do provedor esgotados) e 5xx/rede
 * (provedor inacessível) — alinhado à política fail-closed (3B).
 */
export function ehErroRetryableParaFallback(err: unknown): boolean {
  const e = err as { status?: number; name?: string; code?: string } | null;
  // Abort do cliente (desconexão SSE) NUNCA transborda — independente de
  // qualquer campo de status que o erro possa carregar.
  if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') return false;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (typeof status === 'number') {
    // 429 (cota/créditos do provedor) e 5xx (falha do provedor) transbordam.
    // 4xx (incluindo 408) é da solicitação/cliente → NÃO transborda.
    return status === 429 || status >= 500;
  }
  // Sem status (rede/timeout) → transborda.
  return true;
}

/** Anota o modelo EFETIVAMENTE usado na resposta (respeitando o `model` já
 *  devolvido pelo provedor), para que chamadores registrem telemetria precisa.
 *  Para streams, o objeto é anotado antes de retornar (mesma tier — custo
 *  idêntico; apenas o NOME do modelo vencedor fica rastreável). */
function anotarModeloUsado(data: any, model: string): any {
  try {
    if (data && typeof data === 'object' && data.model == null) {
      data.model = model;
    }
  } catch {
    // resposta imutável/stream congelado — segue sem anotação (best-effort)
  }
  return data;
}

/**
 * Fallback bidirecional entre provedores (Token Plan <-> OpenCode Go).
 * Se o provedor PRINCIPAL falhar por motivo RETRYABLE (ex.: HTTP 429 —
 * créditos do plano esgotados), a chamada transborda para o RESERVA com o
 * MESMO tier. Erros de cliente (4xx não-429) não transbordam. Núcleo puro.
 */
export async function executarComFallback(
  params: any,
  options: any | undefined,
  principal: ProvedorAlvo,
  reserva: ProvedorAlvo,
): Promise<any> {
  const preparar = (alvo: ProvedorAlvo) => {
    const p = { ...params, model: alvo.model };
    // `enable_thinking` só existe para modelos Qwen; provedores puros (ex.:
    // OpenCode Go) rejeitam parâmetros desconhecidos no corpo.
    if (!alvo.model.toLowerCase().startsWith('qwen')) {
      delete p.enable_thinking;
    }
    // Modelos OpenAI (gpt-*): `max_completion_tokens` substitui `max_tokens`;
    // a família GPT-5 ainda rejeita `temperature` diferente do padrão 1.
    if (alvo.model.toLowerCase().startsWith('gpt-')) {
      if (p.max_tokens !== undefined && p.max_completion_tokens === undefined) {
        p.max_completion_tokens = p.max_tokens;
      }
      delete p.max_tokens;
      if (alvo.model.toLowerCase().startsWith('gpt-5') && p.temperature !== undefined && p.temperature !== 1) {
        delete p.temperature;
      }
    }
    return p;
  };
  try {
    return anotarModeloUsado(await principal.client(preparar(principal), options), principal.model);
  } catch (errMain) {
    if (!ehErroRetryableParaFallback(errMain)) {
      // 4xx de cliente (400/401/403/404...) é problema de configuração ou
      // conteúdo — repetir no reserva só mascararia o erro real.
      throw errMain;
    }
    console.warn(
      `[AI Service] Provedor principal (${principal.model}) falhou. Tentando reserva (${reserva.model})...`,
      errMain,
    );
    try {
      return anotarModeloUsado(await reserva.client(preparar(reserva), options), reserva.model);
    } catch (errFallback) {
      // Sem backup configurado, o erro relevante é o do provedor principal.
      if (errFallback instanceof BackupIndisponivelError) throw errMain;
      console.error('[AI Service] Ambos os provedores falharam.', errFallback);
      throw errFallback;
    }
  }
}

const originalCreate = deepseekClient.chat.completions.create.bind(deepseekClient.chat.completions);
const opencodeCreate: ProvedorCreate = opencodeClient
  ? opencodeClient.chat.completions.create.bind(opencodeClient.chat.completions)
  : async () => {
      throw new BackupIndisponivelError('Backup OpenCode não configurado (OPENCODE_API_KEY ausente).');
    };

/** Resolve os alvos principal/reserva a partir do modelo pedido e da
 *  preferência de provedor (`PREFER_OPENCODE=true` inverte a ordem).
 *  Os creates reais são injetáveis por padrão — testes passam fakes. */
export function montarProvedores(
  params: { model?: string },
  preferOpencode: boolean,
  tokenPlanCreate: ProvedorCreate = originalCreate,
  opencodeCreateFn: ProvedorCreate = opencodeCreate,
): { principal: ProvedorAlvo; reserva: ProvedorAlvo } {
  const tier = ehModeloPro(params.model ?? '') ? 'PRO' : 'FLASH';
  const tokenPlan: ProvedorAlvo = { client: tokenPlanCreate, model: modeloPorTier(tier) };
  const opencode: ProvedorAlvo = { client: opencodeCreateFn, model: modeloReservaPorTier(tier) };
  return preferOpencode
    ? { principal: opencode, reserva: tokenPlan }
    : { principal: tokenPlan, reserva: opencode };
}

// Proxy para fallback duplo (Token Plan <-> OpenCode Go): TODA chamada ao
// deepseekClient transborda para o reserva quando o principal falha.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
deepseekClient.chat.completions.create = async function (params: any, options?: any) {
  const { principal, reserva } = montarProvedores(params, process.env.PREFER_OPENCODE === 'true');
  return executarComFallback(params, options, principal, reserva);
};

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
  const modelo = modeloPorTier(op.modelTier);
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
    // `completion.model` reflete o modelo EFETIVAMENTE usado pelo provedor
    // (com o wrapper de fallback, pode ser o reserva — ex.: OpenCode Go).
    const modelUsado = completion.model || modelo;
    return {
      modelUsed: modelUsado,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
    };
  } catch (err) {
    throw normalizarErroProvedor(err);
  }
}
