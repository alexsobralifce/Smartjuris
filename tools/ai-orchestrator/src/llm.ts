// ===========================================================================
// Chamadas LLM (DeepSeek implementador e GPT-5.6 Terra revisor) via fetch,
// compatível com OpenAI. Chaves nunca são logadas; redação aplicada a erros.
// ===========================================================================

import { z } from 'zod';
import { AuditResult, type AuditResult as AuditResultType } from './contracts.js';
import type { EffectiveEnv } from './config.js';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCompletion {
  content: string;
  usage: TokenUsage;
}

export interface LlmClient {
  /** `complex=true` usa o modelo pro (escada flash→pro em rodadas de correção avançadas). */
  implementer(prompt: string, opts?: { complex?: boolean }): Promise<LlmCompletion>;
  /** `modelOverride` permite escalar o revisor (baliza anti-loop). */
  reviewer(context: string, correctionHint?: string, modelOverride?: string): Promise<LlmCompletion>;
  /** Estruturador de requisitos (DeepSeek Flash) — SYSTEM de estruturação estrito. */
  structurer(prompt: string): Promise<LlmCompletion>;
}

export const STRUCTURE_SYSTEM_PROMPT = [
  'Você é o analista de requisitos do orquestrador de implementação por fases.',
  'Receba requisitos em linguagem natural e transforme em fases de implementação',
  'ENUMERADAS, pequenas, verificáveis e ordenadas por dependência.',
  '',
  'REGRAS:',
  '- Quebre em fases pequenas (cada uma com escopo e critérios de aceite claros).',
  '- USE EXATAMENTE os nomes de campo do contrato abaixo: id, titulo, descricao,',
  '  dependencias, escopo, foraDoEscopo, testesObrigatorios, criteriosAceite.',
  '- NÃO renomeie os campos: nada de nome, tarefas, criterios_aceite ou testes.',
  '- id: String (use aspas), sequência da próxima faixa livre (ex.: 5A, 5B, 5C)',
  '  — nunca repita o existente.',
  '- titulo: String curto com aspas.',
  '- dependencias: array de Strings com os ids de fases anteriores que esta fase exige.',
  '- escopo: o que DEVE ser implementado nesta fase (String).',
  '- foraDoEscopo: o que NÃO deve ser tocado (String).',
  '- testesObrigatorios: array de Strings com os testes a entregar.',
  '- criteriosAceite: array de Strings com itens objetivos que o revisor usará.',
  '- Não invente requisitos: use apenas o que o usuário pediu, desdobrando em etapas.',
  '',
  'Responda SOMENTE com um objeto JSON válido, sem texto fora e sem cercas de código,',
  'neste formato EXATO (campos e tipos idênticos):',
  '{',
  '  "fases": [',
  '    { "id": "5A", "titulo": "Título da fase", "descricao": "Descrição.",',
  '      "dependencias": ["4B"],',
  '      "escopo": "Implementar ...", "foraDoEscopo": "Não alterar ...",',
  '      "testesObrigatorios": ["Teste de ..."],',
  '      "criteriosAceite": ["A funcionalidade funciona ...", "..."] }',
  '  ]',
  '}',
].join('\n');

export async function chatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Campo de limite de conclusão: DeepSeek aceita `max_tokens`; modelos
   *  OpenAI mais novos exigem `max_completion_tokens`. */
  completionTokensField?: 'max_tokens' | 'max_completion_tokens';
  timeoutMs?: number;
}): Promise<LlmCompletion> {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const field = opts.completionTokensField ?? 'max_tokens';
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    stream: false,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  body[field] = opts.maxTokens ?? 8000;

  // Retry para falhas transitórias (5xx/429) e resposta vazia (intermitente na
  // API do DeepSeek). Erros determinísticos (4xx como 400) NÃO são repetidos.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status >= 500 || res.status === 429) {
        const errBody = await res.text().catch(() => '');
        lastError = new Error(`LLM HTTP ${res.status}: ${redactSecret(errBody, opts.apiKey)}`);
        continue; // tenta novamente uma vez
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`LLM HTTP ${res.status}: ${redactSecret(errBody, opts.apiKey)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const message = data.choices?.[0]?.message;
      const usage: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };
      const content = message?.content;
      if (typeof content === 'string' && content.trim() !== '') {
        return { content, usage };
      }
      // Modelos de raciocínio (ex.: deepseek-v4-flash) podem consumir todo o
      // max_tokens no `reasoning_content` e devolver `content` vazio. Nesse
      // caso, usa o raciocínio como fallback em vez de derrubar a fase.
      if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim() !== '') {
        return { content: message.reasoning_content, usage };
      }
      lastError = new Error('LLM retornou resposta vazia.');
      continue; // tenta novamente uma vez
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error('LLM excedeu o tempo limite.');
        continue;
      }
      // Erros de rede transitórios (undici/fetch): conexão derrubada no meio da
      // requisição (`terminated`), `fetch failed`, DNS/TCP (`ENOTFOUND`,
      // `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `ECONNREFUSED`) e `socket hang
      // up` são intermitentes — repetem uma vez como 5xx/429/vazio.
      const msg = err instanceof Error ? err.message : String(err);
      if (/fetch failed|terminated|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up/i.test(msg)) {
        lastError = new Error(`LLM erro de rede: ${redactSecret(msg, opts.apiKey)}`);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('LLM falhou após retry.');
}

export function redactSecret(text: string, ...secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('***');
  }
  return out;
}

export const REVIEW_SYSTEM_PROMPT = [
  'Você é um revisor técnico independente de uma implementação de software.',
  'Analise o resultado enviado e responda SOMENTE com um objeto JSON válido,',
  'sem texto fora do JSON e sem cercas de código. O JSON deve seguir EXATAMENTE',
  'este contrato (sem campos extras):',
  '{',
  '  "phase": string,',
  '  "verdict": "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT",',
  '  "advanceAllowed": boolean,',
  '  "findings": [{ "severity": "BLOCKER"|"HIGH"|"MEDIUM"|"LOW"|"PASS", "file": string|null, "line": number|null, "requirement": string, "evidence": string, "impact": string, "action": string }],',
  '  "requiredFixes": string[],',
  '  "missingTests": string[],',
  '  "scopeViolations": string[],',
  '  "migrationRisks": string[],',
  '  "securityRisks": string[],',
  '  "financialRisks": string[],',
  '  "rollbackRisks": string[],',
  '  "nextPhase": string|null',
  '}',
].join('\n');

/** Extrai o primeiro objeto JSON balanceado do texto (tolera cercas ```json). */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```(?:json)?/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Resposta do revisor sem objeto JSON.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export class AuditParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditParseError';
  }
}

/** Parse estrito do contrato de auditoria; campos extras ou enums inválidos falham. */
export function parseAudit(jsonText: string): AuditResultType {
  let raw: unknown;
  try {
    raw = extractJson(jsonText);
  } catch (err) {
    throw new AuditParseError(`JSON inválido: ${(err as Error).message}`);
  }
  const parsed = AuditResult.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('; ');
    throw new AuditParseError(`Contrato de auditoria inválido: ${issues}`);
  }
  return parsed.data;
}

export function createLlmClient(env: EffectiveEnv, modelForReview: string): LlmClient {
  return {
    async implementer(prompt: string, opts?: { complex?: boolean }): Promise<LlmCompletion> {
      return chatCompletion({
        baseUrl: env.deepseekBaseUrl,
        apiKey: env.deepseekApiKey,
        model: opts?.complex ? env.deepseekModelPro : env.deepseekModel,
        system: 'Você é o implementador do SmartJuris. Implemente apenas a fase solicitada, execute testes e build e reporte evidências. Não invente dados nem altere arquivos fora do escopo.',
        user: prompt,
        temperature: 0.3,
        maxTokens: 12000,
        completionTokensField: 'max_tokens', // DeepSeek
      });
    },
    async reviewer(context: string, correctionHint?: string): Promise<LlmCompletion> {
      const user = correctionHint
        ? `${context}\n\nA resposta anterior não seguiu o contrato. Erro: ${correctionHint}\nResponda novamente somente com o JSON válido do contrato.`
        : context;
      return chatCompletion({
        baseUrl: env.openaiBaseUrl,
        apiKey: env.openaiApiKey,
        model: modelForReview,
        system: REVIEW_SYSTEM_PROMPT,
        user,
        maxTokens: 4000,
        completionTokensField: 'max_completion_tokens', // OpenAI (modelos novos)
      });
    },
    async structurer(prompt: string): Promise<LlmCompletion> {
      return chatCompletion({
        baseUrl: env.deepseekBaseUrl,
        apiKey: env.deepseekApiKey,
        model: env.deepseekModel, // DeepSeek Flash (nunca pro)
        system: STRUCTURE_SYSTEM_PROMPT,
        user: prompt,
        temperature: 0.3,
        // Modelos de raciocínio gastam tokens no reasoning_content antes do
        // JSON; 4000 truncava o contrato em requisitos grandes.
        maxTokens: 12000,
        completionTokensField: 'max_tokens', // DeepSeek
      });
    },
  };
}

export interface AuditWithRetryResult {
  audit: AuditResultType;
  rawResponses: string[];
  corrected: boolean;
  /** Tokens somados de TODAS as chamadas ao revisor (inclui retry de contrato). */
  usage: TokenUsage;
}

function sumUsage(items: TokenUsage[]): TokenUsage {
  return {
    promptTokens: items.reduce((acc, u) => acc + u.promptTokens, 0),
    completionTokens: items.reduce((acc, u) => acc + u.completionTokens, 0),
    totalTokens: items.reduce((acc, u) => acc + u.totalTokens, 0),
  };
}

export function validateAuditWithRetry(
  llm: LlmClient,
  context: string,
  opts?: { model?: string },
): Promise<AuditWithRetryResult> {
  return (async () => {
    const raw1 = await llm.reviewer(context, undefined, opts?.model);
    try {
      const audit = parseAudit(raw1.content);
      return { audit, rawResponses: [raw1.content], corrected: false, usage: raw1.usage };
    } catch (err) {
      const hint = (err as Error).message;
      const raw2 = await llm.reviewer(context, hint, opts?.model);
      const audit = parseAudit(raw2.content); // lança AuditParseError se persistir
      return { audit, rawResponses: [raw1.content, raw2.content], corrected: true, usage: sumUsage([raw1.usage, raw2.usage]) };
    }
  })();
}

export function auditErrorSummary(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join('; ');
  return err instanceof Error ? err.message : String(err);
}
