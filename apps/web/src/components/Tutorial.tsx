import { useState } from 'react'
import { FONT, RADIUS, SPACE } from '../ui'

interface TutorialStep {
  title: string
  subtitle: string
  description: string
  tips: string[]
  icon: string
}

const STEPS: TutorialStep[] = [
  {
    title: '1. Indexação & Base de Conhecimento Vetorial (RAG)',
    subtitle: 'Alimente o SmartJuris com os modelos e teses do seu escritório',
    description:
      'Faça upload de peças anteriores, acórdãos e minutas em PDF/DOCX no módulo "Base RAG". O motor BGE-M3 gera embeddings semânticos para recuperar suas teses em segundos.',
    tips: [
      'Suba modelos de petições com argumentos consolidados.',
      'Documentos são segregados com isolamento estrito por escritório.',
      'A busca semântica encontra argumentos mesmo com palavras diferentes.',
    ],
    icon: '📚',
  },
  {
    title: '2. Geração de Peças & Resumos com IA Supervisionada',
    subtitle: 'Redija iniciais, contestações e recursos com precisão cirúrgica',
    description:
      'No módulo "Gerar Peças", selecione o tipo de peça, o processo e insira os dados do caso. O Qwen com RAG gera a minuta em menos de 3 minutos, com citações da jurisprudência nacional.',
    tips: [
      'Utilize o streaming para acompanhar a redação em tempo real.',
      'Defina se deseja incluir jurisprudência vinculante dos tribunais.',
      'Prazos e intimações são resumidos automaticamente em 2 frases.',
    ],
    icon: '⚡',
  },
  {
    title: '3. Fila de Validação Humana & Crivo Ético OAB',
    subtitle: 'Nenhum documento sai do sistema sem o seu crivo e aprovação',
    description:
      'Todas as minutas geradas entram na fila do módulo "Validação". O advogado revisa, edita no Editor Rico e aprova ou reprova com auditoria completa de IP e horário antes de exportar em PDF/DOCX com timbre.',
    tips: [
      'Exportação bloqueada para peças sem aprovação expressa do advogado.',
      'Trilha de auditoria em conformidade com o Código de Ética da OAB.',
      'Adicione notas de revisão e calcule o custo exato em tokens.',
    ],
    icon: '⚖️',
  },
  {
    title: '4. Gestão Financeira, Timesheet & Jurimetria Preditiva',
    subtitle: 'Controle de honorários, horas faturáveis e estimativa de êxito',
    description:
      'Acompanhe lançamentos de honorários, cronometre minutos de atuação no timesheet com cálculo de horas faturáveis e simule a probabilidade de êxito no simulador de jurimetria.',
    tips: [
      'Cronômetro de timesheet com exportação para cobrança de clientes.',
      'Calculadora de risco processual por área e tribunal.',
      'Kanban de CRM para conversão de leads e novos contratos.',
    ],
    icon: '💼',
  },
]

export default function Tutorial() {
  const [activeStep, setActiveStep] = useState(0)
  const step = STEPS[activeStep]

  return (
    <div style={{
      maxWidth: 1000,
      margin: '0 auto',
      padding: '32px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: SPACE.xl,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          background: 'var(--color-badge-tint)',
          color: 'var(--color-primary)',
          fontSize: FONT.xs,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 10px',
          borderRadius: 20,
        }}>
          📖 Guia do Usuário
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          color: 'var(--color-foreground)',
          margin: '6px 0 0',
          letterSpacing: '-0.02em',
        }}>
          Como Operar o SmartJuris LexOS em 4 Passos
        </h1>
        <p style={{ fontSize: FONT.md, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
          Conheça o fluxo operacional padrão para extrair máxima produtividade com total segurança jurídica.
        </p>
      </div>

      {/* Navegação de Etapas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: SPACE.sm,
      }}>
        {STEPS.map((s, idx) => {
          const isActive = idx === activeStep
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveStep(idx)}
              style={{
                background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                color: isActive ? 'var(--color-on-primary)' : 'var(--color-foreground)',
                border: '1px solid var(--color-border)',
                borderRadius: RADIUS.card,
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <div style={{ fontSize: FONT.sm, fontWeight: isActive ? 700 : 500, lineHeight: 1.3 }}>
                Passo {idx + 1}
              </div>
            </button>
          )
        })}
      </div>

      {/* Conteúdo do Passo Ativo */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: RADIUS.modal,
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.lg,
        boxShadow: '0 4px 16px color-mix(in srgb, var(--color-foreground) 4%, transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>{step.icon}</span>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              color: 'var(--color-foreground)',
              margin: 0,
            }}>
              {step.title}
            </h2>
            <div style={{ fontSize: FONT.md, color: 'var(--color-muted)', marginTop: 2 }}>
              {step.subtitle}
            </div>
          </div>
        </div>

        <p style={{ fontSize: FONT.lg, color: 'var(--color-foreground)', lineHeight: 1.6, margin: 0 }}>
          {step.description}
        </p>

        <div style={{
          background: 'var(--color-surface-2)',
          borderRadius: RADIUS.card,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: FONT.xs, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary)' }}>
            💡 Boas práticas recomendadas:
          </div>
          {step.tips.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: FONT.md, color: 'var(--color-foreground)' }}>
              <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>✓</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
