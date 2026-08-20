import { useState, useEffect, useCallback } from 'react'
import { api, getErrorMessage } from '../api/client'
import Toast, { ToastMessage } from './Toast'

type Tab = 'escritorios' | 'creditos' | 'metricas' | 'auditoria'

interface Escritorio {
  id: string
  nome: string
  plano: string
  limiteUsuarios: number
  usuariosAtivos: number
  status: 'ativo' | 'inativo'
  tokens30d: number
  limiteTokensMes?: number | null
  usoPercentual?: number
}

interface CreditoUsuario {
  id: string
  nome: string
  email: string
  creditosDisponiveis: number | null
  consumidosMes: number
  restantes: number | null
}

interface CreditoEscritorio {
  id: string
  nome: string
  plano: string
  isDemo: boolean
  creditosDisponiveis: number | null
  consumidosMes: number
  restantes: number | null
  usuarios: CreditoUsuario[]
}

type Modal =
  | { kind: 'novoEscritorio' }
  | { kind: 'editar'; esc: Escritorio }
  | { kind: 'desativar'; esc: Escritorio }
  | { kind: 'excluir'; esc: Escritorio }
  | { kind: 'tempSenha'; titulo: string; senha: string }
  | { kind: 'addCreditos'; alvo: { tipo: 'escritorio' | 'usuario'; id: string; nome: string } }
  | null

const PLANOS = [
  { id: 'starter', label: 'Starter' },
  { id: 'profissional', label: 'Profissional' },
  { id: 'enterprise', label: 'Enterprise' },
]

const planoMeta: Record<string, { label: string; color: string; bg: string }> = {
  starter: { label: 'Starter', color: 'var(--color-muted)', bg: 'var(--color-surface-2)' },
  profissional: { label: 'Profissional', color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  pro: { label: 'Profissional', color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  enterprise: { label: 'Enterprise', color: 'var(--color-warning)', bg: 'var(--color-accent-light)' },
}

const acaoMeta: Record<string, { label: string; color: string; bg: string }> = {
  CREATE_ESCRITORIO: { label: 'Novo escritório', color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  CREATE_ESCRITORIO_USER: { label: 'Novo usuário', color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  PASSWORD_CHANGE: { label: 'Troca de senha', color: 'var(--color-warning)', bg: 'var(--color-accent-light)' },
  PASSWORD_RESET: { label: 'Reset de senha', color: 'var(--color-warning)', bg: 'var(--color-accent-light)' },
  UPDATE_ESCRITORIO: { label: 'Escritório atualizado', color: 'var(--color-muted)', bg: 'var(--color-surface-2)' },
  DEACTIVATE_ESCRITORIO: { label: 'Escritório desativado', color: 'var(--color-danger)', bg: 'var(--color-danger-light)' },
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background)',
  fontSize: 13,
  color: 'var(--color-foreground)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
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
  fontFamily: 'var(--font-sans)',
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
  fontFamily: 'var(--font-sans)',
}

const fmtNum = (v: number | string | undefined | null) => {
  if (v === undefined || v === null) return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR')
}

const fmtDate = (v: string | undefined | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function copiarTexto(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '8px 22px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', ...style }}>{children}</th>
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

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
        <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.6 }}>🗂️</div>
        {text}
      </td>
    </tr>
  )
}

function TempSenhaModal({ titulo, senha, onClose, notify }: { titulo: string; senha: string; onClose: () => void; notify: (t: 'success' | 'error', m: string) => void }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const ok = await copiarTexto(senha)
    if (ok) {
      setCopied(true)
      notify('success', 'Senha copiada para a área de transferência.')
      setTimeout(() => setCopied(false), 2000)
    } else {
      notify('error', 'Não foi possível copiar a senha.')
    }
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>{titulo}</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 18 }}>Senha temporária do administrador inicial.</div>

      <div style={{
        background: 'var(--color-accent-light)',
        border: '1px solid var(--color-accent)',
        borderRadius: 6,
        padding: '12px 14px',
        fontSize: 12,
        color: 'var(--color-warning)',
        fontWeight: 500,
        marginBottom: 16,
        lineHeight: 1.5,
      }}>
        ⚠️ Anote agora — esta senha não será exibida novamente. Entregue-a ao administrador do escritório por um canal seguro.
      </div>

      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px dashed var(--color-border)',
        borderRadius: 6,
        padding: '14px 16px',
        marginBottom: 22,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: '0.06em', color: 'var(--color-foreground)', wordBreak: 'break-all' }}>{senha}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={handleCopy} style={{ ...primaryBtn, background: copied ? 'var(--color-success)' : 'var(--color-primary)' }}>
          {copied ? 'Copiada ✓' : 'Copiar senha'}
        </button>
        <button onClick={onClose} style={ghostBtn}>Concluir</button>
      </div>
    </div>
  )
}

function ExcluirEscritorioModal({ esc, onCancel, onSubmit }: { esc: Escritorio; onCancel: () => void; onSubmit: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const valid = confirmText.trim() === esc.nome
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4, color: 'var(--color-danger)' }}>
        Excluir escritório permanentemente
      </div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>
        Esta ação <strong style={{ color: 'var(--color-danger)' }}>NÃO pode ser desfeita</strong>. Todos os processos, peças, clientes, andamentos, financeiro, timesheet e usuários do escritório serão removidos para sempre.
      </div>

      <div style={{
        background: 'var(--color-danger-light)',
        border: '1px solid var(--color-danger)',
        borderRadius: 6,
        padding: '12px 14px',
        fontSize: 12,
        color: 'var(--color-danger)',
        fontWeight: 500,
        marginBottom: 18,
        lineHeight: 1.5,
      }}>
        ⚠️ Você está prestes a excluir <strong>{esc.nome}</strong> e <strong>todos os seus dados</strong>.
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Para confirmar, digite o nome do escritório exatamente:</label>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          style={{ ...inputStyle, borderColor: valid ? 'var(--color-success)' : (confirmText ? 'var(--color-danger)' : 'var(--color-border)'), fontFamily: 'var(--font-mono)' }}
          placeholder={esc.nome}
          autoFocus
        />
        {confirmText && !valid && (
          <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>
            O texto não confere com "{esc.nome}".
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button
          disabled={!valid}
          onClick={onSubmit}
          style={{ ...primaryBtn, background: 'var(--color-danger)', opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }}
        >
          Excluir permanentemente
        </button>
      </div>
    </div>
  )
}

function AddCreditosModal({ alvo, onCancel, onSubmit }: { alvo: { tipo: 'escritorio' | 'usuario'; id: string; nome: string }; onCancel: () => void; onSubmit: (quantidade: number) => void }) {
  const [quantidade, setQuantidade] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const q = Number(quantidade)
  const valid = quantidade.trim() !== '' && Number.isInteger(q) && q > 0

  const submit = async () => {
    if (!valid) {
      setError('Informe um número inteiro positivo de créditos.')
      return
    }
    setSubmitting(true)
    await onSubmit(q)
    setSubmitting(false)
  }

  const rotulo = alvo.tipo === 'escritorio' ? 'Adicionar créditos ao escritório' : 'Adicionar tokens ao usuário'

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>{rotulo}</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>
        <strong style={{ color: 'var(--color-foreground)' }}>{alvo.nome}</strong> · 1 crédito = 1 token. O saldo é somado ao valor atual e vale para o mês corrente.
      </div>

      <div>
        <label style={labelStyle}>Quantidade de créditos</label>
        <input
          value={quantidade}
          onChange={e => { setQuantidade(e.target.value); if (error) setError(undefined) }}
          style={{ ...inputStyle, borderColor: error ? 'var(--color-danger)' : 'var(--color-border)' }}
          type="number"
          min={1}
          step={1}
          placeholder="Ex.: 50000"
          autoFocus
        />
        {error && <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid || submitting} onClick={submit} style={{ ...primaryBtn, opacity: valid && !submitting ? 1 : 0.5, cursor: valid && !submitting ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Adicionando…' : 'Adicionar créditos'}
        </button>
      </div>
    </div>
  )
}

export default function RootPainel() {
  const [activeTab, setActiveTab] = useState<Tab>('escritorios')

  const [escritorios, setEscritorios] = useState<Escritorio[]>([])
  const [metricas, setMetricas] = useState<any[]>([])
  const [auditoria, setAuditoria] = useState<any[]>([])
  const [creditos, setCreditos] = useState<CreditoEscritorio[]>([])
  const [loadingCreditos, setLoadingCreditos] = useState(false)
  const [expandedEsc, setExpandedEsc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = useCallback((type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const loadEscritorios = useCallback(async () => {
    setLoading(true)
    try {
      // Fase 7 implementará estes endpoints — shapes esperados no report.
      const data = await api.raiz.listEscritorios()
      setEscritorios(Array.isArray(data) ? data : [])
    } catch {
      addToast('error', 'Não foi possível carregar os escritórios.')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const loadMetricas = useCallback(async () => {
    try {
      const data = await api.raiz.getMetricasAgregadas()
      setMetricas(Array.isArray(data) ? data : [])
    } catch {
      addToast('error', 'Não foi possível carregar as métricas agregadas.')
    }
  }, [addToast])

  const loadAuditoria = useCallback(async () => {
    try {
      const data = await api.raiz.getAuditoria()
      setAuditoria(Array.isArray(data) ? data : [])
    } catch {
      addToast('error', 'Não foi possível carregar a auditoria.')
    }
  }, [addToast])

  const loadCreditos = useCallback(async () => {
    setLoadingCreditos(true)
    try {
      const data = await api.raiz.getCreditos()
      setCreditos(Array.isArray(data) ? data : [])
    } catch {
      addToast('error', 'Não foi possível carregar os créditos.')
    } finally {
      setLoadingCreditos(false)
    }
  }, [addToast])

  useEffect(() => { loadEscritorios() }, [loadEscritorios])
  useEffect(() => { if (activeTab === 'metricas') loadMetricas() }, [activeTab, loadMetricas])
  useEffect(() => { if (activeTab === 'auditoria') loadAuditoria() }, [activeTab, loadAuditoria])
  useEffect(() => { if (activeTab === 'creditos') loadCreditos() }, [activeTab, loadCreditos])

  const handleCriarEscritorio = async (data: { nome: string; adminNome: string; adminEmail: string }) => {
    try {
      const res = await api.raiz.criarEscritorio(data)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao criar escritório.'))
        return
      }
      const senha = json?.senhaTemporaria || json?.senha || json?.password
      setModal({ kind: 'tempSenha', titulo: 'Escritório criado', senha: senha || '—' })
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao criar escritório.')
    }
  }

  const handleEditar = async (id: string, patch: { plano: string; limiteUsuarios: number; limiteTokensMes?: number }) => {
    try {
      const res = await api.raiz.editarEscritorio(id, patch)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao atualizar escritório.'))
        return
      }
      setModal(null)
      addToast('success', 'Escritório atualizado.')
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao atualizar escritório.')
    }
  }

  const handleDesativar = async (esc: Escritorio) => {
    try {
      const res = await api.raiz.desativarEscritorio(esc.id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao desativar escritório.'))
        return
      }
      setModal(null)
      addToast('success', 'Escritório desativado.')
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao desativar escritório.')
    }
  }

  const handleExcluir = async (esc: Escritorio) => {
    try {
      const res = await api.raiz.excluirEscritorioPermanente(esc.id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao excluir escritório permanentemente.'))
        return
      }
      const json = await res.json().catch(() => ({}))
      setModal(null)
      addToast('success', `Escritório "${esc.nome}" excluído permanentemente${json?.usuariosRemovidos ? ` (${json.usuariosRemovidos} usuário${json.usuariosRemovidos === 1 ? '' : 's'} removido${json.usuariosRemovidos === 1 ? '' : 's'})` : ''}.`)
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao excluir escritório permanentemente.')
    }
  }

  const handleAddCreditos = async (tipo: 'escritorio' | 'usuario', id: string, quantidade: number) => {
    try {
      const res = tipo === 'escritorio'
        ? await api.raiz.adicionarCreditosEscritorio(id, quantidade)
        : await api.raiz.adicionarCreditosUsuario(id, quantidade)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao adicionar créditos.'))
        return
      }
      setModal(null)
      addToast('success', `${fmtNum(quantidade)} crédito(s) adicionado(s).`)
      loadCreditos()
    } catch {
      addToast('error', 'Falha ao adicionar créditos.')
    }
  }

  const totalTokens = metricas.reduce((acc, m) => acc + (Number(m?.tokens30d) || 0), 0)
  const totalUsuarios = metricas.reduce((acc, m) => acc + (Number(m?.usuariosAtivos) || 0), 0)

  // Ranking ordenado por % de uso (decrescente)
  const ranking = [...metricas].sort((a, b) => {
    const usoA = a?.usoPercentual != null ? Number(a.usoPercentual) : -1
    const usoB = b?.usoPercentual != null ? Number(b.usoPercentual) : -1
    return usoB - usoA
  })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>
          Administração da Plataforma
        </div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>
          SmartJuris Operações · escritórios, consumo e auditoria
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--color-border)', marginBottom: 28 }}>
        {([['escritorios', 'Escritórios'], ['creditos', 'Créditos'], ['metricas', 'Métricas Agregadas'], ['auditoria', 'Auditoria']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '10px 2px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: activeTab === t ? 600 : 500,
            color: activeTab === t ? 'var(--color-foreground)' : 'var(--color-muted)',
            borderBottom: `2px solid ${activeTab === t ? 'var(--color-accent)' : 'transparent'}`,
            marginBottom: -1,
            transition: 'color 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ===== TAB: ESCRITÓRIOS ===== */}
      {activeTab === 'escritorios' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{escritorios.length} {escritorios.length === 1 ? 'escritório' : 'escritórios'} na plataforma</div>
            <button onClick={() => setModal({ kind: 'novoEscritorio' })} style={primaryBtn}>+ Novo escritório</button>
          </div>

          {loading ? (
            <div style={{ color: 'var(--color-muted)', fontSize: 13, padding: '24px 0' }}>Carregando…</div>
          ) : (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <Th>Escritório</Th><Th>Plano</Th><Th>Limite de usuários</Th><Th>Usuários ativos</Th><Th>Tokens (30d)</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {escritorios.map(esc => {
                    const pm = planoMeta[esc.plano] || { label: esc.plano, color: 'var(--color-muted)', bg: 'var(--color-surface-2)' }
                    return (
                      <tr key={esc.id} style={{ borderTop: '1px solid var(--color-border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{esc.nome}</td>
                        <td style={{ padding: '12px 22px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: pm.color, background: pm.bg, padding: '3px 8px', borderRadius: 4 }}>{pm.label}</span>
                        </td>
                        <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(esc.limiteUsuarios)}</td>
                        <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(esc.usuariosAtivos)}</td>
                        <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(esc.tokens30d)}</td>
                        <td style={{ padding: '12px 22px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                            color: esc.status === 'ativo' ? 'var(--color-success)' : 'var(--color-muted)',
                            background: esc.status === 'ativo' ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                          }}>{esc.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                        </td>
                        <td style={{ padding: '12px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => setModal({ kind: 'editar', esc })} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}>Editar</button>
                          <button onClick={() => setModal({ kind: 'desativar', esc })} disabled={esc.status !== 'ativo'} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, color: 'var(--color-danger)', borderColor: 'var(--color-danger)', opacity: esc.status === 'ativo' ? 1 : 0.4, cursor: esc.status === 'ativo' ? 'pointer' : 'not-allowed' }}>
                            Desativar
                          </button>
                          <button onClick={() => setModal({ kind: 'excluir', esc })} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, color: 'var(--color-danger)', borderColor: 'var(--color-danger)', marginLeft: 6 }} title="Excluir permanentemente (irreversível)">
                            Excluir
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {escritorios.length === 0 && <EmptyRow colSpan={7} text="Nenhum escritório cadastrado. Clique em “Novo escritório” para começar." />}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== TAB: CRÉDITOS ===== */}
      {activeTab === 'creditos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            <StatCard label="Escritórios com saldo" value={fmtNum(creditos.filter(c => c.creditosDisponiveis != null).length)} />
            <StatCard label="Créditos consumidos (mês)" value={fmtNum(creditos.reduce((a, c) => a + (Number(c.consumidosMes) || 0), 0))} />
            <StatCard label="Créditos restantes" value={fmtNum(creditos.reduce((a, c) => a + (Number(c.restantes) || 0), 0))} />
          </div>

          {loadingCreditos ? (
            <div style={{ color: 'var(--color-muted)', fontSize: 13, padding: '24px 0' }}>Carregando…</div>
          ) : (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <Th>Escritório</Th><Th>Plano</Th><Th>Disponível</Th><Th>Consumidos (mês)</Th><Th>Restantes</Th><Th style={{ width: 140 }}>Uso</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {creditos.map(c => {
                    const disp = c.creditosDisponiveis
                    const pct = disp != null && disp > 0 ? Math.round(((Number(c.consumidosMes) || 0) / disp) * 100) : 0
                    const usoColor = pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                    const pm = planoMeta[c.plano] || { label: c.plano, color: 'var(--color-muted)', bg: 'var(--color-surface-2)' }
                    return (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--color-border)', verticalAlign: 'top' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>
                          {c.nome}
                          {c.isDemo && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-accent)', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>demo</span>}
                        </td>
                        <td style={{ padding: '12px 22px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: pm.color, background: pm.bg, padding: '3px 8px', borderRadius: 4 }}>{pm.label}</span>
                        </td>
                        <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{disp != null ? fmtNum(disp) : 'Ilimitado'}</td>
                        <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtNum(c.consumidosMes)}</td>
                        <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.restantes != null ? fmtNum(c.restantes) : '—'}</td>
                        <td style={{ padding: '12px 22px' }}>
                          {disp != null && disp > 0 ? (
                            <div>
                              <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: usoColor, borderRadius: 3 }} />
                              </div>
                              <div style={{ fontSize: 10, color: usoColor, fontWeight: 600, marginTop: 4 }}>{pct}%</div>
                            </div>
                          ) : <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {c.isDemo && (
                            <button onClick={() => setExpandedEsc(expandedEsc === c.id ? null : c.id)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}>
                              {expandedEsc === c.id ? 'Ocultar usuários' : 'Ver usuários'}
                            </button>
                          )}
                          <button onClick={() => setModal({ kind: 'addCreditos', alvo: { tipo: 'escritorio', id: c.id, nome: c.nome } })} style={{ ...primaryBtn, padding: '5px 12px', fontSize: 11 }}>
                            + Créditos
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {creditos.length === 0 && <EmptyRow colSpan={7} text="Nenhum escritório cadastrado." />}
                </tbody>
              </table>

              {/* Usuários demo expandidos */}
              {creditos.filter(c => c.isDemo && expandedEsc === c.id).map(c => (
                <div key={`users-${c.id}`} style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                  <div style={{ padding: '12px 22px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>
                    Usuários de {c.nome} (créditos individuais)
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {c.usuarios.map(u => {
                        const dispU = u.creditosDisponiveis
                        const pctU = dispU != null && dispU > 0 ? Math.round((u.consumidosMes / dispU) * 100) : 0
                        const usoColorU = pctU > 85 ? 'var(--color-danger)' : pctU > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                        return (
                          <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '10px 22px', fontSize: 13 }}>
                              <div style={{ fontWeight: 500 }}>{u.nome}</div>
                              <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{u.email}</div>
                            </td>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Disp: {dispU != null ? fmtNum(dispU) : 'herda esc.'}</td>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Consumidos: {fmtNum(u.consumidosMes)}</td>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: usoColorU, fontWeight: 600 }}>Restantes: {u.restantes != null ? fmtNum(u.restantes) : '—'}</td>
                            <td style={{ padding: '10px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button onClick={() => setModal({ kind: 'addCreditos', alvo: { tipo: 'usuario', id: u.id, nome: u.nome } })} style={{ ...primaryBtn, padding: '5px 12px', fontSize: 11 }}>
                                + Tokens
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {c.usuarios.length === 0 && <tr><td colSpan={5} style={{ padding: '16px 22px', color: 'var(--color-muted)', fontSize: 12 }}>Nenhum usuário.</td></tr>}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== TAB: MÉTRICAS AGREGADAS ===== */}
      {activeTab === 'metricas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            <StatCard label="Escritórios" value={fmtNum(escritorios.length)} sub={`${fmtNum(escritorios.filter(e => e.status === 'ativo').length)} ativos`} />
            <StatCard label="Tokens totais (30d)" value={fmtNum(totalTokens)} />
            <StatCard label="Usuários ativos" value={fmtNum(totalUsuarios)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 28 }}>
            {metricas.map(m => {
              const uso = m?.usoPercentual != null ? Number(m.usoPercentual) : 0
              const usoColor = uso > 85 ? 'var(--color-danger)' : uso > 60 ? 'var(--color-warning)' : 'var(--color-success)'
              return (
                <div key={m.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 20px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{m.nome}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, letterSpacing: '-0.02em', margin: '10px 0 2px' }}>{fmtNum(m.tokens30d)}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>tokens (30d)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', margin: '10px 0 6px' }}>
                    <span>{fmtNum(m.usuariosAtivos)} usuários ativos</span>
                    <span style={{ color: usoColor, fontWeight: 600 }}>{uso}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(uso, 100)}%`, height: '100%', background: usoColor, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
            {metricas.length === 0 && (
              <div style={{ gridColumn: '1 / -1', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '40px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
                Sem métricas agregadas disponíveis.
              </div>
            )}
          </div>

          {ranking.length > 0 && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>Ranking por uso do limite</div>
              {ranking.map((m, i) => {
                const uso = m?.usoPercentual != null ? Number(m.usoPercentual) : 0
                const usoColor = uso > 85 ? 'var(--color-danger)' : uso > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? 'var(--color-accent)' : 'var(--color-surface-2)', color: i === 0 ? '#18170f' : 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ width: 180, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.nome}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(uso, 100)}%`, height: '100%', background: usoColor, borderRadius: 3 }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: usoColor, fontWeight: 600, width: 48, textAlign: 'right', flexShrink: 0 }}>{uso}%</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ===== TAB: AUDITORIA ===== */}
      {activeTab === 'auditoria' && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)' }}>
                <Th>Data</Th><Th>Ação</Th><Th>Autor</Th><Th>Detalhes</Th><Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {auditoria.map(l => {
                const am = acaoMeta[l.acao] || { label: l.acao, color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' }
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(l.createdAt)}</td>
                    <td style={{ padding: '12px 22px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: am.color, background: am.bg, padding: '3px 8px', borderRadius: 4 }}>{am.label}</span>
                    </td>
                    <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{l.actorNome || '—'}</td>
                    <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{l.detalhes || '—'}</td>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{l.ipAddress || '—'}</td>
                  </tr>
                )
              })}
              {auditoria.length === 0 && <EmptyRow colSpan={5} text="Nenhuma entrada de auditoria disponível." />}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== MODALS ===== */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(24,23,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setModal(null)}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: 28, width: 440, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            {modal.kind === 'novoEscritorio' && (
              <NovoEscritorioModal onCancel={() => setModal(null)} onSubmit={handleCriarEscritorio} />
            )}
            {modal.kind === 'editar' && (
              <EditarEscritorioModal esc={modal.esc} onCancel={() => setModal(null)} onSubmit={handleEditar} />
            )}
            {modal.kind === 'desativar' && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Desativar escritório</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>
                  Desativar <strong style={{ color: 'var(--color-foreground)' }}>{modal.esc.nome}</strong>? Todos os usuários do escritório perderão o acesso. A ação é reversível (soft delete).
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setModal(null)} style={ghostBtn}>Cancelar</button>
                  <button onClick={() => handleDesativar(modal.esc)} style={{ ...primaryBtn, background: 'var(--color-danger)' }}>Desativar escritório</button>
                </div>
              </div>
            )}
            {modal.kind === 'excluir' && (
              <ExcluirEscritorioModal esc={modal.esc} onCancel={() => setModal(null)} onSubmit={() => handleExcluir(modal.esc)} />
            )}
            {modal.kind === 'addCreditos' && (
              <AddCreditosModal alvo={modal.alvo} onCancel={() => setModal(null)} onSubmit={(q) => handleAddCreditos(modal.alvo.tipo, modal.alvo.id, q)} />
            )}
            {modal.kind === 'tempSenha' && (
              <TempSenhaModal titulo={modal.titulo} senha={modal.senha} onClose={() => setModal(null)} notify={(t, m) => addToast(t, m)} />
            )}
          </div>
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function NovoEscritorioModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (data: { nome: string; adminNome: string; adminEmail: string }) => void }) {
  const [nome, setNome] = useState('')
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [errors, setErrors] = useState<{ nome?: string; adminNome?: string; adminEmail?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const valid = nome.trim() && adminNome.trim() && adminEmail.trim()

  const submit = async () => {
    const next: typeof errors = {}
    if (!nome.trim()) next.nome = 'Informe o nome do escritório.'
    if (!adminNome.trim()) next.adminNome = 'Informe o nome do administrador inicial.'
    if (!adminEmail.trim()) next.adminEmail = 'Informe o e-mail do administrador.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) next.adminEmail = 'E-mail inválido.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    await onSubmit({ nome: nome.trim(), adminNome: adminNome.trim(), adminEmail: adminEmail.trim() })
    setSubmitting(false)
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Novo escritório</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>Crie um novo escritório e o administrador inicial responsável por ele.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nome do escritório</label>
          <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={{ ...inputStyle, borderColor: errors.nome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Silva & Advogados Associados" autoFocus />
          {errors.nome && <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>{errors.nome}</div>}
        </div>
        <div>
          <label style={labelStyle}>Nome do admin inicial</label>
          <input value={adminNome} onChange={e => { setAdminNome(e.target.value); if (errors.adminNome) setErrors(p => ({ ...p, adminNome: undefined })) }} style={{ ...inputStyle, borderColor: errors.adminNome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Dr. Carlos Silva" />
          {errors.adminNome && <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>{errors.adminNome}</div>}
        </div>
        <div>
          <label style={labelStyle}>E-mail do admin inicial</label>
          <input value={adminEmail} onChange={e => { setAdminEmail(e.target.value); if (errors.adminEmail) setErrors(p => ({ ...p, adminEmail: undefined })) }} style={{ ...inputStyle, borderColor: errors.adminEmail ? 'var(--color-danger)' : 'var(--color-border)' }} type="email" placeholder="admin@escritorio.com" />
          {errors.adminEmail && <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>{errors.adminEmail}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid || submitting} onClick={submit} style={{ ...primaryBtn, opacity: valid && !submitting ? 1 : 0.5, cursor: valid && !submitting ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Criando…' : 'Criar escritório'}
        </button>
      </div>
    </div>
  )
}

function EditarEscritorioModal({ esc, onCancel, onSubmit }: { esc: Escritorio; onCancel: () => void; onSubmit: (id: string, patch: { plano: string; limiteUsuarios: number; limiteTokensMes?: number }) => void }) {
  const [plano, setPlano] = useState(esc.plano || 'starter')
  const [limiteUsuarios, setLimiteUsuarios] = useState(String(esc.limiteUsuarios ?? 10))
  const [limiteTokensMes, setLimiteTokensMes] = useState(String(esc.limiteTokensMes ?? 1000000))
  const [submitting, setSubmitting] = useState(false)

  const valid = limiteUsuarios.trim() && Number(limiteUsuarios) > 0

  const submit = async () => {
    setSubmitting(true)
    await onSubmit(esc.id, { plano, limiteUsuarios: Number(limiteUsuarios), limiteTokensMes: Number(limiteTokensMes) || undefined })
    setSubmitting(false)
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Editar escritório</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>{esc.nome}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Plano</label>
          <select value={plano} onChange={e => setPlano(e.target.value)} style={inputStyle}>
            {PLANOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Limite de usuários</label>
          <input value={limiteUsuarios} onChange={e => setLimiteUsuarios(e.target.value)} style={inputStyle} type="number" min={1} />
        </div>
        <div>
          <label style={labelStyle}>Limite de tokens (mensal)</label>
          <input value={limiteTokensMes} onChange={e => setLimiteTokensMes(e.target.value)} style={inputStyle} type="number" min={0} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid || submitting} onClick={submit} style={{ ...primaryBtn, opacity: valid && !submitting ? 1 : 0.5, cursor: valid && !submitting ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
