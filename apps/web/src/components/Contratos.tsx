import { useState } from 'react'

export default function Contratos() {
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
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            AGENTE AUTÔNOMO DE REVISÃO DOCUMENTAL
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Revisão de Contratos & Riscos
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 4 }}>
            Detecção automática de cláusulas abusivas, riscos de sucumbência e sugestões de redação alternativa.
          </p>
        </div>

        <button
          onClick={handlePreencherExemplo}
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          📄 Carregar Minuta de Exemplo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Editor da Minuta */}
        <form onSubmit={handleAnaliseContrato} style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              Cole a Minuta Contratual (PDF / Texto)
            </label>
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{minutaTexto.length} caracteres</span>
          </div>

          <textarea
            value={minutaTexto}
            onChange={e => setMinutaTexto(e.target.value)}
            placeholder="Cole aqui o texto do contrato comercial ou prestação de serviços..."
            rows={14}
            style={{
              width: '100%', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 6,
              fontSize: 13, background: 'var(--color-background)', color: 'var(--color-foreground)',
              outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5
            }}
          />

          <button
            disabled={analyzing || !minutaTexto.trim()}
            type="submit"
            style={{
              background: minutaTexto.trim() ? 'var(--color-primary)' : 'var(--color-border)',
              color: '#fff', border: 'none', padding: '12px', borderRadius: 6,
              fontSize: 13, fontWeight: 600, cursor: minutaTexto.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            {analyzing ? '🔍 Agente IA Analisando Cláusulas...' : '🤖 Analisar Cláusulas & Detectar Riscos →'}
          </button>
        </form>

        {/* Resultado da Análise de Risco */}
        <div>
          {!analiseResult ? (
            <div style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 8, padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-foreground)', marginBottom: 4 }}>Nenhum contrato analisado ainda</div>
              <div style={{ fontSize: 12, maxWidth: 320, margin: '0 auto' }}>Cole uma minuta ou clique em "Carregar Minuta de Exemplo" para executar o agente autônomo de risco.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Card de Score */}
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>PARECER DO AGENTE IA</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: 'var(--color-foreground)' }}>{analiseResult.nivel}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>ÍNDICE DE RISCO</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-warning)' }}>
                    {analiseResult.scoreRisco} / 100
                  </div>
                </div>
              </div>

              {/* Lista de Cláusulas Sinalizadas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analiseResult.clausulas.map((c: any, i: number) => (
                  <div key={i} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18, borderLeft: `4px solid ${c.cor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.titulo}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.cor, textTransform: 'uppercase' }}>
                        {c.status}
                      </span>
                    </div>

                    {c.evidencia && (
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', background: '#eef0f7', padding: '4px 8px', borderRadius: 4, marginBottom: 8 }}>
                        {c.evidencia}
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                      <strong>Problema identificado:</strong> {c.problema}
                    </div>

                    <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 4, padding: 10, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <strong>💡 Sugestão de Redação Playbook:</strong><br/>
                      {c.sugestao}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
