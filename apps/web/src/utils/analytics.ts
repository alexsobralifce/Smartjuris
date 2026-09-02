/**
 * Rastreamento de conversão — Google Ads (gtag.js).
 *
 * A tag do Google é injetada no `<head>` em build (site.json → vite.config.ts).
 * Este módulo centraliza os eventos de conversão, com guarda de segurança para
 * não quebrar em dev/testes quando o `gtag` ainda não foi carregado.
 */

type GtagFunction = (...args: unknown[]) => void

declare global {
  interface Window {
    gtag?: GtagFunction
    dataLayer?: unknown[]
  }
}

/** Conversões do Google Ads. `send_to` = ID da conta / ID da ação de conversão. */
const CONVERSIONS = {
  assinatura: {
    send_to: 'AW-18423855449/aLhSCPPPmewcENnyltFE',
    value: 1.0,
    currency: 'BRL',
  },
} as const

function fireEvent(event: string, params: Record<string, unknown>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', event, params)
  }
}

/**
 * Dispara a conversão de "Assinatura" do Google Ads.
 * Chamada no clique do botão "Assinar" (método de *clique* — mede a conversão
 * antes de ela acontecer, no fluxo de redirecionamento ao Mercado Pago).
 */
export function trackSubscriptionConversion() {
  fireEvent('conversion', { ...CONVERSIONS.assinatura })
}
