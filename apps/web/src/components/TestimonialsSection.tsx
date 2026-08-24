import { FONT, RADIUS, SPACE } from '../ui'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface Testimonial {
  name: string
  oab: string
  role: string
  location: string
  uf: string
  area: string
  quote: string
  highlightMetric: string
  avatarBg: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Dra. Camila Albuquerque',
    oab: 'OAB/SP 412.890',
    role: 'Sócia-fundadora · Albuquerque & Associados',
    location: 'São Paulo',
    uf: 'SP',
    area: 'Contencioso Cível & Consumidor',
    quote:
      'Com mais de 400 processos ativos na capital paulista, o gerador de peças RAG reduziu nosso tempo de elaboração de iniciais e recursos de 4 horas para 15 minutos. A precisão na citação das súmulas do TJSP e do STJ é impecável.',
    highlightMetric: 'Tempo de minuta: 4h ➔ 15min',
    avatarBg: '#1a2744',
  },
  {
    name: 'Dr. Marcelo Vasconcelos',
    oab: 'OAB/RJ 198.340',
    role: 'Sócio · Vasconcelos & Prado Advogados',
    location: 'Rio de Janeiro',
    uf: 'RJ',
    area: 'Direito Empresarial & M&A',
    quote:
      'O scanner de revisão contratual do SmartJuris detectou cláusulas leoninas e brechas de responsabilidade civil em uma negociação de M&A em questão de segundos. Tornou-se indispensável para a nossa equipe consultiva.',
    highlightMetric: 'Scanner de riscos instantâneo',
    avatarBg: '#2d6a4f',
  },
  {
    name: 'Dra. Renata Figueiredo',
    oab: 'OAB/MG 156.780',
    role: 'Especialista Trabalhista · Figueiredo Advocacia',
    location: 'Belo Horizonte',
    uf: 'MG',
    area: 'Trabalhista & Previdenciário',
    quote:
      'A facilidade de alimentar o SmartJuris com nossos modelos de peças e obter minutas perfeitamente alinhadas ao estilo do escritório, com fundamentação na CLT e precedentes do TRT3, transformou nossa rentabilidade.',
    highlightMetric: 'Alinhamento 100% ao estilo da banca',
    avatarBg: '#5b4fcf',
  },
  {
    name: 'Dr. Eduardo Dornelles',
    oab: 'OAB/RS 89.450',
    role: 'Sócio Gestor · Dornelles Advocacia Rural',
    location: 'Passo Fundo',
    uf: 'RS',
    area: 'Agronegócio & Contratos Rurais',
    quote:
      'A jurimetria preditiva e o controle integrado de timesheet faturável nos permitiram apresentar aos produtores rurais relatórios de probabilidade de êxito com alto rigor técnico. A plataforma passa muita credibilidade.',
    highlightMetric: 'Jurimetria com rigor preditivo',
    avatarBg: '#92400e',
  },
  {
    name: 'Dra. Larissa Brandão',
    oab: 'OAB/BA 54.120',
    role: 'Titular · Brandão & Castro Advogados',
    location: 'Salvador',
    uf: 'BA',
    area: 'Direito à Saúde & Tutelas de Urgência',
    quote:
      'A elaboração de tutelas de urgência de saúde que antes exigiam pesquisa manual exaustiva agora é feita com fundamentação sólida em precedentes do TJBA em poucos minutos. Salvamos tempo e garantimos decisões favoráveis aos clientes.',
    highlightMetric: 'Tutelas liminares em < 3 minutos',
    avatarBg: '#c2185b',
  },
  {
    name: 'Dr. Henrique Alencastro',
    oab: 'OAB/DF 48.910',
    role: 'Sócio · Alencastro Práticas em Cortes Superiores',
    location: 'Brasília',
    uf: 'DF',
    area: 'Atuação perante STJ, TST e STF',
    quote:
      'O rigor ético e a fila de validação humana garantem que nossa assinatura digital só seja aposta em peças irretocáveis. A plataforma respeita a liturgia da advocacia sem abrir mão do que a IA tem de mais moderno.',
    highlightMetric: 'Validação ética OAB auditável',
    avatarBg: '#1a2744',
  },
]

function StarRating() {
  return (
    <div style={{ display: 'flex', gap: 2, color: 'var(--color-accent)' }}>
      {[...Array(5)].map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>
  )
}

export default function TestimonialsSection() {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'

  return (
    <section style={{
      maxWidth: 1240,
      margin: '0 auto',
      width: '100%',
      padding: isMobile ? '32px 20px' : isTablet ? '48px 32px' : '64px 48px',
      display: 'flex',
      flexDirection: 'column',
      gap: SPACE.xxl,
    }}>
      {/* Título da Seção */}
      <div style={{ textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--color-badge-tint)',
          color: 'var(--color-primary)',
          fontSize: FONT.xs,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '5px 12px',
          borderRadius: 20,
          marginBottom: SPACE.md,
        }}>
          <span>⭐</span> Prova Social em Todo o Brasil
        </div>

        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? 26 : isTablet ? 32 : 38,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: 'var(--color-foreground)',
          margin: `0 0 ${SPACE.md}px`,
        }}>
          Advogados de Norte a Sul confiam no SmartJuris
        </h2>

        <p style={{
          fontSize: isMobile ? FONT.base : FONT.xl,
          color: 'var(--color-muted)',
          lineHeight: 1.6,
          margin: 0,
        }}>
          Veja como bancas e advogados autônomos de diferentes estados e ramos do Direito elevaram seu faturamento e ganharam agilidade com a nossa IA.
        </p>
      </div>

      {/* Grade de Depoimentos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
        gap: SPACE.xl,
      }}>
        {TESTIMONIALS.map((t, idx) => {
          const initials = t.name
            .replace('Dra. ', '')
            .replace('Dr. ', '')
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')

          return (
            <div
              key={idx}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: RADIUS.card,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: SPACE.lg,
                boxShadow: '0 4px 20px color-mix(in srgb, var(--color-foreground) 4%, transparent)',
                position: 'relative',
              }}
            >
              {/* Topo do Card: Estrelas + Métrica */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <StarRating />
                <span style={{
                  fontSize: FONT.xs,
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  background: 'var(--color-surface-2)',
                  padding: '3px 8px',
                  borderRadius: RADIUS.chip,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {t.uf} · {t.area.split('&')[0].trim()}
                </span>
              </div>

              {/* Texto do Depoimento */}
              <p style={{
                fontSize: FONT.md,
                lineHeight: 1.6,
                color: 'var(--color-foreground)',
                margin: 0,
                fontStyle: 'normal',
              }}>
                "{t.quote}"
              </p>

              {/* Tag de Ganho Real */}
              <div style={{
                background: 'var(--color-accent-light)',
                color: 'var(--color-on-accent)',
                padding: '6px 12px',
                borderRadius: RADIUS.chip,
                fontSize: FONT.xs,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span>🚀</span>
                <span>{t.highlightMetric}</span>
              </div>

              {/* Autor do Depoimento */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderTop: '1px solid var(--color-border)',
                paddingTop: SPACE.md,
              }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: t.avatarBg,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: FONT.md,
                  flexShrink: 0,
                }}>
                  {initials}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: FONT.md,
                    color: 'var(--color-foreground)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {t.name}
                  </div>
                  <div style={{
                    fontSize: FONT.xs,
                    color: 'var(--color-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {t.oab} · {t.location}/{t.uf}
                  </div>
                  <div style={{
                    fontSize: FONT.xs,
                    color: 'var(--color-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {t.role}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
