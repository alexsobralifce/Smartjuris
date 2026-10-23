import { useState, useEffect, useCallback } from 'react'
import { api, getErrorMessage } from '../api/client'
import { resumoUsoPromocao } from '../utils/promocaoUI'
import Toast, { ToastMessage } from './Toast'
import RootBlog from './RootBlog'
import RootLegislacao from './RootLegislacao'
import { Button, EmptyRow, EmptyState, FONT, Field, FormGrid, FormRow, inputStyle, Loading, Modal, PageContainer, PageHeader, RADIUS, SPACE, Table, TableShell, Td, Th, THeadRow, Tr, useIsMobile } from '../ui'

type Tab = 'escritorios' | 'creditos' | 'metricas' | 'auditoria' | 'logs' | 'billing' | 'blog' | 'legislacao'

// Painel de desenvolvedor do billing (Mercado Pago) — visão técnica root.
interface BillingDev {
  config: {
    mpConfigurado: boolean
    temPublicKey: boolean
    temWebhookSecret: boolean
    accessTokenPrefix: string | null
    publicKeyPrefix: string | null
    appUrl: string
    publicApiUrl: string
    webhookUrl: string
  }
  promocao: {
    ativa: boolean
    percentual: number
    validade: string | null
    usos: {
      total: number
      ultimas24h: number
      porPlano: { basico: number; profissional: number; office: number }
    }
  }
  webhooks: {
    total: number
    ultimas24h: number
    recentes: { tipo: string; dataId: string; estado: string | null; resultado: string; escritorioId: string | null; createdAt: string }[]
  }
  operacoes: { idempotencyKey: string; plano: string; estado: string; fase: string; resultadoIncerto: boolean; mercadoPagoId: string | null; error: string | null; createdAt: string }[]
  assinaturas: { id: string; nome: string; plano: string; assinaturaStatus: string; assinaturaPlano: string | null; mercadoPagoId: string | null; creditsAvailable: number; proximaCobranca: string | null; ativo: boolean }[]
}

interface Escritorio {
  id: string
  nome: string
  plano: string
  limiteUsuarios: number
  usuariosAtivos: number
  ativo: boolean
  tokens30d: number
  usuarios: { id: string; nome: string; email: string; role: string; ativo: boolean }[]
  limiteTokensMes?: number | null
  usoPercentual?: number
  isentoMensalidade?: boolean
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

type ModalState =
  | { kind: 'novoEscritorio' }
  | { kind: 'editar'; esc: Escritorio }
  | { kind: 'desativar'; esc: Escritorio }
  | { kind: 'excluir'; esc: Escritorio }
  | { kind: 'tempSenha'; titulo: string; senha: string }
  | { kind: 'addCreditos'; alvo: { tipo: 'escritorio' | 'usuario'; id: string; nome: string } }
  | { kind: 'novoUsuario'; esc: Escritorio }
  | { kind: 'editarUsuario'; esc: Escritorio; user: Escritorio['usuarios'][number] }
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

const fmtDetalhes = (v: unknown): string => {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

const nivelMeta: Record<string, { label: string; color: string; bg: string }> = {
  info:  { label: 'INFO',  color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  warn:  { label: 'WARN',  color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  error: { label: 'ERRO',  color: 'var(--color-danger)',  bg: 'var(--color-danger-light)' },
}

const formatarLogTexto = (l: any): string => {
  const t = l.createdAt ? new Date(l.createdAt).toISOString() : ''
  const linha = `[${t}] ${String(l.level).toUpperCase()} ${l.message}`
  const extras = [
    l.source && `fonte: ${l.source}`,
    l.path && `rota: ${l.method || ''} ${l.path}`,
    l.ip && `ip: ${l.ip}`,
  ].filter(Boolean).join(' | ')
  return `${linha}${extras ? ' · ' + extras : ''}${l.stack ? '\n' + l.stack : ''}`
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
      <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.sm }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: FONT.sm, color: subColor || 'var(--color-muted)', marginTop: SPACE.xs }}>{sub}</div>}
    </div>
  )
}

// --- Painel de dev do billing (Mercado Pago) ---

function DevStatus({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div style={{ background: ok ? 'var(--color-success-light)' : 'var(--color-danger-light)', border: `1px solid ${ok ? 'var(--color-success)' : 'var(--color-danger)'}`, borderRadius: RADIUS.control, padding: '10px 12px' }}>
      <div style={{ fontSize: FONT.xs, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{ok ? '✓' : '✗'} {label}</div>
      <div style={{ fontSize: FONT.sm, marginTop: 4, fontFamily: 'var(--font-mono)', color: 'var(--color-foreground)' }}>{value}</div>
    </div>
  )
}

const STATUS_CORES: Record<string, { cor: string; fundo: string }> = {
  ativa: { cor: 'var(--color-success)', fundo: 'var(--color-success-light)' },
  pendente: { cor: 'var(--color-warning)', fundo: 'var(--color-warning-light)' },
  atrasada: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
  cancelada: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
  nenhuma: { cor: 'var(--color-muted)', fundo: 'var(--color-surface-2)' },
  created: { cor: 'var(--color-warning)', fundo: 'var(--color-warning-light)' },
  done: { cor: 'var(--color-success)', fundo: 'var(--color-success-light)' },
  failed: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CORES[status] ?? { cor: 'var(--color-muted)', fundo: 'var(--color-surface-2)' }
  return (
    <span style={{ display: 'inline-block', background: c.fundo, color: c.cor, fontSize: FONT.xs, fontWeight: 600, padding: '3px 8px', borderRadius: RADIUS.chip, textTransform: 'capitalize' }}>{status}</span>
  )
}

const RESULT_CORES: Record<string, { cor: string; fundo: string }> = {
  ATIVADO: { cor: 'var(--color-success)', fundo: 'var(--color-success-light)' },
  DESATIVADO: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
  OBSOLETO: { cor: 'var(--color-muted)', fundo: 'var(--color-surface-2)' },
  SEM_MUDANCA: { cor: 'var(--color-muted)', fundo: 'var(--color-surface-2)' },
  SEM_VINCULO: { cor: 'var(--color-warning)', fundo: 'var(--color-warning-light)' },
  ERRO: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
  MP_INDISPONIVEL: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
}

function ResultPill({ result }: { result: string }) {
  const c = RESULT_CORES[result] ?? { cor: 'var(--color-muted)', fundo: 'var(--color-surface-2)' }
  return (
    <span style={{ display: 'inline-block', background: c.fundo, color: c.cor, fontSize: FONT.xs, fontWeight: 600, padding: '3px 8px', borderRadius: RADIUS.chip, fontFamily: 'var(--font-mono)' }}>{result}</span>
  )
}

function TempSenhaModal({ open, titulo, senha, onClose, notify }: { open: boolean; titulo: string; senha: string; onClose: () => void; notify: (t: 'success' | 'error', m: string) => void }) {
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
      open={open}
      onClose={onClose}
      title={titulo}
      width={440}
      footer={
        <>
          <Button onClick={handleCopy} style={copied ? { background: 'var(--color-success)' } : undefined}>
            {copied ? 'Copiada ✓' : 'Copiar senha'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Concluir</Button>
        </>
      }
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.lg }}>
        Senha temporária do administrador inicial.
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
        ⚠️ Anote agora — esta senha não será exibida novamente. Entregue-a ao administrador do escritório por um canal seguro.
      </div>

      <div style={{
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

function ExcluirEscritorioModal({ open, esc, onClose, onSubmit }: { open: boolean; esc: Escritorio; onClose: () => void; onSubmit: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const valid = confirmText.trim() === esc.nome
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Excluir escritório permanentemente"
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={!valid} onClick={onSubmit}>
            Excluir permanentemente
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.lg }}>
        Esta ação <strong style={{ color: 'var(--color-danger)' }}>NÃO pode ser desfeita</strong>. Todos os processos, peças, clientes, andamentos, financeiro, timesheet e usuários do escritório serão removidos para sempre.
      </div>

      <div style={{
        background: 'var(--color-danger-light)',
        border: '1px solid var(--color-danger)',
        borderRadius: RADIUS.control,
        padding: '12px 14px',
        fontSize: FONT.base,
        color: 'var(--color-danger)',
        fontWeight: 500,
        marginBottom: SPACE.lg,
        lineHeight: 1.5,
      }}>
        ⚠️ Você está prestes a excluir <strong>{esc.nome}</strong> e <strong>todos os seus dados</strong>.
      </div>

      <Field label="Para confirmar, digite o nome do escritório exatamente:" error={confirmText && !valid ? `O texto não confere com "${esc.nome}".` : undefined}>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          style={{ ...inputStyle(), borderColor: valid ? 'var(--color-success)' : (confirmText ? 'var(--color-danger)' : 'var(--color-border)'), fontFamily: 'var(--font-mono)' }}
          placeholder={esc.nome}
          autoFocus
        />
      </Field>
    </Modal>
  )
}

function AddCreditosModal({ open, alvo, onClose, onSubmit }: { open: boolean; alvo: { tipo: 'escritorio' | 'usuario'; id: string; nome: string }; onClose: () => void; onSubmit: (quantidade: number) => void }) {
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
    <Modal
      open={open}
      onClose={onClose}
      title={rotulo}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid || submitting} onClick={submit}>
            {submitting ? 'Adicionando…' : 'Adicionar créditos'}
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.xl }}>
        <strong style={{ color: 'var(--color-foreground)' }}>{alvo.nome}</strong> · 1 crédito = 1 token. O saldo é somado ao valor atual e vale para o mês corrente.
      </div>

      <Field label="Quantidade de créditos" error={error}>
        <input
          value={quantidade}
          onChange={e => { setQuantidade(e.target.value); if (error) setError(undefined) }}
          style={{ ...inputStyle(), borderColor: error ? 'var(--color-danger)' : 'var(--color-border)' }}
          type="number"
          min={1}
          step={1}
          placeholder="Ex.: 50000"
          autoFocus
        />
      </Field>
    </Modal>
  )
}

export default function RootPainel() {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<Tab>('escritorios')

  const [escritorios, setEscritorios] = useState<Escritorio[]>([])
  const [metricas, setMetricas] = useState<any[]>([])
  const [auditoria, setAuditoria] = useState<any[]>([])
  const [creditos, setCreditos] = useState<CreditoEscritorio[]>([])
  const [loadingCreditos, setLoadingCreditos] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logCarregando, setLogCarregando] = useState(false)
  const [logNivel, setLogNivel] = useState('')
  const [logBusca, setLogBusca] = useState('')
  const [logExpanded, setLogExpanded] = useState<string | null>(null)
  const [billingDev, setBillingDev] = useState<BillingDev | null>(null)
  const [loadingBilling, setLoadingBilling] = useState(false)
  const [expandedEsc, setExpandedEsc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)

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

  const loadBillingDev = useCallback(async () => {
    setLoadingBilling(true)
    try {
      const data = await api.raiz.getBillingDev()
      setBillingDev(data)
    } catch {
      addToast('error', 'Não foi possível carregar o painel de dev do billing.')
    } finally {
      setLoadingBilling(false)
    }
  }, [addToast])

  const loadLogs = useCallback(async () => {
    setLogCarregando(true)
    try {
      const params: Record<string, string | number> = { limit: 200 }
      if (logNivel) params.level = logNivel
      if (logBusca) params.busca = logBusca
      const data = await api.raiz.getLogs(params)
      setLogs(Array.isArray(data?.rows) ? data.rows : [])
      setLogTotal(Number(data?.total ?? 0))
    } catch {      addToast('error', 'Não foi possível carregar os logs.')
    } finally {
      setLogCarregando(false)
    }
  }, [addToast, logNivel, logBusca])

  useEffect(() => { loadEscritorios() }, [loadEscritorios])
  useEffect(() => { if (activeTab === 'metricas') loadMetricas() }, [activeTab, loadMetricas])
  useEffect(() => { if (activeTab === 'auditoria') loadAuditoria() }, [activeTab, loadAuditoria])
  useEffect(() => { if (activeTab === 'creditos') loadCreditos() }, [activeTab, loadCreditos])
  useEffect(() => { if (activeTab === 'logs') loadLogs() }, [activeTab, loadLogs])
  useEffect(() => { if (activeTab === 'billing') loadBillingDev() }, [activeTab, loadBillingDev])

  const copiarLog = async (l: any) => {
    const ok = await copiarTexto(formatarLogTexto(l))
    addToast(ok ? 'success' : 'error', ok ? 'Log copiado.' : 'Falha ao copiar.')
  }
  const copiarErrosFiltrados = async () => {
    const erros = logs.filter((l) => l.level === 'error')
    const texto = erros.length ? erros.map(formatarLogTexto).join('\n\n') : 'Nenhum erro no filtro atual.'
    const ok = await copiarTexto(texto)
    addToast(ok ? 'success' : 'error', ok ? `${erros.length} erro(s) copiado(s).` : 'Falha ao copiar.')
  }
  const copiarTodosFiltrados = async () => {
    const texto = logs.length ? logs.map(formatarLogTexto).join('\n\n') : 'Nenhum log no filtro atual.'
    const ok = await copiarTexto(texto)
    addToast(ok ? 'success' : 'error', ok ? 'Log filtrado copiado.' : 'Falha ao copiar.')
  }

  const handleCriarEscritorio = async (data: { nome: string; adminNome: string; adminEmail: string; isentoMensalidade?: boolean }) => {
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

  const handleResetSenha = async (user: { id: string; email: string }) => {
    try {
      const res = await api.raiz.resetarSenhaUsuario(user.id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao resetar senha.'))
        return
      }
      const data = await res.json().catch(() => ({}))
      setModal({ kind: 'tempSenha', titulo: 'Senha redefinida', senha: data?.senhaTemporaria || '—' })
      addToast('success', `Senha redefinida para ${user.email}.`)
    } catch {
      addToast('error', 'Falha ao resetar senha.')
    }
  }

  const handleCriarUsuario = async (escId: string, data: { nome: string; email: string; role: string }) => {
    try {
      const res = await api.raiz.adicionarUsuario(escId, data)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao adicionar usuário.'))
        return
      }
      const senha = json?.senhaTemporaria || json?.senha || json?.password
      setModal({ kind: 'tempSenha', titulo: 'Usuário adicionado', senha: senha || '—' })
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao adicionar usuário.')
    }
  }

  const handleEditarUsuario = async (escId: string, userId: string, patch: { nome?: string; email?: string; role?: string; ativo?: boolean }) => {
    try {
      const res = await api.raiz.atualizarUsuario(escId, userId, patch)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao atualizar usuário.'))
        return
      }
      setModal(null)
      addToast('success', 'Usuário atualizado.')
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao atualizar usuário.')
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
    <PageContainer>
      <PageHeader
        eyebrow="OPERAÇÕES DA PLATAFORMA"
        title="Painel Root"
        description="SmartJuris Operações · escritórios, consumo e auditoria"
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 24, rowGap: 12, borderBottom: '1px solid var(--color-border)', marginBottom: 28, flexWrap: 'wrap' }}>
        {([['escritorios', 'Escritórios'], ['creditos', 'Créditos'], ['metricas', 'Métricas Agregadas'], ['auditoria', 'Auditoria'], ['logs', 'Logs'], ['billing', 'Billing (Dev)'], ['blog', 'Blog'], ['legislacao', 'Base Legislativa']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '10px 2px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: FONT.md,
            whiteSpace: 'nowrap',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.xl, flexWrap: 'wrap' }}>
            <div style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>{escritorios.length} {escritorios.length === 1 ? 'escritório' : 'escritórios'} na plataforma</div>
            <Button onClick={() => setModal({ kind: 'novoEscritorio' })}>+ Novo escritório</Button>
          </div>

          {loading ? (
            <Loading message="Carregando…" />
          ) : (
            <TableShell minWidth={1000}>
              <Table>
                <thead>
                  <THeadRow>
                    <Th>Escritório</Th>
                    <Th>Usuário</Th>
                    <Th style={{ textAlign: 'center' }}>Reset Senha</Th>
                    <Th>Plano</Th>
                    <Th>Limite de usuários</Th>
                    <Th>Usuários ativos</Th>
                    <Th>Tokens (30d)</Th>
                    <Th>Status</Th>
                    <Th style={{ textAlign: 'right' }}>Ações</Th>
                  </THeadRow>
                </thead>
                <tbody>
                  {(() => {
                    interface LinhaTabela {
                      esc: Escritorio
                      user: Escritorio['usuarios'][number] | null
                      isFirst: boolean
                      rowspan: number
                    }

                    const linhas: LinhaTabela[] = escritorios.flatMap(esc =>
                      esc.usuarios?.length
                        ? esc.usuarios.map((user, idx) => ({ esc, user: user as Escritorio['usuarios'][number] | null, isFirst: idx === 0, rowspan: esc.usuarios.length }))
                        : [{ esc, user: null as Escritorio['usuarios'][number] | null, isFirst: true, rowspan: 1 }]
                    )

                    return linhas.map((linha, idx) => {
                      const { esc, user, isFirst, rowspan } = linha
                      const pm = planoMeta[esc.plano] || { label: esc.plano, color: 'var(--color-muted)', bg: 'var(--color-surface-2)' }
                      const rowStyle = isFirst && idx > 0 ? { borderTop: '2px solid var(--color-border)' } : {}

                      return (
                        <Tr key={`${esc.id}-${user?.id || 'empty'}`} style={rowStyle}>
                          {isFirst && (
                            <Td rowSpan={rowspan} style={{ fontSize: FONT.md, fontWeight: 500, verticalAlign: 'middle' }}>{esc.nome}</Td>
                          )}
                          <Td style={{ fontSize: FONT.sm, verticalAlign: 'middle' }}>
                            {user ? (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 500, color: 'var(--color-foreground)' }}>{user.nome}</span>
                                  <span style={{
                                    fontSize: FONT.xs, fontWeight: 600, padding: '1px 6px', borderRadius: RADIUS.chip,
                                    color: user.role === 'admin' ? 'var(--color-primary)' : 'var(--color-muted)',
                                    background: user.role === 'admin' ? 'var(--color-badge-tint)' : 'var(--color-surface-2)',
                                  }}>
                                    {user.role === 'admin' ? 'Admin' : 'Advogado'}
                                  </span>
                                  <span style={{
                                    fontSize: FONT.xs, fontWeight: 600, padding: '1px 6px', borderRadius: RADIUS.chip,
                                    color: user.ativo ? 'var(--color-success)' : 'var(--color-muted)',
                                    background: user.ativo ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                                  }}>
                                    {user.ativo ? 'Ativo' : 'Inativo'}
                                  </span>
                                </div>
                                <div style={{ color: 'var(--color-muted)', marginTop: 2 }}>{user.email}</div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-muted)' }}>—</span>
                            )}
                          </Td>
                          <Td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {user ? (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  style={{ padding: '4px 8px', fontSize: FONT.sm, color: 'var(--color-warning)', borderColor: 'var(--color-warning)' }}
                                  onClick={() => handleResetSenha(user)}
                                >
                                  Resetar senha
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  style={{ padding: '4px 8px', fontSize: FONT.sm }}
                                  onClick={() => setModal({ kind: 'editarUsuario', esc, user })}
                                >
                                  Editar
                                </Button>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-muted)' }}>—</span>
                            )}
                          </Td>
                          {isFirst && (
                            <>
                              <Td rowSpan={rowspan} style={{ verticalAlign: 'middle' }}>
                                <span style={{ fontSize: FONT.xs, fontWeight: 600, color: pm.color, background: pm.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{pm.label}</span>
                              </Td>
                              <Td rowSpan={rowspan} style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base, verticalAlign: 'middle' }}>{fmtNum(esc.limiteUsuarios)}</Td>
                              <Td rowSpan={rowspan} style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base, verticalAlign: 'middle' }}>{fmtNum(esc.usuariosAtivos)}</Td>
                              <Td rowSpan={rowspan} style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base, verticalAlign: 'middle' }}>{fmtNum(esc.tokens30d)}</Td>
                              <Td rowSpan={rowspan} style={{ verticalAlign: 'middle' }}>
                                {esc.isentoMensalidade && (
                                  <span style={{
                                    fontSize: FONT.xs, fontWeight: 700, padding: '3px 8px', borderRadius: RADIUS.chip,
                                    color: 'var(--color-on-accent)', background: 'var(--color-accent)', marginRight: 6,
                                  }}>Cortesia</span>
                                )}
                                <span style={{
                                  fontSize: FONT.xs, fontWeight: 600, padding: '3px 8px', borderRadius: RADIUS.chip,
                                  color: esc.ativo ? 'var(--color-success)' : 'var(--color-muted)',
                                  background: esc.ativo ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                                }}>{esc.ativo ? 'Ativo' : 'Inativo'}</span>
                              </Td>
                              <Td rowSpan={rowspan} style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                                <Button size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, marginRight: 6 }} onClick={() => setModal({ kind: 'novoUsuario', esc })} title="Adicionar usuário a este escritório">+ Usuário</Button>
                                <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, marginRight: 6 }} onClick={() => setModal({ kind: 'editar', esc })}>Editar</Button>
                                <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} disabled={!esc.ativo} onClick={() => setModal({ kind: 'desativar', esc })}>
                                  Desativar
                                </Button>
                                <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, color: 'var(--color-danger)', borderColor: 'var(--color-danger)', marginLeft: 6 }} title="Excluir permanentemente (irreversível)" onClick={() => setModal({ kind: 'excluir', esc })}>
                                  Excluir
                                </Button>
                              </Td>
                            </>
                          )}
                        </Tr>
                      )
                    })
                  })()}
                  {escritorios.length === 0 && <EmptyRow colSpan={9} message="Nenhum escritório cadastrado. Clique em “Novo escritório” para começar." />}
                </tbody>
              </Table>
            </TableShell>
          )}
        </>
      )}

      {/* ===== TAB: CRÉDITOS ===== */}
      {activeTab === 'creditos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginBottom: SPACE.xxl }}>
            <StatCard label="Escritórios com saldo" value={fmtNum(creditos.filter(c => c.creditosDisponiveis != null).length)} />
            <StatCard label="Créditos consumidos (mês)" value={fmtNum(creditos.reduce((a, c) => a + (Number(c.consumidosMes) || 0), 0))} />
            <StatCard label="Créditos restantes" value={fmtNum(creditos.reduce((a, c) => a + (Number(c.restantes) || 0), 0))} />
          </div>

          {loadingCreditos ? (
            <Loading message="Carregando…" />
          ) : (
            <TableShell>
              <Table>
                <thead>
                  <THeadRow>
                    <Th>Escritório</Th><Th>Plano</Th><Th>Disponível</Th><Th>Consumidos (mês)</Th><Th>Restantes</Th><Th style={{ width: 140 }}>Uso</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                  </THeadRow>
                </thead>
                <tbody>
                  {creditos.map(c => {
                    const disp = c.creditosDisponiveis
                    const pct = disp != null && disp > 0 ? Math.round(((Number(c.consumidosMes) || 0) / disp) * 100) : 0
                    const usoColor = pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                    const pm = planoMeta[c.plano] || { label: c.plano, color: 'var(--color-muted)', bg: 'var(--color-surface-2)' }
                    return (
                      <Tr key={c.id} style={{ verticalAlign: 'top' }}>
                        <Td style={{ fontSize: FONT.md, fontWeight: 500 }}>
                          {c.nome}
                          {c.isDemo && <span style={{ fontSize: FONT.xs, fontWeight: 700, color: 'var(--color-accent)', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>demo</span>}
                        </Td>
                        <Td>
                          <span style={{ fontSize: FONT.xs, fontWeight: 600, color: pm.color, background: pm.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{pm.label}</span>
                        </Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{disp != null ? fmtNum(disp) : 'Ilimitado'}</Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{fmtNum(c.consumidosMes)}</Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{c.restantes != null ? fmtNum(c.restantes) : '—'}</Td>
                        <Td>
                          {disp != null && disp > 0 ? (
                            <div>
                              <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: usoColor, borderRadius: 3 }} />
                              </div>
                              <div style={{ fontSize: FONT.xs, color: usoColor, fontWeight: 600, marginTop: 4 }}>{pct}%</div>
                            </div>
                          ) : <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>—</span>}
                        </Td>
                        <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {c.isDemo && (
                            <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, marginRight: 6 }} onClick={() => setExpandedEsc(expandedEsc === c.id ? null : c.id)}>
                              {expandedEsc === c.id ? 'Ocultar usuários' : 'Ver usuários'}
                            </Button>
                          )}
                          <Button size="sm" style={{ padding: '5px 12px', fontSize: FONT.sm }} onClick={() => setModal({ kind: 'addCreditos', alvo: { tipo: 'escritorio', id: c.id, nome: c.nome } })}>
                            + Créditos
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
                  {creditos.length === 0 && <EmptyRow colSpan={7} message="Nenhum escritório cadastrado." />}
                </tbody>
              </Table>

              {/* Usuários demo expandidos */}
              {creditos.filter(c => c.isDemo && expandedEsc === c.id).map(c => (
                <div key={`users-${c.id}`} style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                  <div style={{ padding: '12px 22px', fontSize: FONT.sm, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>
                    Usuários de {c.nome} (créditos individuais)
                  </div>
                  <Table>
                    <tbody>
                      {c.usuarios.map(u => {
                        const dispU = u.creditosDisponiveis
                        const pctU = dispU != null && dispU > 0 ? Math.round((u.consumidosMes / dispU) * 100) : 0
                        const usoColorU = pctU > 85 ? 'var(--color-danger)' : pctU > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                        return (
                          <Tr key={u.id}>
                            <Td style={{ padding: '10px 22px', fontSize: FONT.md }}>
                              <div style={{ fontWeight: 500 }}>{u.nome}</div>
                              <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{u.email}</div>
                            </Td>
                            <Td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>Disp: {dispU != null ? fmtNum(dispU) : 'herda esc.'}</Td>
                            <Td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>Consumidos: {fmtNum(u.consumidosMes)}</Td>
                            <Td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: FONT.base, color: usoColorU, fontWeight: 600 }}>Restantes: {u.restantes != null ? fmtNum(u.restantes) : '—'}</Td>
                            <Td style={{ padding: '10px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <Button size="sm" style={{ padding: '5px 12px', fontSize: FONT.sm }} onClick={() => setModal({ kind: 'addCreditos', alvo: { tipo: 'usuario', id: u.id, nome: u.nome } })}>
                                + Tokens
                              </Button>
                            </Td>
                          </Tr>
                        )
                      })}
                      {c.usuarios.length === 0 && <EmptyRow colSpan={5} message="Nenhum usuário." />}
                    </tbody>
                  </Table>
                </div>
              ))}
            </TableShell>
          )}
        </>
      )}

      {/* ===== TAB: MÉTRICAS AGREGADAS ===== */}
      {activeTab === 'metricas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginBottom: SPACE.xxl }}>
            <StatCard label="Escritórios" value={fmtNum(escritorios.length)} sub={`${fmtNum(escritorios.filter(e => e.ativo).length)} ativos`} />
            <StatCard label="Tokens totais (30d)" value={fmtNum(totalTokens)} />
            <StatCard label="Usuários ativos" value={fmtNum(totalUsuarios)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 28 }}>
            {metricas.map(m => {
              const uso = m?.usoPercentual != null ? Number(m.usoPercentual) : 0
              const usoColor = uso > 85 ? 'var(--color-danger)' : uso > 60 ? 'var(--color-warning)' : 'var(--color-success)'
              return (
                <div key={m.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '18px 20px' }}>
                  <div style={{ fontWeight: 600, fontSize: FONT.md, marginBottom: 2 }}>{m.nome}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em', margin: '10px 0 2px' }}>{fmtNum(m.tokens30d)}</div>
                  <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>tokens (30d)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.sm, color: 'var(--color-muted)', margin: '10px 0 6px' }}>
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
              <div style={{ gridColumn: '1 / -1', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card }}>
                <EmptyState message="Sem métricas agregadas disponíveis." />
              </div>
            )}
          </div>

          {ranking.length > 0 && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: FONT.md }}>Ranking por uso do limite</div>
              {ranking.map((m, i) => {
                const uso = m?.usoPercentual != null ? Number(m.usoPercentual) : 0
                const usoColor = uso > 85 ? 'var(--color-danger)' : uso > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? 'var(--color-accent)' : 'var(--color-surface-2)', color: i === 0 ? 'var(--color-on-accent)' : 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FONT.sm, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ width: 180, flexShrink: 0 }}>
                      <div style={{ fontSize: FONT.md, fontWeight: 500 }}>{m.nome}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(uso, 100)}%`, height: '100%', background: usoColor, borderRadius: 3 }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base, color: usoColor, fontWeight: 600, width: 48, textAlign: 'right', flexShrink: 0 }}>{uso}%</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ===== TAB: AUDITORIA ===== */}
      {activeTab === 'auditoria' && (
        <TableShell>
          <Table>
            <thead>
              <THeadRow>
                <Th>Data</Th><Th>Ação</Th><Th>Autor</Th><Th>Detalhes</Th><Th>IP</Th>
              </THeadRow>
            </thead>
            <tbody>
              {auditoria.map(l => {
                const am = acaoMeta[l.acao] || { label: l.acao, color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' }
                return (
                  <Tr key={l.id}>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)' }}>{fmtDate(l.createdAt)}</Td>
                    <Td>
                      <span style={{ fontSize: FONT.xs, fontWeight: 600, color: am.color, background: am.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{am.label}</span>
                    </Td>
                    <Td style={{ fontSize: FONT.md, fontWeight: 500 }}>{l.actorNome || '—'}</Td>
                    <Td style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>{fmtDetalhes(l.detalhes)}</Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)' }}>{l.ipAddress || '—'}</Td>
                  </Tr>
                )
              })}
              {auditoria.length === 0 && <EmptyRow colSpan={5} message="Nenhuma entrada de auditoria disponível." />}
            </tbody>
          </Table>
        </TableShell>
      )}

      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {/* contadores + ações */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
              <StatCard label="Total" value={fmtNum(logTotal)} />
              <StatCard label="Erros" value={fmtNum(logs.filter(l => l.level === 'error').length)} />
              <StatCard label="Warnings" value={fmtNum(logs.filter(l => l.level === 'warn').length)} />
            </div>
            <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" onClick={copiarErrosFiltrados}>📋 Copiar erros</Button>
              <Button variant="secondary" size="sm" onClick={copiarTodosFiltrados}>📄 Copiar filtrados</Button>
            </div>
          </div>

          {/* filtros */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr auto', gap: SPACE.sm }}>
            <Field label="Nível">
              <select value={logNivel} onChange={e => setLogNivel(e.target.value)} style={inputStyle()}>
                <option value="">Todos</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Erro</option>
              </select>
            </Field>
            <Field label="Buscar">
              <input value={logBusca} onChange={e => setLogBusca(e.target.value)} placeholder="mensagem, source ou stack..." style={inputStyle()} />
            </Field>
            <div style={{ alignSelf: 'end' }}>
              <Button size="sm" onClick={loadLogs} disabled={logCarregando}>{logCarregando ? 'Carregando...' : 'Filtrar'}</Button>
            </div>
          </div>

          {/* lista */}
          <TableShell>
            <Table>
              <thead>
                <THeadRow>
                  <Th>Data</Th><Th>Nível</Th><Th>Mensagem / Stack</Th><Th>Origem</Th><Th style={{ width: 90 }}>Copiar</Th>
                </THeadRow>
              </thead>
              <tbody>
                {logs.map(l => {
                  const nm = nivelMeta[l.level] || nivelMeta.info
                  const expanded = logExpanded === l.id
                  return (
                    <Tr key={l.id}>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{fmtDate(l.createdAt)}</Td>
                      <Td>
                        <span style={{ fontSize: FONT.xs, fontWeight: 600, color: nm.color, background: nm.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{nm.label}</span>
                      </Td>
                      <Td style={{ fontSize: FONT.base, maxWidth: 560 }}>
                        <div>{l.message}</div>
                        {l.stack && (
                          <>
                            <button onClick={() => setLogExpanded(expanded ? null : l.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontSize: FONT.xs, cursor: 'pointer', marginTop: 2 }}>
                              {expanded ? '▲ ocultar stack' : '▼ ver stack'}
                            </button>
                            {expanded && <pre style={{ background: 'var(--color-surface-2)', padding: 8, borderRadius: RADIUS.control, fontFamily: 'var(--font-mono)', fontSize: FONT.xs, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.stack}</pre>}
                          </>
                        )}
                      </Td>
                      <Td style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>
                        <div>{l.source || '—'}</div>
                        {l.path && <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs }}>{l.method} {l.path}</div>}
                        {l.ip && <div style={{ fontSize: FONT.xs }}>ip {l.ip}</div>}
                      </Td>
                      <Td>
                        <Button variant="secondary" size="sm" onClick={() => copiarLog(l)}>Copiar</Button>
                      </Td>
                    </Tr>
                  )
                })}
                {logs.length === 0 && <EmptyRow colSpan={5} message={logCarregando ? 'Carregando logs...' : 'Nenhum log registrado.'} />}
              </tbody>
            </Table>
          </TableShell>
        </div>
      )}

      {activeTab === 'blog' && <RootBlog addToast={addToast} />}
      {activeTab === 'legislacao' && <RootLegislacao addToast={addToast} />}

      {activeTab === 'billing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {/* Configuração */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.md }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.02em' }}>Configuração Mercado Pago</div>
              <Button variant="secondary" size="sm" onClick={loadBillingDev} disabled={loadingBilling}>{loadingBilling ? 'Atualizando...' : '↻ Atualizar'}</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: SPACE.sm }}>
              <DevStatus label="Access Token" ok={billingDev?.config.mpConfigurado ?? false} value={billingDev?.config.accessTokenPrefix ?? '—'} />
              <DevStatus label="Public Key" ok={billingDev?.config.temPublicKey ?? false} value={billingDev?.config.publicKeyPrefix ?? '—'} />
              <DevStatus label="Webhook Secret" ok={billingDev?.config.temWebhookSecret ?? false} value={billingDev?.config.temWebhookSecret ? 'configurado' : 'ausente (fail-closed em produção)'} />
              <DevStatus label="Webhooks 24h" ok={(billingDev?.webhooks.ultimas24h ?? 0) > 0} value={String(billingDev?.webhooks.ultimas24h ?? 0)} />
            </div>
            <div style={{ marginTop: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.xs, fontSize: FONT.sm, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
              <div>Webhook URL: <span style={{ color: 'var(--color-foreground)' }}>{billingDev?.config.webhookUrl ?? '—'}</span></div>
              <div>APP_URL: {billingDev?.config.appUrl ?? '—'}</div>
              <div>PUBLIC_API_URL: {billingDev?.config.publicApiUrl ?? '—'}</div>
            </div>
          </div>

          {/* Fase 7F — Promoção de boas-vindas (uso) */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.md }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.02em' }}>Promoção de boas-vindas (1º mês)</div>
              {(() => {
                const r = resumoUsoPromocao(billingDev?.promocao)
                return (
                  <DevStatus
                    label={r.rotuloEstado}
                    ok={r.ativa}
                    value={`${r.percentual}% OFF${r.validade ? ' · até ' + new Date(r.validade).toLocaleDateString('pt-BR') : ''}`}
                  />
                )
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: SPACE.sm }}>
              {(() => {
                const r = resumoUsoPromocao(billingDev?.promocao)
                return (
                  <>
                    <DevStatus label="Usos (total)" ok={r.usos.total > 0} value={String(r.usos.total)} />
                    <DevStatus label="Usos 24h" ok={false} value={String(r.usos.ultimas24h)} />
                    <DevStatus label="Básico" ok={false} value={String(r.usos.basico)} />
                    <DevStatus label="Profissional / Avançado" ok={false} value={`${r.usos.profissional} / ${r.usos.office}`} />
                  </>
                )
              })()}
            </div>
          </div>

          {/* Assinaturas ativas */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.02em', marginBottom: SPACE.md }}>
              Escritórios com assinatura <span style={{ color: 'var(--color-muted)', fontSize: FONT.sm }}>({billingDev?.assinaturas.length ?? 0})</span>
            </div>
            <TableShell>
              <Table>
                <THeadRow>
                  <Th>Escritório</Th><Th>Status</Th><Th>Plano</Th><Th>MP ID</Th><Th>Créditos</Th><Th>Próx. cobrança</Th>
                </THeadRow>
                <tbody>
                  {(billingDev?.assinaturas ?? []).map(a => (
                    <Tr key={a.id}>
                      <Td>{a.nome}</Td>
                      <Td><StatusPill status={a.assinaturaStatus} /></Td>
                      <Td>{a.assinaturaPlano ?? a.plano}</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs }}>{a.mercadoPagoId ?? '—'}</Td>
                      <Td>{a.creditsAvailable}</Td>
                      <Td>{a.proximaCobranca ? new Date(a.proximaCobranca).toLocaleDateString('pt-BR') : '—'}</Td>
                    </Tr>
                  ))}
                  {(billingDev?.assinaturas ?? []).length === 0 && <EmptyRow colSpan={6} message="Nenhum escritório com assinatura." />}
                </tbody>
              </Table>
            </TableShell>
          </div>

          {/* Webhooks recentes */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.02em', marginBottom: SPACE.md }}>
              Webhooks recebidos <span style={{ color: 'var(--color-muted)', fontSize: FONT.sm }}>(total {billingDev?.webhooks.total ?? 0})</span>
            </div>
            <TableShell>
              <Table>
                <THeadRow>
                  <Th>Tipo</Th><Th>Data ID</Th><Th>Estado</Th><Th>Resultado</Th><Th>Quando</Th>
                </THeadRow>
                <tbody>
                  {(billingDev?.webhooks.recentes ?? []).map((w, i) => (
                    <Tr key={i}>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs }}>{w.tipo}</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs }}>{w.dataId}</Td>
                      <Td>{w.estado ?? '—'}</Td>
                      <Td><ResultPill result={w.resultado} /></Td>
                      <Td style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{new Date(w.createdAt).toLocaleString('pt-BR')}</Td>
                    </Tr>
                  ))}
                  {(billingDev?.webhooks.recentes ?? []).length === 0 && <EmptyRow colSpan={5} message="Nenhum webhook recebido ainda." />}
                </tbody>
              </Table>
            </TableShell>
          </div>

          {/* Operações de checkout */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.02em', marginBottom: SPACE.md }}>Operações de checkout (outbox)</div>
            <TableShell>
              <Table>
                <THeadRow>
                  <Th>Plano</Th><Th>Estado</Th><Th>Fase</Th><Th>Incerto</Th><Th>MP ID</Th><Th>Erro</Th>
                </THeadRow>
                <tbody>
                  {(billingDev?.operacoes ?? []).map((o, i) => (
                    <Tr key={i}>
                      <Td>{o.plano}</Td>
                      <Td><StatusPill status={o.estado} /></Td>
                      <Td style={{ fontSize: FONT.sm }}>{o.fase}</Td>
                      <Td>{o.resultadoIncerto ? '⚠️ sim' : 'não'}</Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs }}>{o.mercadoPagoId ?? '—'}</Td>
                      <Td style={{ fontSize: FONT.sm, color: 'var(--color-danger)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.error ?? '—'}</Td>
                    </Tr>
                  ))}
                  {(billingDev?.operacoes ?? []).length === 0 && <EmptyRow colSpan={6} message="Nenhuma operação de checkout." />}
                </tbody>
              </Table>
            </TableShell>
          </div>
        </div>
      )}

      {/* ===== MODAIS ===== */}
      {modal?.kind === 'novoEscritorio' && (
        <NovoEscritorioModal open onClose={() => setModal(null)} onSubmit={handleCriarEscritorio} />
      )}
      {modal?.kind === 'editar' && (
        <EditarEscritorioModal open esc={modal.esc} onClose={() => setModal(null)} onSubmit={handleEditar} />
      )}
      {modal?.kind === 'novoUsuario' && (
        <NovoUsuarioModal open esc={modal.esc} onClose={() => setModal(null)} onSubmit={(data: { nome: string; email: string; role: string }) => handleCriarUsuario(modal.esc.id, data)} />
      )}
      {modal?.kind === 'editarUsuario' && (
        <EditarUsuarioModal open esc={modal.esc} user={modal.user} onClose={() => setModal(null)} onSubmit={(patch: { nome?: string; email?: string; role?: string; ativo?: boolean }) => handleEditarUsuario(modal.esc.id, modal.user.id, patch)} />
      )}
      {modal?.kind === 'desativar' && (
        <Modal
          open
          onClose={() => setModal(null)}
          title="Desativar escritório"
          width={440}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleDesativar(modal.esc)}>Desativar escritório</Button>
            </>
          }
        >
          <div style={{ color: 'var(--color-muted)', fontSize: FONT.base }}>
            Desativar <strong style={{ color: 'var(--color-foreground)' }}>{modal.esc.nome}</strong>? Todos os usuários do escritório perderão o acesso. A ação é reversível (soft delete).
          </div>
        </Modal>
      )}
      {modal?.kind === 'excluir' && (
        <ExcluirEscritorioModal open esc={modal.esc} onClose={() => setModal(null)} onSubmit={() => handleExcluir(modal.esc)} />
      )}
      {modal?.kind === 'addCreditos' && (
        <AddCreditosModal open alvo={modal.alvo} onClose={() => setModal(null)} onSubmit={(q) => handleAddCreditos(modal.alvo.tipo, modal.alvo.id, q)} />
      )}
      {modal?.kind === 'tempSenha' && (
        <TempSenhaModal open titulo={modal.titulo} senha={modal.senha} onClose={() => setModal(null)} notify={(t, m) => addToast(t, m)} />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  )
}

function NovoEscritorioModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (data: { nome: string; adminNome: string; adminEmail: string; isentoMensalidade?: boolean }) => void }) {
  const [nome, setNome] = useState('')
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [isentoMensalidade, setIsentoMensalidade] = useState(false)
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
    await onSubmit({ nome: nome.trim(), adminNome: adminNome.trim(), adminEmail: adminEmail.trim(), isentoMensalidade })
    setSubmitting(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo escritório"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid || submitting} onClick={submit}>
            {submitting ? 'Criando…' : 'Criar escritório'}
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.xl }}>
        Crie um novo escritório e o administrador inicial responsável por ele.
      </div>

      <FormGrid>
        <FormRow span>
          <Field label="Nome do escritório" error={errors.nome}>
            <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={{ ...inputStyle(), borderColor: errors.nome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Silva & Advogados Associados" autoFocus />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Nome do admin inicial" error={errors.adminNome}>
            <input value={adminNome} onChange={e => { setAdminNome(e.target.value); if (errors.adminNome) setErrors(p => ({ ...p, adminNome: undefined })) }} style={{ ...inputStyle(), borderColor: errors.adminNome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Dr. Carlos Silva" />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="E-mail do admin inicial" error={errors.adminEmail}>
            <input value={adminEmail} onChange={e => { setAdminEmail(e.target.value); if (errors.adminEmail) setErrors(p => ({ ...p, adminEmail: undefined })) }} style={{ ...inputStyle(), borderColor: errors.adminEmail ? 'var(--color-danger)' : 'var(--color-border)' }} type="email" placeholder="admin@escritorio.com" />
          </Field>
        </FormRow>
        <FormRow span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: FONT.base, color: 'var(--color-foreground)', lineHeight: 1.4 }}>
            <input type="checkbox" checked={isentoMensalidade} onChange={e => setIsentoMensalidade(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--color-accent)', flexShrink: 0 }} />
            Acesso gratuito (cortesia) — este escritório usa o sistema sem pagar a mensalidade
          </label>
        </FormRow>
      </FormGrid>
    </Modal>
  )
}

function EditarEscritorioModal({ open, esc, onClose, onSubmit }: { open: boolean; esc: Escritorio; onClose: () => void; onSubmit: (id: string, patch: { plano: string; limiteUsuarios: number; limiteTokensMes?: number }) => void }) {
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
    <Modal
      open={open}
      onClose={onClose}
      title="Editar escritório"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid || submitting} onClick={submit}>
            {submitting ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.xl }}>{esc.nome}</div>

      <FormGrid>
        <FormRow>
          <Field label="Plano">
            <select value={plano} onChange={e => setPlano(e.target.value)} style={inputStyle()}>
              {PLANOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Limite de usuários">
            <input value={limiteUsuarios} onChange={e => setLimiteUsuarios(e.target.value)} style={inputStyle()} type="number" min={1} />
          </Field>
        </FormRow>
        <FormRow span>
          <Field label="Limite de tokens (mensal)">
            <input value={limiteTokensMes} onChange={e => setLimiteTokensMes(e.target.value)} style={inputStyle()} type="number" min={0} />
          </Field>
        </FormRow>
      </FormGrid>
    </Modal>
  )
}

function NovoUsuarioModal({
  open,
  esc,
  onClose,
  onSubmit,
}: {
  open: boolean
  esc: Escritorio
  onClose: () => void
  onSubmit: (data: { nome: string; email: string; role: string }) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
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
    try {
      await onSubmit({ nome: nome.trim(), email: email.trim(), role })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Adicionar usuário a ${esc.nome}`}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button disabled={!valid || submitting} onClick={submit}>
            {submitting ? 'Adicionando…' : 'Adicionar usuário'}
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginBottom: SPACE.xl }}>
        Adicione um novo usuário diretamente neste escritório. O usuário receberá uma senha temporária.
      </div>

      <FormGrid>
        <FormRow>
          <Field label="Nome completo" error={errors.nome}>
            <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={{ ...inputStyle(), borderColor: errors.nome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Dr. Carlos Silva" autoFocus />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="E-mail de acesso" error={errors.email}>
            <input value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: undefined })) }} style={{ ...inputStyle(), borderColor: errors.email ? 'var(--color-danger)' : 'var(--color-border)' }} type="email" placeholder="carlos@escritorio.com" />
          </Field>
        </FormRow>
        <FormRow span>
          <Field label="Perfil (Função)">
            <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle()}>
              <option value="user">Advogado</option>
              <option value="admin">Administrador (Gestor)</option>
            </select>
          </Field>
        </FormRow>
      </FormGrid>
    </Modal>
  )
}

function EditarUsuarioModal({
  open,
  esc,
  user,
  onClose,
  onSubmit,
}: {
  open: boolean
  esc: Escritorio
  user: Escritorio['usuarios'][number]
  onClose: () => void
  onSubmit: (patch: { nome?: string; email?: string; role?: string; ativo?: boolean }) => Promise<void>
}) {
  const [nome, setNome] = useState(user.nome || '')
  const [email, setEmail] = useState(user.email || '')
  const [role, setRole] = useState(user.role || 'user')
  const [ativo, setAtivo] = useState(user.ativo ?? true)
  const [errors, setErrors] = useState<{ nome?: string; email?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const valid = nome.trim() && email.trim()

  const submit = async () => {
    const next: typeof errors = {}
    if (!nome.trim()) next.nome = 'Informe o nome.'
    if (!email.trim()) next.email = 'Informe o e-mail.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'E-mail inválido.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit({ nome: nome.trim(), email: email.trim(), role, ativo })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar usuário de ${esc.nome}`}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button disabled={!valid || submitting} onClick={submit}>
            {submitting ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormRow>
          <Field label="Nome completo" error={errors.nome}>
            <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={{ ...inputStyle(), borderColor: errors.nome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Dr. Carlos Silva" autoFocus />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="E-mail de acesso" error={errors.email}>
            <input value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: undefined })) }} style={{ ...inputStyle(), borderColor: errors.email ? 'var(--color-danger)' : 'var(--color-border)' }} type="email" placeholder="carlos@escritorio.com" />
          </Field>
        </FormRow>
        <FormRow span>
          <Field label="Perfil (Função)">
            <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle()}>
              <option value="user">Advogado</option>
              <option value="admin">Administrador (Gestor)</option>
            </select>
          </Field>
        </FormRow>
        <FormRow span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: SPACE.xs }}>
          <input type="checkbox" id="user-ativo-check" checked={ativo} onChange={e => setAtivo(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
          <label htmlFor="user-ativo-check" style={{ fontSize: FONT.md, color: 'var(--color-foreground)', cursor: 'pointer', userSelect: 'none' }}>
            Usuário com acesso ativo
          </label>
        </FormRow>
      </FormGrid>
    </Modal>
  )
}
