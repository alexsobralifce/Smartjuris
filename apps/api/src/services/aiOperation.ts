// ===========================================================================
// Fase 2F — Orquestrador de operação de IA com idempotência e reserva.
//
// Fluxo completo:
//   idempotencyKey (obrigatória) + fingerprint canônico (payload+classificação)
//   → buildClassifierPayload (2C: deriva escritório/plano/saldo/processo/docs/RAG)
//   → classifyAiOperation (classificador determinístico)
//   → estimateAiOperation (2B: tokens/custo estimados a partir da classificação)
//   → reserveAiUsage (reserva; UNIQUE (escritorio_id, idempotency_key) + FOR UPDATE)
//   → gerar (ponto de integração — NÃO conecta SSE/frontend nesta fase)
//   → settleAiUsage (liquidação com uso real) ou releaseAiUsageReservation (falha)
//
// Garantias:
//   - chave de idempotência OBRIGATÓRIA (rejeita sem ela);
//   - retry seguro: mesma chave (mesmo escritório + mesmo fingerprint) NÃO
//     executa generate de novo — reutiliza a operação reservada/liquidada;
//   - MESMA chave com payload/classificação DIFERENTE → conflito explícito;
//   - MESMA chave em escritórios DISTINTOS → operações independentes;
//   - concorrência: 2 chamadas simultâneas da mesma chave → 1 reserva + 1 geração;
//   - falhas liberam reservas; erro de release NÃO é suprimido (compensação
//     pendente é sinalizada);
//   - nenhum token_usage duplicado (settle idempotente por operationId).
// ===========================================================================

import { createHash } from 'node:crypto';
import type { AuthenticatedRequest } from '../middlewares/auth.js';
import { buildClassifierPayload, type BuilderInput } from './payloadBuilder.js';
import { classifyAiOperation, type ClassifierOutput } from './classifier.js';
import {
  estimateAiOperation,
  reserveAiUsage,
  settleAiUsage,
  releaseAiUsageReservation,
  type AiEstimateResult,
} from './usage.js';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AiOperationInput {
  /** Usuário autenticado (escritorioId vem do JWT, nunca do cliente). */
  user: { id: string; role: string; escritorioId: string | null } | undefined;
  /** Input restrito do cliente (2C). */
  input: BuilderInput;
  /** Chave de idempotência OBRIGATÓRIA. */
  idempotencyKey: string;
  /** Request HTTP (opcional — usado para auditoria nas primitivas). */
  req?: AuthenticatedRequest;
  /** Injeta o "uso real" da geração (para testes; padrão: falha controlada). */
  generate?: (op: { operationId: string; payload: ClassifierOutput }) => Promise<{
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}

export type AiOperationResult =
  | {
      ok: true;
      phase: 'classificado' | 'reservado' | 'sucesso' | 'ja-reservado' | 'ja-liquidado' | 'em-execucao';
      operationId: string | null;
      classification: ClassifierOutput | null;
      estimate: AiEstimateResult | null;
      creditsReserved: number | null;
      costCentsReserved: number | null;
      modelUsed: string | null;
      tokensIn: number;
      tokensOut: number;
      warnings: string[];
      fingerprint: string | null;
    }
  | { ok: false; code: string; reason: string };

/**
 * Fingerprint canônico da INTENÇÃO da requisição: escritório + chave + INPUT do
 * cliente (dadosCaso/tipo/área/processoId/etc.) + operação classificada.
 * NÃO inclui o payload derivado (saldo/páginas/documentos) porque esses valores
 * mudam APÓS a reserva — um retry legítimo da mesma chave deve ter o MESMO
 * fingerprint (intenção estável), e uma chave com input diferente deve diferir.
 */
export function fingerprintDaOperacao(
  escritorioId: string,
  idempotencyKey: string,
  inputCanonico: string,
  operation: string,
): string {
  return createHash('sha256')
    .update([escritorioId, idempotencyKey, inputCanonico, operation].join('|'))
    .digest('hex');
}

/** Lê o status/fingerprint atuais da operação (para retries). */
async function estadoDaOperacao(operationId: string): Promise<{ status: string; fingerprint: string | null } | null> {
  const rows = (await db.execute(sql`
    SELECT status, idempotency_fingerprint FROM ai_operations WHERE id = ${operationId} LIMIT 1
  `)) as any[];
  if (!rows[0]) return null;
  return { status: String(rows[0].status), fingerprint: rows[0].idempotency_fingerprint ?? null };
}

// ---------------------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------------------

export async function runAiOperation(opts: AiOperationInput): Promise<AiOperationResult> {
  const { user, input, idempotencyKey, req, generate } = opts;

  // 1. Chave de idempotência OBRIGATÓRIA.
  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return { ok: false, code: 'idempotency-ausente', reason: 'Chave de idempotência é obrigatória.' };
  }

  // 2. Payload real (2C) — deriva tudo do contexto autenticado + banco.
  const payload = await buildClassifierPayload({ user, input });
  if (!payload.ok) {
    return { ok: false, code: payload.code, reason: payload.reason };
  }

  // 3. Classificação determinística.
  const classification = classifyAiOperation(payload.payload);

  // 4. Estimativa de tokens/custo a partir da classificação (2B).
  const op = classification.operation;
  if (!op) {
    return {
      ok: false,
      code: 'sem-operacao-classificada',
      reason: `Classificador não identificou operação (status=${classification.status}).`,
    };
  }
  const pagesRelevant = classification.pagesRelevant ?? 0;
  const estimate = estimateAiOperation({
    operation: op,
    pagesRelevant,
    annexPages: 0,
    ragContextChars: 0,
    expectedOutputChars: undefined,
  });

  // 5. Escritório do CONTEXTO AUTENTICADO (isolamento entre tenants).
  const escritorioId = user?.escritorioId ?? null;
  if (!escritorioId) {
    return { ok: false, code: 'sem-escritorio', reason: 'Usuário sem escritório vinculado.' };
  }

  // 6. Fingerprint canônico da INTENÇÃO (input do cliente + operação) — estável
  //    entre retries legítimos (saldo/páginas mudam após a reserva, não a intenção).
  const inputCanonico = JSON.stringify({
    pieceType: input.pieceType ?? null,
    area: input.area ?? null,
    dadosCaso: input.dadosCaso ?? null,
    processoId: input.processoId ?? null,
    includeJurisprudence: input.includeJurisprudence ?? null,
    outputSize: input.outputSize ?? null,
  });
  const fingerprint = fingerprintDaOperacao(escritorioId, idempotencyKey, inputCanonico, op);

  // 7. Reserva idempotente por (escritorio_id, idempotency_key) com FOR UPDATE.
  const reserve = await reserveAiUsage({
    escritorioId,
    usuarioId: user?.id ?? null,
    idempotencyKey,
    idempotencyFingerprint: fingerprint,
    operation: op,
    estimate,
    req,
  });
  if (!reserve.ok) {
    return { ok: false, code: reserve.reason ?? 'reserva-negada', reason: reserve.reason ?? 'Reserva negada.' };
  }

  const operationId = reserve.operationId ?? null;

  // 8. RETRY/CONCORRÊNCIA: operação já existente para a chave.
  if (reserve.alreadyReserved) {
    // 8a. Valida o fingerprint: mesma chave com conteúdo DIFERENTE é conflito.
    if (reserve.idempotencyFingerprint && reserve.idempotencyFingerprint !== fingerprint) {
      return {
        ok: false,
        code: 'idempotencia-conflito',
        reason: 'A mesma chave de idempotência foi usada com payload/classificação diferente.',
      };
    }
    // 8b. NÃO executa generate de novo: retorna o estado persistido.
    const estado = operationId ? await estadoDaOperacao(operationId) : null;
    const status = estado?.status ?? reserve.status ?? 'reserved';
    if (status === 'succeeded') {
      return {
        ok: true,
        phase: 'ja-liquidado',
        operationId,
        classification,
        estimate,
        creditsReserved: reserve.creditsReserved ?? null,
        costCentsReserved: reserve.costCentsReserved ?? null,
        modelUsed: null,
        tokensIn: 0,
        tokensOut: 0,
        warnings: payload.warnings,
        fingerprint,
      };
    }
    if (status === 'running') {
      return {
        ok: true,
        phase: 'em-execucao',
        operationId,
        classification,
        estimate,
        creditsReserved: reserve.creditsReserved ?? null,
        costCentsReserved: reserve.costCentsReserved ?? null,
        modelUsed: null,
        tokensIn: 0,
        tokensOut: 0,
        warnings: payload.warnings,
        fingerprint,
      };
    }
    // reserved/failed: retorna como já-reservado (sem gerar de novo).
    return {
      ok: true,
      phase: 'ja-reservado',
      operationId,
      classification,
      estimate,
      creditsReserved: reserve.creditsReserved ?? null,
      costCentsReserved: reserve.costCentsReserved ?? null,
      modelUsed: null,
      tokensIn: 0,
      tokensOut: 0,
      warnings: payload.warnings,
      fingerprint,
    };
  }

  // 9. Geração (ponto de integração). Sem gerador → falha controlada que
  //    LIBERA a reserva (comportamento seguro por padrão).
  let modelUsed = 'flash';
  let tokensIn = 0;
  let tokensOut = 0;
  let gerou = false;
  if (generate) {
    try {
      const gen = await generate({ operationId: operationId!, payload: classification });
      modelUsed = gen.modelUsed;
      tokensIn = gen.inputTokens;
      tokensOut = gen.outputTokens;
      gerou = true;
    } catch {
      gerou = false;
    }
  }

  // 10. Liquidação (sucesso) ou liberação (falha).
  if (gerou) {
    const settle = await settleAiUsage({
      operationId: operationId!,
      modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      req,
    });
    if (!settle.ok && !settle.alreadySettled) {
      // Falha no settle: tenta liberar SEM suprimir erro de release.
      const release = await releaseAiUsageReservation({ operationId: operationId!, reason: 'settle-falhou', req });
      if (!release.ok && !release.alreadyReleased) {
        return {
          ok: false,
          code: 'compensacao-pendente',
          reason: `Settle falhou (${settle.reason ?? 'desconhecido'}) e a liberação da reserva também falhou. Compensação pendente: ${release.reason ?? 'desconhecido'}.`,
        };
      }
      return { ok: false, code: settle.reason ?? 'settle-falhou', reason: settle.reason ?? 'Falha ao liquidar.' };
    }
    return {
      ok: true,
      phase: settle.alreadySettled ? 'ja-liquidado' : 'sucesso',
      operationId,
      classification,
      estimate,
      creditsReserved: reserve.creditsReserved ?? null,
      costCentsReserved: reserve.costCentsReserved ?? null,
      modelUsed,
      tokensIn,
      tokensOut,
      warnings: [...payload.warnings, ...classification.warnings],
      fingerprint,
    };
  }

  // Falha na geração → libera a reserva (devolve créditos/custo). O erro de
  // release NÃO é suprimido: se falhar, sinaliza compensação pendente.
  const release = await releaseAiUsageReservation({ operationId: operationId!, reason: 'geracao-falhou', req });
  if (!release.ok && !release.alreadyReleased) {
    return {
      ok: false,
      code: 'compensacao-pendente',
      reason: `Geração falhou e a liberação da reserva também falhou. Compensação pendente: ${release.reason ?? 'desconhecido'}.`,
    };
  }
  return {
    ok: false,
    code: 'geracao-falhou',
    reason: 'Geração não produziu resultado; reserva liberada.',
  };
}
