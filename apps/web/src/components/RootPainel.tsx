import { useState, useEffect, useCallback } from 'react'
import { api, getErrorMessage } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import { Button, EmptyRow, EmptyState, FONT, Field, inputStyle, Loading, Modal, PageContainer, PageHeader, RADIUS, SPACE, Table, TableShell, Td, Th, THeadRow, Tr, useIsMobile } from '../ui'

type Tab = 'escritorios' | 'creditos' | 'metricas' | 'auditoria'

interface Escritorio {
  id: string
  nome: string
  plano: string
  limiteUsuarios: number
  usuariosAtivos: number
  ativo: boolean
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

type ModalState =
  | { kind: 'novoEscritorio' }
  | { kind: 'ativar'; esc: Escritorio }
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

  const handleAtivarSubmit = async (escId: string, data: { plano: string; limiteTokensMes: number }) => {
    try {
      const res = await api.raiz.atualizarEscritorio(escId, {
        ativo: true,
        plano: data.plano,
        limiteTokensMes: data.limiteTokensMes,
      })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Falha ao ativar escritório.'))
        return
      }
      setModal(null)
      addToast('success', `Escritório ativado com ${data.limiteTokensMes.toLocaleString('pt-BR')} créditos liberados.`)
      loadEscritorios()
    } catch {
      addToast('error', 'Falha ao ativar escritório.')
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
      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--color-border)', marginBottom: 28, overflowX: 'auto' }}>
        {([['escritorios', 'Escritórios'], ['creditos', 'Créditos'], ['metricas', 'Métricas Agregadas'], ['auditoria', 'Auditoria']] as [Tab, string][]).map(([t, label]) => (
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
            <TableShell>
              <Table>
                <thead>
                  <THeadRow>
                    <Th>Escritório</Th><Th>Plano</Th><Th>Limite de usuários</Th><Th>Usuários ativos</Th><Th>Tokens (30d)</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Ações</Th>
                  </THeadRow>
                </thead>
                <tbody>
                  {escritorios.map(esc => {
                    const pm = planoMeta[esc.plano] || { label: esc.plano, color: 'var(--color-muted)', bg: 'var(--color-surface-2)' }
                    return (
                      <Tr key={esc.id}>
                        <Td style={{ fontSize: FONT.md, fontWeight: 500 }}>{esc.nome}</Td>
                        <Td>
                          <span style={{ fontSize: FONT.xs, fontWeight: 600, color: pm.color, background: pm.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{pm.label}</span>
                        </Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{fmtNum(esc.limiteUsuarios)}</Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{fmtNum(esc.usuariosAtivos)}</Td>
                        <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{fmtNum(esc.tokens30d)}</Td>
                        <Td>
                          <span style={{
                            fontSize: FONT.xs, fontWeight: 600, padding: '3px 8px', borderRadius: RADIUS.chip,
                            color: esc.ativo ? 'var(--color-success)' : 'var(--color-muted)',
                            background: esc.ativo ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                          }}>{esc.ativo ? 'Ativo' : 'Inativo'}</span>
                        </Td>
                        <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!esc.ativo && (
                            <Button size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, marginRight: 6 }} onClick={() => setModal({ kind: 'ativar', esc })}>Ativar</Button>
                          )}
                          <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, marginRight: 6 }} onClick={() => setModal({ kind: 'editar', esc })}>Editar</Button>
                          <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} disabled={!esc.ativo} onClick={() => setModal({ kind: 'desativar', esc })}>
                            Desativar
                          </Button>
                          <Button variant="secondary" size="sm" style={{ padding: '5px 10px', fontSize: FONT.sm, color: 'var(--color-danger)', borderColor: 'var(--color-danger)', marginLeft: 6 }} title="Excluir permanentemente (irreversível)" onClick={() => setModal({ kind: 'excluir', esc })}>
                            Excluir
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
                  {escritorios.length === 0 && <EmptyRow colSpan={7} message="Nenhum escritório cadastrado. Clique em “Novo escritório” para começar." />}
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

      {/* ===== MODAIS ===== */}
      {modal?.kind === 'novoEscritorio' && (
        <NovoEscritorioModal open onClose={() => setModal(null)} onSubmit={handleCriarEscritorio} />
      )}
      {modal?.kind === 'ativar' && (
        <AtivarEscritorioModal open esc={modal.esc} onClose={() => setModal(null)} onSubmit={(data) => handleAtivarSubmit(modal.esc.id, data)} />
      )}
      {modal?.kind === 'editar' && (
        <EditarEscritorioModal open esc={modal.esc} onClose={() => setModal(null)} onSubmit={handleEditar} />
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

function NovoEscritorioModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (data: { nome: string; adminNome: string; adminEmail: string }) => void }) {
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
    <Modal
      open={open}
      onClose={onClose}
      title="Novo escritório"
      width={440}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <Field label="Nome do escritório" error={errors.nome}>
          <input value={nome} onChange={e => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })) }} style={{ ...inputStyle(), borderColor: errors.nome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Silva & Advogados Associados" autoFocus />
        </Field>
        <Field label="Nome do admin inicial" error={errors.adminNome}>
          <input value={adminNome} onChange={e => { setAdminNome(e.target.value); if (errors.adminNome) setErrors(p => ({ ...p, adminNome: undefined })) }} style={{ ...inputStyle(), borderColor: errors.adminNome ? 'var(--color-danger)' : 'var(--color-border)' }} placeholder="Dr. Carlos Silva" />
        </Field>
        <Field label="E-mail do admin inicial" error={errors.adminEmail}>
          <input value={adminEmail} onChange={e => { setAdminEmail(e.target.value); if (errors.adminEmail) setErrors(p => ({ ...p, adminEmail: undefined })) }} style={{ ...inputStyle(), borderColor: errors.adminEmail ? 'var(--color-danger)' : 'var(--color-border)' }} type="email" placeholder="admin@escritorio.com" />
        </Field>
      </div>
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
      width={440}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <Field label="Plano">
          <select value={plano} onChange={e => setPlano(e.target.value)} style={inputStyle()}>
            {PLANOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Limite de usuários">
          <input value={limiteUsuarios} onChange={e => setLimiteUsuarios(e.target.value)} style={inputStyle()} type="number" min={1} />
        </Field>
        <Field label="Limite de tokens (mensal)">
          <input value={limiteTokensMes} onChange={e => setLimiteTokensMes(e.target.value)} style={inputStyle()} type="number" min={0} />
        </Field>
      </div>
    </Modal>
  )
}

function AtivarEscritorioModal({
  open,
  esc,
  onClose,
  onSubmit,
}: {
  open: boolean
  esc: Escritorio
  onClose: () => void
  onSubmit: (data: { plano: string; limiteTokensMes: number }) => Promise<void>
}) {
  const [plano, setPlano] = useState(esc.plano || 'basico')
  const [limiteTokens, setLimiteTokens] = useState(String(esc.limiteTokensMes || 10000))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const tokensNum = Number(limiteTokens)
  const valid = limiteTokens.trim() !== '' && Number.isInteger(tokensNum) && tokensNum >= 0

  const handleSubmit = async () => {
    if (!valid) {
      setError('Informe uma quantidade válida de créditos (inteiro >= 0).')
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      await onSubmit({ plano, limiteTokensMes: tokensNum })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ativar Escritório e Conceder Créditos"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !valid}>
            {submitting ? 'Ativando…' : 'Ativar e Liberar Créditos →'}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.lg, lineHeight: 1.5 }}>
        Ao ativar o escritório <strong>{esc.nome}</strong>, o administrador receberá um e-mail confirmando a liberação do acesso e o saldo de créditos informado abaixo.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <Field label="Plano de Assinatura">
          <select value={plano} onChange={e => setPlano(e.target.value)} style={inputStyle()}>
            <option value="basico">Básico (Demo)</option>
            <option value="starter">Starter</option>
            <option value="profissional">Profissional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </Field>

        <Field
          label="Créditos Iniciais / Limite Mensal de Tokens"
          error={error}
          required
        >
          <input
            type="number"
            min={0}
            step={1000}
            value={limiteTokens}
            onChange={e => {
              setLimiteTokens(e.target.value)
              if (error) setError(undefined)
            }}
            placeholder="Ex.: 20000"
            style={{ ...inputStyle(!!error), fontFamily: 'var(--font-mono)' }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -4 }}>
          {[10000, 25000, 50000, 100000].map(sug => (
            <Button
              key={sug}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLimiteTokens(String(sug))}
              style={{ fontSize: FONT.xs, padding: '4px 8px' }}
            >
              {sug.toLocaleString('pt-BR')} créditos
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
