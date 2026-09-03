import { useState, useEffect } from "react"
import { Button, FONT, RADIUS, SPACE } from "../ui"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { resumoPrecoPlano, type PlanoAssinaturaApi } from "../utils/promocaoUI"
import { getApiBaseUrl } from "../api/config"

interface Plan {
  audience: string
  name: string
  price: string
  limit: string
  features: string[]
  cta: string
  highlight: boolean
}

interface PromocaoPublica {
  ativa: boolean
  percentual: number
  planos: Array<{
    codigo: string
    precoMensal: number
    valorPromocional: number | null
    valorPromocionalCents: number | null
  }>
}

const PLANS: Plan[] = [
  {
    audience: "Ideal para advogados solo",
    name: "Básico",
    price: "R$ 180,00",
    limit: "20 peças completas por mês",
    features: [
      "Até 20 peças geradas com RAG BGE-M3 + Qwen",
      "Ideal para ~6 iniciais, 6 contestações e 8 recursos/contratos",
      "Economia de até ~40 horas de redação no mês",
      "Suporte técnico via WhatsApp e e-mail",
      "Exportação em PDF/DOCX com timbre personalizado",
      "Histórico seguro de peças por 60 dias",
    ],
    cta: "Começar com o Básico",
    highlight: false,
  },
  {
    audience: "Melhor Custo-Benefício",
    name: "Intermediário",
    price: "R$ 300,00",
    limit: "50 peças completas por mês",
    features: [
      "Tudo do Básico +",
      "Até 50 peças/mês (iniciais com tutelas, apelações e scanners)",
      "Economia de até ~100 horas/mês (1 advogado pleno equivalente)",
      "Análise de até 150 páginas de autos (PDF) por peça",
      "Scanner autônomo de riscos contratuais & jurimetria preditiva",
      "✦ Consultas ilimitadas ao Jus IA (jurisprudência ao vivo)",
      "Suporte prioritário no WhatsApp",
      "Histórico ilimitado com busca semântica",
    ],
    cta: "Escolher o Intermediário",
    highlight: true,
  },
  {
    audience: "Ideal para bancas estabelecidas",
    name: "Avançado",
    price: "R$ 500,00",
    limit: "100 peças completas por mês",
    features: [
      "Tudo do Intermediário +",
      "Até 100 peças/mês (alta escala, recursos aos tribunais superiores)",
      "Economia de até ~200 horas/mês (2 advogados associados plenos)",
      "Custo unitário inferior a R$ 5,00 por peça qualificada",
      "Múltiplos perfis de usuário (até 3 advogados simultâneos)",
      "✦ Jus IA com acesso prioritário + alertas automáticos de jurisprudência",
      "Fila de validação com governança e aprovação por sócio",
      "Agentes autônomos para revisão e teses customizadas",
    ],
    cta: "Falar com vendas",
    highlight: false,
  },
]

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, marginTop: 2 }}
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

function PricingCard({
  plan,
  resumo,
  onCtaClick,
}: {
  plan: Plan
  resumo: ReturnType<typeof resumoPrecoPlano>
  onCtaClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: SPACE.lg,
        background: "var(--color-surface)",
        border: plan.highlight
          ? "2px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        borderRadius: RADIUS.card,
        padding: "28px 24px",
        boxShadow: plan.highlight
          ? "0 12px 40px color-mix(in srgb, var(--color-primary) 18%, transparent)"
          : "0 4px 16px color-mix(in srgb, var(--color-foreground) 5%, transparent)",
        transform: hovered
          ? plan.highlight
            ? "scale(1.03)"
            : "scale(1.02)"
          : "scale(1)",
        transition: "transform 0.2s ease",
      }}
    >
      {plan.highlight && (
        <span
          style={{
            position: "absolute",
            top: -13,
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
          Mais Escolhido
        </span>
      )}

      <div
        style={{
          alignSelf: "flex-start",
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
        {plan.audience}
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: "var(--color-foreground)",
        }}
      >
        {plan.name}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {resumo.promocional ? (
          <>
            <span
              style={{
                alignSelf: "flex-start",
                background: "var(--color-accent)",
                color: "var(--color-on-accent)",
                fontSize: FONT.xs,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: RADIUS.chip,
                marginBottom: 4,
              }}
            >
              {resumo.percentual}% OFF 1º mês
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  color: "var(--color-foreground)",
                }}
              >
                R$ {resumo.valorDestaque.toFixed(2).replace(".", ",")}
              </span>
              <span
                style={{ fontSize: FONT.base, color: "var(--color-muted)" }}
              >
                /mês
              </span>
            </div>
            <span
              style={{
                fontSize: FONT.sm,
                color: "var(--color-muted)",
                textDecoration: "line-through",
              }}
            >
              R$ {resumo.precoMensal.toFixed(2).replace(".", ",")} depois
            </span>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 36,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: "var(--color-foreground)",
              }}
            >
              {plan.price}
            </span>
            <span style={{ fontSize: FONT.base, color: "var(--color-muted)" }}>
              /mês
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-foreground)",
          fontSize: FONT.md,
          fontWeight: 600,
          padding: "8px 12px",
          borderRadius: RADIUS.control,
          textAlign: "center",
        }}
      >
        {plan.limit}
      </div>

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
        {plan.features.map((f) => (
          <li
            key={f}
            style={{ display: "flex", alignItems: "flex-start", gap: SPACE.sm }}
          >
            <CheckIcon />
            <span
              style={{
                fontSize: FONT.base,
                color: "var(--color-foreground)",
                lineHeight: 1.5,
              }}
            >
              {f}
            </span>
          </li>
        ))}
      </ul>

      <Button
        variant={plan.highlight ? "primary" : "secondary"}
        onClick={onCtaClick}
        style={{ width: "100%", padding: "11px", marginTop: SPACE.sm }}
      >
        {plan.cta}
      </Button>
    </div>
  )
}

export default function PricingSection({
  onCtaClick,
}: {
  onCtaClick?: () => void
}) {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === "mobile"
  const isTablet = breakpoint === "tablet"
  const isDesktop = breakpoint === "desktop"

  const [promocao, setPromocao] = useState<PromocaoPublica | null>(null)

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/billing/promocao/status`)
      .then((r) => r.json())
      .then(setPromocao)
      .catch(() => setPromocao(null)) // fail gracefully
  }, [])

  const planosApi: PlanoAssinaturaApi[] = PLANS.map((plan, idx) => {
    const codigo = ["basico", "profissional", "office"][idx]
    const precoMensal = [180, 300, 500][idx]
    const promoData = promocao?.planos.find((p) => p.codigo === codigo)
    return {
      codigo,
      precoMensal,
      creditos: [20, 50, 100][idx],
      rotulo: plan.name,
      promocao: promoData?.valorPromocional
        ? {
            percentual: promocao!.percentual,
            valorPromocional: promoData.valorPromocional,
            valorPromocionalCents: promoData.valorPromocionalCents!,
          }
        : null,
    }
  })

  const promocaoStatus = promocao?.ativa
    ? {
        ativa: true,
        percentual: promocao.percentual,
        elegivel: true,
        motivoIneligibilidade: null,
        valorPromocional: null,
      }
    : undefined

  return (
    <section
      style={{
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: isMobile
            ? "48px 20px"
            : isTablet
              ? "56px 32px"
              : "72px 48px",
        }}
      >
        {/* Cabeçalho da seção */}
        <div
          style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 48px" }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(28px, 4.5vw, 36px)",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              color: "var(--color-foreground)",
              margin: "0 0 16px",
            }}
          >
            Automatize sua rotina jurídica. Escolha o plano ideal para o seu
            escritório.
          </h2>
          <p
            style={{
              fontSize: FONT.xl,
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Produza peças complexas em minutos com a IA mais avançada do
            mercado. Cancele quando quiser.
          </p>
        </div>

        {/* Cartões de preço */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop ? "repeat(3, 1fr)" : "1fr",
            gap: SPACE.xxl,
            alignItems: "stretch",
          }}
        >
          {PLANS.map((plan, idx) => {
            const resumo = resumoPrecoPlano(planosApi[idx], promocaoStatus)
            return (
              <PricingCard
                key={plan.name}
                plan={plan}
                resumo={resumo}
                onCtaClick={onCtaClick}
              />
            )
          })}
        </div>

        {/* Banner de Integração Jus IA */}
        <div
          style={{
            marginTop: 40,
            borderRadius: RADIUS.card,
            background: "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 92%, transparent) 0%, color-mix(in srgb, var(--color-accent) 85%, transparent) 100%)",
            border: "1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)",
            padding: isMobile ? "24px 20px" : "32px 40px",
            display: "grid",
            gridTemplateColumns: isDesktop ? "1fr auto" : "1fr",
            gap: isMobile ? 20 : 32,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                background: "var(--color-accent)",
                color: "var(--color-on-accent)",
                fontSize: FONT.xs,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "4px 12px",
                borderRadius: 20,
              }}>Exclusivo Intermediário & Avançado</span>
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(20px, 3vw, 26px)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              lineHeight: 1.2,
            }}>
              Jurisprudência ao Vivo via Jus IA
            </div>
            <p style={{
              fontSize: FONT.base,
              color: "rgba(255,255,255,0.82)",
              lineHeight: 1.65,
              margin: 0,
              maxWidth: 560,
            }}>
              Os planos <strong style={{ color: "#ffffff" }}>Intermediário</strong> e <strong style={{ color: "#ffffff" }}>Avançado</strong> incluem acesso direto à <strong style={{ color: "var(--color-accent)" }}>Jus IA</strong>, a maior base de jurisprudência inteligente do Brasil. Pesquise decisões de todos os tribunais em segundos, com linguagem natural, e use os resultados diretamente na geração das suas peças — sem sair da plataforma.
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
              gap: 12,
              marginTop: 4,
            }}>
              {[
                { icon: "🔍", title: "Busca Semântica", desc: "Encontre decisões relevantes com linguagem natural, sem precisar de operadores booleanos." },
                { icon: "⚡", title: "Resultados em Tempo Real", desc: "Acesso ao acervo vivo dos tribunais — STF, STJ, TJs, TRFs e muito mais." },
                { icon: "🔗", title: "Integrado ao Gerador RAG", desc: "Os julgados encontrados são injetados automaticamente na geração das suas peças." },
              ].map(item => (
                <div key={item.title} style={{
                  background: "rgba(255,255,255,0.09)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: RADIUS.control,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}>
                  <div style={{ fontSize: 20 }}>{item.icon}</div>
                  <div style={{ fontSize: FONT.sm, fontWeight: 700, color: "#ffffff" }}>{item.title}</div>
                  <div style={{ fontSize: FONT.xs, color: "rgba(255,255,255,0.70)", lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
          {isDesktop && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flexShrink: 0,
              width: 140,
            }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                border: "2px solid rgba(255,255,255,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
              }}>⚖️</div>
              <div style={{ fontSize: FONT.xs, color: "rgba(255,255,255,0.65)", textAlign: "center", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Jus IA</div>
            </div>
          )}
        </div>

        {/* Banner de promoção */}
        {promocao?.ativa && (
          <div
            style={{
              marginTop: 32,
              padding: "16px 24px",
              background: "var(--color-accent-light)",
              border: "1px solid var(--color-accent)",
              borderRadius: RADIUS.card,
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: FONT.md,
                color: "var(--color-foreground)",
                fontWeight: 600,
              }}
            >
              🎉 {promocao.percentual}% OFF na 1ª mensalidade — recorrência
              integral a partir do 2º mês
            </p>
          </div>
        )}

        {/* Gatilhos mentais */}
        <div
          style={{
            textAlign: "center",
            maxWidth: 720,
            margin: "48px auto 0",
            display: "flex",
            flexDirection: "column",
            gap: SPACE.sm,
            alignItems: "center",
          }}
        >
          <p
            style={{
              fontSize: FONT.sm,
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            ☕ 1 peça complexa redigida pelo SmartJuris custa menos que um
            cafezinho.
          </p>
          <p
            style={{
              fontSize: FONT.sm,
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            ⚖️ Todos os planos rodam no modelo de inteligência artificial mais
            capaz para raciocínio lógico-jurídico.
          </p>
          <p
            style={{
              fontSize: FONT.sm,
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            📚 Planos Intermediário & Avançado incluem acesso à Jus IA — pesquise jurisprudência em tempo real de todos os tribunais brasileiros.
          </p>
        </div>
      </div>
    </section>
  )
}
