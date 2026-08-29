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
  calculateAiCostCents,
  isHorarioPico,
  OPERATION_LIMITS,
  type AiEstimateResult,
} from './usage.js';
import { ehErroRetryable, ehFalhaAmbígua, ehFalhaComResposta } from './analiseDocumental.js';
import { gerarOperacaoIA, deepseekModelPro, type ResultadoGeracaoIA } from './ai.js';
import { recordAudit } from '../middlewares/audit.js';
import type { AiOperationType } from './usage.js';
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
  /** Injeta o "uso real" da geração (para testes; padrão: falha controlada).
   *  `modelTier` informa qual modelo o gerador DEVE usar ('FLASH' ou 'PRO') —
   *  usado pela política de fallback Flash→Pro (3B). */
  generate?: (op: {
    operationId: string;
    payload: ClassifierOutput;
    modelTier: 'FLASH' | 'PRO';
  }) => Promise<{
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  /** Desliga o fallback Flash→Pro (env DEEPSEEK_FALLBACK_TO_PRO='false' é a
   *  fonte canônica; este campo permite testes explícitos). */
  fallbackParaPro?: boolean;
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

  // 1. Chave de idempotência OBRIGATÓRIA e SEM prefixo interno reservado.
  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return { ok: false, code: 'idempotency-ausente', reason: 'Chave de idempotência é obrigatória.' };
  }
  if (idempotencyKey.startsWith(PREFIXO_CHAVE_FALLBACK)) {
    return {
      ok: false,
      code: 'idempotency-reservada',
      reason: 'A chave de idempotência usa um prefixo reservado para uso interno do sistema.',
    };
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
    // reserved/failed: a operação FLASH falhou. Se o fallback PRO (chave
    // ':pro') JÁ LIQUIDOU a mesma operação lógica, o retry deve devolver o
    // RESULTADO do PRO (não o estado da FLASH falha) — idempotência real do
    // fallback preservada entre retries.
    const resultadoProLiquidado = await buscarResultadoFallbackProLiquidado({
      escritorioId,
      idempotencyKey,
      inputCanonico,
      op,
      classification,
      estimate,
      payloadWarnings: payload.warnings,
    });
    if (resultadoProLiquidado) return resultadoProLiquidado;
    // Sem fallback PRO liquidado: retorna como já-reservado (sem gerar de novo).
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
  //    Fase 3B: falha RECUPERÁVEL do FLASH aciona o fallback automático para o
  //    PRO (decisão de SERVIDOR, env DEEPSEEK_FALLBACK_TO_PRO, default true).
  let modelUsed = 'flash';
  let tokensIn = 0;
  let tokensOut = 0;
  let gerou = false;
  let fallbackPro = false;
  let motivoFallback: string | null = null;
  let falhaAmbigua = false;

  const gerador = generate ?? gerarOperacaoIA;
  if (gerador) {
    try {
      const gen = await gerador({ operationId: operationId!, payload: classification, modelTier: 'FLASH' });
      modelUsed = gen.modelUsed;
      tokensIn = gen.inputTokens;
      tokensOut = gen.outputTokens;
      gerou = true;
    } catch (err) {
      // Falha na geração FLASH: o fallback PRO só é autorizado com CONFIRMAÇÃO
      // ESTRUTURADA de que o provedor NÃO processou a chamada
      // (ehFalhaComResposta — ex.: 429/400 marcado pelo adaptador). Sem isso a
      // falha é AMBÍGUA e a reserva é retida para reconciliação (nunca
      // reexecuta nem libera integralmente). Também nunca para recusa/validação.
      const recuperavel = ehErroRetryable(err);
      const ambigua = ehFalhaAmbígua(err);
      const confirmada = ehFalhaComResposta(err);
      // Decisão canônica de SERVIDOR: DEEPSEEK_FALLBACK_TO_PRO=false desliga
      // SEMPRE o fallback — o campo de injeção de teste NÃO pode reativá-lo.
      const envDesligado = process.env.DEEPSEEK_FALLBACK_TO_PRO === 'false';
      const habilitado = !envDesligado && (opts.fallbackParaPro ?? true);
      if (recuperavel && confirmada && !ambigua && habilitado) {
        const resultadoFallback = await executarFallbackPro({
          operationIdFlash: operationId!,
          user,
          idempotencyKey,
          inputCanonico,
          op,
          estimate,
          classification,
          payloadWarnings: [...payload.warnings, ...classification.warnings],
          req,
          generate: gerador,
        });
        if (resultadoFallback) {
          return resultadoFallback; // sucesso PRO ou REQUIRES_ADDITIONAL_CREDITS
        }
        // Fallback PRO indisponível (sem gerador/erro): segue para liberação
        // da reserva FLASH abaixo, com motivo GENÉRICO (nunca expõe detalhes
        // internos do provedor/exceção ao chamador).
        motivoFallback = 'falha-temporaria-do-provedor';
      } else if (ambigua) {
        // Falha AMBÍGUA (timeout/rede): o provedor PODE ter processado e
        // faturado. A reserva NÃO é devolvida integralmente antes de
        // reconciliação: a operação é MARCADA como uso ambíguo pendente
        // (crédito retido). Se a MARCAÇÃO falhar, não podemos afirmar que a
        // tentativa ficará identificável — sinaliza compensação pendente.
        const marcou = await marcarUsoAmbiguo(operationId!);
        if (!marcou) {
          return {
            ok: false,
            code: 'compensacao-pendente',
            reason: 'Falha ambígua sem resposta do provedor e a marcação persistente de reconciliação falhou. Compensação pendente; verifique os registros.',
          };
        }
        falhaAmbigua = true;
        motivoFallback = 'falha-ambigua-sem-resposta-do-provedor';
      } else {
        motivoFallback = 'falha-na-execucao';
      }
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
          reason: 'Falha ao liquidar a operação e a liberação da reserva também falhou. Compensação pendente; verifique os registros.',
        };
      }
      return { ok: false, code: 'settle-falhou', reason: 'Falha ao liquidar a operação; tente novamente.' };
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

  // Falha na geração.
  if (falhaAmbigua) {
    // AMBÍGUA: reserva RETIDA (status running + marcação persistente) até a
    // reconciliação financeira com o provedor — nunca devolução integral
    // silenciosa de uma chamada que pode ter sido faturada.
    return {
      ok: false,
      code: 'falha-ambigua-reconciliacao-pendente',
      reason: 'Falha sem resposta do provedor; o uso pode ter sido faturado e está em reconciliação.',
    };
  }
  // Falha CONFIRMADA → libera a reserva (devolve créditos/custo). O erro de
  // release NÃO é suprimido: se falhar, sinaliza compensação pendente.
  const release = await releaseAiUsageReservation({
    operationId: operationId!,
    reason: motivoFallback ? `geracao-falhou (${motivoFallback})` : 'geracao-falhou',
    req,
  });
  if (!release.ok && !release.alreadyReleased) {
    return {
      ok: false,
      code: 'compensacao-pendente',
      reason: 'Geração falhou e a liberação da reserva também falhou. Compensação pendente; verifique os registros.',
    };
  }
  return {
    ok: false,
    code: 'geracao-falhou',
    reason: 'A geração não pôde ser concluída neste momento; tente novamente. Reserva liberada.',
  };
}

/** Prefixo RESERVADO para chaves de idempotência internas do fallback
 *  Flash→Pro. O cliente NUNCA pode usar este prefixo (validado no
 *  builderInputSchema / runAiOperation): garante que a chave derivada do
 *  fallback NUNCA colide com chaves normais controladas pelo cliente. */
export const PREFIXO_CHAVE_FALLBACK = 'smartjuris:fallback:';

// ---------------------------------------------------------------------------
// Fase 3B — Fallback Flash → Pro
// ---------------------------------------------------------------------------

/** Fluxo de fallback Flash→Pro (3B):
 *  1. registra o motivo (auditável via req, quando disponível);
 *  2. recalcula o custo com o modelo PRO;
 *  3. revalida a reserva (orçamento disponível cobre o PRO);
 *  4. executa o PRO SOMENTE com orçamento (nova chave com sufixo ':pro');
 *  5. sem orçamento → REQUIRES_ADDITIONAL_CREDITS (nunca executa Pro sem saldo).
 * Retorna resultado tipado; null se o fallback não pôde ser executado
 * (sem gerador ou erro de reserva) — o chamador libera a reserva FLASH. */
/** Busca a operação PRO (`<chave>:pro`) já LIQUIDADA para a mesma chave
 *  lógica. Se existir (retry após sucesso do fallback), devolve o resultado do
 *  PRO — o retry NÃO regera nem reutiliza o estado da FLASH que falhou.
 *  Retorna null se não houver PRO liquidado. */
async function buscarResultadoFallbackProLiquidado(opts: {
  escritorioId: string;
  idempotencyKey: string;
  inputCanonico: string;
  op: string;
  classification: ClassifierOutput;
  estimate: AiEstimateResult;
  payloadWarnings: string[];
}): Promise<AiOperationResult | null> {
  const chavePro = `${PREFIXO_CHAVE_FALLBACK}${opts.idempotencyKey}:pro`;
  let rows: any[] = [];
  try {
    rows = (await db.execute(sql`
      SELECT id, status, idempotency_fingerprint, credits_reserved, cost_cents_reserved, model_used, tokens_in, tokens_out
      FROM ai_operations
      WHERE escritorio_id = ${opts.escritorioId} AND idempotency_key = ${chavePro}
      LIMIT 1
    `)) as any[];
  } catch {
    return null;
  }
  const opPro = rows[0];
  if (!opPro) return null;
  if (String(opPro.status) !== 'succeeded') return null;
  // Fingerprint da MESMA operação lógica: a operação ':pro' só é reutilizada
  // se corresponder à MESMA intenção (escritório + chave + input + operação).
  // Uma operação ':pro' criada previamente com conteúdo DIFERENTE não pode ser
  // reutilizada como resultado do fallback desta chamada.
  const fingerprintPro = fingerprintDaOperacao(opts.escritorioId, chavePro, opts.inputCanonico, opts.op);
  if (opPro.idempotency_fingerprint && String(opPro.idempotency_fingerprint) !== fingerprintPro) {
    return null;
  }
  return {
    ok: true,
    phase: 'ja-liquidado',
    operationId: String(opPro.id),
    classification: opts.classification,
    estimate: opts.estimate,
    creditsReserved: Number(opPro.credits_reserved ?? 0),
    costCentsReserved: Number(opPro.cost_cents_reserved ?? 0),
    modelUsed: opPro.model_used ? String(opPro.model_used) : null,
    tokensIn: Number(opPro.tokens_in ?? 0),
    tokensOut: Number(opPro.tokens_out ?? 0),
    warnings: [...opts.payloadWarnings, 'Fallback PRO já liquidado: resultado reutilizado.'],
    fingerprint: fingerprintPro,
  };
}

/** Marcação PERSISTENTE de uso ambíguo (falha sem resposta do provedor):
 *  a tentativa pode ter sido faturada e fica identificável para reconciliação
 *  financeira. Retorna true se a marcação foi GRAVADA; false se falhou — o
 *  chamador NÃO pode reportar reconciliação pendente se a marcação não existe
 *  (o estado seria silenciosamente irreconciliável). */
async function marcarUsoAmbiguo(operationId: string): Promise<boolean> {
  try {
    const res = await db.execute(sql`
      UPDATE ai_operations
      SET fallback_reason = 'uso-ambiguo-pendente-reconciliacao', updated_at = now()
      WHERE id = ${operationId}
      RETURNING id
    `) as any[];
    const afetadas = Array.isArray(res) ? res.length : 0;
    return afetadas > 0;
  } catch {
    return false;
  }
}

async function executarFallbackPro(opts: {
  operationIdFlash: string;
  user: { id: string; role: string; escritorioId: string | null } | undefined;
  idempotencyKey: string;
  inputCanonico: string;
  op: string;
  estimate: AiEstimateResult;
  classification: ClassifierOutput;
  payloadWarnings: string[];
  req?: AuthenticatedRequest;
  generate: (op: { operationId: string; payload: ClassifierOutput; modelTier: 'FLASH' | 'PRO' }) => Promise<{
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}): Promise<AiOperationResult | null> {
  const escritorioId = opts.user?.escritorioId ?? null;
  if (!escritorioId) return null;

  /** Libera a reserva FLASH (a tentativa original falhou) ANTES do fallback
   *  PRO. O fallback só ocorre para falhas CONFIRMADAS (429/5xx/4xx — o
   *  provedor respondeu com erro sem geração), portanto a liberação é INTEGRAL
   *  e a tentativa é marcada com o motivo REAL (fallback-flash-pro), não como
   *  uso ambíguo. Se a liberação falhar, sinaliza compensação pendente. */
  const liberarFlash = async (): Promise<{ ok: boolean; pendencia?: string }> => {
    const release = await releaseAiUsageReservation({
      operationId: opts.operationIdFlash,
      reason: 'fallback-flash-pro (falha confirmada sem geração; reserva devolvida)',
      req: opts.req,
    });
    if (!release.ok && !release.alreadyReleased) {
      return { ok: false, pendencia: release.reason ?? 'release-flash-falhou' };
    }
    // Marcação PERSISTENTE do motivo real do fallback (auditável/pesquisável).
    // OBRIGATÓRIA: se a marcação falhar, o fallback NÃO prossegue — sem a
    // marcação a origem do PRO não seria auditável.
    try {
      const res = await db.execute(sql`
        UPDATE ai_operations
        SET fallback_reason = 'fallback-flash-pro', updated_at = now()
        WHERE id = ${opts.operationIdFlash}
        RETURNING id
      `) as any[];
      const afetadas = Array.isArray(res) ? res.length : 0;
      if (afetadas === 0) {
        return { ok: false, pendencia: 'marcacao-fallback-falhou (operação não encontrada)' };
      }
    } catch {
      return { ok: false, pendencia: 'marcacao-fallback-falhou (erro de banco)' };
    }
    return { ok: true };
  };

  const motivo = 'flash-falhou-retryable: fallback para pro';
  if (opts.req) {
    await recordAudit(opts.req, 'AI_FALLBACK_FLASH_PRO', {
      alvoId: null,
      detalhes: { operation: opts.op, motivo },
    }).catch(() => {});
  }

  // 1. LIBERA a reserva FLASH ANTES de reservar o PRO: a tentativa original
  //    falhou; os créditos/orçamento liberados ficam disponíveis para a
  //    reexecução PRO. A revalidação de orçamento do PRO considera APENAS o
  //    custo do PRO (sem exigir FLASH+PRO simultâneos). Como a falha é
  //    retryable (timeout/rede/5xx/429), o provedor PODE ter processado a
  //    requisição: a liberação registra consumo parcial mínimo (faturável).
  const liberouFlashAntes = await liberarFlash();
  if (!liberouFlashAntes.ok) {
    return {
      ok: false,
      code: 'compensacao-pendente',
      reason: 'Falha ao liberar a reserva FLASH antes do fallback PRO. Compensação pendente; verifique os registros.',
    };
  }

  // 2. Revalidação FINANCEIRA INTEGRAL do PRO: recomputa a estimativa da
  //    operação (créditos/limites do catálogo) e recalcula o custo com os
  //    preços do modelo PRO (3x Flash default). Nenhum campo financeiro da
  //    estimativa FLASH é herdado por spread — o reserveAiUsage revalida o
  //    orçamento (maxReserveCents/créditos) com a estimativa PRO completa.
  const pico = isHorarioPico();
  const limitesPro = OPERATION_LIMITS[opts.op as AiOperationType];
  // A revalidação financeira do PRO usa os TOKENS ESTIMADOS da MESMA operação
  // (páginas/conteúdo idênticos — só o MODELO muda) e recalcula o custo com os
  // preços do PRO. `creditsRequired` é re-derivado do catálogo da OPERAÇÃO
  // (crédito por operação, não por modelo), nunca herdado da estimativa FLASH.
  const custoPro = calculateAiCostCents({
    model: deepseekModelPro,
    inputTokens: opts.estimate.inputTokensEstimated,
    outputTokens: opts.estimate.outputTokensEstimated,
    isPeak: pico,
  });
  const estimativaPro: AiEstimateResult = {
    ...opts.estimate,
    creditsRequired: limitesPro.credits, // crédito da OPERAÇÃO (catálogo)
    estimatedCostCents: custoPro.brlCents,
    estimatedUsdCents: custoPro.usdCents,
  };

  // 3. Reserva do PRO com chave DERIVADA (sufixo ':pro') — o reserveAiUsage
  //    revalida o orçamento (maxReserveCents/créditos) com o custo PRO apenas.
  const chavePro = `${PREFIXO_CHAVE_FALLBACK}${opts.idempotencyKey}:pro`;
  const fingerprintPro = fingerprintDaOperacao(escritorioId, chavePro, opts.inputCanonico, opts.op);
  let reservaPro;
  try {
    reservaPro = await reserveAiUsage({
      escritorioId,
      usuarioId: opts.user?.id ?? null,
      idempotencyKey: chavePro,
      idempotencyFingerprint: fingerprintPro,
      operation: opts.op as AiOperationType,
      estimate: estimativaPro,
      // Rastreabilidade financeira (3B): a operação PRO nasce APONTANDO para a
      // FLASH que falhou — gravado ATÔMICO no insert da reserva. Sem isso o
      // fallback NÃO é executado (não há liquidação órfã sem vínculo).
      parentOperationId: opts.operationIdFlash ?? null,
      req: opts.req,
    });
  } catch {
    // Falha de banco/infraestrutura na reserva do PRO: retorna resultado
    // CONTROLADO (nunca deixa a exceção escapar de runAiOperation). A FLASH
    // já foi liberada acima; a reserva PRO pode ter sido criada parcialmente
    // e é compensada pela chave abaixo (idempotência).
    const rows = (await db.execute(sql`
      SELECT id FROM ai_operations WHERE escritorio_id = ${escritorioId} AND idempotency_key = ${chavePro} LIMIT 1
    `).catch(() => [])) as any[];
    const opIdResidual = rows[0]?.id ? String(rows[0].id) : null;
    if (opIdResidual) {
      const release = await releaseAiUsageReservation({ operationId: opIdResidual, reason: 'fallback-pro-reserva-excecao', req: opts.req }).catch(() => null);
      const pendencia = release && !release.ok && !release.alreadyReleased ? release.reason ?? 'release-pro-falhou' : null;
      if (pendencia) {
        return { ok: false, code: 'compensacao-pendente', reason: 'Falha de infraestrutura na reserva PRO e a liberação residual falhou. Compensação pendente; verifique os registros.' };
      }
    }
    return {
      ok: false,
      code: 'falha-temporaria',
      reason: 'Falha temporária ao preparar a reexecução; tente novamente.',
    };
  }
  if (!reservaPro.ok) {
    // Sem orçamento para o PRO: NUNCA executa Pro sem saldo. A FLASH já foi
    // liberada acima — nenhuma reserva pendente.
    return {
      ok: false,
      code: 'REQUIRES_ADDITIONAL_CREDITS',
      reason: 'Orçamento insuficiente para reexecutar com o modelo PRO; reserva FLASH liberada.',
    };
  }

  // 4. IDEMPOTÊNCIA do PRO: se a chave ':pro' já existir (retry legítimo da
  //    mesma operação lógica), reutiliza o estado persistido — NUNCA regera
  //    uma execução PRO já liquidada nem duplica débito.
  if (reservaPro.alreadyReserved) {
    // Valida o fingerprint: mesma chave com conteúdo diferente é conflito.
    if (reservaPro.idempotencyFingerprint && reservaPro.idempotencyFingerprint !== fingerprintPro) {
      return {
        ok: false,
        code: 'idempotencia-conflito',
        reason: 'A chave de fallback PRO foi usada com payload/classificação diferente.',
      };
    }
    const statusPro = reservaPro.status ?? 'reserved';
    if (statusPro === 'succeeded') {
      // PRO já liquidado em retry anterior: reutiliza (sem nova geração).
      return {
        ok: true,
        phase: 'ja-liquidado',
        operationId: reservaPro.operationId ?? null,
        classification: opts.classification,
        estimate: estimativaPro,
        creditsReserved: reservaPro.creditsReserved ?? null,
        costCentsReserved: reservaPro.costCentsReserved ?? null,
        modelUsed: null,
        tokensIn: 0,
        tokensOut: 0,
        warnings: [...opts.payloadWarnings, `Fallback automático reutilizado: ${motivo}`],
        fingerprint: fingerprintPro,
      };
    }
    if (statusPro === 'running' || statusPro === 'reserved') {
      return {
        ok: true,
        phase: 'em-execucao',
        operationId: reservaPro.operationId ?? null,
        classification: opts.classification,
        estimate: estimativaPro,
        creditsReserved: reservaPro.creditsReserved ?? null,
        costCentsReserved: reservaPro.costCentsReserved ?? null,
        modelUsed: null,
        tokensIn: 0,
        tokensOut: 0,
        warnings: [...opts.payloadWarnings, `Fallback PRO já em curso: ${motivo}`],
        fingerprint: fingerprintPro,
      };
    }
    return {
      ok: false,
      code: 'fallback-pro-indisponivel',
      reason: `Fallback PRO já finalizado com status ${statusPro}; sem nova execução.`,
    };
  }

  // 5. Executa o PRO com a NOVA operação. O vínculo parent→FLASH já foi
  //    gravado ATÔNOMICAMENTE na criação da reserva (passo 3) — não há
  //    liquidação órfã possível sem rastreabilidade.
  const operationIdPro = reservaPro.operationId ?? null;
  if (!operationIdPro) {
    // Reserva PRO criada mas operationId ausente (resposta incompleta da
    // camada de uso): COMPENSA a reserva PRO antes de retornar — nenhuma
    // reserva sem caminho de compensação. A liberação usa o operationId REAL
    // buscado pela chave de idempotência (nunca a chave em si).
    let operationIdProReal: string | null = null;
    try {
      const rows = (await db.execute(sql`
        SELECT id FROM ai_operations WHERE escritorio_id = ${escritorioId} AND idempotency_key = ${chavePro} LIMIT 1
      `)) as any[];
      operationIdProReal = rows[0]?.id ? String(rows[0].id) : null;
    } catch {
      operationIdProReal = null;
    }
    const releasePro = operationIdProReal
      ? await releaseAiUsageReservation({ operationId: operationIdProReal, reason: 'fallback-pro-reserva-incompleta', req: opts.req })
      : null;
    const pendencia = releasePro && !releasePro.ok && !releasePro.alreadyReleased ? releasePro.reason ?? 'release-pro-falhou' : null;
    return {
      ok: false,
      code: pendencia ? 'compensacao-pendente' : 'fallback-pro-indisponivel',
      reason: pendencia
        ? 'Reserva PRO sem operationId e a liberação falhou. Compensação pendente; verifique os registros.'
        : 'Reserva PRO sem operationId; reserva liberada.',
    };
  }
  // Vínculo de rastreabilidade gravado na CRIAÇÃO da reserva (passo 3, atômico).
  try {
    const gen = await opts.generate({ operationId: operationIdPro, payload: opts.classification, modelTier: 'PRO' });
    const settle = await settleAiUsage({
      operationId: operationIdPro,
      modelUsed: gen.modelUsed,
      inputTokens: gen.inputTokens,
      outputTokens: gen.outputTokens,
      req: opts.req,
    });
    if (settle.ok || settle.alreadySettled) {
      return {
        ok: true,
        phase: 'sucesso',
        operationId: operationIdPro,
        classification: opts.classification,
        estimate: estimativaPro,
        creditsReserved: reservaPro.creditsReserved ?? null,
        costCentsReserved: reservaPro.costCentsReserved ?? null,
        modelUsed: gen.modelUsed,
        tokensIn: gen.inputTokens,
        tokensOut: gen.outputTokens,
        warnings: [...opts.payloadWarnings, `Fallback automático: ${motivo}`],
        fingerprint: fingerprintPro,
      };
    }
    // Settle do PRO falhou: libera a reserva PRO (erro NÃO suprimido) e
    // devolve null — sem débito duplicado nem crédito preso.
    const releasePro = await releaseAiUsageReservation({ operationId: operationIdPro, reason: 'fallback-pro-settle-falhou', req: opts.req });
    const pendenciaPro = !releasePro.ok && !releasePro.alreadyReleased ? releasePro.reason ?? 'release-pro-falhou' : null;
    if (pendenciaPro) {
      return {
        ok: false,
        code: 'compensacao-pendente',
        reason: 'Fallback PRO: falha ao liquidar e a liberação da reserva PRO falhou. Compensação pendente; verifique os registros.',
      };
    }
    return null;
  } catch (errPro) {
    // Geração PRO falhou. Se AMBÍGUA (sem resposta do provedor), a reserva PRO
    // é RETIDA e marcada para reconciliação (nunca devolução integral de
    // chamada possivelmente faturada); se confirmada, é liberada.
    if (ehFalhaAmbígua(errPro)) {
      const marcou = await marcarUsoAmbiguo(operationIdPro);
      if (!marcou) {
        return {
          ok: false,
          code: 'compensacao-pendente',
          reason: 'Falha ambígua na reexecução PRO e a marcação persistente de reconciliação falhou. Compensação pendente; verifique os registros.',
        };
      }
      return {
        ok: false,
        code: 'fallback-pro-ambigua-reconciliacao-pendente',
        reason: 'Falha sem resposta do provedor na reexecução PRO; uso possivelmente faturado e em reconciliação.',
      };
    }
    // Falha CONFIRMADA do PRO: libera a reserva PRO (erro NÃO suprimido).
    const releasePro = await releaseAiUsageReservation({ operationId: operationIdPro, reason: 'fallback-pro-geracao-falhou', req: opts.req });
    const pendenciaPro = !releasePro.ok && !releasePro.alreadyReleased ? releasePro.reason ?? 'release-pro-falhou' : null;
    if (pendenciaPro) {
      return {
        ok: false,
        code: 'compensacao-pendente',
        reason: 'Fallback PRO: falha na reexecução e a liberação da reserva PRO falhou. Compensação pendente; verifique os registros.',
      };
    }
    return null;
  }
}
