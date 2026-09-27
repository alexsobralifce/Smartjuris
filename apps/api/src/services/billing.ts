// ===========================================================================
// billing.ts — Assinatura recorrente via Mercado Pago (Subscriptions).
//
// Fluxo (Checkout Pro redirect + webhooks):
//   1. Admin do escritório escolhe o plano → POST /api/billing/checkout
//      cria um preapproval (assinatura) no Mercado Pago com `auto_recurring`
//      mensal, `external_reference` = escritorioId e `back_url` para retorno.
//   2. O admin é redirecionado ao `init_point` (página do Mercado Pago).
//   3. O Mercado Pago notifica via webhook (payment / subscription_preapproval)
//      e o backend ativa/desativa o escritório conforme o status.
//
// Sem dependências novas: usa fetch nativo (Node 22+) contra a API REST.
// ===========================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, and, gte, or, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios, billingWebhookEvents, billingCheckoutOperations, billingEscritorioLocks } from '../db/schema.js';
import { sendRootPagamentoAprovadoEmail, sendRootAssinaturaDesativadaEmail } from './email.js';

const MP_BASE = 'https://api.mercadopago.com';
const MP_TOKEN: string = process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '';

/** true quando há access token configurado (produção ou sandbox TEST-*). */
export const MP_CONFIGURADO = MP_TOKEN.length > 0;

// ---------------------------------------------------------------------------
// Planos de assinatura (R$/mês) — os valores cobrados pelo Mercado Pago.
// `codigo` é o plano gravado no escritório (aliases aceitos pelo normalizePlan);
// `creditos` é a recarga mensal de créditos (fonte: PricingSection/PLAN_LIMITS).
// ---------------------------------------------------------------------------
export interface PlanoAssinatura {
  codigo: 'basico' | 'profissional' | 'office';
  precoMensal: number; // R$ por mês
  creditos: number;    // créditos recarregados por ciclo
  rotulo: string;
}

export const BILLING_PLANS: Record<string, PlanoAssinatura> = {
  basico: { codigo: 'basico', precoMensal: 180, creditos: 20, rotulo: 'Básico' },
  intermediario: { codigo: 'profissional', precoMensal: 300, creditos: 50, rotulo: 'Intermediário' },
  profissional: { codigo: 'profissional', precoMensal: 300, creditos: 50, rotulo: 'Intermediário' },
  avancado: { codigo: 'office', precoMensal: 500, creditos: 100, rotulo: 'Avançado' },
  office: { codigo: 'office', precoMensal: 500, creditos: 100, rotulo: 'Avançado' },
  enterprise: { codigo: 'office', precoMensal: 500, creditos: 100, rotulo: 'Avançado' },
};

export function planoAssinatura(plano: string | null | undefined): PlanoAssinatura | null {
  if (!plano) return null;
  // Normaliza: minúsculas e remove acentos (Básico/Intermediário/Avançado).
  const key = plano.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return BILLING_PLANS[key] ?? null;
}

export function listarPlanosAssinatura(): PlanoAssinatura[] {
  const vistos = new Set<string>();
  const planos: PlanoAssinatura[] = [];
  for (const key of Object.keys(BILLING_PLANS)) {
    const p = BILLING_PLANS[key];
    if (!vistos.has(p.codigo)) {
      vistos.add(p.codigo);
      planos.push(p);
    }
  }
  return planos;
}

// ---------------------------------------------------------------------------
// Cliente REST do Mercado Pago
// ---------------------------------------------------------------------------

interface MpResponse {
  ok: boolean;
  status: number;
  data: any;
}

async function mpFetch(path: string, options: RequestInit = {}): Promise<MpResponse> {
  if (!MP_TOKEN) {
    return { ok: false, status: 503, data: { error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado.' } };
  }
  const res = await fetch(`${MP_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MP_TOKEN}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

export interface CriarAssinaturaInput {
  escritorioId: string;
  plano: string;
  payerEmail: string;
  backUrl: string;
  notificationUrl: string;
  /** Chave estável por OPERAÇÃO (outbox): retries usam a mesma chave. */
  idempotencyKey?: string;
  /** Data ISO da 1ª cobrança (auto_recurring.start_date) — ex.: now+30d. */
  startDate?: string;
}

export interface AssinaturaCriada {
  id: string;
  initPoint: string;
  status: string;
  externalReference: string;
}

/** Cria um preapproval (assinatura recorrente) no Mercado Pago.
 *  Usa X-Idempotency-Key estável por OPERAÇÃO (padrão: escritorioId:plano):
 *  retries do MESMO checkout retornam o MESMO preapproval — cobranças
 *  recorrentes nunca duplicam. */
export async function criarAssinatura(input: CriarAssinaturaInput): Promise<AssinaturaCriada> {
  const cfg = planoAssinatura(input.plano);
  if (!cfg) {
    throw new Error(`Plano de assinatura inválido: ${input.plano}`);
  }
  const idempotencyKey = input.idempotencyKey ?? `sj-checkout-${input.escritorioId}-${cfg.codigo}`;
  const { ok, status, data } = await mpFetch('/preapproval', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      reason: `SmartJuris — Plano ${cfg.rotulo}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: cfg.precoMensal,
        currency_id: 'BRL',
        ...(input.startDate ? { start_date: input.startDate } : {}),
      },
      payer_email: input.payerEmail,
      external_reference: input.escritorioId,
      back_url: input.backUrl,
      notification_url: input.notificationUrl,
    }),
  });
  if (!ok) {
    throw new Error(`Mercado Pago falhou ao criar assinatura (${status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  return {
    id: String(data.id),
    initPoint: String(data.init_point ?? ''),
    status: String(data.status ?? 'pending'),
    externalReference: String(data.external_reference ?? ''),
  };
}

/** Consulta o preapproval (assinatura) pelo id no Mercado Pago. */
export async function obterPreapproval(id: string): Promise<any> {
  const { ok, status, data } = await mpFetch(`/preapproval/${encodeURIComponent(id)}`);
  if (!ok) {
    throw new Error(`Mercado Pago falhou ao consultar assinatura (${status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

/** Cancela um preapproval no Mercado Pago (status → cancelled). */
export async function cancelarPreapproval(id: string): Promise<void> {
  const { ok, status, data } = await mpFetch(`/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  });
  if (!ok) {
    throw new Error(`Mercado Pago falhou ao cancelar assinatura (${status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
}

/**
 * Consulta o preapproval pendente no Mercado Pago e devolve o init_point
 * (URL de autorização) para o usuário RETOMAR o pagamento. Retorna null se o
 * recurso não estiver acessível ou já não estiver pendente.
 */
export async function obterInitPointPendente(preapprovalId: string): Promise<string | null> {
  try {
    const preapproval = await obterPreapproval(preapprovalId);
    if (preapproval.status === 'pending' || preapproval.status === 'authorized') {
      return preapproval.init_point ? String(preapproval.init_point) : null;
    }
    return null;
  } catch (e) {
    console.warn('[Billing] Falha ao consultar init_point do preapproval pendente:', (e as Error).message);
    return null;
  }
}

/**
 * Reconciliação/recuperação: busca no Mercado Pago o preapproval criado por
 * uma chamada anterior cuja gravação local não concluiu (falha após o efeito
 * remoto). Usa external_reference (id do escritório) para localizar o recurso
 * real — retries recuperam em vez de duplicar. Retorna o preapproval ou null.
 *
 * SEGURA: valida o estado remoto ANTES de reutilizar — apenas recursos
 * PENDING ou AUTHORIZED são reutilizáveis; preapprovals CANCELADOS ou de
 * outra tentativa são ignorados (retorna null → o checkout cria novo).
 */
export async function buscarPreapprovalPorReferencia(externalReference: string): Promise<any | null> {
  try {
    const { ok, status, data } = await mpFetch(
      `/preapproval/search?external_reference=${encodeURIComponent(externalReference)}&status=all&limit=10`,
    );
    if (!ok) {
      console.warn(`[Billing] Falha ao reconciliar preapproval por external_reference (${status})`);
      return null;
    }
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) return null;
    // Mais recente primeiro (o atual).
    results.sort((a, b) => String(b.last_modified ?? '').localeCompare(String(a.last_modified ?? '')));
    // Valida o estado: só reutiliza PENDING/AUTHORIZED (pagável/reutilizável).
    // CANCELADO/PAUSED/atribuído a outra tentativa → ignora (null).
    const reutilizavel = results.find((p) => {
      const st = String(p.status ?? '');
      return st === 'pending' || st === 'authorized';
    });
    return reutilizavel ?? null;
  } catch (e) {
    console.warn('[Billing] Falha ao reconciliar preapproval por referência:', (e as Error).message);
    return null;
  }
}

/**
 * Fase 7E — Assinatura DEFINITIVA pós 1ª compra promocional:
 * cria o preapproval com valor INTEGRAL e 1ª cobrança em ~30 dias
 * (`auto_recurring.start_date` = now + 30d). Idempotente:
 *   - reconcilia primeiro por external_reference (se um preapproval pendente/
 *     authorized do mesmo escritório JÁ existe, reutiliza — nunca duplica);
 *   - X-Idempotency-Key estável por (escritório, plano) para retries.
 *
 * A startDate RETORNADA é a data REAL do preapproval (extraída do recurso no
 * MP após criar/reutilizar): retries tardios preservam a MESMA 1ª cobrança e
 * a próxima cobrança local é gravada corretamente.
 */
export async function criarAssinaturaDefinitivaPromocional(
  input: CriarAssinaturaInput,
): Promise<AssinaturaCriada & { startDate?: string }> {
  const cfg = planoAssinatura(input.plano);
  if (!cfg) {
    throw new Error(`Plano de assinatura inválido: ${input.plano}`);
  }

  // 1) Reconciliação: efeito remoto anterior pode ter criado o preapproval
  //    (falha ambígua/gravação local perdida) — reutiliza em vez de duplicar.
  const existente = await buscarPreapprovalPorReferencia(input.escritorioId);
  if (existente?.id) {
    const startDate = await extrairStartDatePreapproval(String(existente.id));
    return {
      id: String(existente.id),
      initPoint: String(existente.init_point ?? ''),
      status: String(existente.status ?? 'pending'),
      externalReference: String(existente.external_reference ?? ''),
      startDate: startDate ?? undefined,
    };
  }

  // 2) 1ª cobrança da recorrência em ~30 dias (valor integral).
  const startDateCalculada = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const criada = await criarAssinatura({
    ...input,
    startDate: startDateCalculada,
    idempotencyKey: input.idempotencyKey ?? `sj-promo-final-${input.escritorioId}-${cfg.codigo}`,
  });
  // Data REAL do preapproval criado (fallback: a calculada).
  const startDateReal = (await extrairStartDatePreapproval(criada.id)) ?? startDateCalculada;
  return { ...criada, startDate: startDateReal };
}

/** Lê auto_recurring.start_date do preapproval no MP (null se indisponível). */
async function extrairStartDatePreapproval(preapprovalId: string): Promise<string | null> {
  try {
    const preapproval = await obterPreapproval(preapprovalId);
    const raw = preapproval?.auto_recurring?.start_date ?? preapproval?.start_date;
    if (!raw) return null;
    const ts = Date.parse(String(raw));
    return Number.isFinite(ts) ? String(raw) : null;
  } catch (e) {
    console.warn('[Billing] Falha ao ler start_date do preapproval:', (e as Error).message);
    return null;
  }
}

/**
 * Fase 7E — Vincula a assinatura definitiva ao escritório (local, sem chamada
 * remota): mercado_pago_id, status pendente, plano e próxima cobrança. Usado
 * pelo webhook da 1ª compra para persistir o preapproval criado.
 *
 * NUNCA REGRIDE o status: se o escritório já está `ativa` (pagou a 1ª compra
 * avulsa), o status permanece `ativa` — o vínculo do preapproval definitivo é
 * adicionado (id + plano + próxima cobrança); o webhook `authorized` do
 * preapproval confirma a recorrência.
 */
export async function vincularAssinaturaDefinitiva(
  escritorioId: string,
  assinatura: AssinaturaCriada,
  plano: string,
  startDate?: string | null,
  exec: any = db,
): Promise<boolean> {
  const cfg = planoAssinatura(plano);
  const [esc] = await exec.select({ id: escritorios.id, assinaturaStatus: escritorios.assinaturaStatus })
    .from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) return false;
  const patch: Record<string, any> = {
    mercadoPagoId: assinatura.id,
    assinaturaPlano: cfg?.codigo ?? plano,
  };
  // Só marca `pendente` se o escritório ainda não está ativo (sem regressão).
  if (esc.assinaturaStatus !== 'ativa') {
    patch.assinaturaStatus = 'pendente';
  }
  if (startDate) patch.assinaturaProximaCobranca = new Date(startDate);
  await exec.update(escritorios).set(patch).where(eq(escritorios.id, escritorioId));
  return true;
}

/** Plano gravado no claim promocional (7D) — fonte do plano da 1ª compra. */
export async function planoPromocionalDoEscritorio(escritorioId: string): Promise<string | null> {
  const [esc] = await db.select({ promocaoPlano: escritorios.promocaoPlano })
    .from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  return esc?.promocaoPlano ?? null;
}


export async function adquirirOperacaoCheckout(
  idempotencyKey: string,
  fase: string,
): Promise<boolean> {
  try {
    const leaseMs = Number(process.env.MERCADO_PAGO_CHECKOUT_LEASE_MS ?? 5 * 60 * 1000);
    const lease = new Date(Date.now() - leaseMs).toISOString();
    const atualizados = await db.execute(sql`
      UPDATE billing_checkout_operations
      SET fase = ${fase},
          processando_em = now(),
          updated_at = now()
      WHERE idempotency_key = ${idempotencyKey}
        AND (
          processando_em IS NULL
          OR processando_em < ${lease}::timestamptz
        )
      RETURNING id
    `);
    return (atualizados as any[]).length > 0;
  } catch (e) {
    // FAIL-CLOSED: sem lease confirmado, NENHUMA chamada remota pode ocorrer —
    // propaga o erro (o checkout retorna 500 e não toca o Mercado Pago).
    console.error('[Billing] Falha ao adquirir lease da operação de checkout (fail-closed):', (e as Error).message);
    throw new Error('Não foi possível confirmar o lease da operação de checkout. ' + (e as Error).message);
  }
}

/** Libera o lease da operação (concluiu). */
export async function liberarOperacaoCheckout(idempotencyKey: string): Promise<void> {
  try {
    await db.update(billingCheckoutOperations)
      .set({ processandoEm: null, updatedAt: new Date() })
      .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
  } catch (e) {
    console.warn('[Billing] Falha ao liberar lease da operação:', (e as Error).message);
  }
}

/** Duração máxima do lock por escritório (worker morto não trava o escritório). */
const ESCRITORIO_LOCK_MS = Number(process.env.MERCADO_PAGO_ESCRITORIO_LOCK_MS ?? 10 * 60 * 1000);

/**
 * Adquire o lease atômico POR ESCRITÓRIO (válido durante toda a operação
 * remota). Atômico via INSERT ... ON CONFLICT: se outro checkout/cancelamento
 * do mesmo escritório está em andamento, retorna false (409). Lock expirado
 * é re-adquirido (UPDATE condicional). Fail-closed: erro → false.
 */
export async function adquirirLockEscritorio(
  escritorioId: string,
  dono: string,
): Promise<boolean> {
  try {
    const inseridos = await db.insert(billingEscritorioLocks).values({
      escritorioId,
      dono,
      processandoEm: new Date(),
    }).onConflictDoNothing().returning({ escritorioId: billingEscritorioLocks.escritorioId });
    if (inseridos.length > 0) return true;

    // Conflito: re-adquire se o lock anterior expirou (worker morto).
    const ttl = new Date(Date.now() - ESCRITORIO_LOCK_MS).toISOString();
    const atualizados = await db.execute(sql`
      UPDATE billing_escritorio_locks
      SET processando_em = now(), dono = ${dono}
      WHERE escritorio_id = ${escritorioId}
        AND processando_em < ${ttl}::timestamptz
      RETURNING escritorio_id
    `);
    return (atualizados as any[]).length > 0;
  } catch (e) {
    console.error('[Billing] Falha ao adquirir lock do escritório (fail-closed):', (e as Error).message);
    return false;
  }
}

/** Libera o lease por escritório (sucesso ou falha — finally). */
export async function liberarLockEscritorio(escritorioId: string): Promise<void> {
  try {
    await db.delete(billingEscritorioLocks).where(eq(billingEscritorioLocks.escritorioId, escritorioId));
  } catch (e) {
    console.warn('[Billing] Falha ao liberar lock do escritório:', (e as Error).message);
  }
}

/** Consulta um pagamento pelo id no Mercado Pago. */
export async function obterPayment(id: string): Promise<any> {
  const { ok, status, data } = await mpFetch(`/v1/payments/${encodeURIComponent(id)}`);
  if (!ok) {
    throw new Error(`Mercado Pago falhou ao consultar pagamento (${status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Checkout PROMOCIONAL (1ª compra avulsa — Fase 7D)
//
// Opção C: a 1ª compra é um pagamento AVULSO com o valor promocional (50% OFF)
// via Preferences API (/checkout/preferences); a assinatura recorrente integral
// começa no 2º mês (criada na 7E após o webhook do pagamento aprovado).
// O valor NUNCA vem do cliente: é calculado no backend (promocao.ts).
// ---------------------------------------------------------------------------

/** Prefijo do external_reference da preference promocional (marcador p/ webhook). */
export const REFERENCIA_PROMOCIONAL_PREFIXO = 'sj-promo:';

/**
 * Erro da API do Mercado Pago com o STATUS HTTP REAL (numérico). A distinção
 * definitiva/ambígua NUNCA pode depender do corpo da mensagem (um 5xx pode
 * conter termos como "invalid" no corpo retornado pelo provedor).
 */
export class MpApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'MpApiError';
    this.status = status;
  }
}

/**
 * Classifica uma falha da API do Mercado Pago pelo STATUS HTTP real:
 *   - DEFINITIVA (retorna false p/ `incerta`): erro 4xx/payload rejeitado —
 *     CONFIRMADAMENTE sem efeito remoto (nada foi criado).
 *   - AMBÍGUA (retorna true p/ `incerta`): timeout, 5xx, rede, abort ou
 *     resposta incompleta — NÃO sabemos se o recurso foi criado no MP.
 * Erros SEM status numérico (falha de rede/timeout/abort) são AMBÍGUOS por
 * padrão (nunca se assume que o efeito não ocorreu).
 */
export function falhaMpIncerta(e: unknown): boolean {
  const status = Number((e as any)?.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return false; // 4xx: rejeição CONFIRMADA, sem efeito remoto
  }
  return true; // 5xx, sem status (rede/timeout), resposta incompleta → ambíguo
}

export interface CriarPreferencePromocionalInput {
  escritorioId: string;
  plano: string;
  /** Valor promocional em centavos — SEMPRE calculado no backend (promocao.ts). */
  valorPromocionalCents: number;
  payerEmail: string;
  backUrl: string;
  notificationUrl: string;
  /** Chave estável por OPERAÇÃO (outbox): retries usam a mesma chave. */
  idempotencyKey?: string;
}

export interface PreferenceCriada {
  id: string;
  initPoint: string;
  status: string;
  externalReference: string;
}

/**
 * Cria a PREFERENCE (pagamento avulso) promocional no Mercado Pago.
 * - `unit_price` = valor promocional (backend, em R$);
 * - `external_reference` = `sj-promo:<escritorioId>` — marcador que a 7E usa
 *   no webhook para identificar a 1ª compra promocional;
 * - X-Idempotency-Key estável por operação (retries não duplicam preference).
 */
export async function criarPreferencePromocional(input: CriarPreferencePromocionalInput): Promise<PreferenceCriada> {
  const cfg = planoAssinatura(input.plano);
  if (!cfg) {
    throw new Error(`Plano de assinatura inválido: ${input.plano}`);
  }
  // Defesa em profundidade: o valor promocional é validado aqui também.
  if (!Number.isInteger(input.valorPromocionalCents) || input.valorPromocionalCents <= 0) {
    throw new Error('Valor promocional inválido (deve ser calculado no backend).');
  }
  const valorReais = input.valorPromocionalCents / 100;
  const externalReference = `${REFERENCIA_PROMOCIONAL_PREFIXO}${input.escritorioId}`;
  const idempotencyKey = input.idempotencyKey ?? `sj-promo-checkout-${input.escritorioId}-${cfg.codigo}`;

  const { ok, status, data } = await mpFetch('/checkout/preferences', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      items: [{
        id: `sj-plano-${cfg.codigo}-promo-1mes`,
        title: `SmartJuris — Plano ${cfg.rotulo} (1º mês promocional)`,
        description: `Assinatura SmartJuris ${cfg.rotulo} — primeira mensalidade com desconto promocional. A recorrência integral (R$ ${cfg.precoMensal.toFixed(2)}) começa no 2º mês.`,
        quantity: 1,
        unit_price: valorReais,
        currency_id: 'BRL',
      }],
      payer: { email: input.payerEmail },
      external_reference: externalReference,
      back_urls: {
        success: input.backUrl,
        pending: input.backUrl,
        failure: input.backUrl,
      },
      auto_return: 'approved',
      notification_url: input.notificationUrl,
      statement_descriptor: 'SMARTJURIS',
      metadata: {
        escritorio_id: input.escritorioId,
        plano: cfg.codigo,
        promocional: true,
        valor_promocional_cents: input.valorPromocionalCents,
      },
    }),
  });
  if (!ok) {
    throw new MpApiError(status, `Mercado Pago falhou ao criar preference promocional (${status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  // Resposta positiva só é aceita com os identificadores necessários para
  // continuar o fluxo (fail-closed): sem id/init_point o resultado é AMBÍGUO
  // (não sabemos se o recurso foi criado) — lança para o retry reconciliar.
  if (!data?.id || !data.init_point) {
    throw new MpApiError(status, `Mercado Pago retornou resposta incompleta ao criar preference promocional (${status}): sem id/init_point`);
  }
  return {
    id: String(data.id),
    initPoint: String(data.init_point),
    status: String(data.status ?? ''),
    externalReference: String(data.external_reference ?? ''),
  };
}

/**
 * Reconciliação/recuperação: busca no Mercado Pago a PREFERENCE promocional
 * criada por uma chamada anterior cujo resultado foi AMBÍGUO (timeout/5xx/
 * resposta incompleta) — retries recuperam em vez de duplicar o benefício.
 * Usa o marcador `sj-promo:<escritorioId>` como external_reference.
 *
 * DISTINGUE os três casos (crítico para o anti-abuso):
 *   - { status: 'erro', preference: null }        → busca INCONCLUSIVA (falha
 *     de rede/5xx) — NÃO é ausência confirmada; quem chama NUNCA deve
 *     desmarcar a promoção;
 *   - { status: 'ok', preference: null }          → ausência CONFIRMADA (busca
 *     OK, sem resultado) — seguro prosseguir/desmarcar conforme o fluxo;
 *   - { status: 'ok', preference }                → preference ENCONTRADA (a
 *     MAIS RECENTE, QUALQUER status). O chamador decide pelo `status`:
 *     active/pending → recuperável (init_point); approved/outros → pagamento
 *     já ocorreu (NUNCA tratado como ausência — bloqueia nova cobrança).
 */
export async function buscarPreferencePorReferencia(externalReference: string): Promise<
  { status: 'erro'; preference: null } | { status: 'ok'; preference: any | null }
> {
  try {
    const { ok, status, data } = await mpFetch(
      `/checkout/preferences/search?external_reference=${encodeURIComponent(externalReference)}&limit=10`,
    );
    if (!ok) {
      console.warn(`[Billing] Falha ao reconciliar preference por external_reference (${status})`);
      return { status: 'erro', preference: null };
    }
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) {
      return { status: 'ok', preference: null };
    }
    results.sort((a, b) => String(b.date_created ?? '').localeCompare(String(a.date_created ?? '')));
    return { status: 'ok', preference: results[0] ?? null };
  } catch (e) {
    console.warn('[Billing] Falha ao reconciliar preference por referência:', (e as Error).message);
    return { status: 'erro', preference: null };
  }
}

/**
 * Consulta o init_point de uma PREFERENCE existente (retomada/retry do
 * checkout promocional). Retorna null se o recurso não for acessível.
 */
export async function obterPreferenceInitPoint(preferenceId: string): Promise<string | null> {
  try {
    const { ok, status, data } = await mpFetch(`/checkout/preferences/${encodeURIComponent(preferenceId)}`);
    if (!ok) {
      console.warn(`[Billing] Falha ao consultar preference (${status})`);
      return null;
    }
    const initPoint = String(data.init_point ?? '');
    return initPoint || null;
  } catch (e) {
    console.warn('[Billing] Falha ao consultar init_point da preference:', (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validação de assinatura do webhook (x-signature)
// ---------------------------------------------------------------------------

/**
 * Valida o header `x-signature` do Mercado Pago (HMAC-SHA256 com o webhook
 * secret). Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 *
 * Fail-closed em produção: se MERCADO_PAGO_WEBHOOK_SECRET estiver ausente e
 * NODE_ENV=production, a assinatura é considerada INVÁLIDA (rejeita o webhook).
 * O bypass sem secret só é aceito em desenvolvimento/teste (com aviso).
 */
export function validarWebhookSignature(
  headers: Record<string, string | undefined>,
  body: { id?: string; type?: string },
): { valido: boolean; motivo?: string } {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  const xSignature = headers['x-signature'] ?? headers['X-Signature'];
  const xRequestId = headers['x-request-id'] ?? headers['X-Request-Id'];
  const dataId = body?.id ? String(body.id) : '';

  if (!secret) {
    if (isProd) {
      return { valido: false, motivo: 'MERCADO_PAGO_WEBHOOK_SECRET ausente em produção — webhook rejeitado (fail-closed).' };
    }
    return { valido: true, motivo: 'WEBHOOK_SECRET ausente — assinatura não verificada (apenas dev/teste).' };
  }
  if (!xSignature || !xRequestId || !dataId) {
    return { valido: false, motivo: 'Headers de assinatura incompletos.' };
  }

  // x-signature tem formato "ts=<ts>,v1=<hmac>" (vírgula separa pares; o
  // URLSearchParams padrão não trata vírgula como separador — parse manual).
  const params = new Map<string, string>();
  for (const parte of xSignature.split(',')) {
    const idx = parte.indexOf('=');
    if (idx > 0) params.set(parte.slice(0, idx).trim(), parte.slice(idx + 1).trim());
  }
  const ts = params.get('ts');
  const v1 = params.get('v1');
  if (!ts || !v1) {
    return { valido: false, motivo: 'x-signature sem ts/v1.' };
  }

  // Janela de tempo configurável (default 10 min): eventos muito antigos são
  // rejeitados (defesa contra replay de notificações antigas).
  const janelaMs = Number(process.env.MERCADO_PAGO_WEBHOOK_MAX_AGE_MS ?? 10 * 60 * 1000);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { valido: false, motivo: 'x-signature com ts inválido.' };
  }
  if (Date.now() - tsNum * 1000 > janelaMs) {
    return { valido: false, motivo: 'Evento expirado (ts fora da janela permitida).' };
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const esperado = createHmac('sha256', secret).update(manifest).digest('hex');
  const recebido = v1;

  // timingSafeEqual exige buffers de mesmo tamanho.
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (a.length !== b.length) {
    return { valido: false, motivo: 'Assinatura com comprimento inválido.' };
  }
  return timingSafeEqual(a, b) ? { valido: true } : { valido: false, motivo: 'Assinatura inválida.' };
}

// ---------------------------------------------------------------------------
// Aplicação de eventos no banco
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Resolução de escritório a partir de external_reference (id do escritório)
// ou do preapproval_id (fallback: pagamentos podem não herdar o
// external_reference do preapproval).
// ---------------------------------------------------------------------------

/** Busca o escritório pelo external_reference (uuid) ou pelo mercado_pago_id. */
async function escritorioPorReferencia(externalReference: string, preapprovalId?: string): Promise<string | null> {
  if (externalReference) {
    const [esc] = await db.select({ id: escritorios.id }).from(escritorios)
      .where(eq(escritorios.id, externalReference)).limit(1);
    if (esc) return esc.id;
    const [escPorMp] = await db.select({ id: escritorios.id }).from(escritorios)
      .where(eq(escritorios.mercadoPagoId, externalReference)).limit(1);
    if (escPorMp) return escPorMp.id;
  }
  if (preapprovalId) {
    const [esc] = await db.select({ id: escritorios.id }).from(escritorios)
      .where(eq(escritorios.mercadoPagoId, preapprovalId)).limit(1);
    if (esc) return esc.id;
  }
  return null;
}

/** Recarrega o ciclo de créditos do escritório (novo mês ou reativação).
 *  Aceita um executor transacional (tx) para atomicidade com o efeito. */
async function recarregarCiclo(
  escritorioId: string,
  cfg: PlanoAssinatura,
  forcar: boolean,
  exec: any = db,
): Promise<void> {
  const [esc] = await exec.select({ cycleMonth: escritorios.cycleMonth, assinaturaStatus: escritorios.assinaturaStatus })
    .from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) return;
  const cicloAtual = new Date().toISOString().slice(0, 7);
  const novoCiclo = esc.cycleMonth !== cicloAtual;
  const reativando = esc.assinaturaStatus !== 'ativa';
  if (forcar || novoCiclo || reativando) {
    await exec.update(escritorios).set({
      creditsAvailable: cfg.creditos,
      reserveCentsUsed: 0,
      cycleMonth: cicloAtual,
    }).where(eq(escritorios.id, escritorioId));
  }
}

/** Ativa o escritório após pagamento aprovado (aceita tx p/ atomicidade). */
export async function ativarEscritorio(
  escritorioId: string,
  plano: string,
  extra?: { proximaCobranca?: string | null; ultimaCobranca?: string | null },
  exec: any = db,
): Promise<boolean> {
  const cfg = planoAssinatura(plano);
  if (!cfg) return false;
  const [esc] = await exec.select({ id: escritorios.id }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) return false;

  await recarregarCiclo(escritorioId, cfg, false, exec);

  const patch: Record<string, any> = {
    plano: cfg.codigo,
    ativo: true,
    assinaturaStatus: 'ativa',
    assinaturaPlano: cfg.codigo,
    assinaturaExpiracao: null,
  };
  if (extra?.proximaCobranca) patch.assinaturaProximaCobranca = new Date(extra.proximaCobranca);
  if (extra?.ultimaCobranca) patch.assinaturaUltimaCobranca = new Date(extra.ultimaCobranca);
  await exec.update(escritorios).set(patch).where(eq(escritorios.id, escritorioId));
  return true;
}

/** Desativa o escritório por inadimplência/cancelamento (aceita tx). */
export async function desativarEscritorio(
  escritorioId: string,
  status: 'atrasada' | 'cancelada',
  exec: any = db,
): Promise<boolean> {
  const [esc] = await exec.select({ id: escritorios.id }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) return false;
  await exec.update(escritorios).set({
    ativo: false,
    assinaturaStatus: status,
    assinaturaExpiracao: new Date(),
  }).where(eq(escritorios.id, escritorioId));
  return true;
}

// ---------------------------------------------------------------------------
// Processamento de webhooks do Mercado Pago
// ---------------------------------------------------------------------------

export type WebhookResult =
  | { handled: true; acao: string; escritorioId?: string }
  | { handled: false; motivo: string };

/**
 * Processa uma notificação do Mercado Pago.
 * Tipos suportados:
 *   - `payment`: data.id é o id do pagamento (GET /v1/payments/:id).
 *   - `subscription_preapproval`: data.id é o id do preapproval (GET /preapproval/:id).
 *
 * Idempotência PERSISTIDA: antes de qualquer efeito, registra o evento em
 * billing_webhook_events com chave única (event_type, data_id). Replays/
 * reenvios do Mercado Pago (mesmo tipo + mesmo id) são ignorados — o efeito
 * só acontece UMA vez. A verificação e a gravação usam INSERT ... ON CONFLICT
 * DO NOTHING + RETURNING: se a linha já existir, nada é feito.
 */
export async function processarWebhook(payload: { type?: string; data?: { id?: string } }): Promise<WebhookResult> {
  const type = payload?.type;
  const dataId = payload?.data?.id ? String(payload.data.id) : '';
  if (!type || !dataId) {
    return { handled: false, motivo: 'Payload sem type/data.id.' };
  }

  try {
    // 1) CONSULTA do recurso no MP (GET, sem efeito): necessário para conhecer
    //    o ESTADO atual, usado na chave de deduplicação por transição.
    if (type === 'payment') {
      const payment = await obterPayment(dataId).catch((e: Error) => {
        console.error('[Billing] Falha ao consultar payment:', e.message);
        return null;
      });
      if (!payment) {
        // Registra a tentativa (estado 'DESCONHECIDO' — reprocessável) para
        // rastreabilidade; o retry do MP reconsultará.
        await finalizarEventoWebhook(type, dataId, 'DESCONHECIDO', 'MP_INDISPONIVEL: payment não consultável');
        return { handled: false, motivo: 'Payment não encontrado no Mercado Pago.' };
      }

      const externalReference = String(payment.external_reference ?? '');
      const preapprovalId = payment.preapproval_id ? String(payment.preapproval_id) : undefined;
      const status = String(payment.status ?? 'desconhecido');
      // Fase 7E — 1ª compra promocional: external_reference com o marcador
      // `sj-promo:<escritorioId>` (criado na 7D). O id do escritório é
      // extraído do marcador para a resolução do vínculo.
      const promocional = externalReference.startsWith(REFERENCIA_PROMOCIONAL_PREFIXO);
      const referenciaEscritorio = promocional
        ? externalReference.slice(REFERENCIA_PROMOCIONAL_PREFIXO.length)
        : externalReference;
      const escritorioId = await escritorioPorReferencia(referenciaEscritorio, preapprovalId);
      if (!escritorioId) {
        await registrarEventoFalho(type, dataId, status, 'SEM_VINCULO', 'payment sem vínculo com escritório');
        return { handled: false, motivo: 'Payment sem vínculo com escritório SmartJuris.' };
      }
      // 2) AQUISIÇÃO com chave (event_type, data_id, data_estado): cada
      //    transição do mesmo recurso é um evento distinto (1x). O INSERT já
      //    associa o escritório (usado pela ordenação por assinatura).
      const { adquirido, motivo } = await adquirirEventoWebhook(type, dataId, status, escritorioId);
      if (!adquirido) {
        return { handled: true, acao: motivo ?? 'evento não processado', escritorioId };
      }

      // Plano do pagamento: descrição do MP OU o plano gravado no checkout.
      // Na 1ª compra promocional (7E), o plano vem EXCLUSIVAMENTE do claim
      // persistido na 7D (promocao_plano) — dados do pagamento (description)
      // são descartados por serem manipuláveis.
      let plano: string;
      if (promocional) {
        const planoClaim = await planoPromocionalDoEscritorio(escritorioId);
        const cfgClaim = planoAssinatura(planoClaim);
        plano = cfgClaim?.codigo ?? 'basico';
      } else {
        const planoAssinado = await planoDoEscritorio(escritorioId);
        const cfg = planoAssinatura(String(payment.description ?? '')) ?? (planoAssinado ? planoAssinatura(planoAssinado) : null);
        plano = cfg?.codigo ?? 'basico';
      }

      // 3) EFEITO sob lock por assinatura (ordenação + mutação atômicas).
      const provedorTs = payment.date_created ? String(payment.date_created) : null;
      const execucao = await comLockPorAssinatura(escritorioId, provedorTs, async (tx) => {
        if (status === 'approved') {
          const ok = await ativarEscritorio(escritorioId, plano, {
            ultimaCobranca: payment.date_approved ? String(payment.date_approved) : null,
            proximaCobranca: payment.date_of_expiration ?? null,
          }, tx);
          await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
          return { ok, acao: 'payment.approved → escritório ativado', statusResult: 'ATIVADO' };
        }
        if (status === 'rejected' || status === 'charged_back' || status === 'cancelled') {
          const ok = await desativarEscritorio(escritorioId, 'atrasada', tx);
          await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
          return { ok, acao: `payment.${status} → escritório desativado`, statusResult: 'DESATIVADO' };
        }
        await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
        return { ok: true, acao: `payment.${status} — sem mudança de acesso`, statusResult: 'SEM_MUDANCA' };
      });

      if (execucao.obsoleto) {
        await finalizarEventoWebhook(type, dataId, status, 'OBSOLETO', `payment.${status} anterior ao estado aplicado`);
        return { handled: true, acao: 'evento obsoleto ignorado (ordenação)', escritorioId };
      }
      if (!execucao.resultado) {
        return { handled: false, motivo: 'Efeito sem resultado sob lock.' };
      }
      const { ok, acao, statusResult } = execucao.resultado;

      // 4) Fase 7E — 1ª compra promocional APROVADA: cria a assinatura
      //    DEFINITIVA (valor integral, 1ª cobrança ~30 dias) e vincula.
      //    Idempotente: reconciliação por external_reference + chave estável.
      //    Falha NÃO derruba a ativação (o pagamento avulso já foi pago), mas
      //    deixa o evento REPROCESSAVEL (`ERRO`): o reenvio do MP (ou um
      //    reprocessamento posterior) tenta recriar a recorrência — sem
      //    duplicar (reconciliação/chave estável) e sem expor detalhes do
      //    provedor ao chamador (fail-closed).
      let acaoFinal = acao;
      let statusFinal = statusResult;
      if (ok && promocional && status === 'approved') {
        try {
          const definitiva = await criarAssinaturaDefinitivaPromocional({
            escritorioId,
            plano,
            payerEmail: String(payment.payer?.email ?? ''),
            backUrl: '',
            notificationUrl: '',
            idempotencyKey: `sj-promo-final-${escritorioId}-${plano}`,
          });
          const vinculada = await vincularAssinaturaDefinitiva(
            escritorioId,
            definitiva,
            plano,
            definitiva.startDate ?? null,
          );
          acaoFinal = `payment.approved → ativado + assinatura definitiva criada (${definitiva.id})`;
          statusFinal = vinculada ? 'ATIVADO_RECORRENCIA' : 'ATIVADO';
        } catch (e7e) {
          console.error('[Billing] Falha ao criar assinatura definitiva promocional (7E):', (e7e as Error).message);
          acaoFinal = 'payment.approved → ativado; recorrência pendente de retry (7E)';
          // REPROCESSAVEL: o replay do MP re-tenta; a idempotência da criação
          // da recorrência (reconciliação + chave estável) impede duplicação.
          statusFinal = 'ERRO';
        }
      }
      await finalizarEventoWebhook(type, dataId, status, ok ? statusFinal : 'ESCRITORIO_NAO_ENCONTRADO', acaoFinal);

      // Notificação ao root — fire-and-forget, nunca bloqueia/derruba a
      // resposta do webhook ao Mercado Pago. Cobre TODO pagamento aprovado
      // (1ª cobrança e cada renovação mensal) e desativação por recusa/estorno.
      if (ok) {
        const rotuloPlano = planoAssinatura(plano)?.rotulo ?? plano;
        if (status === 'approved') {
          db.select({ nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1)
            .then(([esc]) => esc && sendRootPagamentoAprovadoEmail({
              escritorioNome: esc.nome,
              plano: rotuloPlano,
              valor: typeof payment.transaction_amount === 'number' ? payment.transaction_amount : null,
              payerEmail: payment.payer?.email ?? null,
              dataAprovacao: payment.date_approved ? String(payment.date_approved) : null,
            }))
            .catch((err) => console.error('[Billing] Falha ao notificar root sobre pagamento aprovado:', err));
        } else if (status === 'rejected' || status === 'charged_back' || status === 'cancelled') {
          const motivo = status === 'rejected' ? 'pagamento_recusado' : status === 'charged_back' ? 'estorno' : 'cancelada';
          db.select({ nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1)
            .then(([esc]) => esc && sendRootAssinaturaDesativadaEmail({
              escritorioNome: esc.nome,
              plano: rotuloPlano,
              motivo,
            }))
            .catch((err) => console.error('[Billing] Falha ao notificar root sobre assinatura desativada:', err));
        }
      }

      if (!ok) return { handled: false, motivo: `Escritório não encontrado (${escritorioId}).` };
      return { handled: true, acao: acaoFinal, escritorioId };
    }

    if (type === 'subscription_preapproval') {
      const preapproval = await obterPreapproval(dataId).catch((e: Error) => {
        console.error('[Billing] Falha ao consultar preapproval:', e.message);
        return null;
      });
      if (!preapproval) {
        await finalizarEventoWebhook(type, dataId, 'DESCONHECIDO', 'MP_INDISPONIVEL: preapproval não consultável');
        return { handled: false, motivo: 'Preapproval não encontrado no Mercado Pago.' };
      }

      const externalReference = String(preapproval.external_reference ?? '');
      const status = String(preapproval.status ?? 'desconhecido');
      const escritorioId = await escritorioPorReferencia(externalReference, dataId);
      if (!escritorioId) {
        await registrarEventoFalho(type, dataId, status, 'SEM_VINCULO', 'preapproval sem vínculo com escritório');
        return { handled: false, motivo: 'Preapproval sem vínculo com escritório SmartJuris.' };
      }
      // Aquisição por transição de estado (deduplicação 1x por transição),
      // já associando o escritório ao evento.
      const { adquirido, motivo } = await adquirirEventoWebhook(type, dataId, status, escritorioId);
      if (!adquirido) {
        return { handled: true, acao: motivo ?? 'evento não processado', escritorioId };
      }

      // Plano: razão do preapproval OU o plano gravado no checkout.
      const planoAssinado = await planoDoEscritorio(escritorioId);
      const cfg = planoAssinatura(String(preapproval.reason ?? '')) ?? (planoAssinado ? planoAssinatura(planoAssinado) : null);
      const plano = cfg?.codigo ?? 'basico';

      // Efeito sob lock por assinatura.
      const provedorTs = preapproval.last_modified ? String(preapproval.last_modified) : null;
      const execucao = await comLockPorAssinatura(escritorioId, provedorTs, async (tx) => {
        if (status === 'authorized') {
          const ok = await ativarEscritorio(escritorioId, plano, {
            proximaCobranca: preapproval.next_payment_date ? String(preapproval.next_payment_date) : null,
          }, tx);
          await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
          return { ok, acao: 'preapproval.authorized → escritório ativado', statusResult: 'ATIVADO' };
        }
        if (status === 'cancelled') {
          const ok = await desativarEscritorio(escritorioId, 'cancelada', tx);
          await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
          return { ok, acao: 'preapproval.cancelled → escritório desativado', statusResult: 'DESATIVADO' };
        }
        if (status === 'paused') {
          const ok = await desativarEscritorio(escritorioId, 'atrasada', tx);
          await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
          return { ok, acao: 'preapproval.paused → escritório desativado (atrasada)', statusResult: 'DESATIVADO' };
        }
        await atualizarProvedorTsEvento(type, dataId, provedorTs, tx);
        return { ok: true, acao: `preapproval.${status} — sem mudança de acesso`, statusResult: 'SEM_MUDANCA' };
      });

      if (execucao.obsoleto) {
        await finalizarEventoWebhook(type, dataId, status, 'OBSOLETO', `preapproval.${status} anterior ao estado aplicado`);
        return { handled: true, acao: 'evento obsoleto ignorado (ordenação)', escritorioId };
      }
      if (!execucao.resultado) {
        return { handled: false, motivo: 'Efeito sem resultado sob lock.' };
      }
      const { ok, acao, statusResult } = execucao.resultado;
      await finalizarEventoWebhook(type, dataId, status, ok ? statusResult : 'ESCRITORIO_NAO_ENCONTRADO', acao);

      // Notificação ao root — só para cancelamento/pausa (a autorização não
      // dispara e-mail aqui: o pagamento aprovado, com valor real, já cobre
      // esse caso via o evento `payment`).
      if (ok && (status === 'cancelled' || status === 'paused')) {
        const rotuloPlano = planoAssinatura(plano)?.rotulo ?? plano;
        const motivo = status === 'cancelled' ? 'cancelada' : 'pausada';
        db.select({ nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1)
          .then(([esc]) => esc && sendRootAssinaturaDesativadaEmail({
            escritorioNome: esc.nome,
            plano: rotuloPlano,
            motivo,
          }))
          .catch((err) => console.error('[Billing] Falha ao notificar root sobre assinatura desativada:', err));
      }

      if (!ok) return { handled: false, motivo: `Escritório não encontrado (${escritorioId}).` };
      return { handled: true, acao, escritorioId };
    }

    await registrarEventoFalho(type, dataId, 'desconhecido', 'TIPO_DESCONHECIDO', 'tipo de evento não suportado');
    return { handled: false, motivo: `Tipo de evento não suportado: ${type}` };
  } catch (error) {
    await registrarEventoFalho(type, dataId, 'desconhecido', 'ERRO', String((error as Error).message ?? error).slice(0, 500));
    throw error;
  }
}

/** Registra um evento que falhou antes da aquisição por estado. */
async function registrarEventoFalho(
  eventType: string,
  dataId: string,
  dataEstado: string,
  resultStatus: string,
  resultDetail?: string,
): Promise<void> {
  try {
    await db.insert(billingWebhookEvents).values({
      eventType,
      dataId,
      dataEstado,
      resultStatus,
      resultDetail: resultDetail ?? null,
    }).onConflictDoNothing();
  } catch (e) {
    console.warn('[Billing] Falha ao registrar evento:', (e as Error).message);
  }
}

/** Estados FINALIZADOS com falha parcial — reprocessáveis a qualquer momento.
 *  NÃO inclui PROCESSANDO/RECEBIDO: esses só são retomáveis via lease expirado
 *  (outro worker detém o processamento). */
const STATUS_REPROCESSAVEIS = new Set([
  'ERRO',
  'MP_INDISPONIVEL',
  'SEM_VINCULO',
  'ESCRITORIO_NAO_ENCONTRADO',
  'TIPO_DESCONHECIDO',
]);

/** Mesma lista como array, para uso em SQL ANY (...). */
const STATUS_REPROCESSAVEIS_LIST = [...STATUS_REPROCESSAVEIS];

/** Duração máxima do lease de processamento (worker pode retomar após). */
const WEBHOOK_LEASE_MS = Number(process.env.MERCADO_PAGO_WEBHOOK_LEASE_MS ?? 2 * 60 * 1000);

/**
 * Aquisição atômica do evento: garante que apenas UM processamento por
 * (event_type, data_id) ocorra por vez.
 *
 * - INSERT (PROCESSANDO + lease) se o evento ainda não existe → adquirido;
 * - se já existe em estado FINALIZADO → replay (não reprocessa);
 * - se já existe em estado REPROCESSAVEL → UPDATE condicional (WHERE lease
 *   expirado ou status reprocessável) → adquirido para retomada, ou
 *   "processando" se outro worker detém lease ativo.
 */
export async function adquirirEventoWebhook(
  eventType: string,
  dataId: string,
  dataEstado: string = 'desconhecido',
  escritorioId?: string | null,
): Promise<{ adquirido: boolean; motivo?: string }> {
  try {
    const inseridos = await db.insert(billingWebhookEvents).values({
      eventType,
      dataId,
      dataEstado,
      escritorioId: escritorioId ?? null,
      resultStatus: 'PROCESSANDO',
      resultDetail: 'aquisição de processamento',
      processandoEm: new Date(),
      attempts: 1,
    }).onConflictDoNothing().returning({ id: billingWebhookEvents.id });
    if (inseridos.length > 0) {
      return { adquirido: true };
    }

    // Evento já existe: tenta adquirir com UPDATE condicional (atômico).
    // Retomável apenas se:
    //   - status FINALIZADO com falha (lista reprocessável); OU
    //   - PROCESSANDO/RECEBIDO com lease expirado (processando_em antigo) ou
    //     processando_em ausente (worker morreu antes de finalizar).
    // Eventos FINALIZADOS com sucesso (ATIVADO/DESATIVADO/...) têm
    // processando_em = NULL e status fora das condições → nunca re-adquiridos.
    const lease = new Date(Date.now() - WEBHOOK_LEASE_MS).toISOString();
    const atualizados = await db.execute(sql`
      UPDATE billing_webhook_events
      SET result_status = 'PROCESSANDO',
          result_detail = 'aquisição de processamento (retomada)',
          processando_em = now(),
          attempts = attempts + 1
      WHERE event_type = ${eventType}
        AND data_id = ${dataId}
        AND data_estado = ${dataEstado}
        AND (
          result_status = ANY(string_to_array(${STATUS_REPROCESSAVEIS_LIST.join(',')}, ','))
          OR (result_status IN ('PROCESSANDO', 'RECEBIDO')
              AND (processando_em IS NULL OR processando_em < ${lease}::timestamptz))
        )
      RETURNING id
    `);
    if ((atualizados as any[]).length > 0) {
      return { adquirido: true };
    }

    // Não adquiriu: transição finalizada (replay) ou lease ativo de outro worker.
    const [existente] = await db.select({ resultStatus: billingWebhookEvents.resultStatus })
      .from(billingWebhookEvents)
      .where(and(
        eq(billingWebhookEvents.eventType, eventType),
        eq(billingWebhookEvents.dataId, dataId),
        eq(billingWebhookEvents.dataEstado, dataEstado),
      )).limit(1);
    const status = existente?.resultStatus ?? '?';
    if (status === 'PROCESSANDO') {
      return { adquirido: false, motivo: 'evento em processamento por outro worker (lease ativo)' };
    }
    return { adquirido: false, motivo: `replay ignorado (transição já processada: ${status})` };
  } catch (e) {
    // Fail-closed: em produção, a tabela de idempotência é OBRIGATÓRIA.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('billing_webhook_events indisponível — webhook rejeitado (fail-closed): ' + (e as Error).message);
    }
    console.warn('[Billing] billing_webhook_events indisponível:', (e as Error).message);
    return { adquirido: true }; // dev/teste: segue sem idempotência persistida
  }
}

/** Finaliza o evento com o resultado do processamento (por transição). */
export async function finalizarEventoWebhook(
  eventType: string,
  dataId: string,
  dataEstado: string,
  resultStatus: string,
  resultDetail?: string,
): Promise<void> {
  try {
    await db.update(billingWebhookEvents)
      .set({
        resultStatus,
        resultDetail: resultDetail ?? null,
        processandoEm: null,
      })
      .where(and(
        eq(billingWebhookEvents.eventType, eventType),
        eq(billingWebhookEvents.dataId, dataId),
        eq(billingWebhookEvents.dataEstado, dataEstado),
      ));
  } catch (e) {
    console.warn('[Billing] Falha ao finalizar evento webhook:', (e as Error).message);
  }
}

/**
 * Ordenação/monotonicidade: um evento cujo timestamp do provedor é MAIS
 * ANTIGO que o último evento FINALIZADO da mesma assinatura é uma transição
 * obsoleta (fora de ordem) — deve ser ignorado para não regredir o estado.
 * Retorna true quando o evento atual deve ser descartado.
 */
async function verificarTransicaoObsoleta(
  escritorioId: string | null,
  provedorTs: string | null,
  exec: any = db,
): Promise<boolean> {
  if (!escritorioId || !provedorTs) return false;
  const tsAtual = Date.parse(provedorTs);
  if (!Number.isFinite(tsAtual)) return false;

  try {
    const [ultimo] = await exec.select({ provedorTs: billingWebhookEvents.provedorTs })
      .from(billingWebhookEvents)
      .where(and(
        eq(billingWebhookEvents.escritorioId, escritorioId),
        sql`${billingWebhookEvents.provedorTs} IS NOT NULL`,
      ))
      .orderBy(sql`${billingWebhookEvents.provedorTs} DESC`)
      .limit(1);
    if (!ultimo?.provedorTs) return false;
    const tsUltimo = Date.parse(String(ultimo.provedorTs));
    if (!Number.isFinite(tsUltimo)) return false;
    return tsAtual < tsUltimo;
  } catch (e) {
    console.warn('[Billing] Falha ao verificar ordenação do evento:', (e as Error).message);
    return false; // fail-open na ordenação: se não der para verificar, processa
  }
}

/**
 * Serialização atômica por assinatura: roda a verificação de ordenação + a
 * aplicação do efeito DENTRO de uma transação com advisory lock por escritório
 * (pg_advisory_xact_lock). Garante que eventos novos/antigos da MESMA
 * assinatura nunca apliquem efeitos concorrentes/regressivos — a verificação
 * e a mutação são atômicas sob o mesmo lock.
 */
interface ExecucaoComLock<T> {
  obsoleto: boolean;
  resultado?: T;
}

async function comLockPorAssinatura<T>(
  escritorioId: string,
  provedorTs: string | null,
  fn: (exec: any) => Promise<T>,
): Promise<ExecucaoComLock<T>> {
  const resultado = await db.transaction<ExecucaoComLock<T>>(async (tx): Promise<ExecucaoComLock<T>> => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('smartjuris_billing_webhook_' || ${escritorioId}))`,
    );
    // Re-verifica dentro do lock: se outro evento aplicou um estado MAIS
    // recente enquanto este aguardava, este é obsoleto.
    const obsoleto = await verificarTransicaoObsoleta(escritorioId, provedorTs, tx);
    if (obsoleto) {
      return { obsoleto: true };
    }
    const efeito = await fn(tx);
    return { obsoleto: false, resultado: efeito };
  });
  return resultado;
}

/** Grava o timestamp do provedor no evento (usado pela ordenação). */
async function atualizarProvedorTsEvento(
  eventType: string,
  dataId: string,
  provedorTs: string | null,
  exec: any = db,
): Promise<void> {
  if (!provedorTs) return;
  try {
    await exec.update(billingWebhookEvents)
      .set({ provedorTs: new Date(provedorTs) })
      .where(and(
        eq(billingWebhookEvents.eventType, eventType),
        eq(billingWebhookEvents.dataId, dataId),
      ));
  } catch (e) {
    console.warn('[Billing] Falha ao gravar provedor_ts:', (e as Error).message);
  }
}

/** Associa o evento ao escritório resolvido (usado pela ordenação por assinatura). */
async function atualizarEscritorioIdEvento(
  eventType: string,
  dataId: string,
  escritorioId: string,
): Promise<void> {
  try {
    await db.update(billingWebhookEvents)
      .set({ escritorioId })
      .where(and(
        eq(billingWebhookEvents.eventType, eventType),
        eq(billingWebhookEvents.dataId, dataId),
      ));
  } catch (e) {
    console.warn('[Billing] Falha ao associar escritorio_id ao evento:', (e as Error).message);
  }
}

/** Plano gravado no checkout do escritório (assinatura_plano). */
async function planoDoEscritorio(escritorioId: string): Promise<string | null> {
  const [esc] = await db.select({ assinaturaPlano: escritorios.assinaturaPlano }).from(escritorios)
    .where(eq(escritorios.id, escritorioId)).limit(1);
  return esc?.assinaturaPlano ?? null;
}
