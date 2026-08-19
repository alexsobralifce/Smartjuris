import { useState, useEffect } from 'react'
import { addPeca } from '../db/store'

type Step = 'tipo' | 'dados' | 'gerando' | 'revisao'

const areas = ['Cível', 'Trabalhista', 'Tributário', 'Penal', 'Previdenciário', 'Consumerista']

const tiposPorArea: Record<string, string[]> = {
  'Cível': ['Petição Inicial', 'Contestação', 'Réplica', 'Recurso de Apelação', 'Agravo de Instrumento', 'Embargos de Declaração', 'Impugnação ao Cumprimento de Sentença'],
  'Trabalhista': ['Reclamação Trabalhista', 'Contestação Trabalhista', 'Recurso Ordinário', 'Recurso de Revista', 'Agravo de Petição'],
  'Tributário': ['Mandado de Segurança Tributário', 'Ação Anulatória', 'Ação de Repetição de Indébito', 'Embargos à Execução Fiscal'],
  'Penal': ['Queixa-Crime', 'Resposta à Acusação', 'Memoriais', 'Habeas Corpus', 'Apelação Criminal'],
  'Previdenciário': ['Ação de Concessão de Benefício', 'Revisão de Benefício', 'Recurso ao CRPS'],
  'Consumerista': ['Petição Inicial CDC', 'Ação de Danos Morais', 'Ação de Obrigação de Fazer'],
}

const pecaGerada = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP

Processo nº 0001234-56.2024.5.02.0001

FERNANDA OLIVEIRA, brasileira, solteira, portadora do RG nº 12.345.678-9 SSP/SP e do CPF nº 123.456.789-00, residente e domiciliada na Rua das Flores, nº 123, Bairro Jardim Europa, São Paulo/SP, CEP 01.234-567, por meio de seu advogado que esta subscreve (procuração anexa), vem, respeitosamente, à presença de Vossa Excelência, apresentar

RECLAMAÇÃO TRABALHISTA

em face de EMPRESA XYZ S.A., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-90, com sede na Av. Paulista, nº 1.000, São Paulo/SP, CEP 01.310-100, pelos fatos e fundamentos de direito a seguir expostos.

I — DOS FATOS

A Reclamante foi admitida pela Reclamada em 15 de março de 2019, na função de Analista Financeira, mediante contrato de trabalho por prazo indeterminado, cumprindo jornada de segunda a sexta-feira, das 08h00 às 18h00, com intervalo intrajornada de uma hora, percebendo, à época da rescisão, salário mensal de R$ 8.500,00 (oito mil e quinhentos reais).

Ocorre que, em flagrante violação aos direitos trabalhistas assegurados pela Consolidação das Leis do Trabalho — CLT e pela Constituição Federal de 1988, a Reclamada passou a exigir da Reclamante a prestação sistemática de horas extraordinárias, sem a correspondente compensação ou pagamento adicional, em ofensa direta ao disposto no art. 7º, XIII e XVI, da Carta Magna.

[...]

II — DO DIREITO

Consoante o entendimento consolidado pelo Tribunal Superior do Trabalho, a supressão de horas extraordinárias habituais gera direito à indenização correspondente, nos exatos termos da Súmula 291 do TST, que assim dispõe:

"A supressão total ou parcial, pelo empregador, de serviço suplementar prestado com habitualidade, durante pelo menos 1 (um) ano, assegura ao empregado o direito à indenização correspondente ao valor de 1 (um) mês das horas suprimidas para cada ano ou fração igual ou superior a seis meses de prestação de serviço acima da jornada normal."

[Documento gerado automaticamente pelo motor RAG — aguardando revisão humana obrigatória]`

const ragChunks = [
  { fonte: 'Súmula 291 TST', trecho: 'A supressão total ou parcial de serviço suplementar assegura indenização...', relevancia: 0.94 },
  { fonte: 'CLT Art. 59 §1º', trecho: 'As horas extraordinárias serão remuneradas com acréscimo mínimo de 50%...', relevancia: 0.91 },
  { fonte: 'CF/88 Art. 7º, XVI', trecho: 'Remuneração do serviço extraordinário superior, no mínimo, em 50% à do normal...', relevancia: 0.89 },
  { fonte: 'TRT-2 · Ac. 2023-045678', trecho: 'A habitualidade de horas extras deve ser aferida por período mínimo de 12 meses...', relevancia: 0.85 },
]

export default function GeradorPecas() {
  const [step, setStep] = useState<Step>('tipo')
  const [area, setArea] = useState('Trabalhista')
  const [tipo, setTipo] = useState('')
  const [progresso, setProgresso] = useState(0)
  const [progressoLabel, setProgressoLabel] = useState('')
  const [copied, setCopied] = useState(false)

  const etapas = ['Selecionar Tipo', 'Dados do Caso', 'Geração IA', 'Revisão']
  const etapaIndex = ['tipo', 'dados', 'gerando', 'revisao'].indexOf(step)

  useEffect(() => {
    if (step === 'gerando') {
      const steps = [
        [20, 'Recuperando jurisprudência relevante (RAG)...'],
        [45, 'Selecionando precedentes do TST e TRT-2...'],
        [65, 'Aplicando template: Reclamação Trabalhista...'],
        [80, 'Gerando minuta com Claude 3.5 Sonnet...'],
        [92, 'Validando citações contra base indexada...'],
        [100, 'Concluído. Aguardando revisão humana.'],
      ]
      let i = 0
      const run = () => {
        if (i < steps.length) {
          setProgresso(steps[i][0] as number)
          setProgressoLabel(steps[i][1] as string)
          i++
          setTimeout(run, 900)
        } else {
          // Persist to localStorage
          const agora = new Date().toLocaleString('pt-BR').replace(',', '')
          addPeca({
            id: `PE-${Date.now()}`,
            processoId: '',
            tipo: tipo || 'Petição',
            area,
            cliente: 'Novo Cliente',
            status: 'revisao',
            prazo: '—',
            geradoEm: agora,
            modelo: 'Claude 3.5 Sonnet',
            fontes: ragChunks.length,
            conteudo: pecaGerada,
          })
          setTimeout(() => setStep('revisao'), 500)
        }
      }
      run()
    }
  }, [step, tipo, area])

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Gerar Peça Processual</div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>Motor RAG jurídico · BGE-M3 · Claude 3.5 Sonnet</div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36, gap: 0 }}>
        {etapas.map((e, i) => (
          <div key={e} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: i < etapaIndex ? 'var(--color-success)' : i === etapaIndex ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: i <= etapaIndex ? '#fff' : 'var(--color-muted)',
                border: i === etapaIndex ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}>
                {i < etapaIndex ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: i === etapaIndex ? 600 : 400, color: i === etapaIndex ? 'var(--color-foreground)' : 'var(--color-muted)' }}>{e}</span>
            </div>
            {i < etapas.length - 1 && (
              <div style={{ width: 48, height: 1, background: i < etapaIndex ? 'var(--color-success)' : 'var(--color-border)', margin: '0 12px' }}/>
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Tipo */}
      {step === 'tipo' && (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>Área do Direito</div>
            {areas.map(a => (
              <button key={a} onClick={() => { setArea(a); setTipo('') }} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', marginBottom: 4, borderRadius: 6,
                border: '1px solid', cursor: 'pointer',
                borderColor: area === a ? 'var(--color-primary)' : 'var(--color-border)',
                background: area === a ? '#eef0f7' : 'var(--color-surface)',
                color: area === a ? 'var(--color-primary)' : 'var(--color-foreground)',
                fontWeight: area === a ? 600 : 400, fontSize: 13,
              }}>{a}</button>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>Tipo de Peça — {area}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(tiposPorArea[area] || []).map(t => (
                <button key={t} onClick={() => setTipo(t)} style={{
                  padding: '16px 18px', borderRadius: 8, textAlign: 'left',
                  border: '1px solid', cursor: 'pointer',
                  borderColor: tipo === t ? 'var(--color-primary)' : 'var(--color-border)',
                  background: tipo === t ? '#eef0f7' : 'var(--color-surface)',
                  color: tipo === t ? 'var(--color-primary)' : 'var(--color-foreground)',
                  fontWeight: tipo === t ? 600 : 400, fontSize: 13,
                  transition: 'all 0.12s',
                }}>{t}</button>
              ))}
            </div>
            <div style={{ marginTop: 24 }}>
              <button
                disabled={!tipo}
                onClick={() => setStep('dados')}
                style={{
                  background: tipo ? 'var(--color-primary)' : 'var(--color-border)',
                  color: '#fff', border: 'none',
                  padding: '11px 28px', borderRadius: 6,
                  fontSize: 13, fontWeight: 600, cursor: tipo ? 'pointer' : 'not-allowed',
                }}>Continuar →</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dados */}
      {step === 'dados' && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)', borderRadius: 6, padding: '12px 16px', marginBottom: 24, fontSize: 12 }}>
            <strong>Modelo selecionado:</strong> {tipo} · Área {area}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {[
              { label: 'Número do Processo', placeholder: '0001234-56.2024.5.02.0001', full: true },
              { label: 'Vara / Tribunal', placeholder: '3ª Vara do Trabalho de SP', full: true },
              { label: 'Nome do Cliente (Reclamante)', placeholder: 'Fernanda Oliveira' },
              { label: 'CPF do Cliente', placeholder: '123.456.789-00' },
              { label: 'Parte Adversa', placeholder: 'Empresa XYZ S.A.' },
              { label: 'CNPJ/CPF da Parte Adversa', placeholder: '12.345.678/0001-90' },
              { label: 'Valor da Causa', placeholder: 'R$ 87.500,00' },
              { label: 'Data de Admissão', placeholder: '15/03/2019' },
            ].map(f => (
              <div key={f.label} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input
                  placeholder={f.placeholder}
                  style={{
                    width: '100%', padding: '9px 12px',
                    border: '1px solid var(--color-border)', borderRadius: 6,
                    fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)',
                    outline: 'none',
                  }}
                />
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Informações Adicionais / Contexto do Caso</label>
              <textarea placeholder="Descreva os fatos relevantes, pedidos específicos, valores a serem cobrados..." rows={4} style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid var(--color-border)', borderRadius: 6,
                fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)',
                outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)',
              }}/>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('tipo')} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, cursor: 'pointer' }}>← Voltar</button>
            <button onClick={() => setStep('gerando')} style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Gerar Peça com IA →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Gerando */}
      {step === 'gerando' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '32px' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 24 }}>Processando com IA...</div>

            <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'var(--color-primary)',
                width: `${progresso}%`,
                transition: 'width 0.6s ease',
              }}/>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)', marginBottom: 28 }}>{progressoLabel}</div>

            {ragChunks.slice(0, Math.floor(progresso / 25)).map(c => (
              <div key={c.fonte} style={{
                background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '10px 14px', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 2 }}>{c.fonte}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic' }}>"{c.trecho}"</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-success)', flexShrink: 0, marginLeft: 12 }}>{(c.relevancia * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Revisão */}
      {step === 'revisao' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <div>
            <div style={{ background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span><strong>Revisão humana obrigatória.</strong> Esta minuta foi gerada por IA e deve ser revisada por um advogado antes do protocolo.</span>
            </div>
            <div style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 8, padding: '24px 28px',
              fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.9,
              whiteSpace: 'pre-wrap', color: 'var(--color-foreground)',
              maxHeight: 520, overflow: 'auto',
            }}>
              {pecaGerada}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('tipo')} style={{ padding: '10px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, cursor: 'pointer' }}>Gerar Nova Versão</button>
              <button
                onClick={() => { navigator.clipboard.writeText(pecaGerada); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                style={{ padding: '10px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, cursor: 'pointer' }}
              >{copied ? '✓ Copiado' : 'Copiar Texto'}</button>
              <button style={{ background: 'var(--color-success)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ✓ Aprovar e Enviar para Fila
              </button>
            </div>
          </div>

          {/* RAG sidebar */}
          <div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600 }}>
                Fontes Recuperadas (RAG)
              </div>
              {ragChunks.map(c => (
                <div key={c.fonte} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)' }}>{c.fonte}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-success)' }}>{(c.relevancia * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>"{c.trecho}"</div>
                </div>
              ))}
              <div style={{ padding: '12px 16px', background: 'var(--color-surface-2)' }}>
                <div style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                  Modelo: Claude 3.5 Sonnet<br/>
                  Embeddings: BGE-M3<br/>
                  Chunks recuperados: 4 de 2.847<br/>
                  Latência: 3.2s
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
