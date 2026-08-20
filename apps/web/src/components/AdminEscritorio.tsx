import { useState, useEffect, useCallback } from 'react'
import { api, getErrorMessage } from '../api/client'
import Toast, { ToastMessage } from './Toast'

type Tab = 'usuarios' | 'permissoes' | 'metricas' | 'identidade'

interface Usuario {
  id: string
  nome: string
  email: string
  role: 'admin' | 'user'
  ativo: boolean
  ultimoLogin?: string
  precisaTrocarSenha?: boolean
  oab?: string | null
  oabUf?: string | null
}

type Modal =
  | { kind: 'novoUsuario' }
  | { kind: 'resetSenha'; user: Usuario }
  | { kind: 'desativar'; user: Usuario }
  | { kind: 'tempSenha'; titulo: string; senha: string }
  | null

// Os 10 módulos concedíveis — IDs alinhados com o App.tsx (Route).
const MODULOS: { id: string; label: string }[] = [
  { id: 'processos', label: 'Processos' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'pecas', label: 'Gerar Peças' },
  { id: 'validacao', label: 'Validação' },
  { id: 'jurimetria', label: 'Jurimetria' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'contratos', label: 'Revisão Contratual' },
  { id: 'crm', label: 'Funil de Clientes' },
  { id: 'base', label: 'Base RAG' },
  { id: 'documentacao', label: 'Documentação' },
]

const roleMeta: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: 'Administrador', color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  user: { label: 'Usuário', color: 'var(--color-warning)', bg: 'var(--color-accent-light)' },
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

// Grade de checkboxes dos 10 módulos (2 colunas)
function ModuleCheckboxGrid({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {MODULOS.map(m => {
        const checked = selected.includes(m.id)
        return (
          <label key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
            borderRadius: 6,
            cursor: 'pointer',
            background: checked ? 'var(--color-badge-tint)' : 'var(--color-surface)',
            transition: 'border-color 0.15s, background 0.15s',
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(m.id)}
              style={{ accentColor: 'var(--color-primary)', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 500, color: checked ? 'var(--color-foreground)' : 'var(--color-muted)' }}>{m.label}</span>
          </label>
        )
      })}
    </div>
  )
}

// Modal de confirmação da senha temporária
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
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 18 }}>Senha temporária gerada pelo sistema.</div>

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
        ⚠️ Anote agora — esta senha não será exibida novamente. Entregue-a ao usuário por um canal seguro.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
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

export default function AdminEscritorio() {
  const [activeTab, setActiveTab] = useState<Tab>('usuarios')

  const me = JSON.parse(localStorage.getItem('smartjuris_user') || '{}')

  const [info, setInfo] = useState<any>({})
  const [users, setUsers] = useState<Usuario[]>([])
  const [metricas, setMetricas] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)

  // Identidade / Papel Timbrado
  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [inscricaoOab, setInscricaoOab] = useState('')
  const [endereco, setEndereco] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [cep, setCep] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [site, setSite] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [oab, setOab] = useState('')
  const [oabUf, setOabUf] = useState('')
  const [savingIdentity, setSavingIdentity] = useState(false)

  // Permissões tab
  const [selectedUserId, setSelectedUserId] = useState('')
  const [permissoesSelecionadas, setPermissoesSelecionadas] = useState<string[]>([])
  const [permissoesOriginal, setPermissoesOriginal] = useState<string[]>([])
  const [savingPermissoes, setSavingPermissoes] = useState(false)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = useCallback((type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Fase 7 implementará estes endpoints — shapes esperados no report.
      const [infoData, usersData, metricasData] = await Promise.all([
        api.escritorio.getInfo(),
        api.escritorio.listUsers(),
        api.escritorio.getMetricas(),
      ])
      setInfo(infoData ?? {})
      setUsers(Array.isArray(usersData) ? usersData : [])
      setMetricas(metricasData ?? {})
    } catch {
      addToast('error', 'Não foi possível carregar os dados do escritório.')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { loadData() }, [loadData])

  // Preenche os campos de identidade quando info/users estiverem prontos.
  useEffect(() => {
    if (loading) return
    setRazaoSocial(info?.razaoSocial || '')
    setCnpj(info?.cnpj || '')
    setInscricaoOab(info?.inscricaoOab || '')
    setEndereco(info?.endereco || '')
    setNumero(info?.numero || '')
    setBairro(info?.bairro || '')
    setCidade(info?.cidade || '')
    setUf(info?.uf || '')
    setCep(info?.cep || '')
    setTelefone(info?.telefone || '')
    setEmail(info?.email || '')
    setSite(info?.site || '')
    setLogoUrl(info?.logoUrl || '')
    if (me.id) {
      const u = users.find(x => x.id === me.id)
      setOab(u?.oab || '')
      setOabUf(u?.oabUf || '')
    }
  }, [loading, info, users, me.id])

  // Ao trocar de usuário no seletor de permissões, carrega as permissões atuais.
  useEffect(() => {
    if (!selectedUserId) { setPermissoesSelecionadas([]); setPermissoesOriginal([]); return }
    let cancelled = false
    api.escritorio.getPermissoes(selectedUserId).then(data => {
      if (cancelled) return
      const ativos = Array.isArray(data?.permissoes)
        ? data.permissoes.filter((p: any) => p.ativo).map((p: any) => p.modulo)
        : []
      setPermissoesSelecionadas(ativos)
      setPermissoesOriginal(ativos)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedUserId])

  const handleCriarUsuario = async (data: { nome: string; email: string; permissoes: string[] }) => {
    try {
      const res = await api.escritorio.criarUsuario(data)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao criar usuário.'))
        return
      }
      const senha = json?.senhaTemporaria || json?.senha || json?.password
      setModal({ kind: 'tempSenha', titulo: 'Usuário criado', senha: senha || '—' })
      loadData()
    } catch {
      addToast('error', 'Falha ao criar usuário.')
    }
  }

  const handleResetSenha = async (user: Usuario) => {
    try {
      const res = await api.escritorio.resetarSenha(user.id)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao redefinir senha.'))
        return
      }
      const senha = json?.senhaTemporaria || json?.senha || json?.password
      setModal({ kind: 'tempSenha', titulo: 'Senha temporária gerada', senha: senha || '—' })
    } catch {
      addToast('error', 'Falha ao redefinir senha.')
    }
  }

  const handleDesativar = async (user: Usuario) => {
    try {
      const res = await api.escritorio.desativarUsuario(user.id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao alterar o status do usuário.'))
        return
      }
      setModal(null)
      addToast('success', user.ativo ? 'Usuário desativado.' : 'Usuário reativado.')
      loadData()
    } catch {
      addToast('error', 'Falha ao alterar o status do usuário.')
    }
  }

  const handleSalvarPermissoes = async () => {
    if (!selectedUserId) return
    setSavingPermissoes(true)
    try {
      const res = await api.escritorio.salvarPermissoes(selectedUserId, MODULOS.map(m => ({ modulo: m.id, ativo: permissoesSelecionadas.includes(m.id) })))
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao salvar permissões.'))
        return
      }
      setPermissoesOriginal(permissoesSelecionadas)
      addToast('success', 'Permissões atualizadas.')
      loadData()
    } catch {
      addToast('error', 'Falha ao salvar permissões.')
    } finally {
      setSavingPermissoes(false)
    }
  }

  const handleSalvarIdentidade = async () => {
    setSavingIdentity(true)
    try {
      await Promise.all([
        api.escritorio.saveIdentity({
          razaoSocial, cnpj, inscricaoOab,
          endereco, numero, bairro, cidade, uf, cep,
          telefone, email, site, logoUrl,
        }),
        ...(me.id ? [api.escritorio.updateUsuario(me.id, { oab, oabUf })] : []),
      ])
      addToast('success', 'Identidade e papel timbrado salvos.')
      loadData()
    } catch {
      addToast('error', 'Falha ao salvar a identidade e o papel timbrado.')
    } finally {
      setSavingIdentity(false)
    }
  }

  const tokensMes = Number(metricas?.tokensMes ?? 0)
  const limiteTokensMes = metricas?.limiteTokensMes != null ? Number(metricas.limiteTokensMes) : null
  const hasLimite = limiteTokensMes != null && limiteTokensMes > 0
  const usoPercentual = hasLimite
    ? (metricas?.usoPercentual != null ? Number(metricas.usoPercentual) : Math.round((tokensMes / (limiteTokensMes as number)) * 100))
    : 0
  const usoColor = usoPercentual > 85 ? 'var(--color-danger)' : usoPercentual > 60 ? 'var(--color-warning)' : 'var(--color-success)'

  const permissoesDirty = JSON.stringify(permissoesSelecionadas) !== JSON.stringify(permissoesOriginal)

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>
          {info?.nome || 'Administração do Escritório'}
        </div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>
          Gestão de usuários, permissões e consumo do seu escritório
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--color-border)', marginBottom: 28 }}>
        {([['usuarios', 'Usuários'], ['permissoes', 'Permissões'], ['metricas', 'Métricas'], ['identidade', 'Identidade / Papel Timbrado']] as [Tab, string][]).map(([t, label]) => (
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

      {loading && activeTab === 'usuarios' && (
        <div style={{ color: 'var(--color-muted)', fontSize: 13, padding: '24px 0' }}>Carregando…</div>
      )}

      {/* ===== TAB: USUÁRIOS ===== */}
      {activeTab === 'usuarios' && !loading && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{users.length} {users.length === 1 ? 'usuário' : 'usuários'} no escritório</div>
            <button onClick={() => setModal({ kind: 'novoUsuario' })} style={primaryBtn}>+ Novo usuário</button>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  <Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Último login</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
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
                      <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(u.ultimoLogin)}</td>
                      <td style={{ padding: '12px 22px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                          color: u.ativo ? 'var(--color-success)' : 'var(--color-muted)',
                          background: u.ativo ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                        }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td style={{ padding: '12px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setModal({ kind: 'resetSenha', user: u })} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}>Resetar senha</button>
                        <button onClick={() => setModal({ kind: 'desativar', user: u })} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, color: u.ativo ? 'var(--color-danger)' : 'var(--color-success)', borderColor: u.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          {u.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && <EmptyRow colSpan={6} text="Nenhum usuário cadastrado. Clique em “Novo usuário” para começar." />}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== TAB: PERMISSÕES ===== */}
      {activeTab === 'permissoes' && (
        <>
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Selecione o usuário</label>
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} style={inputStyle}>
                <option value="">— Escolha um usuário —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.nome} · {u.email}</option>
                ))}
              </select>
            </div>

            {selectedUser && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Módulos de acesso de</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{selectedUser.nome}</span>
                </div>
                <ModuleCheckboxGrid selected={permissoesSelecionadas} onChange={setPermissoesSelecionadas} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
                  <button
                    onClick={handleSalvarPermissoes}
                    disabled={savingPermissoes || !permissoesDirty}
                    style={{ ...primaryBtn, opacity: savingPermissoes || !permissoesDirty ? 0.5 : 1, cursor: savingPermissoes || !permissoesDirty ? 'not-allowed' : 'pointer' }}
                  >
                    {savingPermissoes ? 'Salvando…' : 'Salvar permissões'}
                  </button>
                  {!permissoesDirty && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Nenhuma alteração pendente</span>}
                </div>
              </>
            )}

            {!selectedUser && (
              <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.6 }}>🔑</div>
                Selecione um usuário acima para editar os módulos que ele pode acessar.
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== TAB: MÉTRICAS ===== */}
      {activeTab === 'metricas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            <StatCard label="Processos" value={fmtNum(metricas?.totalProcessos)} sub={`${fmtNum(metricas?.processosAtivos)} ativos`} />
            <StatCard label="Peças no mês" value={fmtNum(metricas?.pecasMes)} />
            <StatCard label="Tokens no mês" value={fmtNum(metricas?.tokensMes)} sub={hasLimite ? `Limite mensal: ${fmtNum(limiteTokensMes)}` : undefined} />
            <StatCard label="Usuários ativos" value={fmtNum(metricas?.usuariosAtivos)} sub={`${users.length} no total`} />
          </div>

          {hasLimite ? (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Uso do limite de tokens</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: usoColor, fontWeight: 600 }}>{usoPercentual}%</div>
              </div>
              <div style={{ height: 8, background: 'var(--color-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(usoPercentual, 100)}%`, height: '100%', background: usoColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 10 }}>
                🔋 {fmtNum(tokensMes)} de {fmtNum(limiteTokensMes)} tokens consumidos neste mês · Limite mensal: {fmtNum(limiteTokensMes)}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Consumo de tokens do mês</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.03em', marginTop: 8 }}>{fmtNum(tokensMes)}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Sem limite de demonstração definido.</div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB: IDENTIDADE ===== */}
      {activeTab === 'identidade' && (
        <div style={{ maxWidth: 760 }}>
          {/* Bloco 1: Dados do Escritório */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '22px 24px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 16 }}>
              Dados do Escritório (Papel Timbrado)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Razão Social</label>
                <input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} style={inputStyle} placeholder="Escritório de Advocacia Ltda." />
              </div>
              <div>
                <label style={labelStyle}>CNPJ</label>
                <input value={cnpj} onChange={e => setCnpj(e.target.value)} style={inputStyle} placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <label style={labelStyle}>Inscrição OAB do escritório</label>
                <input value={inscricaoOab} onChange={e => setInscricaoOab(e.target.value)} style={inputStyle} placeholder="OAB/UF 1234" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Endereço</label>
                <input value={endereco} onChange={e => setEndereco(e.target.value)} style={inputStyle} placeholder="Rua dos Advogados, 100 — sala 12" />
              </div>
              <div>
                <label style={labelStyle}>Número</label>
                <input value={numero} onChange={e => setNumero(e.target.value)} style={inputStyle} placeholder="100" />
              </div>
              <div>
                <label style={labelStyle}>Bairro</label>
                <input value={bairro} onChange={e => setBairro(e.target.value)} style={inputStyle} placeholder="Centro" />
              </div>
              <div>
                <label style={labelStyle}>Cidade</label>
                <input value={cidade} onChange={e => setCidade(e.target.value)} style={inputStyle} placeholder="São Paulo" />
              </div>
              <div>
                <label style={labelStyle}>UF</label>
                <input value={uf} onChange={e => setUf(e.target.value)} style={inputStyle} placeholder="SP" maxLength={2} />
              </div>
              <div>
                <label style={labelStyle}>CEP</label>
                <input value={cep} onChange={e => setCep(e.target.value)} style={inputStyle} placeholder="00000-000" />
              </div>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input value={telefone} onChange={e => setTelefone(e.target.value)} style={inputStyle} placeholder="(11) 0000-0000" />
              </div>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="contato@escritorio.com.br" />
              </div>
              <div>
                <label style={labelStyle}>Site</label>
                <input value={site} onChange={e => setSite(e.target.value)} style={inputStyle} placeholder="www.escritorio.com.br" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Logo do escritório</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => setLogoUrl(typeof reader.result === 'string' ? reader.result : '')
                    reader.readAsDataURL(file)
                  }}
                  style={inputStyle}
                />
                {logoUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <img src={logoUrl} alt="Logo do escritório" style={{ maxHeight: 80, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                    <button onClick={() => setLogoUrl('')} style={ghostBtn}>Remover logo</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bloco 2: Assinatura do Advogado */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '22px 24px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 16 }}>
              Assinatura do Advogado (você)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nome</label>
                <input value={me.name || ''} readOnly style={{ ...inputStyle, color: 'var(--color-muted)', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label style={labelStyle}>OAB</label>
                <input value={oab} onChange={e => setOab(e.target.value)} style={inputStyle} placeholder="OAB nº 123.456" />
              </div>
              <div>
                <label style={labelStyle}>UF da OAB</label>
                <input value={oabUf} onChange={e => setOabUf(e.target.value)} style={inputStyle} placeholder="SP" maxLength={2} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSalvarIdentidade}
              disabled={savingIdentity}
              style={{ ...primaryBtn, opacity: savingIdentity ? 0.5 : 1, cursor: savingIdentity ? 'not-allowed' : 'pointer' }}
            >
              {savingIdentity ? 'Salvando…' : 'Salvar identidade'}
            </button>
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(24,23,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setModal(null)}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: 28, width: 440, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            {modal.kind === 'novoUsuario' && (
              <NovoUsuarioModal
                onCancel={() => setModal(null)}
                onSubmit={handleCriarUsuario}
              />
            )}
            {modal.kind === 'resetSenha' && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Resetar senha</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 18 }}>
                  Gerar uma nova senha temporária para <strong style={{ color: 'var(--color-foreground)' }}>{modal.user.nome}</strong> ({modal.user.email})?
                </div>
                <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--color-muted)', marginBottom: 20 }}>
                  A senha atual será invalidada. O sistema gerará uma temporária para você entregar ao usuário.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setModal(null)} style={ghostBtn}>Cancelar</button>
                  <button onClick={() => handleResetSenha(modal.user)} style={primaryBtn}>Gerar nova senha</button>
                </div>
              </div>
            )}
            {modal.kind === 'desativar' && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {modal.user.ativo ? 'Desativar usuário' : 'Reativar usuário'}
                </div>
                <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>
                  {modal.user.ativo
                    ? <>O usuário <strong style={{ color: 'var(--color-foreground)' }}>{modal.user.nome}</strong> perderá o acesso imediato ao sistema. Esta ação pode ser revertida.</>
                    : <>O usuário <strong style={{ color: 'var(--color-foreground)' }}>{modal.user.nome}</strong> voltará a ter acesso ao sistema.</>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setModal(null)} style={ghostBtn}>Cancelar</button>
                  <button onClick={() => handleDesativar(modal.user)} style={{ ...primaryBtn, background: modal.user.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {modal.user.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              </div>
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

function NovoUsuarioModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (data: { nome: string; email: string; permissoes: string[] }) => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [permissoes, setPermissoes] = useState<string[]>(['documentacao'])
  const [errors, setErrors] = useState<{ nome?: string; email?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const valid = nome.trim() && email.trim()

  const submit = async () => {
    const next: typeof errors = {}
    if (!nome.trim()) next.nome = 'Informe o nome do usuário.'
    if (!email.trim()) next.email = 'Informe o e-mail.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'E-mail inválido.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    await onSubmit({ nome: nome.trim(), email: email.trim(), permissoes })
    setSubmitting(false)
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 }}>Novo usuário</div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 20 }}>Cadastre um membro da equipe e defina seus módulos de acesso.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nome</label>
          <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={{ ...inputStyle, borderColor: errors.nome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Nome completo" autoFocus />
          {errors.nome && <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>{errors.nome}</div>}
        </div>
        <div>
          <label style={labelStyle}>E-mail</label>
          <input value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: undefined })) }} style={{ ...inputStyle, borderColor: errors.email ? 'var(--color-danger)' : 'var(--color-border)' }} type="email" placeholder="usuario@escritorio.com" />
          {errors.email && <div style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>{errors.email}</div>}
        </div>

        <div>
          <label style={labelStyle}>Módulos de acesso</label>
          <ModuleCheckboxGrid selected={permissoes} onChange={setPermissoes} />
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8 }}>
            Documentação vem marcada por padrão. A senha temporária será gerada automaticamente ao criar.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancelar</button>
        <button disabled={!valid || submitting} onClick={submit} style={{ ...primaryBtn, opacity: valid && !submitting ? 1 : 0.5, cursor: valid && !submitting ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Criando…' : 'Criar usuário'}
        </button>
      </div>
    </div>
  )
}
