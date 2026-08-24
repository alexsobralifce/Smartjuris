import { useState } from 'react'
import { FONT, RADIUS, SPACE } from '../ui'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface PieceExample {
  id: string
  title: string
  subtitle: string
  time: string
  complexity: 'Básica' | 'Média' | 'Alta' | 'Estratégica'
  icon: string
  bullets: string[]
  sampleExcerpt: string
}

const PIECE_EXAMPLES: PieceExample[] = [
  {
    id: 'iniciais',
    title: 'Petições Iniciais Estruturadas',
    subtitle: 'Com fatos cronológicos, pedidos líquidos e jurisprudência vinculante',
    time: '~2 a 3 min',
    complexity: 'Alta',
    icon: '📝',
    bullets: [
      'Ações Indenizatórias (Danos Morais / Materiais / Inscrição Indevida)',
      'Reclamatórias Trabalhistas com liquidação automática de verbas',
      'Execuções de Títulos e Ações Monitórias com cálculo de juros/correção',
      'Divórcios, Alimentos e Ações de Família com narrativa humanizada',
    ],
    sampleExcerpt:
      '«...Diante do manifesto descumprimento contratual e da negativa injustificada de cobertura securitária, restam configurados os requisitos do art. 300 do CPC para a concessão da tutela de urgência antecipada, cumulada com a condenação em danos morais in re ipsa, conforme tese fixada no Tema Repetitivo nº 938 do STJ...»',
  },
  {
    id: 'recursos',
    title: 'Recursos & Apelações com Cotejo Analítico',
    subtitle: 'Impugnação específica aos fundamentos da decisão recorrida',
    time: '~3 a 4 min',
    complexity: 'Estratégica',
    icon: '⚖️',
    bullets: [
      'Apelações Cíveis com demonstração de error in judicando e error in procedendo',
      'Recursos Ordinários Trabalhistas (TRT) e Recursos de Revista (TST)',
      'Agravos de Instrumento com pedido de efeito suspensivo ativo',
      'Embargos de Declaração para sanar omissões e prequestionar matérias',
    ],
    sampleExcerpt:
      '«...A r. sentença combatida incorreu em evidente omissão ao desconsiderar a prova testemunhal id. 849a2b, violando o princípio do contraditório substancial (art. 489, § 1º, IV, CPC). O cotejo analítico demonstra que o entendimento deste E. Tribunal converge categoricamente para o acolhimento da preliminar...»',
  },
  {
    id: 'contestações',
    title: 'Contestações & Defesas Técnicas',
    subtitle: 'Preliminares de mérito, impugnação de provas e teses subsidiárias',
    time: '~2 min',
    complexity: 'Média',
    icon: '🛡️',
    bullets: [
      'Defesas perante Juizados Especiais Cíveis (JEC) e Varas Cíveis',
      'Arguição precisa de incompetência territorial, ilegitimidade e prescrição',
      'Impugnação ao benefício da gratuidade de justiça e ao valor da causa',
      'Pedidos contrapostos e reconvenções estruturadas',
    ],
    sampleExcerpt:
      '«...PRELIMINARMENTE, suscita-se a ilegitimidade passiva ad causam da Requerida, haja vista que a cadeia de fornecimento restou integralmente executada por terceiro estranho à lide. NO MÉRITO, comprova-se a culpa exclusiva da vítima (art. 14, § 3º, II, CDC), impondo-se a total improcedência dos pedidos formulados...»',
  },
  {
    id: 'scanner',
    title: 'Auditorias & Pareceres de Contratos',
    subtitle: 'Scanner autônomo com mapa de riscos e sugestões de redação',
    time: '~1 min',
    complexity: 'Alta',
    icon: '🔍',
    bullets: [
      'Identificação instantânea de cláusulas nulas, leoninas ou de risco crítico',
      'Revisão de contratos de M&A, prestação de serviços e locação empresarial',
      'Adequação à LGPD (Lei 13.709/18) e conformidade regulatória',
      'Geração de minutas alternativas com equilíbrio econômico-financeiro',
    ],
    sampleExcerpt:
      '«...[ALERTA DE RISCO CRÍTICO - Cláusula 11.2]: A retenção integral das arras cumulada com multa penal compensatória de 30% excede o limite do art. 412 do Código Civil e jurisprudência pacífica do STJ. Redação sugerida: Adequar a penalidade para 10% do valor desembolsado...»',
  },
  {
    id: 'intimacoes',
    title: 'Resumos Executivos & Prazos Fatais',
    subtitle: 'Síntese em 2 frases da intimação com contagem de dias úteis',
    time: 'Instantâneo',
    complexity: 'Básica',
    icon: '⚡',
    bullets: [
      'Extração do comando judicial e ação imediata necessária',
      'Cálculo de prazo fatal com consideração de feriados e suspensões',
      'Vínculo direto ao processo e notificação aos advogados responsáveis',
      'Redação e higienização automática de PII (dados sensíveis)',
    ],
    sampleExcerpt:
      '«...[SÍNTESE IA]: O juízo da 3ª Vara Cível determinou a especificação de provas justificadas no prazo de 5 dias úteis. [PRAZO FATAL]: 28/08/2026 às 23h59. [AÇÃO RECOMENDADA]: Protocolar petição requerendo depoimento pessoal e prova pericial contábil...»',
  },
  {
    id: 'memoriais',
    title: 'Memoriais & Roteiros de Sustentação',
    subtitle: 'Visual law conciso e estratégico para os julgadores',
    time: '~2 min',
    complexity: 'Estratégica',
    icon: '🎯',
    bullets: [
      'Destaque em tópicos para entrega a desembargadores e ministros',
      'Resumo fático cronológico em bullet points de fácil leitura',
      'Roteiro temporizado para sustentação oral de 5 a 10 minutos',
      'Gráficos de jurimetria incorporáveis com taxas de êxito da matéria',
    ],
    sampleExcerpt:
      '«...SÍNTESE DOS PONTOS CHAVE PARA O JULGAMENTO:\n1. Inexistência de mora comprovada (comprovante id. 9102).\n2. Violação direta ao Tema 1.042 do STJ.\n3. Pedido: Provimento integral do recurso para afastar a penalidade contratual...»',
  },
]

const PLAN_CAPACITIES = [
  {
    plan: 'Plano 20 Peças/mês',
    subtitle: 'Básico · Advogado Solo',
    badge: 'Essencial',
    hoursSaved: '~40h / mês',
    productionList: [
      '6 Petições Iniciais (Cíveis, Família ou Trabalhistas)',
      '6 Contestações Técnicas (JEC e Varas Cíveis)',
      '4 Recursos (Agravos e Embargos de Declaração)',
      '4 Notificações / Pareceres / Contratos Simples',
    ],
    highlight: false,
    capacityNote: 'Capacidade ideal para bancas individuais com até 70 processos ativos.',
  },
  {
    plan: 'Plano 50 Peças/mês',
    subtitle: 'Intermediário · Sociedades de 2 a 3 Advogados',
    badge: 'Mais Escolhido',
    hoursSaved: '~100h / mês',
    productionList: [
      '15 Petições Iniciais Robustas (com Tutelas de Urgência)',
      '15 Contestações Complexas (com Preliminares de Mérito)',
      '10 Recursos de Grande Porte (Apelações com Cotejo / ROs)',
      '5 Auditorias & Scanners de Minutas Contratuais',
      '5 Réplicas e Manifestações sobre Perícias',
    ],
    highlight: true,
    capacityNote: 'Equivale à carga de trabalho de 1 advogado associado dedicado integralmente.',
  },
  {
    plan: 'Plano 100 Peças/mês',
    subtitle: 'Avançado · Bancas Estruturadas & Equipes',
    badge: 'Alta Performance',
    hoursSaved: '~200h / mês',
    productionList: [
      '30 Petições Iniciais Estratégicas e de Carteira',
      '30 Defesas e Contestações Corporativas Parametrizadas',
      '20 Recursos em Tribunais Superiores (STJ / STF / TST)',
      '10 Pareceres Societários, M&A e Acordos de Sócios',
      '10 Memoriais de Julgamento & Sustentações Orais',
    ],
    highlight: false,
    capacityNote: 'Custo unitário inferior a R$ 5,00 por peça qualificada produzida pela IA.',
  },
]

export default function ProductionShowcase() {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'
  const [selectedPiece, setSelectedPiece] = useState<string>(PIECE_EXAMPLES[0].id)
  const [viewMode, setViewMode] = useState<'pieces' | 'plans'>('pieces')

  const currentPiece = PIECE_EXAMPLES.find(p => p.id === selectedPiece) || PIECE_EXAMPLES[0]

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
      {/* Cabeçalho da Seção */}
      <div style={{ textAlign: 'center', maxWidth: 840, margin: '0 auto' }}>
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
          <span>⚡</span> Produtividade Jurídica em Escala
        </div>

        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? 26 : isTablet ? 32 : 38,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: 'var(--color-foreground)',
          margin: `0 0 ${SPACE.md}px`,
        }}>
          O que você produz em minutos com o SmartJuris
        </h2>

        <p style={{
          fontSize: isMobile ? FONT.base : FONT.xl,
          color: 'var(--color-muted)',
          lineHeight: 1.6,
          margin: 0,
        }}>
          Peças completas fundamentadas na jurisprudência dos tribunais brasileiros e no estilo do seu escritório, geradas com inteligência artificial supervisionada.
        </p>

        {/* Toggle de Visualização: Peças vs. Capacidade por Plano */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--color-surface-2)',
          padding: 4,
          borderRadius: RADIUS.control,
          marginTop: SPACE.xl,
          border: '1px solid var(--color-border)',
        }}>
          <button
            type="button"
            onClick={() => setViewMode('pieces')}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: RADIUS.chip,
              cursor: 'pointer',
              fontSize: FONT.md,
              fontWeight: 600,
              background: viewMode === 'pieces' ? 'var(--color-surface)' : 'transparent',
              color: viewMode === 'pieces' ? 'var(--color-primary)' : 'var(--color-muted)',
              boxShadow: viewMode === 'pieces' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Exemplos de Peças
          </button>
          <button
            type="button"
            onClick={() => setViewMode('plans')}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: RADIUS.chip,
              cursor: 'pointer',
              fontSize: FONT.md,
              fontWeight: 600,
              background: viewMode === 'plans' ? 'var(--color-surface)' : 'transparent',
              color: viewMode === 'plans' ? 'var(--color-primary)' : 'var(--color-muted)',
              boxShadow: viewMode === 'plans' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Capacidade por Plano (20, 50, 100)
          </button>
        </div>
      </div>

      {viewMode === 'pieces' ? (
        /* Modo 1: Mostruário com Fonte Proeminente e Pré-Visualização */
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '360px 1fr',
          gap: SPACE.xl,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.modal,
          overflow: 'hidden',
          boxShadow: '0 8px 30px color-mix(in srgb, var(--color-foreground) 4%, transparent)',
        }}>
          {/* Menu Lateral de Peças */}
          <div style={{
            background: 'var(--color-surface-2)',
            borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
            borderBottom: isMobile ? '1px solid var(--color-border)' : 'none',
            padding: isMobile ? SPACE.md : SPACE.lg,
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            gap: SPACE.sm,
            overflowX: isMobile ? 'auto' : 'visible',
          }}>
            {PIECE_EXAMPLES.map(p => {
              const active = p.id === selectedPiece
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPiece(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: SPACE.md,
                    padding: isMobile ? '10px 14px' : '14px 16px',
                    border: 'none',
                    borderRadius: RADIUS.card,
                    cursor: 'pointer',
                    background: active ? 'var(--color-primary)' : 'transparent',
                    color: active ? 'var(--color-on-primary)' : 'var(--color-foreground)',
                    textAlign: 'left',
                    transition: 'background 0.15s ease, color 0.15s ease',
                    whiteSpace: isMobile ? 'nowrap' : 'normal',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{p.icon}</span>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: active ? 700 : 500,
                      fontSize: FONT.md,
                    }}>
                      {p.title}
                    </span>
                  </div>
                  {!isMobile && (
                    <span style={{
                      fontSize: FONT.xs,
                      fontWeight: 600,
                      color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {p.time}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Área de Destaque da Peça com Tipografia Maior */}
          <div style={{
            padding: isMobile ? '24px 18px' : '36px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: SPACE.xl,
          }}>
            {/* Topo: Título em Fonte Grande + Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  background: 'var(--color-badge-tint)',
                  color: 'var(--color-primary)',
                  fontSize: FONT.xs,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '4px 10px',
                  borderRadius: RADIUS.chip,
                }}>
                  Complexidade: {currentPiece.complexity}
                </span>

                <span style={{
                  background: 'var(--color-success-light)',
                  color: 'var(--color-success)',
                  fontSize: FONT.xs,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: RADIUS.chip,
                }}>
                  ⏱️ Tempo Médio: {currentPiece.time}
                </span>
              </div>

              {/* TÍTULO EM FONTE MAIOR CONFORME REQUISITO */}
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: isMobile ? 22 : 28,
                color: 'var(--color-foreground)',
                margin: '4px 0 0',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}>
                {currentPiece.title}
              </h3>

              <div style={{ fontSize: FONT.lg, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                {currentPiece.subtitle}
              </div>
            </div>

            {/* Lista de Exemplos Desenvolvíveis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: FONT.xs, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)' }}>
                O que você pode gerar com este módulo:
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: SPACE.sm,
              }}>
                {currentPiece.bullets.map((b, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: FONT.md,
                    color: 'var(--color-foreground)',
                    lineHeight: 1.4,
                  }}>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>✓</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trecho Real de Demonstração */}
            <div style={{
              background: 'var(--color-surface-2)',
              borderLeft: '4px solid var(--color-accent)',
              borderRadius: '0 8px 8px 0',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <div style={{
                fontSize: FONT.xs,
                fontWeight: 600,
                color: 'var(--color-muted)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                Trecho de minuta gerada com fundamentação automática:
              </div>
              <div style={{
                fontFamily: 'var(--font-sans)',
                fontSize: FONT.md,
                fontStyle: 'italic',
                color: 'var(--color-foreground)',
                lineHeight: 1.6,
              }}>
                {currentPiece.sampleExcerpt}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Modo 2: Capacidade de Produção Mensal por Plano (20, 50, 100) */
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: SPACE.xl,
        }}>
          {PLAN_CAPACITIES.map(c => (
            <div
              key={c.plan}
              style={{
                background: 'var(--color-surface)',
                border: c.highlight ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: RADIUS.card,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: SPACE.lg,
                boxShadow: c.highlight
                  ? '0 12px 36px color-mix(in srgb, var(--color-primary) 12%, transparent)'
                  : '0 4px 16px color-mix(in srgb, var(--color-foreground) 4%, transparent)',
                position: 'relative',
              }}
            >
              {c.highlight && (
                <span style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  fontSize: FONT.xs,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '4px 12px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                }}>
                  {c.badge}
                </span>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-foreground)' }}>
                  {c.plan}
                </div>
                <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                  {c.subtitle}
                </div>
              </div>

              {/* Caixa de Economia de Tempo */}
              <div style={{
                background: 'var(--color-surface-2)',
                borderRadius: RADIUS.control,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)' }}>Economia Estimada:</span>
                <span style={{ fontSize: FONT.md, fontWeight: 700, color: 'var(--color-success)' }}>{c.hoursSaved}</span>
              </div>

              {/* Lista do que o usuário produz */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: FONT.xs, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary)' }}>
                  O que você produz em 1 mês:
                </div>
                {c.productionList.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: FONT.sm,
                    lineHeight: 1.4,
                    color: 'var(--color-foreground)',
                  }}>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div style={{
                borderTop: '1px solid var(--color-border)',
                paddingTop: SPACE.md,
                fontSize: FONT.xs,
                color: 'var(--color-muted)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}>
                💡 {c.capacityNote}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
