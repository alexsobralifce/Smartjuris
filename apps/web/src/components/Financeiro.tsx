import { useState, useEffect, useRef } from 'react'
import { api, getErrorMessage } from '../api/client'
import { maskCurrency } from '../utils/masks'
import Toast, { ToastMessage } from './Toast'
import Pagination, { usePagination } from './Pagination'

// Converte "R$ 15.500,00" -> 15500; ignora valores não numéricos ("20% do valor recuperado").
function parseValor(valor?: string): number {
  if (!valor) return 0
  const match = valor.match(/R\$\s*([\d.,]+)/)
  if (!match) return 0
  const normalized = match[1].replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isNaN(n) ? 0 : n
}

const formatBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Aceita "YYYY-MM-DD" (padrão do input date) ou "DD/MM/YYYY".
function parseDate(v?: string): Date | null {
  if (!v) return null
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]))
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState<'honorarios' | 'timesheet'>('honorarios')
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [timesheets, setTimesheets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Clientes para o seletor de busca no lançamento
  const [clientes, setClientes] = useState<any[]>([])
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false)
  const clienteSearchRef = useRef<HTMLDivElement>(null)

  // Paginação das tabelas de lançamentos e timesheet
  const lancamentosPagination = usePagination(lancamentos, 10)
  const timesheetsPagination = usePagination(timesheets, 10)

  // Estado do modal de novo lançamento (declarado ANTES do filtro de clientes para evitar TDZ)
  const [novoCliente, setNovoCliente] = useState('')
  const [novoTipo, setNovoTipo] = useState('Honorário Fixo')
  const [novoValor, setNovoValor] = useState('R$ 2.500,00')
  const [novoVencimento, setNovoVencimento] = useState('2026-09-10')

  // Filtro de clientes para o seletor de busca (case-insensitive, até 8)
  const clientesFiltrados = clientes
    .filter(c => (c.nome || '').toLowerCase().includes(novoCliente.toLowerCase()))
    .slice(0, 8)

  // Sistema de Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  // Timer local
  const [timerRunning, setTimerRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [descricaoAtividade, setDescricaoAtividade] = useState('')

  // Modal de novo lançamento
  const [showNovoLancamento, setShowNovoLancamento] = useState(false)

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
      addToast('error', 'Não foi possível carregar os dados financeiros.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Carrega clientes cadastrados para o seletor de busca
  useEffect(() => {
    api.clientes.list()
      .then(data => { if (Array.isArray(data)) setClientes(data) })
      .catch(e => {
        console.error(e)
        addToast('error', 'Não foi possível carregar a lista de clientes.')
      })
  }, [])

  // Fecha o dropdown ao clicar fora ou pressionar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clienteSearchRef.current && !clienteSearchRef.current.contains(e.target as Node)) {
        setClienteDropdownOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClienteDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
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
    if (seconds === 0) {
      addToast('error', 'Inicie o cronômetro antes de salvar o registro de horas.')
      return
    }
    if (!descricaoAtividade.trim()) {
      addToast('error', 'Digite a descrição da atividade faturável.')
      return
    }
    const minutos = Math.max(1, Math.round(seconds / 60))
    try {
      const res = await api.financeiro.createTimesheet({
        advogado: 'Dr. Advogado',
        descricao: descricaoAtividade,
        minutos,
        valorHora: '350,00'
      })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao registrar as horas.'))
        return
      }
      setSeconds(0)
      setTimerRunning(false)
      setDescricaoAtividade('')
      addToast('success', 'Registro de horas salvo com sucesso!')
      loadData()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao registrar as horas.')
    }
  }

  const handleCreateLancamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoCliente.trim()) {
      addToast('error', 'O Nome do Cliente é obrigatório no lançamento financeiro.')
      return
    }
    if (!novoValor.trim()) {
      addToast('error', 'Informe o Valor do lançamento.')
      return
    }
    try {
      const res = await api.financeiro.createLancamento({
        cliente: novoCliente,
        tipo: novoTipo,
        valor: novoValor,
        vencimento: novoVencimento,
        status: 'pendente'
      })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao registrar lançamento financeiro.'))
        return
      }
      setShowNovoLancamento(false)
      setNovoCliente('')
      addToast('success', 'Lançamento de honorários registrado com sucesso!')
      loadData()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao registrar lançamento financeiro.')
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'pago' ? 'pendente' : 'pago'
    try {
      const res = await api.financeiro.updateLancamento(id, { status: nextStatus })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao atualizar o status do lançamento.'))
        return
      }
      loadData()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao atualizar o status do lançamento.')
    }
  }

  // KPIs dos cards de resumo (valores reais derivados dos lançamentos)
  const agora = new Date()
  const pendentes = lancamentos.filter(l => l.status === 'pendente')
  const pagos = lancamentos.filter(l => l.status === 'pago')
  const noMesCorrente = (v?: string) => {
    const d = parseDate(v)
    return !!d && d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth()
  }
  const pendentesDoMes = pendentes.filter(l => noMesCorrente(l.vencimento))
  const pagosDoMes = pagos.filter(l => noMesCorrente(l.vencimento))
  const aReceberNoMes = pendentesDoMes.reduce((acc, l) => acc + parseValor(l.valor), 0)
  const recebidoNoMes = pagosDoMes.reduce((acc, l) => acc + parseValor(l.valor), 0)
  const totalPendente = pendentes.reduce((acc, l) => acc + parseValor(l.valor), 0)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            GESTÃO DE HONORÁRIOS & FATURAMENTO
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Financeiro & Registro de Horas
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
            ⏱️ Registro de Horas
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
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-primary)', marginTop: 6 }}>{formatBRL(aReceberNoMes)}</div>
              <div style={{ fontSize: 11, color: 'var(--color-success)', marginTop: 4 }}>{pendentes.length} {pendentes.length === 1 ? 'contrato ativo' : 'contratos ativos'}</div>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recebido no Mês</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-success)', marginTop: 6 }}>{formatBRL(recebidoNoMes)}</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{pagosDoMes.length} {pagosDoMes.length === 1 ? 'pagamento no mês' : 'pagamentos no mês'}</div>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Pendente em Aberto</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-accent)', marginTop: 6 }}>{formatBRL(totalPendente)}</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{pendentes.length} {pendentes.length === 1 ? 'pendência em aberto' : 'pendências em aberto'}</div>
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
                  lancamentosPagination.pageItems.map(l => (
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
            <Pagination {...lancamentosPagination} onPageChange={lancamentosPagination.setPage} />
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
                ⏱️ CRONÔMETRO DE ATIVIDADE FATURÁVEL (HORAS COBRÁVEIS)
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

          {/* Histórico do Registro de Horas */}
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
                  timesheetsPagination.pageItems.map(t => (
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
            <Pagination {...timesheetsPagination} onPageChange={timesheetsPagination.setPage} />
          </div>
        </div>
      )}

      {/* Modal de Novo Lançamento */}
      {showNovoLancamento && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 28, width: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontFamily: 'var(--font-display)' }}>Novo Lançamento Financeiro</h3>
            <form onSubmit={handleCreateLancamento} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div ref={clienteSearchRef} style={{ position: 'relative' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Nome do cliente</label>
                <input
                  required
                  type="text"
                  placeholder="Buscar cliente..."
                  value={novoCliente}
                  onChange={e => { setNovoCliente(e.target.value); setClienteDropdownOpen(true) }}
                  onFocus={() => setClienteDropdownOpen(true)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}
                />
                {clienteDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 6, marginTop: 4, boxShadow: '0 12px 32px rgba(24,23,15,0.14)',
                    maxHeight: 240, overflowY: 'auto',
                  }}>
                    {clientesFiltrados.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-muted)' }}>
                        Nenhum cliente encontrado — digite o nome manualmente
                      </div>
                    ) : (
                      clientesFiltrados.map(c => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => { setNovoCliente(c.nome); setClienteDropdownOpen(false) }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            width: '100%', padding: '9px 12px', border: 'none', background: 'transparent',
                            cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--color-foreground)',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, flexShrink: 0,
                            background: c.tipo === 'PF' ? 'var(--color-primary)' : 'var(--color-accent)', color: '#fff',
                          }}>{c.tipo}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Tipo de honorário</label>
                <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="Honorário Fixo">Honorário Fixo</option>
                  <option value="Êxito (Ad Exitum)">Êxito (Ad Exitum)</option>
                  <option value="Partido Mensal">Partido Mensal</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Valor monetário *</label>
                <input
                  required
                  type="text"
                  placeholder="R$ 0,00"
                  value={novoValor}
                  onChange={e => setNovoValor(maskCurrency(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Data de vencimento *</label>
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

      {/* Componente de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
