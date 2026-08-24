import { useState } from 'react'
import { Button, FONT, RADIUS, SPACE } from '../ui'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface Plan {
  audience: string
  name: string
  price: string
  limit: string
  features: string[]
  cta: string
  highlight: boolean
}

const PLANS: Plan[] = [
  {
    audience: 'Ideal para advogados solo',
    name: 'Básico',
    price: 'R$ 180,00',
    limit: '20 peças completas por mês',
    features: [
      'Até 20 peças geradas com RAG BGE-M3 + Qwen',
      'Ideal para ~6 iniciais, 6 contestações e 8 recursos/contratos',
      'Economia de até ~40 horas de redação no mês',
      'Suporte técnico via WhatsApp e e-mail',
      'Exportação em PDF/DOCX com timbre personalizado',
      'Histórico seguro de peças por 60 dias',
    ],
    cta: 'Começar com o Básico',
    highlight: false,
  },
  {
    audience: 'Melhor Custo-Benefício',
    name: 'Intermediário',
    price: 'R$ 300,00',
    limit: '50 peças completas por mês',
    features: [
      'Tudo do Básico +',
      'Até 50 peças/mês (iniciais com tutelas, apelações e scanners)',
      'Economia de até ~100 horas/mês (1 advogado pleno equivalente)',
      'Análise de até 150 páginas de autos (PDF) por peça',
      'Scanner autônomo de riscos contratuais & jurimetria preditiva',
      'Suporte prioritário no WhatsApp',
      'Histórico ilimitado com busca semântica',
    ],
    cta: 'Escolher o Intermediário',
    highlight: true,
  },
  {
    audience: 'Ideal para bancas estabelecidas',
    name: 'Avançado',
    price: 'R$ 500,00',
    limit: '100 peças completas por mês',
    features: [
      'Tudo do Intermediário +',
      'Até 100 peças/mês (alta escala, recursos aos tribunais superiores)',
      'Economia de até ~200 horas/mês (2 advogados associados plenos)',
      'Custo unitário inferior a R$ 5,00 por peça qualificada',
      'Múltiplos perfis de usuário (até 3 advogados simultâneos)',
      'Fila de validação com governança e aprovação por sócio',
      'Agentes autônomos para revisão e teses customizadas',
    ],
    cta: 'Falar com vendas',
    highlight: false,
  },
]

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M5 13l4 4L19 7" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PricingCard({ plan }: { plan: Plan }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.lg,
        background: 'var(--color-surface)',
        border: plan.highlight ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
        borderRadius: RADIUS.card,
        padding: '28px 24px',
        boxShadow: plan.highlight
          ? '0 12px 40px color-mix(in srgb, var(--color-primary) 18%, transparent)'
          : '0 4px 16px color-mix(in srgb, var(--color-foreground) 5%, transparent)',
        transform: hovered ? (plan.highlight ? 'scale(1.03)' : 'scale(1.02)') : 'scale(1)',
        transition: 'transform 0.2s ease',
      }}
    >
      {plan.highlight && (
        <span style={{
          position: 'absolute',
          top: -13,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-accent)',
          color: 'var(--color-on-accent)',
          fontSize: FONT.xs,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '5px 14px',
          borderRadius: 20,
          whiteSpace: 'nowrap',
        }}>
          Mais Escolhido
        </span>
      )}

      <div style={{
        alignSelf: 'flex-start',
        background: 'var(--color-badge-tint)',
        color: 'var(--color-primary)',
        fontSize: FONT.xs,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        borderRadius: RADIUS.chip,
      }}>
        {plan.audience}
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--color-foreground)' }}>
        {plan.name}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--color-foreground)' }}>{plan.price}</span>
        <span style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>/mês</span>
      </div>

      <div style={{
        background: 'var(--color-surface-2)',
        color: 'var(--color-foreground)',
        fontSize: FONT.md,
        fontWeight: 600,
        padding: '8px 12px',
        borderRadius: RADIUS.control,
        textAlign: 'center',
      }}>
        {plan.limit}
      </div>

      <ul style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
        flex: 1,
      }}>
        {plan.features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.sm }}>
            <CheckIcon />
            <span style={{ fontSize: FONT.base, color: 'var(--color-foreground)', lineHeight: 1.5 }}>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={plan.highlight ? 'primary' : 'secondary'}
        style={{ width: '100%', padding: '11px', marginTop: SPACE.sm }}
      >
        {plan.cta}
      </Button>
    </div>
  )
}

export default function PricingSection() {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'
  const isDesktop = breakpoint === 'desktop'

  return (
    <section style={{
      background: 'var(--color-surface)',
      borderTop: '1px solid var(--color-border)',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: isMobile ? '48px 20px' : isTablet ? '56px 32px' : '72px 48px',
      }}>
        {/* Cabeçalho da seção */}
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 48px' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4.5vw, 36px)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            fontWeight: 400,
            color: 'var(--color-foreground)',
            margin: '0 0 16px',
          }}>
            Automatize sua rotina jurídica. Escolha o plano ideal para o seu escritório.
          </h2>
          <p style={{ fontSize: FONT.xl, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
            Produza peças complexas em minutos com a IA mais avançada do mercado. Cancele quando quiser.
          </p>
        </div>

        {/* Cartões de preço */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr',
          gap: SPACE.xxl,
          alignItems: 'stretch',
        }}>
          {PLANS.map(plan => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>

        {/* Gatilhos mentais */}
        <div style={{
          textAlign: 'center',
          maxWidth: 720,
          margin: '48px auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.sm,
          alignItems: 'center',
        }}>
          <p style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
            ☕ 1 peça complexa redigida pelo SmartJuris custa menos que um cafezinho.
          </p>
          <p style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
            ⚖️ Todos os planos rodam no modelo de inteligência artificial mais capaz para raciocínio lógico-jurídico.
          </p>
        </div>
      </div>
    </section>
  )
}
