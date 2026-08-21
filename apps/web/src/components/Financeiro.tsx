import { useState, useEffect, useRef } from 'react'
import { api, getErrorMessage } from '../api/client'
import { maskCurrency } from '../utils/masks'
import Toast, { ToastMessage } from './Toast'
import Pagination, { usePagination } from './Pagination'
import {
  FONT, SPACE, RADIUS, Z,
  PageContainer, PageHeader, Button, inputStyle, Field, FormGrid, FormRow,
  TableShell, Table, THeadRow, Th, Tr, Td, EmptyRow,
  Modal, useIsMobile,
} from '../ui'

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
  const isMobile = useIsMobile()
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
    <PageContainer>
      <PageHeader
        eyebrow="FINANCEIRO & TIMESHEET"
        title="Financeiro & Registro de Horas"
        description="Controle de honorários contratuais, taxa de êxito e horas faturáveis de advogados."
        action={
          <div style={{ display: 'flex', gap: SPACE.sm }}>
            <Button
              size="sm"
              variant={activeTab === 'honorarios' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('honorarios')}
            >
              💰 Honorários e Contas
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'timesheet' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('timesheet')}
            >
              ⏱️ Registro de Horas
            </Button>
          </div>
        }
      />

      {/* Seção 1: Honorários e Lançamentos */}
      {activeTab === 'honorarios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl, marginTop: SPACE.xxl }}>
          {/* Cards de Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: SPACE.lg }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xl }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>A Receber neste Mês</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, color: 'var(--color-primary)', marginTop: 6 }}>{formatBRL(aReceberNoMes)}</div>
              <div style={{ fontSize: FONT.sm, color: 'var(--color-success)', marginTop: SPACE.xs }}>{pendentes.length} {pendentes.length === 1 ? 'contrato ativo' : 'contratos ativos'}</div>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xl }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recebido no Mês</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, color: 'var(--color-success)', marginTop: 6 }}>{formatBRL(recebidoNoMes)}</div>
              <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: SPACE.xs }}>{pagosDoMes.length} {pagosDoMes.length === 1 ? 'pagamento no mês' : 'pagamentos no mês'}</div>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xl }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Pendente em Aberto</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, color: 'var(--color-accent)', marginTop: 6 }}>{formatBRL(totalPendente)}</div>
              <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: SPACE.xs }}>{pendentes.length} {pendentes.length === 1 ? 'pendência em aberto' : 'pendências em aberto'}</div>
            </div>
          </div>

          {/* Botão de Adicionar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.md }}>
            <div style={{ fontSize: FONT.lg, fontWeight: 600 }}>Lançamentos de Honorários</div>
            <Button onClick={() => setShowNovoLancamento(true)}>+ Novo Lançamento</Button>
          </div>

          {/* Tabela de Lançamentos */}
          <TableShell>
            <Table style={{ minWidth: 700 }}>
              <THeadRow>
                {['Cliente', 'Tipo de Honorário', 'Valor', 'Vencimento', 'Status', 'Ações'].map(h => (
                  <Th key={h}>{h}</Th>
                ))}
              </THeadRow>
              <tbody>
                {loading ? (
                  <EmptyRow colSpan={6} message="Carregando lançamentos..." />
                ) : lancamentos.length === 0 ? (
                  <EmptyRow colSpan={6} message="Nenhum lançamento cadastrado." />
                ) : (
                  lancamentosPagination.pageItems.map(l => (
                    <Tr key={l.id}>
                      <Td style={{ fontWeight: 600 }}>{l.cliente}</Td>
                      <Td>{l.tipo}</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.valor}</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{l.vencimento}</Td>
                      <Td>
                        <span style={{
                          fontSize: FONT.xs, fontWeight: 700, padding: '3px 8px', borderRadius: RADIUS.chip, textTransform: 'uppercase',
                          background: l.status === 'pago' ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                          color: l.status === 'pago' ? 'var(--color-success)' : 'var(--color-warning)'
                        }}>
                          {l.status === 'pago' ? '✓ Pago' : 'Pendência'}
                        </span>
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleToggleStatus(l.id, l.status)}
                        >
                          {l.status === 'pago' ? 'Marcar Pendente' : 'Marcar Pago'}
                        </Button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
            <Pagination {...lancamentosPagination} onPageChange={lancamentosPagination.setPage} />
          </TableShell>
        </div>
      )}

      {/* Seção 2: Timesheet & Gravação de Horas */}
      {activeTab === 'timesheet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl, marginTop: SPACE.xxl }}>
          {/* Cronômetro Widget */}
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card,
            padding: SPACE.xxl, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: SPACE.lg,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm, flex: 1, minWidth: isMobile ? '100%' : undefined, marginRight: isMobile ? 0 : SPACE.xxl }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                ⏱️ CRONÔMETRO DE ATIVIDADE FATURÁVEL (HORAS COBRÁVEIS)
              </div>
              <input
                type="text"
                placeholder="Ex: Minuta de Agravo de Instrumento para Fernanda Oliveira..."
                value={descricaoAtividade}
                onChange={e => setDescricaoAtividade(e.target.value)}
                style={inputStyle()}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.lg, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.pageTitle, fontWeight: 700, minWidth: 110, textAlign: 'center', color: timerRunning ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                {formatTimer(seconds)}
              </div>

              {!timerRunning ? (
                <Button
                  variant="secondary"
                  style={{ background: 'var(--color-success)', border: 'none', color: 'var(--color-on-primary)' }}
                  onClick={() => setTimerRunning(true)}
                >
                  ▶ Iniciar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  style={{ background: 'var(--color-warning)', border: 'none', color: 'var(--color-on-primary)' }}
                  onClick={() => setTimerRunning(false)}
                >
                  ⏸ Pausar
                </Button>
              )}

              <Button
                disabled={seconds === 0}
                onClick={handleSaveTimer}
              >
                💾 Registrar Horas
              </Button>
            </div>
          </div>

          {/* Histórico do Registro de Horas */}
          <TableShell>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: FONT.md }}>
              Histórico de Horas Registradas no Mês
            </div>
            <Table style={{ minWidth: 680 }}>
              <THeadRow>
                {['Advogado', 'Descrição da Tarefa', 'Duração', 'Valor Calculado', 'Faturado'].map(h => (
                  <Th key={h}>{h}</Th>
                ))}
              </THeadRow>
              <tbody>
                {timesheets.length === 0 ? (
                  <EmptyRow colSpan={5} message="Nenhuma hora registrada ainda." />
                ) : (
                  timesheetsPagination.pageItems.map(t => (
                    <Tr key={t.id}>
                      <Td style={{ fontWeight: 600 }}>{t.advogado}</Td>
                      <Td>{t.descricao}</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)' }}>{t.minutos} min</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        R$ {((t.minutos / 60) * 350).toFixed(2)}
                      </Td>
                      <Td>
                        <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '2px 6px', borderRadius: RADIUS.chip, background: t.faturado === 'sim' ? 'var(--color-success-light)' : 'var(--color-warning-light)', color: t.faturado === 'sim' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                          {t.faturado === 'sim' ? '✓ Faturado' : 'Pendente'}
                        </span>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
            <Pagination {...timesheetsPagination} onPageChange={timesheetsPagination.setPage} />
          </TableShell>
        </div>
      )}

      {/* Modal de Novo Lançamento */}
      <Modal
        open={showNovoLancamento}
        onClose={() => setShowNovoLancamento(false)}
        title="Novo Lançamento Financeiro"
        width={560}
      >
        <form onSubmit={handleCreateLancamento} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          <FormGrid>
            <FormRow span>
              <Field label="Nome do cliente" required>
                <div ref={clienteSearchRef} style={{ position: 'relative' }}>
                  <input
                    required
                    type="text"
                    placeholder="Buscar cliente..."
                    value={novoCliente}
                    onChange={e => { setNovoCliente(e.target.value); setClienteDropdownOpen(true) }}
                    onFocus={() => setClienteDropdownOpen(true)}
                    style={inputStyle()}
                  />
                  {clienteDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: Z.sticky,
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: RADIUS.control, marginTop: SPACE.xs,
                      maxHeight: 240, overflowY: 'auto',
                    }}>
                      {clientesFiltrados.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: FONT.base, color: 'var(--color-muted)' }}>
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
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm,
                              width: '100%', padding: '9px 12px', border: 'none', background: 'transparent',
                              cursor: 'pointer', textAlign: 'left', fontSize: FONT.md, color: 'var(--color-foreground)',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                            <span style={{
                              fontSize: FONT.xs, fontWeight: 700, padding: '2px 6px', borderRadius: RADIUS.chip, flexShrink: 0,
                              background: c.tipo === 'PF' ? 'var(--color-primary)' : 'var(--color-accent)', color: 'var(--color-on-primary)',
                            }}>{c.tipo}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </Field>
            </FormRow>

            <FormRow>
              <Field label="Tipo de honorário">
                <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)} style={inputStyle()}>
                  <option value="Honorário Fixo">Honorário Fixo</option>
                  <option value="Êxito (Ad Exitum)">Êxito (Ad Exitum)</option>
                  <option value="Partido Mensal">Partido Mensal</option>
                </select>
              </Field>
            </FormRow>

            <FormRow>
              <Field label="Valor monetário" required>
                <input
                  required
                  type="text"
                  placeholder="R$ 0,00"
                  value={novoValor}
                  onChange={e => setNovoValor(maskCurrency(e.target.value))}
                  style={{ ...inputStyle(), fontFamily: 'var(--font-mono)' }}
                />
              </Field>
            </FormRow>

            <FormRow>
              <Field label="Data de vencimento" required>
                <input required type="date" value={novoVencimento} onChange={e => setNovoVencimento(e.target.value)} style={{ ...inputStyle(), fontFamily: 'var(--font-mono)' }} />
              </Field>
            </FormRow>
          </FormGrid>

          <div style={{ display: 'flex', gap: SPACE.sm, justifyContent: 'flex-end', marginTop: SPACE.md }}>
            <Button variant="secondary" onClick={() => setShowNovoLancamento(false)}>Cancelar</Button>
            <Button type="submit">Salvar Lançamento</Button>
          </div>
        </form>
      </Modal>

      {/* Componente de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  )
}
