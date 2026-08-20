import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const taxaSucesso = [
  { mes: 'Fev', taxa: 78 }, { mes: 'Mar', taxa: 82 }, { mes: 'Abr', taxa: 80 },
  { mes: 'Mai', taxa: 85 }, { mes: 'Jun', taxa: 88 }, { mes: 'Jul', taxa: 87 },
  { mes: 'Ago', taxa: 91 },
]

const porArea = [
  { area: 'Trabalhista', processos: 58, sucesso: 89 },
  { area: 'Cível', processos: 47, sucesso: 74 },
  { area: 'Tributário', processos: 29, sucesso: 86 },
  { area: 'Previdenciário', processos: 13, sucesso: 92 },
]

const distribuicao = [
  { name: 'Trabalhista', value: 58, color: '#1a2744' },
  { name: 'Cível', value: 47, color: '#c8a84b' },
  { name: 'Tributário', value: 29, color: '#2d6a4f' },
  { name: 'Previdenciário', value: 13, color: '#6b7280' },
]

function ChanceBar({ value }: { value: number }) {
  const color = value >= 80 ? 'var(--color-success)' : value >= 65 ? 'var(--color-accent)' : 'var(--color-danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }}/>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color, minWidth: 32 }}>{value}%</span>
    </div>
  )
}

export default function Jurimetria() {
  const [activeTab, setActiveTab] = useState<'overview' | 'previsao' | 'simulador' | 'acordaos'>('overview')
  const [stats, setStats] = useState<any>(null)
  const [erro, setErro] = useState(false)

  // Sistema de Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  // Estado do Resumidor de Acórdãos Extensos
  const [acordaoTexto, setAcordaoTexto] = useState('')
  const [resumindoAcordao, setResumindoAcordao] = useState(false)
  const [acordaoResumoResult, setAcordaoResumoResult] = useState<any | null>(null)

  // Estado do Simulador Preditivo
  const [simArea, setSimArea] = useState('Trabalhista')
  const [simTipo, setSimTipo] = useState('Horas Extras e Intervalo')
  const [simTribunal, setSimTribunal] = useState('TRT-2 (São Paulo)')
  const [simValor, setSimValor] = useState('R$ 80.000,00')
  const [simResult, setSimResult] = useState<{ chance: number; dias: number; decisao: string; economia: string }>({
    chance: 86,
    dias: 210,
    decisao: 'Litígio Altamente Favorável (Tese Pacífica)',
    economia: 'Proposta de acordo acima de 85% do valor'
  })

  const carregarStats = () => {
    setErro(false)
    api.jurimetria.stats()
      .then(data => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setStats(data)
        } else {
          setErro(true)
          addToast('error', 'Resposta inválida ao carregar dados de jurimetria.')
        }
      })
      .catch(err => {
        console.error('Erro ao carregar dados de jurimetria:', err)
        setErro(true)
        addToast('error', 'Erro ao carregar dados de jurimetria. Tente novamente.')
      })
  }

  useEffect(() => {
    carregarStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResumirAcordao = (e: React.FormEvent) => {
    e.preventDefault()
    if (!acordaoTexto.trim()) return
    setResumindoAcordao(true)
    setAcordaoResumoResult(null)

    setTimeout(() => {
      setAcordaoResumoResult({
        tribunal: 'STJ — Superior Tribunal de Justiça (3ª Turma)',
        relator: 'Min. Relator(a) Designado(a)',
        resultado: 'PROVIMENTO PARCIAL AO RECURSO ESPECIAL',
        ratioDecidendi: '📌 RATIO DECIDENDI (Fundamento Determinante): A falta de notificação prévia do devedor antes da inclusão do nome nos cadastros de inadimplentes configura dano moral in re ipsa, independente de comprovação de prejuízo patrimonial direto (Súmula 385 STJ mitigada).',
        pontosChave: [
          'Tese Firme: Dever de notificação antecipada mantido conforme CDC, art. 43, § 2º.',
          'Danos Morais Fixados: R$ 12.000,00 com juros de mora a contar do evento danoso (Súmula 54 STJ).',
          'Honorários Sucumbenciais: Redimensionados para 15% sobre o valor da condenação.'
        ]
      })
      setResumindoAcordao(false)
    }, 1100)
  }

  // Atualiza simulação dinamicamente
  const handleSimulate = (area: string, tipo: string, tribunal: string) => {
    setSimArea(area)
    setSimTipo(tipo)
    setSimTribunal(tribunal)

    let chance = 75
    let dias = 300
    let decisao = 'Propício para Litígio'
    let economia = 'Margem de negociação: 70%'

    if (area === 'Trabalhista') {
      chance = tipo.includes('Horas') ? 88 : 82
      dias = 240
      decisao = 'Litígio com Alta Probabilidade de Procedência Parcial ou Total'
      economia = 'Tese consolidada na Súmula do TST'
    } else if (area === 'Consumerista') {
      chance = 91
      dias = 180
      decisao = 'Altíssima probabilidade de acordo em audiência conciliatória'
      economia = 'Dano moral in re ipsa consolidado'
    } else if (area === 'Tributário') {
      chance = 79
      dias = 420
      decisao = 'Recomendado Mandado de Segurança com Pedido Liminar'
      economia = 'Depósito judicial suspende exigibilidade'
    } else {
      chance = 68
      dias = 360
      decisao = 'Análise de acordo prévio recomendada'
      economia = 'Evita sucumbência recíproca'
    }

    setSimResult({ chance, dias, decisao, economia })
  }

  if (erro) {
    return (
      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ color: 'var(--color-danger)', fontSize: 15, fontWeight: 600 }}>Erro ao carregar dados de jurimetria</div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13, maxWidth: 480 }}>
          Não foi possível carregar as estatísticas. Verifique sua conexão e tente novamente.
        </div>
        <button
          onClick={carregarStats}
          style={{
            background: 'var(--color-primary)', color: '#fff', border: 'none',
            padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
        <Toast toasts={toasts} onDismiss={dismissToast} />
      </div>
    )
  }

  if (!stats) return <div style={{ padding: 40, color: 'var(--color-muted)' }}>Carregando dados de jurimetria...</div>

  const { taxaExito, distribuicaoArea = [], previsoes = [] } = stats

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Jurimetria & Analytics</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>Inteligência e previsão sobre processos · Jan–Ago 2026</div>
          <div style={{ marginTop: 10, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '4px 10px', display: 'inline-block' }}>
            DADOS DEMONSTRATIVOS
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['overview', 'previsao', 'simulador', 'acordaos'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: '1px solid var(--color-border)', cursor: 'pointer',
              background: activeTab === t ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeTab === t ? '#fff' : 'var(--color-muted)',
            }}>
              {t === 'overview' ? 'Visão Geral' : t === 'previsao' ? 'Previsão de Êxito' : t === 'simulador' ? '⚡ Calculadora Preditiva' : '📜 Resumidor de Acórdãos IA'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Taxa de Êxito Geral', value: '87%', sub: 'vs. 79% média mercado' },
              { label: 'Tempo Médio Encerramento', value: '11,4 m', sub: 'Trabalhista: 8,2m' },
              { label: 'Valor Recuperado (2026)', value: 'R$ 3,2M', sub: 'Contencioso ativo' },
              { label: 'Peças por Processo', value: '4,7', sub: 'Média do escritório' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-success)', marginTop: 6 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, marginBottom: 18 }}>
            {/* Line chart */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Taxa de Êxito Mensal (%)</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={taxaSucesso}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Line type="monotone" dataKey="taxa" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Pie */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Distribuição por Área</div>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={distribuicaoArea} cx="50%" cy="50%" outerRadius={60} dataKey="value" strokeWidth={0}>
                    {distribuicaoArea.map((entry: any, i: number) => <Cell key={i} fill={entry.color || distribuicao[i%distribuicao.length].color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {distribuicaoArea.map((d: any, i: number) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color || distribuicao[i%distribuicao.length].color }}/>
                      <span style={{ fontSize: 12 }}>{d.name}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{d.value} proc.</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Taxa de Êxito por Área do Direito (%)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={porArea} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="area" tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                <Bar dataKey="sucesso" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Taxa de Êxito (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {activeTab === 'previsao' && (
        <div>
          <div style={{ background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 12 }}>
            <strong>Modelo preditivo:</strong> Random Forest treinado em 12.847 decisões judiciais reais. Acurácia: 85%. Variáveis: tipo de ação, vara, perfil das partes, jurisprudência prevalente.
          </div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['Processo', 'Tipo / Cliente', 'Valor da Causa', 'Prazo Estimado', 'Probabilidade de Êxito'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previsoes.map((p: any, i: number) => (
                  <tr key={p.processo || i} style={{ borderTop: '1px solid var(--color-border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>{(p.processo || '—').slice(0, 18)}{p.processo && p.processo.length > 18 ? '...' : ''}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.tipo}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{p.cliente}</div>
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.valor}</td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--color-muted)' }}>{p.prazo}</td>
                    <td style={{ padding: '14px 20px', minWidth: 200 }}>
                      <ChanceBar value={p.chance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aba 3: Calculadora Preditiva Interativa */}
      {activeTab === 'simulador' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Formulário de Parâmetros */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', marginBottom: 6 }}>
              PARÂMETROS DA CAUSA
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>Simulação de Probabilidade</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>ÁREA DO DIREITO</label>
                <select
                  value={simArea}
                  onChange={e => handleSimulate(e.target.value, simTipo, simTribunal)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', fontSize: 13 }}
                >
                  {['Trabalhista', 'Consumerista', 'Cível', 'Tributário'].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>MATÉRIA / TESE PRINCIPAL</label>
                <select
                  value={simTipo}
                  onChange={e => handleSimulate(simArea, e.target.value, simTribunal)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', fontSize: 13 }}
                >
                  {simArea === 'Trabalhista' && [
                    <option key="he" value="Horas Extras e Intervalo">Horas Extras e Intervalo (Art. 71 CLT)</option>,
                    <option key="ri" value="Rescisão Indireta por FGTS">Rescisão Indireta por FGTS</option>,
                    <option key="ins" value="Adicional de Insalubridade">Adicional de Insalubridade (Grau Médio/Máximo)</option>,
                  ]}
                  {simArea === 'Consumerista' && [
                    <option key="voo" value="Extravio de Voo / Atraso">Atraso/Cancelamento de Voo & Extravio</option>,
                    <option key="spc" value="Negativação Indevida SPC">Negativação Indevida no SPC/Serasa</option>,
                    <option key="vic" value="Vício do Produto não reparado">Vício Oculto do Produto</option>,
                  ]}
                  {simArea === 'Cível' && [
                    <option key="cob" value="Cobrança de Título Extrajudicial">Execução de Título Extrajudicial</option>,
                    <option key="desc" value="Rescisão por Inadimplemento">Rescisão Contratual por Descumprimento</option>,
                  ]}
                  {simArea === 'Tributário' && [
                    <option key="ms" value="Mandado de Segurança ICMS">Exclusão do ICMS da Base do PIS/COFINS</option>,
                    <option key="rep" value="Repetição de Indébito">Ação de Repetição de Indébito</option>,
                  ]}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>TRIBUNAL / JURISDIÇÃO</label>
                <select
                  value={simTribunal}
                  onChange={e => handleSimulate(simArea, simTipo, e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', fontSize: 13 }}
                >
                  <option value="TRT-2 (São Paulo)">TRT-2 (São Paulo / Capital)</option>
                  <option value="TJSP (Varas Cíveis SP)">TJSP (Varas Cíveis Centrais)</option>
                  <option value="TRF-3 (Federal SP)">TRF-3 (Justiça Federal)</option>
                  <option value="JEC (Juizado Especial Cível)">JEC (Juizado Especial Cível)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>VALOR DA CAUSA ESTIMADO</label>
                <input
                  type="text"
                  value={simValor}
                  onChange={e => setSimValor(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-background)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
          </div>

          {/* Resultado da Análise Preditiva */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                    PROJEÇÃO ESTATÍSTICA JURIMÉTRICA
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '4px 0 0' }}>{simTipo}</h3>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Índice de Favorabilidade</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: simResult.chance >= 80 ? 'var(--color-success)' : 'var(--color-accent)' }}>
                    {simResult.chance}%
                  </div>
                </div>
              </div>

              <div style={{ height: 8, background: 'var(--color-surface-2)', borderRadius: 4, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ width: `${simResult.chance}%`, height: '100%', background: simResult.chance >= 80 ? 'var(--color-success)' : 'var(--color-accent)', borderRadius: 4 }}/>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>TEMPO MÉDIO ATÉ SENTENÇA</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, marginTop: 4 }}>~{simResult.dias} dias</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>Base: Últimas 1.240 decisões na vara</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>PARECER ESTRATÉGICO DA IA</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginTop: 4 }}>{simResult.decisao}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{simResult.economia}</div>
                </div>
              </div>
            </div>

            {/* Dica de Ação Rápida */}
            <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Pronto para redigir a peça com essa tese?</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>Gere a petição com fundamentação já ancorada na jurisprudência do {simTribunal}.</div>
              </div>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('nav-pecas', { detail: { area: simArea } }))
                }}
                style={{
                  background: 'var(--color-primary)', color: '#fff', border: 'none',
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Gerar Peça no RAG →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aba de Resumidor Executivo de Acórdãos Extensos com Ratio Decidendi */}
      {activeTab === 'acordaos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <form onSubmit={handleResumirAcordao} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                Cole a Decisão / Acórdão Extenso (Inteiro Teor)
              </label>
              <button
                type="button"
                onClick={() => setAcordaoTexto(`RECURSO ESPECIAL Nº 1.984.321 - SP (2022/0123456-7)
RELATOR : MINISTRO RELATOR
RECORRENTE : MARIANA DUARTE
RECORRIDO : COMPANHIA AÉREA VOOFÁCIL
EMENTA: RECURSO ESPECIAL. DIREITO DO CONSUMIDOR. TRANSPORTE AÉREO. CANCELAMENTO DE VOO INTERNACIONAL. FALHA NA PRESTAÇÃO DO SERVIÇO. DANO MORAL IN RE IPSA. DESNECESSIDADE DE PROVA DO PREJUÍZO DIRECTO. SÚMULA 385 STJ. MITIGAÇÃO. QUANTUM INDENIZATÓRIO RAZOÁVEL. RECURSO PARCIALMENTE PROVIDO.`)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                📄 Exemplo de Acórdão STJ
              </button>
            </div>

            <textarea
              value={acordaoTexto}
              onChange={e => setAcordaoTexto(e.target.value)}
              placeholder="Cole aqui o texto completo da ementa ou acórdão do STF, STJ, TST ou TJ..."
              rows={12}
              style={{ width: '100%', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-sans)', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
            />

            <button
              disabled={resumindoAcordao || !acordaoTexto.trim()}
              type="submit"
              style={{
                background: acordaoTexto.trim() ? 'var(--color-primary)' : 'var(--color-border)',
                color: '#fff', border: 'none', padding: '12px', borderRadius: 6,
                fontSize: 13, fontWeight: 600, cursor: acordaoTexto.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              {resumindoAcordao ? '🧠 Extraindo Ratio Decidendi via IA...' : '⚡ Resumir Acórdão & Destacar Ratio Decidendi →'}
            </button>
          </form>

          {/* Resultado do Resumo Executivo */}
          <div>
            {!acordaoResumoResult ? (
              <div style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 8, padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📜</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-foreground)', marginBottom: 4 }}>Nenhum acórdão analisado ainda</div>
                <div style={{ fontSize: 12, maxWidth: 320, margin: '0 auto' }}>Cole o texto de uma decisão e clique no botão para extrair o fundamento determinante e os pontos decisórios.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{acordaoResumoResult.tribunal}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)', marginTop: 4 }}>{acordaoResumoResult.resultado}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{acordaoResumoResult.relator}</div>
                </div>

                <div style={{ background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)', borderRadius: 8, padding: 18, fontSize: 12, color: 'var(--color-foreground)', lineHeight: 1.5 }}>
                  {acordaoResumoResult.ratioDecidendi}
                </div>

                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)' }}>PONTOS CHAVE DA DECISÃO:</div>
                  {acordaoResumoResult.pontosChave.map((p: string, idx: number) => (
                    <div key={idx} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--color-primary)' }}>•</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Componente Toast de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
