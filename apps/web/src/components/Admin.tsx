import { useState, useEffect, useCallback } from 'react'
import { api, getErrorMessage } from '../api/client'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Pagination, { usePagination } from './Pagination'

type Tab = 'usuarios' | 'metricas' | 'financeiro' | 'logs'
type LogSubTab = 'logins' | 'tokens' | 'auditoria'

const iso = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const defaultRange = () => {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 30)
  return { from: iso(from), to: iso(to) }
}

const fmtNum = (v: number | string | undefined | null) => {
  if (v === undefined || v === null) return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR')
}

const fmtBrl = (v: number | undefined | null) => {
  if (v === undefined || v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtUsd = (v: number | undefined | null) => {
  if (v === undefined || v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })
}

const fmtDate = (v: string | undefined | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('pt-BR')
}

const roleMeta: Record<string, { label: string; color: string; bg: string }> = {
  root: { label: 'Root', color: 'var(--color-warning)', bg: 'var(--color-accent-light)' },
  admin: { label: 'Administrador', color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  user: { label: 'Usuário', color: 'var(--color-muted)', bg: 'var(--color-surface-2)' },
}

const piePalette = ['#1a2744', '#c8a84b', '#2d6a4f', '#6b7280', '#92400e', '#7f1d1d']

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background)',
  fontSize: 13,
  color: 'var(--color-foreground)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-muted)',
  display: 'block',
  marginBottom: 4,
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  background: 'var(--color-surface)',
  color: 'var(--color-muted)',
  border: '1px solid var(--color-border)',
  padding: '8px 16px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
}

function StatCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 20px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || 'var(--color-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
      {right}
    </div>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>{text}</td>
    </tr>
  )
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '8px 22px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', ...style }}>{children}</th>
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>('usuarios')
  const [logSubTab, setLogSubTab] = useState<LogSubTab>('logins')
  const [{ from, to }, setRange] = useState(defaultRange)

  // Data
  const [users, setUsers] = useState<any[]>([])
  const [globalStats, setGlobalStats] = useState<any>(null)
  const [financialStats, setFinancialStats] = useState<any>(null)
  const [loginLogs, setLoginLogs] = useState<any[]>([])
  const [tokenLogs, setTokenLogs] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Filters (usuários tab)
  const [searchEmail, setSearchEmail] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loginSucessoFilter, setLoginSucessoFilter] = useState('')

  // Modals
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'edit'; user: any } | { type: 'reset'; user: any }>(null)

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.admin.listUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      notify('error', 'Não foi possível carregar os usuários.')
    }
  }, [notify])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (activeTab === 'metricas') {
      setLoading(true)
      api.admin.getGlobalStats(from, to).then(d => { setGlobalStats(d); setLoading(false) }).catch(e => { console.error(e); notify('error', 'Não foi possível carregar as estatísticas.'); setLoading(false) })
    }
  }, [activeTab, from, to])

  useEffect(() => {
    if (activeTab === 'financeiro') {
      setLoading(true)
      api.admin.getFinancialStats(from, to).then(d => { setFinancialStats(d); setLoading(false) }).catch(e => { console.error(e); notify('error', 'Não foi possível carregar os dados financeiros.'); setLoading(false) })
    }
  }, [activeTab, from, to])

  useEffect(() => {
    if (activeTab !== 'logs') return
    setLoading(true)
    if (logSubTab === 'logins') {
      api.admin.getLoginLogs(from, to, loginSucessoFilter || undefined).then(d => { setLoginLogs(Array.isArray(d) ? d : []); setLoading(false) }).catch(e => { console.error(e); notify('error', 'Não foi possível carregar os logs.'); setLoading(false) })
    } else if (logSubTab === 'tokens') {
      api.admin.getTokenLogs(from, to).then(d => { setTokenLogs(Array.isArray(d) ? d : []); setLoading(false) }).catch(e => { console.error(e); notify('error', 'Não foi possível carregar os logs.'); setLoading(false) })
    } else {
      api.admin.getAuditLogs(from, to).then(d => { setAuditLogs(Array.isArray(d) ? d : []); setLoading(false) }).catch(e => { console.error(e); notify('error', 'Não foi possível carregar os logs.'); setLoading(false) })
    }
  }, [activeTab, logSubTab, from, to, loginSucessoFilter])

  // ----- User actions -----
  const handleCreate = async (data: { nome: string; email: string; senha: string; role: string }) => {
    try {
      const res = await api.admin.createUser(data)
      if (!res.ok) {
        notify('error', await getErrorMessage(res, 'Falha ao criar usuário.'))
        return
      }
      setModal(null)
      notify('success', 'Usuário criado com sucesso.')
      loadUsers()
    } catch (e) {
      notify('error', 'Falha ao criar usuário.')
    }
  }

  const handleEdit = async (id: string, patch: any) => {
    try {
      const res = await api.admin.updateUser(id, patch)
      if (!res.ok) {
        notify('error', await getErrorMessage(res, 'Falha ao atualizar usuário.'))
        return
      }
      setModal(null)
      notify('success', 'Usuário atualizado.')
      loadUsers()
    } catch (e) {
      notify('error', 'Falha ao atualizar usuário.')
    }
  }

  const handleReset = async (id: string, senha: string) => {
    try {
      const res = await api.admin.resetPassword(id, senha)
      if (!res.ok) {
        notify('error', await getErrorMessage(res, 'Falha ao redefinir senha.'))
        return
      }
      setModal(null)
      notify('success', 'Senha redefinida.')
    } catch (e) {
      notify('error', 'Falha ao redefinir senha.')
    }
  }

  const handleToggleAtivo = async (u: any) => {
    try {
      const res = await api.admin.updateUser(u.id, { ativo: !u.ativo })
      if (!res.ok) {
        notify('error', await getErrorMessage(res, 'Falha ao alterar status.'))
        return
      }
      notify('success', u.ativo ? 'Usuário desativado.' : 'Usuário reativado.')
      loadUsers()
    } catch (e) {
      notify('error', 'Falha ao alterar status.')
    }
  }

  const handleDelete = async (u: any) => {
    if (!window.confirm(`Excluir definitivamente ${u.nome} (${u.email})?`)) return
    try {
      const res = await api.admin.deleteUser(u.id)
      if (!res.ok) {
        notify('error', await getErrorMessage(res, 'Falha ao excluir usuário.'))
        return
      }
      notify('success', 'Usuário excluído.')
      loadUsers()
    } catch (e) {
      notify('error', 'Falha ao excluir usuário.')
    }
  }

  const filteredUsers = users.filter(u => {
    if (searchEmail && !(u.email || '').toLowerCase().includes(searchEmail.toLowerCase())) return false
    if (roleFilter && u.role !== roleFilter) return false
    return true
  })

  const usersPagination = usePagination(filteredUsers, 10)

  // ----- Derived chart data -----
  const tokensPorDia = globalStats?.tokensPorDia || []
  const topUsuarios = globalStats?.topUsuarios || []
  const distribuicaoRole = (globalStats?.distribuicaoRole || []).map((d: any) => ({
    name: roleMeta[d.role]?.label || d.role,
    value: d.total,
    color: piePalette[0],
  }))

  const custoPorDia = financialStats?.custoPorDia || []
  const custoPorOperacao = financialStats?.custoPorOperacao || []
  const rankingUsuarios = financialStats?.rankingUsuarios || []

  const projectComparison = custoPorDia.map((d: any) => ({ dia: d.dia, brl: d.brl }))

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Administração</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>Gestão de usuários, consumo e auditoria do sistema</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['usuarios', 'Usuários'], ['metricas', 'Métricas Globais'], ['financeiro', 'Financeiro'], ['logs', 'Logs']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: '1px solid var(--color-border)', cursor: 'pointer',
              background: activeTab === t ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeTab === t ? '#fff' : 'var(--color-muted)',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Period filter */}
      {(activeTab === 'metricas' || activeTab === 'financeiro' || activeTab === 'logs') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Período</span>
          <input type="date" value={from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
          <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>até</span>
          <input type="date" value={to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
          <button onClick={() => setRange(defaultRange)} style={{ ...ghostBtn, padding: '7px 12px', fontSize: 11 }}>Últimos 30 dias</button>
          {loading && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-muted)' }}>Carregando…</span>}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
          color: '#fff', padding: '12px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* ===== TAB: USUÁRIOS ===== */}
      {activeTab === 'usuarios' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input placeholder="Buscar por e-mail" value={searchEmail} onChange={e => setSearchEmail(e.target.value)} style={{ ...inputStyle, width: 240 }} />
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                <option value="">Todos os perfis</option>
                <option value="root">Root</option>
                <option value="admin">Administrador</option>
                <option value="user">Usuário</option>
              </select>
            </div>
            <button onClick={() => setModal({ type: 'create' })} style={primaryBtn}>Novo Usuário</button>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  <Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Status</Th><Th>Último login</Th><Th>Tokens</Th><Th>Custo</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {usersPagination.pageItems.map(u => {
                  const rm = roleMeta[u.role] || roleMeta.user
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{u.nome}</td>
                      <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{u.email}</td>
                      <td style={{ padding: '12px 22px' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: rm.color, background: rm.bg, padding: '3px 8px', borderRadius: 4 }}>{rm.label}</span>
                      </td>
                      <td style={{ padding: '12px 22px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                          color: u.ativo ? 'var(--color-success)' : 'var(--color-muted)',
                          background: u.ativo ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                        }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(u.ultimoLogin)}</td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(u.totalTokens)}</td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtBrl(u.custoBrl)}</td>
                      <td style={{ padding: '12px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setModal({ type: 'edit', user: u })} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}>Editar</button>
                        <button onClick={() => setModal({ type: 'reset', user: u })} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}>Resetar Senha</button>
                        <button onClick={() => handleToggleAtivo(u)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}>{u.ativo ? 'Desativar' : 'Reativar'}</button>
                        <button onClick={() => handleDelete(u)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>Excluir</button>
                      </td>
                    </tr>
                  )
                })}
                {filteredUsers.length === 0 && <EmptyRow colSpan={8} text="Nenhum usuário encontrado." />}
              </tbody>
            </table>
            <Pagination {...usersPagination} onPageChange={usersPagination.setPage} />
          </div>
        </>
      )}

      {/* ===== TAB: MÉTRICAS GLOBAIS ===== */}
      {activeTab === 'metricas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
            <StatCard label="Usuários" value={`${fmtNum(globalStats?.usuariosAtivos)}`} sub={`${fmtNum(globalStats?.usuariosTotal)} no total`} />
            <StatCard label="Tokens no período" value={fmtNum(globalStats?.tokensPeriodo)} />
            <StatCard label="Custo no período" value={fmtBrl(globalStats?.custoBrlPeriodo)} sub={fmtUsd(globalStats?.custoUsdPeriodo)} />
            <StatCard label="Peças geradas" value={fmtNum(globalStats?.pecasPeriodo)} />
            <StatCard label="Logins" value={fmtNum(globalStats?.loginsPeriodo)} sub={`${fmtNum(globalStats?.loginsSucesso)} com sucesso`} subColor="var(--color-success)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, marginBottom: 18 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Consumo de tokens por dia</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tokensPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Line type="monotone" dataKey="tokens" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Tokens" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Distribuição por perfil</div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={distribuicaoRole} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0} paddingAngle={2}>
                    {distribuicaoRole.map((entry: any, i: number) => <Cell key={i} fill={entry.color || piePalette[i % piePalette.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {distribuicaoRole.map((d: any, i: number) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color || piePalette[i % piePalette.length] }} />
                      <span style={{ fontSize: 12 }}>{d.name}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Usuários com maior consumo</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topUsuarios} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                <Bar dataKey="tokens" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Tokens" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ===== TAB: FINANCEIRO ===== */}
      {activeTab === 'financeiro' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            <StatCard label="Custo do período" value={fmtBrl(financialStats?.custoTotalBrl)} sub={fmtUsd(financialStats?.custoTotalUsd)} />
            <StatCard label="Projeção mensal" value={fmtBrl(financialStats?.projecaoMensalBrl)} sub={fmtUsd(financialStats?.projecaoMensalUsd)} />
            <StatCard label="Custo médio por peça" value={fmtBrl(financialStats?.custoMedioPorPeca)} />
            <StatCard label="Custo médio por usuário" value={fmtBrl(financialStats?.custoMedioPorUsuario)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Custo diário (BRL)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={custoPorDia} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Bar dataKey="brl" fill="var(--color-accent)" radius={[4, 4, 0, 0]} name="Custo (BRL)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Evolução do custo</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={projectComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Line type="monotone" dataKey="brl" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Custo (BRL)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px', marginBottom: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Custo por operação</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={custoPorOperacao} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="operacao" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                <Bar dataKey="brl" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Custo (BRL)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <CardHeader title="Ranking de custo por usuário" right={<span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{rankingUsuarios.length} usuários</span>} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  <Th>Usuário</Th><Th>Tokens</Th><Th>Custo (USD)</Th><Th>Custo (BRL)</Th>
                </tr>
              </thead>
              <tbody>
                {rankingUsuarios.map((u: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{u.nome}<div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{u.email}</div></td>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(u.tokens)}</td>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtUsd(u.usd)}</td>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{fmtBrl(u.brl)}</td>
                  </tr>
                ))}
                {rankingUsuarios.length === 0 && <EmptyRow colSpan={4} text="Sem dados de custo no período." />}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== TAB: LOGS ===== */}
      {activeTab === 'logs' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {([['logins', 'Logins'], ['tokens', 'Tokens'], ['auditoria', 'Auditoria']] as [LogSubTab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setLogSubTab(t)} style={{
                padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: '1px solid var(--color-border)', cursor: 'pointer',
                background: logSubTab === t ? 'var(--color-primary)' : 'var(--color-surface)',
                color: logSubTab === t ? '#fff' : 'var(--color-muted)',
              }}>
                {label}
              </button>
            ))}
            {logSubTab === 'logins' && (
              <select value={loginSucessoFilter} onChange={e => setLoginSucessoFilter(e.target.value)} style={{ ...inputStyle, width: 160, marginLeft: 'auto' }}>
                <option value="">Todos os resultados</option>
                <option value="true">Com sucesso</option>
                <option value="false">Com falha</option>
              </select>
            )}
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {logSubTab === 'logins' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <Th>Data</Th><Th>E-mail</Th><Th>Nome</Th><Th>IP</Th><Th>Resultado</Th><Th>Motivo da falha</Th>
                  </tr>
                </thead>
                <tbody>
                  {loginLogs.map((l: any) => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(l.createdAt)}</td>
                      <td style={{ padding: '12px 22px', fontSize: 12 }}>{l.emailTentado}</td>
                      <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{l.nome || '—'}</td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{l.ipAddress || '—'}</td>
                      <td style={{ padding: '12px 22px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                          color: l.sucesso ? 'var(--color-success)' : 'var(--color-danger)',
                          background: l.sucesso ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                        }}>{l.sucesso ? 'Sucesso' : 'Falha'}</span>
                      </td>
                      <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{l.motivoFalha || '—'}</td>
                    </tr>
                  ))}
                  {loginLogs.length === 0 && <EmptyRow colSpan={6} text="Nenhum log de login no período." />}
                </tbody>
              </table>
            )}

            {logSubTab === 'tokens' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <Th>Data</Th><Th>Usuário</Th><Th>Modelo</Th><Th>Operação</Th><Th>Tokens</Th><Th>Custo</Th>
                  </tr>
                </thead>
                <tbody>
                  {tokenLogs.map((l: any) => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(l.createdAt)}</td>
                      <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{l.nome}<div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{l.email}</div></td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{l.modelo}</td>
                      <td style={{ padding: '12px 22px', fontSize: 12 }}>{l.operacao}</td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(l.totalTokens)}</td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtBrl(l.custoBrl)}</td>
                    </tr>
                  ))}
                  {tokenLogs.length === 0 && <EmptyRow colSpan={6} text="Nenhum consumo de tokens no período." />}
                </tbody>
              </table>
            )}

            {logSubTab === 'auditoria' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <Th>Data</Th><Th>Autor</Th><Th>Ação</Th><Th>Alvo</Th><Th>Detalhes</Th><Th>IP</Th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((l: any) => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(l.createdAt)}</td>
                      <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{l.actorNome}</td>
                      <td style={{ padding: '12px 22px' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '3px 8px', borderRadius: 4 }}>{l.acao}</span>
                      </td>
                      <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{l.alvoEmail || '—'}</td>
                      <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{l.detalhes || '—'}</td>
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{l.ipAddress || '—'}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && <EmptyRow colSpan={6} text="Nenhuma entrada de auditoria no período." />}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ===== MODALS ===== */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(24,23,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setModal(null)}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            {modal.type === 'create' && <CreateUserModal onCancel={() => setModal(null)} onSubmit={handleCreate} />}
            {modal.type === 'edit' && <EditUserModal user={modal.user} onCancel={() => setModal(null)} onSubmit={handleEdit} />}
            {modal.type === 'reset' && <ResetPasswordModal user={modal.user} onCancel={() => setModal(null)} onSubmit={handleReset} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ----- Modal components -----
function CreateUserModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (data: { nome: string; email: string; senha: string; role: string }) => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState('user')
  const valid = nome.trim() && email.trim() && senha.length >= 8

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Novo Usuário</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>Cadastre um novo acesso ao sistema.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={labelStyle}>Nome</label><input value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} /></div>
        <div><label style={labelStyle}>E-mail</label><input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} type="email" /></div>
        <div><label style={labelStyle}>Senha (mín. 8 caracteres)</label><input value={senha} onChange={e => setSenha(e.target.value)} style={inputStyle} type="password" /></div>
        <div>
          <label style={labelStyle}>Perfil</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
            <option value="user">Usuário</option>
            <option value="admin">Administrador</option>
            <option value="root">Root</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid} onClick={() => onSubmit({ nome, email, senha, role })} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }}>Criar usuário</button>
      </div>
    </div>
  )
}

function EditUserModal({ user, onCancel, onSubmit }: { user: any; onCancel: () => void; onSubmit: (id: string, patch: any) => void }) {
  const [nome, setNome] = useState(user.nome || '')
  const [email, setEmail] = useState(user.email || '')
  const [role, setRole] = useState(user.role || 'user')
  const [ativo, setAtivo] = useState(user.ativo !== false)
  const valid = nome.trim() && email.trim()

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Editar Usuário</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>{user.email}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={labelStyle}>Nome</label><input value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} /></div>
        <div><label style={labelStyle}>E-mail</label><input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} type="email" /></div>
        <div>
          <label style={labelStyle}>Perfil</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
            <option value="user">Usuário</option>
            <option value="admin">Administrador</option>
            <option value="root">Root</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          <span style={{ fontSize: 13 }}>Usuário ativo</span>
          <button onClick={() => setAtivo(v => !v)} style={{
            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
            background: ativo ? 'var(--color-success)' : 'var(--color-border)', transition: 'background 0.15s',
          }}>
            <span style={{ position: 'absolute', top: 2, left: ativo ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid} onClick={() => onSubmit(user.id, { nome, email, role, ativo })} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }}>Salvar</button>
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, onCancel, onSubmit }: { user: any; onCancel: () => void; onSubmit: (id: string, senha: string) => void }) {
  const [senha, setSenha] = useState('')
  const [confirm, setConfirm] = useState('')
  const valid = senha.length >= 8 && senha === confirm

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Resetar Senha</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>{user.nome} · {user.email}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={labelStyle}>Nova senha (mín. 8 caracteres)</label><input value={senha} onChange={e => setSenha(e.target.value)} style={inputStyle} type="password" /></div>
        <div><label style={labelStyle}>Confirmar senha</label><input value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} type="password" /></div>
        {confirm && senha !== confirm && <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>As senhas não coincidem.</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid} onClick={() => onSubmit(user.id, senha)} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }}>Redefinir senha</button>
      </div>
    </div>
  )
}
