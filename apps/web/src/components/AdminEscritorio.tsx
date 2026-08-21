import { useState, useEffect, useCallback } from 'react'
import { api, getErrorMessage } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import {
  Button, EmptyRow, EmptyState, Field, FONT, inputStyle, Loading, Modal,
  PageContainer, PageHeader, RADIUS, SPACE, Table, TableShell, Td, Th, THeadRow, Tr, useIsMobile,
} from '../ui'

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

function StatCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '18px 20px' }}>
      <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: FONT.sm, color: subColor || 'var(--color-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
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
            borderRadius: RADIUS.control,
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
            <span style={{ fontSize: FONT.md, fontWeight: 500, color: checked ? 'var(--color-foreground)' : 'var(--color-muted)' }}>{m.label}</span>
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
    <Modal
      open
      onClose={onClose}
      title={titulo}
      width={440}
      footer={(
        <>
          <Button
            onClick={handleCopy}
            variant={copied ? 'danger' : 'primary'}
            style={copied ? { background: 'var(--color-success)' } : undefined}
          >
            {copied ? 'Copiada ✓' : 'Copiar senha'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Concluir</Button>
        </>
      )}
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.lg }}>
        Senha temporária gerada pelo sistema.
      </div>

      <div style={{
        background: 'var(--color-accent-light)',
        border: '1px solid var(--color-accent)',
        borderRadius: RADIUS.control,
        padding: '12px 14px',
        fontSize: FONT.base,
        color: 'var(--color-warning)',
        fontWeight: 500,
        marginBottom: SPACE.lg,
        lineHeight: 1.5,
      }}>
        ⚠️ Anote agora — esta senha não será exibida novamente. Entregue-a ao usuário por um canal seguro.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md,
        background: 'var(--color-surface-2)',
        border: '1px dashed var(--color-border)',
        borderRadius: RADIUS.control,
        padding: '14px 16px',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.cardTitle, letterSpacing: '0.06em', color: 'var(--color-foreground)', wordBreak: 'break-all' }}>{senha}</span>
      </div>
    </Modal>
  )
}

export default function AdminEscritorio() {
  const isMobile = useIsMobile()
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
    <PageContainer>
      <PageHeader
        eyebrow="ADMINISTRAÇÃO DO ESCRITÓRIO"
        title={info?.nome || 'Administração do Escritório'}
        description="Gestão de usuários, permissões e consumo do seu escritório"
      />

      <div style={{ marginTop: SPACE.xxl }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: SPACE.xxl, borderBottom: '1px solid var(--color-border)', marginBottom: 28 }}>
          {([['usuarios', 'Usuários'], ['permissoes', 'Permissões'], ['metricas', 'Métricas'], ['identidade', 'Identidade / Papel Timbrado']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: '10px 2px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: FONT.md,
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

        {loading && activeTab === 'usuarios' && <Loading message="Carregando…" />}

        {/* ===== TAB: USUÁRIOS ===== */}
        {activeTab === 'usuarios' && !loading && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.xl }}>
              <div style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>{users.length} {users.length === 1 ? 'usuário' : 'usuários'} no escritório</div>
              <Button onClick={() => setModal({ kind: 'novoUsuario' })}>+ Novo usuário</Button>
            </div>

            <TableShell>
              <Table style={{ minWidth: 720 }}>
                <THeadRow>
                  <Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Último login</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                </THeadRow>
                <tbody>
                  {users.map(u => {
                    const rm = roleMeta[u.role] || roleMeta.user
                    return (
                      <Tr key={u.id}>
                        <Td style={{ fontWeight: 500 }}>{u.nome}</Td>
                        <Td style={{ color: 'var(--color-muted)' }}>{u.email}</Td>
                        <Td>
                          <span style={{ fontSize: FONT.xs, fontWeight: 600, color: rm.color, background: rm.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{rm.label}</span>
                        </Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)' }}>{fmtDate(u.ultimoLogin)}</Td>
                        <Td>
                          <span style={{
                            fontSize: FONT.xs, fontWeight: 600, padding: '3px 8px', borderRadius: RADIUS.chip,
                            color: u.ativo ? 'var(--color-success)' : 'var(--color-muted)',
                            background: u.ativo ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                          }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                        </Td>
                        <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'resetSenha', user: u })} style={{ marginRight: 6 }}>Resetar senha</Button>
                          <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'desativar', user: u })} style={{ color: u.ativo ? 'var(--color-danger)' : 'var(--color-success)', borderColor: u.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}>
                            {u.ativo ? 'Desativar' : 'Reativar'}
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
                  {users.length === 0 && <EmptyRow colSpan={6} message="Nenhum usuário cadastrado. Clique em “Novo usuário” para começar." />}
                </tbody>
              </Table>
            </TableShell>
          </>
        )}

        {/* ===== TAB: PERMISSÕES ===== */}
        {activeTab === 'permissoes' && (
          <div>
            <div style={{ marginBottom: SPACE.xl, maxWidth: 560 }}>
              <Field label="Selecione o usuário">
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} style={inputStyle()}>
                  <option value="">— Escolha um usuário —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.nome} · {u.email}</option>
                  ))}
                </select>
              </Field>
            </div>

            {selectedUser && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: SPACE.md }}>
                  <span style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>Módulos de acesso de</span>
                  <span style={{ fontSize: FONT.md, fontWeight: 600 }}>{selectedUser.nome}</span>
                </div>
                <ModuleCheckboxGrid selected={permissoesSelecionadas} onChange={setPermissoesSelecionadas} />
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.xl }}>
                  <Button
                    onClick={handleSalvarPermissoes}
                    disabled={savingPermissoes || !permissoesDirty}
                  >
                    {savingPermissoes ? 'Salvando…' : 'Salvar permissões'}
                  </Button>
                  {!permissoesDirty && <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>Nenhuma alteração pendente</span>}
                </div>
              </>
            )}

            {!selectedUser && (
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card }}>
                <EmptyState icon="🔑" message="Selecione um usuário acima para editar os módulos que ele pode acessar." />
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: MÉTRICAS ===== */}
        {activeTab === 'metricas' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 14, marginBottom: SPACE.lg }}>
              <StatCard label="Processos" value={fmtNum(metricas?.totalProcessos)} sub={`${fmtNum(metricas?.processosAtivos)} ativos`} />
              <StatCard label="Peças no mês" value={fmtNum(metricas?.pecasMes)} />
              <StatCard label="Tokens no mês" value={fmtNum(metricas?.tokensMes)} sub={hasLimite ? `Limite mensal: ${fmtNum(limiteTokensMes)}` : undefined} />
              <StatCard label="Usuários ativos" value={fmtNum(metricas?.usuariosAtivos)} sub={`${users.length} no total`} />
            </div>

            {hasLimite ? (
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '20px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SPACE.md }}>
                  <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Uso do limite de tokens</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base, color: usoColor, fontWeight: 600 }}>{usoPercentual}%</div>
                </div>
                <div style={{ height: 8, background: 'var(--color-surface-2)', borderRadius: RADIUS.chip, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(usoPercentual, 100)}%`, height: '100%', background: usoColor, borderRadius: RADIUS.chip, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: 10 }}>
                  🔋 {fmtNum(tokensMes)} de {fmtNum(limiteTokensMes)} tokens consumidos neste mês · Limite mensal: {fmtNum(limiteTokensMes)}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.lg }}>
                <div>
                  <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Consumo de tokens do mês</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.03em', marginTop: 8 }}>{fmtNum(tokensMes)}</div>
                </div>
                <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>Sem limite de demonstração definido.</div>
              </div>
            )}
          </>
        )}

        {/* ===== TAB: IDENTIDADE ===== */}
        {activeTab === 'identidade' && (
          <div style={{ maxWidth: 760 }}>
            {/* Bloco 1: Dados do Escritório */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '22px 24px', marginBottom: SPACE.xl }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.lg }}>
                Dados do Escritório (Papel Timbrado)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Razão Social">
                    <input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} style={inputStyle()} placeholder="Escritório de Advocacia Ltda." />
                  </Field>
                </div>
                <div>
                  <Field label="CNPJ">
                    <input value={cnpj} onChange={e => setCnpj(e.target.value)} style={inputStyle()} placeholder="00.000.000/0001-00" />
                  </Field>
                </div>
                <div>
                  <Field label="Inscrição OAB do escritório">
                    <input value={inscricaoOab} onChange={e => setInscricaoOab(e.target.value)} style={inputStyle()} placeholder="OAB/UF 1234" />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Endereço">
                    <input value={endereco} onChange={e => setEndereco(e.target.value)} style={inputStyle()} placeholder="Rua dos Advogados, 100 — sala 12" />
                  </Field>
                </div>
                <div>
                  <Field label="Número">
                    <input value={numero} onChange={e => setNumero(e.target.value)} style={inputStyle()} placeholder="100" />
                  </Field>
                </div>
                <div>
                  <Field label="Bairro">
                    <input value={bairro} onChange={e => setBairro(e.target.value)} style={inputStyle()} placeholder="Centro" />
                  </Field>
                </div>
                <div>
                  <Field label="Cidade">
                    <input value={cidade} onChange={e => setCidade(e.target.value)} style={inputStyle()} placeholder="São Paulo" />
                  </Field>
                </div>
                <div>
                  <Field label="UF">
                    <input value={uf} onChange={e => setUf(e.target.value)} style={inputStyle()} placeholder="SP" maxLength={2} />
                  </Field>
                </div>
                <div>
                  <Field label="CEP">
                    <input value={cep} onChange={e => setCep(e.target.value)} style={inputStyle()} placeholder="00000-000" />
                  </Field>
                </div>
                <div>
                  <Field label="Telefone">
                    <input value={telefone} onChange={e => setTelefone(e.target.value)} style={inputStyle()} placeholder="(11) 0000-0000" />
                  </Field>
                </div>
                <div>
                  <Field label="E-mail">
                    <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle()} placeholder="contato@escritorio.com.br" />
                  </Field>
                </div>
                <div>
                  <Field label="Site">
                    <input value={site} onChange={e => setSite(e.target.value)} style={inputStyle()} placeholder="www.escritorio.com.br" />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Logo do escritório">
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
                      style={inputStyle()}
                    />
                  </Field>
                  {logoUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginTop: 10 }}>
                      <img src={logoUrl} alt="Logo do escritório" style={{ maxHeight: 80, border: '1px solid var(--color-border)', borderRadius: RADIUS.control }} />
                      <Button variant="secondary" onClick={() => setLogoUrl('')}>Remover logo</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco 2: Assinatura do Advogado */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '22px 24px', marginBottom: SPACE.xl }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.lg }}>
                Assinatura do Advogado (você)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Nome">
                    <input value={me.name || ''} readOnly style={{ ...inputStyle(), color: 'var(--color-muted)', cursor: 'not-allowed' }} />
                  </Field>
                </div>
                <div>
                  <Field label="OAB">
                    <input value={oab} onChange={e => setOab(e.target.value)} style={inputStyle()} placeholder="OAB nº 123.456" />
                  </Field>
                </div>
                <div>
                  <Field label="UF da OAB">
                    <input value={oabUf} onChange={e => setOabUf(e.target.value)} style={inputStyle()} placeholder="SP" maxLength={2} />
                  </Field>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                onClick={handleSalvarIdentidade}
                disabled={savingIdentity}
              >
                {savingIdentity ? 'Salvando…' : 'Salvar identidade'}
              </Button>
            </div>
          </div>
        )}

        {/* ===== MODALS ===== */}
        {modal?.kind === 'novoUsuario' && (
          <NovoUsuarioModal
            onCancel={() => setModal(null)}
            onSubmit={handleCriarUsuario}
          />
        )}
        {modal?.kind === 'resetSenha' && (
          <Modal
            open
            onClose={() => setModal(null)}
            title="Resetar senha"
            width={440}
            footer={(
              <>
                <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
                <Button onClick={() => handleResetSenha(modal.user)}>Gerar nova senha</Button>
              </>
            )}
          >
            <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.lg }}>
              Gerar uma nova senha temporária para <strong style={{ color: 'var(--color-foreground)' }}>{modal.user.nome}</strong> ({modal.user.email})?
            </div>
            <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: RADIUS.control, padding: '10px 14px', fontSize: FONT.base, color: 'var(--color-muted)' }}>
              A senha atual será invalidada. O sistema gerará uma temporária para você entregar ao usuário.
            </div>
          </Modal>
        )}
        {modal?.kind === 'desativar' && (
          <Modal
            open
            onClose={() => setModal(null)}
            title={modal.user.ativo ? 'Desativar usuário' : 'Reativar usuário'}
            width={440}
            footer={(
              <>
                <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
                <Button
                  onClick={() => handleDesativar(modal.user)}
                  variant="danger"
                  style={modal.user.ativo ? undefined : { background: 'var(--color-success)' }}
                >
                  {modal.user.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              </>
            )}
          >
            <div style={{ color: 'var(--color-muted)', fontSize: FONT.base }}>
              {modal.user.ativo
                ? <>O usuário <strong style={{ color: 'var(--color-foreground)' }}>{modal.user.nome}</strong> perderá o acesso imediato ao sistema. Esta ação pode ser revertida.</>
                : <>O usuário <strong style={{ color: 'var(--color-foreground)' }}>{modal.user.nome}</strong> voltará a ter acesso ao sistema.</>}
            </div>
          </Modal>
        )}
        {modal?.kind === 'tempSenha' && (
          <TempSenhaModal titulo={modal.titulo} senha={modal.senha} onClose={() => setModal(null)} notify={(t, m) => addToast(t, m)} />
        )}

        <Toast toasts={toasts} onDismiss={dismissToast} />
      </div>
    </PageContainer>
  )
}

function NovoUsuarioModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (data: { nome: string; email: string; permissoes: string[] }) => void }) {
  const isMobile = useIsMobile()
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
    <Modal
      open
      onClose={onCancel}
      title="Novo usuário"
      width={560}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button disabled={!valid || submitting} onClick={submit}>
            {submitting ? 'Criando…' : 'Criar usuário'}
          </Button>
        </>
      )}
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.xl }}>
        Cadastre um membro da equipe e defina seus módulos de acesso.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACE.md }}>
          <Field label="Nome" error={errors.nome} required>
            <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={inputStyle(!!errors.nome)} placeholder="Nome completo" autoFocus />
          </Field>
          <Field label="E-mail" error={errors.email} required>
            <input value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: undefined })) }} style={inputStyle(!!errors.email)} type="email" placeholder="usuario@escritorio.com" />
          </Field>
        </div>

        <div>
          <Field label="Módulos de acesso">
            <ModuleCheckboxGrid selected={permissoes} onChange={setPermissoes} />
          </Field>
          <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: SPACE.sm }}>
            Documentação vem marcada por padrão. A senha temporária será gerada automaticamente ao criar.
          </div>
        </div>
      </div>
    </Modal>
  )
}
