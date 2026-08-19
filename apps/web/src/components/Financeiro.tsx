import { useState, useEffect } from 'react'
import { api } from '../api/client'

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState<'honorarios' | 'timesheet'>('honorarios')
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [timesheets, setTimesheets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Timer local
  const [timerRunning, setTimerRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [descricaoAtividade, setDescricaoAtividade] = useState('')

  // Modal de novo lançamento
  const [showNovoLancamento, setShowNovoLancamento] = useState(false)
  const [novoCliente, setNovoCliente] = useState('')
  const [novoTipo, setNovoTipo] = useState('Honorário Fixo')
  const [novoValor, setNovoValor] = useState('R$ 2.500,00')
  const [novoVencimento, setNovoVencimento] = useState('2026-09-10')

  const loadData = async () => {
    setLoading(true)
    try {
      const [lData, tData] = await Promise.all([
        api.financeiro.listLancamentos(),
        api.financeiro.listTimesheet()
      ])
      if (Array.isArray(lData)) setLancamentos(lData)
      if (Array.isArray(tData)) setTimesheets(tData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Cronômetro de Timesheet
  useEffect(() => {
    let interval: any = null
    if (timerRunning) {
      interval = setInterval(() => {
        setSeconds(s => s + 1)
      }, 1000)
    } else if (!timerRunning && seconds !== 0) {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [timerRunning, seconds])

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleSaveTimer = async () => {
    if (seconds === 0 || !descricaoAtividade.trim()) return
    const minutos = Math.max(1, Math.round(seconds / 60))
    try {
      await api.financeiro.createTimesheet({
        advogado: 'Dr. Advogado',
        descricao: descricaoAtividade,
        minutos,
        valorHora: '350,00'
      })
      setSeconds(0)
      setTimerRunning(false)
      setDescricaoAtividade('')
      loadData()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateLancamento = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.financeiro.createLancamento({
        cliente: novoCliente,
        tipo: novoTipo,
        valor: novoValor,
        vencimento: novoVencimento,
        status: 'pendente'
      })
      setShowNovoLancamento(false)
      setNovoCliente('')
      loadData()
    } catch (e) {
      console.error(e)
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'pago' ? 'pendente' : 'pago'
    try {
      await api.financeiro.updateLancamento(id, { status: nextStatus })
      loadData()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            GESTÃO DE HONORÁRIOS & FATURAMENTO
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Financeiro & Timesheet
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 4 }}>
            Controle de honorários contratuais, taxa de êxito e horas faturáveis de advogados.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('honorarios')}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)',
              background: activeTab === 'honorarios' ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeTab === 'honorarios' ? '#fff' : 'var(--color-muted)', cursor: 'pointer'
            }}
          >
            💰 Honorários e Contas
          </button>
          <button
            onClick={() => setActiveTab('timesheet')}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)',
              background: activeTab === 'timesheet' ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeTab === 'timesheet' ? '#fff' : 'var(--color-muted)', cursor: 'pointer'
            }}
          >
            ⏱️ Timesheet (Horas)
          </button>
        </div>
      </div>

      {/* Seção 1: Honorários e Lançamentos */}
      {activeTab === 'honorarios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cards de Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>A Receber neste Mês</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-primary)', marginTop: 6 }}>R$ 15.500,00</div>
              <div style={{ fontSize: 11, color: 'var(--color-success)', marginTop: 4 }}>3 contratos ativos</div>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Honorários de Êxito (Ad Exitum)</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-accent)', marginTop: 6 }}>R$ 48.200,00</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>Previsão baseada em jurimetria</div>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taxa de Inadimplência</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-success)', marginTop: 6 }}>2.1%</div>
              <div style={{ fontSize: 11, color: 'var(--color-success)', marginTop: 4 }}>Abaixo do padrão de mercado (8%)</div>
            </div>
          </div>

          {/* Botão de Adicionar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Lançamentos de Honorários</div>
            <button
              onClick={() => setShowNovoLancamento(true)}
              style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              + Novo Lançamento
            </button>
          </div>

          {/* Tabela de Lançamentos */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['Cliente', 'Tipo de Honorário', 'Valor', 'Vencimento', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)' }}>Carregando lançamentos...</td></tr>
                ) : lancamentos.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)' }}>Nenhum lançamento cadastrado.</td></tr>
                ) : (
                  lancamentos.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 600, fontSize: 13 }}>{l.cliente}</td>
                      <td style={{ padding: '14px 18px', fontSize: 12 }}>{l.tipo}</td>
                      <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{l.valor}</td>
                      <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)' }}>{l.vencimento}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
                          background: l.status === 'pago' ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                          color: l.status === 'pago' ? 'var(--color-success)' : 'var(--color-warning)'
                        }}>
                          {l.status === 'pago' ? '✓ Pago' : 'Pendência'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <button
                          onClick={() => handleToggleStatus(l.id, l.status)}
                          style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                        >
                          {l.status === 'pago' ? 'Marcar Pendente' : 'Marcar Pago'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Seção 2: Timesheet & Gravação de Horas */}
      {activeTab === 'timesheet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Cronômetro Widget */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, marginRight: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                ⏱️ CRONÔMETRO DE ATIVIDADE FATURÁVEL (BILLABLE HOURS)
              </div>
              <input
                type="text"
                placeholder="Ex: Minuta de Agravo de Instrumento para Fernanda Oliveira..."
                value={descricaoAtividade}
                onChange={e => setDescricaoAtividade(e.target.value)}
                style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-background)', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 700, minWidth: 110, textAlign: 'center', color: timerRunning ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                {formatTimer(seconds)}
              </div>

              {!timerRunning ? (
                <button
                  onClick={() => setTimerRunning(true)}
                  style={{ background: 'var(--color-success)', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  ▶ Iniciar
                </button>
              ) : (
                <button
                  onClick={() => setTimerRunning(false)}
                  style={{ background: 'var(--color-warning)', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  ⏸ Pausar
                </button>
              )}

              <button
                disabled={seconds === 0}
                onClick={handleSaveTimer}
                style={{ background: seconds > 0 ? 'var(--color-primary)' : 'var(--color-border)', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: seconds > 0 ? 'pointer' : 'not-allowed' }}
              >
                💾 Registrar Horas
              </button>
            </div>
          </div>

          {/* Histórico do Timesheet */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>
              Histórico de Horas Registradas no Mês
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['Advogado', 'Descrição da Tarefa', 'Duração', 'Valor Calculado', 'Faturado'].map(h => (
                    <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timesheets.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)' }}>Nenhuma hora registrada ainda.</td></tr>
                ) : (
                  timesheets.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 18px', fontSize: 12, fontWeight: 600 }}>{t.advogado}</td>
                      <td style={{ padding: '12px 18px', fontSize: 13 }}>{t.descricao}</td>
                      <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.minutos} min</td>
                      <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
                        R$ {((t.minutos / 60) * 350).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: t.faturado === 'sim' ? 'var(--color-success-light)' : 'var(--color-warning-light)', color: t.faturado === 'sim' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                          {t.faturado === 'sim' ? '✓ Faturado' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Novo Lançamento */}
      {showNovoLancamento && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 28, width: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontFamily: 'var(--font-display)' }}>Novo Lançamento Financeiro</h3>
            <form onSubmit={handleCreateLancamento} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>NOME DO CLIENTE</label>
                <input required type="text" placeholder="Ex: Fernanda Oliveira" value={novoCliente} onChange={e => setNovoCliente(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>TIPO DE HONORÁRIO</label>
                <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="Honorário Fixo">Honorário Fixo</option>
                  <option value="Êxito (Ad Exitum)">Êxito (Ad Exitum)</option>
                  <option value="Partido Mensal">Partido Mensal</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>VALOR</label>
                <input required type="text" value={novoValor} onChange={e => setNovoValor(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono)' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>DATA DE VENCIMENTO</label>
                <input required type="date" value={novoVencimento} onChange={e => setNovoVencimento(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono)' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setShowNovoLancamento(false)} style={{ padding: '8px 14px', border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 18px', border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salvar Lançamento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
