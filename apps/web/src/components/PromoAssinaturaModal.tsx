import { useEffect, useState } from "react"
import { Modal, Button, FONT, RADIUS, SPACE, Loading } from "../ui"
import { api, getErrorMessage } from "../api/client"
import { useBreakpoint } from "../hooks/useBreakpoint"
import {
  decidirCheckoutPromocional,
  resumoPrecoPlano,
  type PlanoAssinaturaApi,
  type PromocaoStatusApi,
} from "../utils/promocaoUI"
import { PLAN_CAPACITIES } from "../utils/planCapacities"

// ---------------------------------------------------------------------------
// Modal promocional exibido após o primeiro login: apresenta os planos com o
// desconto de boas-vindas (1º mês) e, principalmente, quanto cada assinatura
// permite produzir por mês (PLAN_CAPACITIES).
// ---------------------------------------------------------------------------

/** Espelho mínimo do GET /api/billing/status (só o que este modal usa). */
interface StatusAssinaturaApi {
  plano: string | null
  promocao: PromocaoStatusApi
  assinatura?: { status: string | null } | null
  mpConfigurado?: boolean
}

// Fallback estático (preços integrais, sem promoção) usado quando a busca
// falha: o modal segue mostrando os cards a preço cheio, sem quebrar.
const PLANOS_FALLBACK: PlanoAssinaturaApi[] = [
  { codigo: "basico", precoMensal: 180, creditos: 20, rotulo: "Básico", promocao: null },
  { codigo: "profissional", precoMensal: 300, creditos: 50, rotulo: "Intermediário", promocao: null },
  { codigo: "office", precoMensal: 500, creditos: 100, rotulo: "Avançado", promocao: null },
]

function fmtBRL(v: number) {
  return v.toFixed(2).replace(".", ",")
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, marginTop: 3 }}
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="var(--color-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9" stroke="var(--color-muted)" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        stroke="var(--color-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function PromoAssinaturaModal(props: {
  open: boolean
  onDismiss: () => void
  onNavigateAssinatura: () => void
}) {
  const { open, onDismiss, onNavigateAssinatura } = props

  const [planos, setPlanos] = useState<PlanoAssinaturaApi[]>([])
  const [status, setStatus] = useState<StatusAssinaturaApi | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [assinarPlano, setAssinarPlano] = useState<string | null>(null)
  const [erro, setErro] = useState("")

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === "mobile"
  const isDesktop = breakpoint === "desktop"

  // Carrega planos + status SOMENTE quando o modal abre.
  useEffect(() => {
    if (!open) return
    let ativo = true
    setCarregado(false)
    setErro("")
    setAssinarPlano(null)
    setPlanos([])
    setStatus(null)

    Promise.all([api.billing.planos(), api.billing.status()])
      .then(([p, s]) => {
        if (!ativo) return
        setPlanos(p?.planos ?? PLANOS_FALLBACK)
        setStatus(s ?? null)
      })
      .catch(() => {
        if (!ativo) return
        // Falha graciosa: cards a preço cheio, sem promoção, sem crash.
        setPlanos(PLANOS_FALLBACK)
        setStatus(null)
      })
      .finally(() => {
        if (ativo) setCarregado(true)
      })

    return () => {
      ativo = false
    }
  }, [open])

  // Se o escritório NÃO é elegível (já tem assinatura ativa ou já usou a
  // promoção — `elegivel` false cobre exatamente esses casos), o modal deixa
  // de ser relevante e fecha sozinho.
  useEffect(() => {
    if (!open || !carregado) return
    if (status && status.promocao.elegivel === false) {
      onDismiss()
    }
  }, [open, carregado, status, onDismiss])

  const assinar = async (codigo: string) => {
    setAssinarPlano(codigo)
    setErro("")

    // Timeout de 30 segundos para evitar botão congelado indefinidamente.
    const timeoutId = setTimeout(() => {
      setErro("A requisição está demorando muito. Verifique sua conexão e tente novamente.")
      setAssinarPlano(null)
    }, 30000)

    try {
      // 1ª compra promocional: quando o escritório é ELEGÍVEL, usa a preference
      // avulsa com o valor promocional (50% OFF na 1ª mensalidade); a
      // recorrência integral começa no 2º mês. O backend revalida.
      const decisao = decidirCheckoutPromocional(status?.promocao)
      const res = decisao.promocional
        ? await api.billing.checkoutPromocional(codigo)
        : await api.billing.checkout(codigo)

      clearTimeout(timeoutId)

      if (!res.ok) {
        setErro(await getErrorMessage(res, "Falha ao criar o checkout."))
        setAssinarPlano(null)
        return
      }
      const data = await res.json()
      if (data?.initPoint) {
        window.location.href = data.initPoint
      } else {
        setErro("O Mercado Pago não retornou a URL de pagamento. Verifique se o Mercado Pago está configurado corretamente.")
        setAssinarPlano(null)
      }
    } catch (e) {
      clearTimeout(timeoutId)
      setErro((e as Error).message || "Falha ao criar o checkout.")
      setAssinarPlano(null)
    }
  }

  const promoAtiva = status?.promocao?.ativa === true

  return (
    <Modal
      open={open}
      onClose={onDismiss}
      title="Bem-vindo ao SmartJuris"
      width={720}
      footer={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACE.md,
            width: "100%",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onNavigateAssinatura}
            style={{
              background: "transparent",
              border: "none",
              padding: "10px 2px",
              color: "var(--color-primary)",
              fontSize: FONT.base,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              minHeight: isMobile ? 44 : undefined,
            }}
          >
            Ver tela de assinatura completa
          </button>
          <Button variant="secondary" onClick={onDismiss}>
            Depois
          </Button>
        </div>
      }
    >
      {/* Banner de promoção (só quando ativa) */}
      {promoAtiva && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACE.sm,
            background: "var(--color-accent-light)",
            border: "1px solid var(--color-accent)",
            borderRadius: RADIUS.card,
            padding: "12px 16px",
            marginBottom: SPACE.lg,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">🎉</span>
          <span style={{ fontSize: FONT.md, color: "var(--color-foreground)", fontWeight: 600, lineHeight: 1.5 }}>
            {status.promocao.percentual}% OFF na 1ª mensalidade — recorrência integral a partir do 2º mês
          </span>
        </div>
      )}

      {erro && (
        <div
          role="alert"
          style={{
            marginBottom: SPACE.lg,
            background: "var(--color-danger-light)",
            color: "var(--color-danger)",
            padding: "12px 16px",
            borderRadius: RADIUS.control,
            fontSize: FONT.base,
          }}
        >
          {erro}
        </div>
      )}

      <p style={{ margin: "0 0 20px", fontSize: FONT.md, color: "var(--color-muted)", lineHeight: 1.6 }}>
        Veja quanto você consegue produzir por mês com cada assinatura e ative o plano ideal para o seu escritório.
      </p>

      {!carregado ? (
        <Loading message="Carregando planos…" />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop ? "repeat(3, 1fr)" : "1fr",
            gap: isDesktop ? SPACE.md : SPACE.xl,
            alignItems: "stretch",
            marginTop: SPACE.lg,
          }}
        >
          {planos.map((plano, index) => {
            const capacity = PLAN_CAPACITIES[index] ?? PLAN_CAPACITIES[PLAN_CAPACITIES.length - 1]
            const resumo = resumoPrecoPlano(plano, status?.promocao)
            const destaque = capacity.highlight

            return (
              <div
                key={plano.codigo}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACE.md,
                  background: "var(--color-surface)",
                  border: destaque ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                  borderRadius: RADIUS.card,
                  padding: "22px 18px",
                  boxShadow: destaque
                    ? "0 12px 40px color-mix(in srgb, var(--color-primary) 18%, transparent)"
                    : "0 4px 16px color-mix(in srgb, var(--color-foreground) 5%, transparent)",
                }}
              >
                {/* Badge flutuante do plano em destaque */}
                {destaque && (
                  <span
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--color-accent)",
                      color: "var(--color-on-accent)",
                      fontSize: FONT.xs,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "5px 14px",
                      borderRadius: 20,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {capacity.badge}
                  </span>
                )}

                {/* Selo do plano + selo de desconto */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 22 }}>
                  {!destaque && (
                    <span
                      style={{
                        background: "var(--color-badge-tint)",
                        color: "var(--color-primary)",
                        fontSize: FONT.xs,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "4px 10px",
                        borderRadius: RADIUS.chip,
                      }}
                    >
                      {capacity.badge}
                    </span>
                  )}
                  {resumo.promocional && (
                    <span
                      style={{
                        background: "var(--color-accent)",
                        color: "var(--color-on-accent)",
                        fontSize: FONT.xs,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        padding: "4px 10px",
                        borderRadius: RADIUS.chip,
                      }}
                    >
                      {resumo.percentual}% OFF 1º mês
                    </span>
                  )}
                </div>

                {/* Nome + público-alvo */}
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                  {capacity.plan}
                </div>
                <div style={{ fontSize: FONT.sm, color: "var(--color-muted)", marginTop: -6, lineHeight: 1.4 }}>
                  {capacity.subtitle}
                </div>

                {/* Preço */}
                {resumo.promocional ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}>
                        R$ {fmtBRL(resumo.valorDestaque)}
                      </span>
                      <span style={{ fontSize: FONT.base, color: "var(--color-muted)" }}>/mês</span>
                    </div>
                    <div style={{ fontSize: FONT.sm, color: "var(--color-muted)" }}>
                      <span style={{ textDecoration: "line-through" }}>R$ {fmtBRL(resumo.precoMensal)}</span>
                      <span> depois</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}>
                      R$ {fmtBRL(resumo.valorDestaque)}
                    </span>
                    <span style={{ fontSize: FONT.base, color: "var(--color-muted)" }}>/mês</span>
                  </div>
                )}

                {/* Economia de tempo */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FONT.sm }}>
                  <ClockIcon />
                  <span style={{ color: "var(--color-muted)" }}>Economia de</span>
                  <span style={{ color: "var(--color-foreground)", fontWeight: 700 }}>{capacity.hoursSaved}</span>
                </div>

                {/* Capacidade de produção */}
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: SPACE.sm,
                    flex: 1,
                  }}
                >
                  {capacity.productionList.map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: SPACE.sm }}>
                      <CheckIcon />
                      <span style={{ fontSize: FONT.base, color: "var(--color-foreground)", lineHeight: 1.5 }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Nota de capacidade */}
                <p
                  style={{
                    margin: 0,
                    paddingTop: SPACE.md,
                    borderTop: "1px solid var(--color-border)",
                    fontSize: FONT.sm,
                    color: "var(--color-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {capacity.capacityNote}
                </p>

                {/* CTA */}
                <Button
                  variant={destaque ? "primary" : "secondary"}
                  onClick={() => assinar(plano.codigo)}
                  disabled={assinarPlano !== null}
                  style={{ width: "100%", padding: "11px", marginTop: "auto" }}
                >
                  {assinarPlano === plano.codigo
                    ? "Abrindo Mercado Pago…"
                    : resumo.promocional
                      ? `Assinar com ${resumo.percentual}% OFF`
                      : "Assinar"}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
