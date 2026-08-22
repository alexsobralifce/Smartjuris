// ===========================================================================
// Chamadas LLM (DeepSeek implementador e GPT-5.6 Terra revisor) via fetch,
// compatível com OpenAI. Chaves nunca são logadas; redação aplicada a erros.
// ===========================================================================

import { z } from 'zod';
import { AuditResult, type AuditResult as AuditResultType } from './contracts.js';
import type { EffectiveEnv } from './config.js';

export interface LlmClient {
  implementer(prompt: string): Promise<string>;
  reviewer(context: string, correctionHint?: string): Promise<string>;
}

export async function chatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 8000,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}: ${redactSecret(body, opts.apiKey)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('LLM retornou resposta vazia.');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
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
    async implementer(prompt: string): Promise<string> {
      return chatCompletion({
        baseUrl: env.deepseekBaseUrl,
        apiKey: env.deepseekApiKey,
        model: env.deepseekModel,
        system: 'Você é o implementador do SmartJuris. Implemente apenas a fase solicitada, execute testes e build e reporte evidências. Não invente dados nem altere arquivos fora do escopo.',
        user: prompt,
        temperature: 0.3,
        maxTokens: 8000,
      });
    },
    async reviewer(context: string, correctionHint?: string): Promise<string> {
      const user = correctionHint
        ? `${context}\n\nA resposta anterior não seguiu o contrato. Erro: ${correctionHint}\nResponda novamente somente com o JSON válido do contrato.`
        : context;
      return chatCompletion({
        baseUrl: env.openaiBaseUrl,
        apiKey: env.openaiApiKey,
        model: modelForReview,
        system: REVIEW_SYSTEM_PROMPT,
        user,
        temperature: 0,
        maxTokens: 4000,
      });
    },
  };
}

export function validateAuditWithRetry(
  llm: LlmClient,
  context: string,
): Promise<{ audit: AuditResultType; rawResponses: string[]; corrected: boolean }> {
  return (async () => {
    const raw1 = await llm.reviewer(context);
    try {
      const audit = parseAudit(raw1);
      return { audit, rawResponses: [raw1], corrected: false };
    } catch (err) {
      const hint = (err as Error).message;
      const raw2 = await llm.reviewer(context, hint);
      const audit = parseAudit(raw2); // lança AuditParseError se persistir
      return { audit, rawResponses: [raw1, raw2], corrected: true };
    }
  })();
}

export function auditErrorSummary(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join('; ');
  return err instanceof Error ? err.message : String(err);
}
