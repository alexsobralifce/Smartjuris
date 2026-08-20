import { useState } from 'react'
import { Button, EmptyState, FONT, inputStyle, PageContainer, PageHeader, RADIUS, SPACE, useIsMobile } from '../ui'

export default function Contratos() {
  const isMobile = useIsMobile()
  const [minutaTexto, setMinutaTexto] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analiseResult, setAnaliseResult] = useState<any | null>(null)

  const handleAnaliseContrato = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!minutaTexto.trim()) return
    setAnalyzing(true)
    setAnaliseResult(null)

    // Simulação da análise do Agente Autônomo baseada no Playbook
    setTimeout(() => {
      setAnaliseResult({
        scoreRisco: 65, // 0 a 100
        nivel: 'Risco Moderado / Requer Ajustes',
        clausulas: [
          {
            titulo: 'Cláusula 8ª — Foro de Eleição Exclusivo',
            status: 'Risco Alto',
            cor: 'var(--color-danger)',
            bg: 'var(--color-danger-light)',
            evidencia: '📍 Localização no Documento: Pág. 3, Parágrafo 2º, Linhas 14-16',
            problema: 'Eleição de foro em comarca distante (Manaus/AM) desproporcional ao valor do contrato.',
            sugestao: 'Redigir: "Fica eleito o foro da Comarca da Capital do Estado de São Paulo..."'
          },
          {
            titulo: 'Cláusula 12ª — Multa Rescisória de 40%',
            status: 'Atenção',
            cor: 'var(--color-warning)',
            bg: 'var(--color-warning-light)',
            evidencia: '📍 Localização no Documento: Pág. 4, Parágrafo 1º, Linhas 08-11',
            problema: 'Percentual de multa contratual (40%) acima do teto jurisprudencial de 10% a 20%.',
            sugestao: 'Reduzir a multa rescisória para 10% sobre o saldo devedor conforme art. 412 do Código Civil.'
          },
          {
            titulo: 'Cláusula 4ª — Prazo de Pagamento e Reajuste',
            status: 'Conforme',
            cor: 'var(--color-success)',
            bg: 'var(--color-success-light)',
            evidencia: '📍 Localização no Documento: Pág. 1, Parágrafo 4º, Linhas 02-05',
            problema: 'Reajuste anual pelo IPCA devidamente especificado.',
            sugestao: 'Manter a redação original.'
          }
        ]
      })
      setAnalyzing(false)
    }, 1200)
  }

  const handlePreencherExemplo = () => {
    setMinutaTexto(`CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TECNOLOGIA

CLÁUSULA PRIMEIRA — DO OBJETO
O presente contrato tem por objeto a prestação de serviços de desenvolvimento de software sob demanda.

CLÁUSULA QUARTA — DO PREÇO E REAJUSTE
Pela execução dos serviços, a CONTRATANTE pagará o valor mensal de R$ 15.000,00 (quinze mil reais), reajustado anualmente pela variação positiva do IPCA/IBGE.

CLÁUSULA OITAVA — DO FORO
Para dirimir quaisquer dúvidas oriundas deste instrumento, as partes elegem de forma irrevogável o Foro da Comarca de Manaus/AM, renunciando a qualquer outro por mais privilegiado que seja.

CLÁUSULA DÉCIMA SEGUNDA — DA RESCISÃO E MULTA
A rescisão imotivada por qualquer das partes sujeitará a parte infratora ao pagamento de multa compensatória correspondente a 40% (quarenta por cento) do valor total restante do contrato.`)
  }

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
      {/* Header */}
      <PageHeader
        eyebrow="REVISÃO CONTRATUAL"
        title="Revisão de Contratos & Riscos"
        description="Detecção automática de cláusulas abusivas, riscos de sucumbência e sugestões de redação alternativa."
        action={
          <Button variant="secondary" size="sm" onClick={handlePreencherExemplo}>
            📄 Carregar Minuta de Exemplo
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACE.xxl, alignItems: 'start' }}>
        {/* Editor da Minuta */}
        <form onSubmit={handleAnaliseContrato} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xxl }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--color-muted)' }}>
              Cole a minuta contratual (PDF / texto)
            </label>
            <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{minutaTexto.length} caracteres</span>
          </div>

          <textarea
            value={minutaTexto}
            onChange={e => setMinutaTexto(e.target.value)}
            placeholder="Cole aqui o texto do contrato comercial ou prestação de serviços..."
            rows={14}
            style={{
              ...inputStyle(), background: 'var(--color-background)',
              resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5
            }}
          />

          <Button type="submit" disabled={analyzing || !minutaTexto.trim()}>
            {analyzing ? '🔍 Agente IA Analisando Cláusulas...' : '🤖 Analisar Cláusulas & Detectar Riscos →'}
          </Button>
        </form>

        {/* Resultado da Análise de Risco */}
        <div>
          {!analiseResult ? (
            <div style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xxl }}>
              <EmptyState icon="🛡️" message="Nenhum contrato analisado ainda. Cole uma minuta ou clique em 'Carregar Minuta de Exemplo' para executar o agente autônomo de risco." />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              {/* Card de Score */}
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xl, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.md }}>
                <div>
                  <div style={{ fontSize: FONT.xs, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>PARECER DO AGENTE IA</div>
                  <div style={{ fontSize: FONT.xl, fontWeight: 600, marginTop: 2, color: 'var(--color-foreground)' }}>{analiseResult.nivel}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)' }}>ÍNDICE DE RISCO</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-warning)' }}>
                    {analiseResult.scoreRisco} / 100
                  </div>
                </div>
              </div>

              {/* Lista de Cláusulas Sinalizadas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
                {analiseResult.clausulas.map((c: any, i: number) => (
                  <div key={i} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg, borderLeft: `4px solid ${c.cor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: FONT.md, fontWeight: 600 }}>{c.titulo}</span>
                      <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '2px 8px', borderRadius: RADIUS.chip, background: c.bg, color: c.cor, textTransform: 'uppercase' }}>
                        {c.status}
                      </span>
                    </div>

                    {c.evidencia && (
                      <div style={{ fontSize: FONT.sm, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '4px 8px', borderRadius: RADIUS.chip, marginBottom: SPACE.sm }}>
                        {c.evidencia}
                      </div>
                    )}

                    <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.sm, lineHeight: 1.4 }}>
                      <strong>Problema identificado:</strong> {c.problema}
                    </div>

                    <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: RADIUS.chip, padding: 10, fontSize: FONT.sm, fontFamily: 'var(--font-mono)' }}>
                      <strong>💡 Sugestão de Redação Padronizada:</strong><br/>
                      {c.sugestao}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
