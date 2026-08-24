// ===========================================================================
// promocao.ts — Promoção de boas-vindas (Fase 7B): 50% OFF na 1ª mensalidade.
//
// Opção C (pagamento avulso + assinatura): a 1ª compra é avulsa com o valor
// promocional; a recorrência integral começa no 2º mês. Este módulo concentra
// a LÓGICA DE NEGÓCIO (flags, cálculo e elegibilidade) — valor promocional é
// calculado EXCLUSIVAMENTE no backend, nunca aceito do cliente.
// ===========================================================================

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios } from '../db/schema.js';
import { planoAssinatura, type PlanoAssinatura } from './billing.js';

// ---------------------------------------------------------------------------
// Feature flags (env) — default desligado (fluxo atual inalterado).
// ---------------------------------------------------------------------------

export interface ConfigPromocao {
  ativa: boolean;
  percentual: number; // 50 = 50% OFF
  /** Data fim opcional (ISO); null = sem validade. */
  validade?: string | null;
}

export function configPromocao(): ConfigPromocao {
  const raw = process.env.PROMOCAO_ATIVA ?? '';
  const ativa = raw === 'true' || raw === '1';
  const percentualRaw = Number(process.env.PROMOCAO_PERCENTUAL ?? 50);
  // Percentual válido: inteiro no intervalo (0, 100). Fora disso → default 50.
  const percentual =
    Number.isInteger(percentualRaw) && percentualRaw > 0 && percentualRaw < 100 ? percentualRaw : 50;
  const validadeRaw = process.env.PROMOCAO_VALIDADE ? String(process.env.PROMOCAO_VALIDADE) : null;
  // Validade malformada → FALHA SEGURA: desativa a promoção (nunca aplica com
  // data inválida silenciosamente). O campo exposto indica o problema.
  let validade: string | null = validadeRaw;
  if (validadeRaw !== null) {
    const ts = Date.parse(validadeRaw);
    if (!Number.isFinite(ts)) {
      console.warn(`[promocao] PROMOCAO_VALIDADE inválida (${validadeRaw}) — promoção desativada (fail-safe).`);
      validade = null;
      return { ativa: false, percentual, validade: null };
    }
  }
  return { ativa, percentual, validade };
}

/** Promoção expirada? (validade configurada e já passou — término INCLUSIVO: `>=`). */
export function promocaoExpirada(cfg: ConfigPromocao, agora: Date = new Date()): boolean {
  if (!cfg.validade) return false;
  const fim = Date.parse(cfg.validade);
  if (!Number.isFinite(fim)) return true; // malformada → trata como expirada (fail-safe)
  return agora.getTime() >= fim;
}

// ---------------------------------------------------------------------------
// Cálculo do valor promocional (backend-only)
// ---------------------------------------------------------------------------

export interface ValorPromocional {
  plano: string;
  rotulo: string;
  /** Preço integral em R$ (180/300/500). */
  precoMensal: number;
  /** Preço integral em centavos. */
  precoCents: number;
  /** Percentual de desconto aplicado (50). */
  percentual: number;
  /** Valor promocional em R$ (90/150/250). */
  valorPromocional: number;
  /** Valor promocional em centavos. */
  valorPromocionalCents: number;
  ativo: boolean;
}

/**
 * Calcula o valor promocional do plano. Arredonda para baixo o centavo
 * (50% de 180 = 90 exato; valores ímpares seriam truncados — ex.: 50% de 199
 * = 99,5 → 99,50). Nunca aceita valor do cliente: o plano resolve o preço.
 */
export function calcularValorPromocional(
  plano: string,
  cfg: ConfigPromocao = configPromocao(),
): ValorPromocional | null {
  const p = planoAssinatura(plano);
  if (!p) return null;
  const precoCents = Math.round(p.precoMensal * 100);
  const valorPromocionalCents = Math.floor(precoCents * (1 - cfg.percentual / 100));
  return {
    plano: p.codigo,
    rotulo: p.rotulo,
    precoMensal: p.precoMensal,
    precoCents,
    percentual: cfg.percentual,
    valorPromocional: valorPromocionalCents / 100,
    valorPromocionalCents,
    ativo: cfg.ativa && !promocaoExpirada(cfg),
  };
}

// ---------------------------------------------------------------------------
// Elegibilidade — "novo cliente"
// ---------------------------------------------------------------------------

export interface DecisaoElegibilidade {
  elegivel: boolean;
  motivo: string;
  usouPromocao: boolean;
  temAssinaturaAtiva: boolean;
  temHistoricoPago: boolean;
}

/**
 * Decide se o escritório é ELEGÍVEL à promoção:
 *   - não pode ter usado a promoção antes (promocao_usada);
 *   - não pode ter assinatura ATIVA (assinatura_status = 'ativa');
 *   - não pode ter histórico de assinatura paga (mercado_pago_id já gravado
 *     em algum momento OU assinatura_status já foi 'ativa'/'atrasada').
 *
 * "Novo cliente" = escritório sem qualquer vínculo de pagamento anterior.
 */
export async function decidirElegibilidade(escritorioId: string): Promise<DecisaoElegibilidade> {
  const [esc] = await db.select({
    id: escritorios.id,
    plano: escritorios.plano,
    mercadoPagoId: escritorios.mercadoPagoId,
    assinaturaStatus: escritorios.assinaturaStatus,
    assinaturaPlano: escritorios.assinaturaPlano,
    promocaoUsada: escritorios.promocaoUsada,
  }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);

  if (!esc) {
    return { elegivel: false, motivo: 'escritorio-nao-encontrado', usouPromocao: false, temAssinaturaAtiva: false, temHistoricoPago: false };
  }

  const usouPromocao = esc.promocaoUsada === true;
  const temAssinaturaAtiva = esc.assinaturaStatus === 'ativa';
  // Histórico de pagamento: já vinculou um preapproval (mesmo que cancelado)
  // ou o status já foi ativa/atrasada/cancelada em algum momento.
  const temHistoricoPago =
    esc.mercadoPagoId != null ||
    (esc.assinaturaStatus !== 'nenhuma' && esc.assinaturaStatus !== 'pendente');

  if (usouPromocao) {
    return { elegivel: false, motivo: 'promocao-ja-usada', usouPromocao: true, temAssinaturaAtiva, temHistoricoPago };
  }
  if (temAssinaturaAtiva) {
    return { elegivel: false, motivo: 'assinatura-ativa', usouPromocao: false, temAssinaturaAtiva: true, temHistoricoPago };
  }
  if (temHistoricoPago) {
    return { elegivel: false, motivo: 'historico-pagamento', usouPromocao: false, temAssinaturaAtiva, temHistoricoPago: true };
  }
  return { elegivel: true, motivo: 'novo-cliente', usouPromocao: false, temAssinaturaAtiva: false, temHistoricoPago: false };
}

// ---------------------------------------------------------------------------
// Persistência do uso (anti-abuso — cancelar/re-assinar não reaplica)
// ---------------------------------------------------------------------------

/**
 * Claim ATÔMICO E COMPLETO da promoção: marca `promocao_usada=true` SOMENTE se
 * o escritório ainda é ELEGÍVEL em TODAS as condições, no MESMO UPDATE
 * condicional (anti-corrida + anti-fraude):
 *   - promocao_usada = false (nunca usou);
 *   - sem vínculo de pagamento (mercado_pago_id nulo);
 *   - assinatura_status fora de ativa/atrasada/cancelada (sem histórico pago).
 * Duas requisições concorrentes: apenas UMA vence (a outra afeta 0 linhas).
 *
 * O valor NÃO é aceito do chamador: é RECALCULADO aqui a partir do plano e da
 * configuração (backend-only) e validado antes da persistência.
 */
export async function marcarPromocaoUsada(
  escritorioId: string,
  plano: string,
): Promise<{ ok: boolean; valorPromocionalCents: number }> {
  const cfg = configPromocao();
  const valor = calcularValorPromocional(plano, cfg);
  if (!valor || !valor.ativo) {
    return { ok: false, valorPromocionalCents: 0 };
  }
  const atualizados = await db.update(escritorios).set({
    promocaoUsada: true,
    promocaoPlano: planoAssinatura(plano)?.codigo ?? plano,
    promocaoValorCents: valor.valorPromocionalCents,
    promocaoAtivaEm: new Date(),
    promocaoPercentual: cfg.percentual,
  }).where(and(
    eq(escritorios.id, escritorioId),
    eq(escritorios.promocaoUsada, false),
    sql`${escritorios.mercadoPagoId} IS NULL`,
    sql`${escritorios.assinaturaStatus} NOT IN ('ativa', 'atrasada', 'cancelada')`,
  )).returning({ id: escritorios.id });
  return { ok: atualizados.length > 0, valorPromocionalCents: valor.valorPromocionalCents };
}

/**
 * Remove a marca de uso (compensação) — APENAS se o uso ainda não foi
 * CONFIRMADO por uma cobrança. Condicional à identidade do claim: só desmarca
 * o que ESTA operação marcou (não desfaz uso de outra operação concorrente ou
 * já concluída). `planoEsperado` evita desmarcar um claim de outro plano.
 */
export async function desmarcarPromocaoUsada(
  escritorioId: string,
  planoEsperado?: string,
): Promise<boolean> {
  const cond = [eq(escritorios.id, escritorioId), eq(escritorios.promocaoUsada, true)];
  if (planoEsperado) {
    cond.push(eq(escritorios.promocaoPlano, planoAssinatura(planoEsperado)?.codigo ?? planoEsperado));
  }
  const atualizados = await db.update(escritorios).set({
    promocaoUsada: false,
    promocaoPlano: null,
    promocaoValorCents: null,
    promocaoAtivaEm: null,
    promocaoPercentual: null,
  }).where(and(...cond)).returning({ id: escritorios.id });
  return atualizados.length > 0;
}

/** Conta escritórios que usaram a promoção (painel dev). */
export async function contarUsoPromocao(): Promise<number> {
  const rows = await db.execute(sql`SELECT COUNT(*)::int AS n FROM escritorios WHERE promocao_usada = true`);
  return Number((rows as any)[0]?.n ?? 0);
}
