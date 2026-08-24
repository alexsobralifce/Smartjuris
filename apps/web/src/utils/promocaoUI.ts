// ===========================================================================
// Fase 7F — Lógica pura de exibição/decisão da promoção de boas-vindas
// (1º mês 50% OFF). Funções SEM efeitos colaterais, testáveis com node:test
// (padrão do repo — sseParser/sseFlow). Os componentes (Assinatura/RootPainel)
// apenas renderizam o resultado destas funções.
// ===========================================================================

// ---------------------------------------------------------------------------
// Tipos mínimos (espelho das respostas da API — sem dependência de React).
// ---------------------------------------------------------------------------

export interface PromocaoPlanoApi {
  percentual: number
  valorPromocional: number
  valorPromocionalCents: number
}

export interface PlanoAssinaturaApi {
  codigo: string
  precoMensal: number
  creditos: number
  rotulo: string
  promocao: PromocaoPlanoApi | null
}

export interface PromocaoStatusApi {
  ativa: boolean
  percentual: number
  elegivel: boolean
  motivoIneligibilidade: string | null
  valorPromocional: {
    percentual: number
    precoMensal: number
    valorPromocional: number
    valorPromocionalCents: number
  } | null
}

export interface BillingDevPromocaoApi {
  ativa: boolean
  percentual: number
  validade: string | null
  usos: {
    total: number
    ultimas24h: number
    porPlano: { basico: number; profissional: number; office: number }
  }
}

// ---------------------------------------------------------------------------
// Assinatura — decisão do checkout
// ---------------------------------------------------------------------------

export interface DecisaoCheckout {
  /** true → usar /checkout-promocional (1ª compra avulsa com desconto). */
  promocional: boolean
  motivo: 'elegivel' | 'promocao-inativa' | 'nao-elegivel'
}

/**
 * Decide qual checkout usar: promocional (quando a promoção está ATIVA e o
 * escritório é ELEGÍVEL) ou o normal (fallback). Regra ÚNICA para a UI —
 * o backend revalida (defesa em profundidade).
 */
export function decidirCheckoutPromocional(promocao: PromocaoStatusApi | undefined): DecisaoCheckout {
  if (!promocao || promocao.ativa !== true || promocao.elegivel !== true) {
    return { promocional: false, motivo: !promocao || promocao.ativa !== true ? 'promocao-inativa' : 'nao-elegivel' };
  }
  return { promocional: true, motivo: 'elegivel' };
}

// ---------------------------------------------------------------------------
// Assinatura — resumo de preços do card de plano
// ---------------------------------------------------------------------------

export interface ResumoPrecoPlano {
  /** true quando o card deve exibir o valor promocional destacado. */
  promocional: boolean
  /** Valor em destaque (promocional ou integral). */
  valorDestaque: number
  /** Valor integral (usado como "depois" riscado quando promocional). */
  precoMensal: number
  percentual: number | null
}

/**
 * Monta o resumo de preços do card de plano: quando elegível E o plano expõe
 * valor promocional, destaca o desconto; senão exibe o preço integral.
 */
export function resumoPrecoPlano(
  plano: PlanoAssinaturaApi,
  promocao: PromocaoStatusApi | undefined,
): ResumoPrecoPlano {
  const elegivel = promocao?.ativa === true && promocao.elegivel === true;
  const temValorPromo = plano.promocao !== null
    && Number.isFinite(plano.promocao.valorPromocionalCents)
    && plano.promocao.valorPromocionalCents > 0;
  if (elegivel && temValorPromo) {
    return {
      promocional: true,
      valorDestaque: plano.promocao!.valorPromocional,
      precoMensal: plano.precoMensal,
      percentual: plano.promocao!.percentual,
    };
  }
  return { promocional: false, valorDestaque: plano.precoMensal, precoMensal: plano.precoMensal, percentual: null };
}

// ---------------------------------------------------------------------------
// RootPainel — resumo do bloco de promoção no painel dev
// ---------------------------------------------------------------------------

export interface ResumoUsoPromocao {
  rotuloEstado: string
  ativa: boolean
  percentual: number
  validade: string | null
  usos: {
    total: number
    ultimas24h: number
    basico: number
    profissional: number
    office: number
  }
}

/** Normaliza os dados do endpoint /billing/dev (tolerante a payloads parciais). */
export function resumoUsoPromocao(data: BillingDevPromocaoApi | undefined | null): ResumoUsoPromocao {
  const ativa = data?.ativa === true;
  return {
    rotuloEstado: ativa ? 'ATIVA' : 'INATIVA',
    ativa,
    percentual: Number(data?.percentual ?? 50),
    validade: data?.validade ?? null,
    usos: {
      total: Number(data?.usos?.total ?? 0),
      ultimas24h: Number(data?.usos?.ultimas24h ?? 0),
      basico: Number(data?.usos?.porPlano?.basico ?? 0),
      profissional: Number(data?.usos?.porPlano?.profissional ?? 0),
      office: Number(data?.usos?.porPlano?.office ?? 0),
    },
  };
}
