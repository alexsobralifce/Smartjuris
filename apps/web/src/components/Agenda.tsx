import { useState, useEffect, type FormEvent } from 'react'
import { api, getErrorMessage, type AgendaItem } from '../api/client'
import Toast, { type ToastMessage } from './Toast'

// ---------------------------------------------------------------------------
// Constantes de domínio (tipos de evento, legendas, nomes de meses/semana)
// ---------------------------------------------------------------------------

const TIPO_EMOJI: Record<string, string> = {
  audiencia: '🏛️',
  prazo_processo: '⚖️',
  prazo_peca: '📄',
  financeiro: '💰',
  aniversario: '🎂',
  evento: '📅',
}

const LEGENDA: { tipo: string; label: string; cor: string }[] = [
  { tipo: 'audiencia', label: 'Audiência', cor: 'primary' },
  { tipo: 'prazo_processo', label: 'Prazo Processual', cor: 'warning' },
  { tipo: 'prazo_peca', label: 'Prazo de Peça', cor: 'peca' },
  { tipo: 'financeiro', label: 'Financeiro', cor: 'success' },
  { tipo: 'aniversario', label: 'Aniversário', cor: 'aniversario' },
  { tipo: 'evento', label: 'Evento', cor: 'accent' },
]

// Allowlist do formulário de eventos manuais
const TIPOS_EVENTO = ['audiencia', 'reuniao', 'prazo', 'diligencia', 'outro'] as const

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ---------------------------------------------------------------------------
// Helpers de data (evitam bugs de fuso horário em datas "date-only")
// ---------------------------------------------------------------------------

/** Retorna uma data LOCAL quando o ISO é apenas `YYYY-MM-DD`; senão, `new Date(iso)`. */
function parseInicio(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(iso)
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const startOfWeek = (d: Date) => {
  const r = startOfDay(d)
  r.setDate(r.getDate() - r.getDay())
  return r
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const mesString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

const dateToInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const formatTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Constrói o ISO de início/fim de um evento manual. */
function buildIso(data: string, hora: string, diaInteiro: boolean): string {
  if (diaInteiro) return `${data}T00:00:00.000Z`
  const [h, m] = hora ? hora.split(':').map(Number) : [0, 0]
  const [y, mo, d] = data.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

function sortAgendaItems(list: AgendaItem[]): AgendaItem[] {
  return [...list].sort((a, b) => {
    if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1
    return parseInicio(a.inicio).getTime() - parseInicio(b.inicio).getTime()
  })
}

// ---------------------------------------------------------------------------
// Tipos locais (lista de processos/clientes e estado do formulário/modal)
// ---------------------------------------------------------------------------

interface OptionProcesso { id: string; cliente?: string; tipo?: string }
interface OptionCliente { id: string; nome?: string }

type View = 'mes' | 'semana' | 'dia'

type ModalState = { mode: 'create' } | { mode: 'edit'; item: AgendaItem } | null

interface FormState {
  titulo: string
  tipo: string
  dataInicio: string
  horaInicio: string
  diaInteiro: boolean
  dataFim: string
  horaFim: string
  descricao: string
  processoId: string
  clienteId: string
}

const emptyForm: FormState = {
  titulo: '', tipo: 'reuniao', dataInicio: '', horaInicio: '', diaInteiro: false,
  dataFim: '', horaFim: '', descricao: '', processoId: '', clienteId: '',
}

function formFromItem(item: AgendaItem): FormState {
  const inicio = parseInicio(item.inicio)
  const fim = item.fim ? parseInicio(item.fim) : null
  return {
    titulo: item.titulo,
    tipo: item.tipo === 'audiencia' ? 'audiencia' : 'outro',
    dataInicio: dateToInput(inicio),
    horaInicio: item.diaInteiro ? '' : formatTime(inicio),
    diaInteiro: item.diaInteiro,
    dataFim: fim ? dateToInput(fim) : '',
    horaFim: fim && !item.diaInteiro ? formatTime(fim) : '',
    descricao: '',
    processoId: item.processoId ?? '',
    clienteId: item.clienteId ?? '',
  }
}

// ---------------------------------------------------------------------------
// Detecção de mobile (touch) via matchMedia — sem CSS externo
// ---------------------------------------------------------------------------

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobile
}

// ---------------------------------------------------------------------------
// Estilos compartilhados
// ---------------------------------------------------------------------------

const inputBase = (hasError: boolean) => ({
  width: '100%', padding: '10px 12px', minHeight: 44,
  border: hasError ? '1.5px solid var(--color-danger)' : '1px solid var(--color-border)',
  borderRadius: 6, fontSize: 13, background: 'var(--color-surface)',
  color: 'var(--color-foreground)', outline: 'none', boxSizing: 'border-box' as const,
})

const labelStyle = (hasError: boolean) => ({
  fontSize: 10, fontWeight: 600,
  color: hasError ? 'var(--color-danger)' : 'var(--color-muted)',
  display: 'block', marginBottom: 4,
})

const fieldErrorStyle = { fontSize: 11, color: 'var(--color-danger)', marginTop: 2, display: 'block' as const }

const iconButtonStyle = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', cursor: 'pointer',
  color: 'var(--color-muted)', fontSize: 18, borderRadius: 6, flexShrink: 0,
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

/** Linha de evento usada nas visões Dia e Semana. */
function EventRow({ item, onEdit, onDelete }: {
  item: AgendaItem
  onEdit?: () => void
  onDelete?: () => void
}) {
  const emoji = TIPO_EMOJI[item.tipo] ?? '📅'
  const isManual = item.origem === 'manual'
  const timeLabel = item.diaInteiro ? '' : formatTime(parseInicio(item.inicio))
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 6,
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderLeft: `3px solid var(--color-${item.cor})`,
    }}>
      <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.titulo}
        </div>
        {item.cliente && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{item.cliente}</div>}
      </div>
      {timeLabel && (
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', flexShrink: 0 }}>
          {timeLabel}
        </span>
      )}
      {isManual && onEdit && (
        <button type="button" onClick={onEdit} aria-label="Editar evento" title="Editar evento" style={iconButtonStyle}>✎</button>
      )}
      {isManual && onDelete && (
        <button type="button" onClick={onDelete} aria-label="Excluir evento" title="Excluir evento" style={iconButtonStyle}>×</button>
      )}
    </div>
  )
}

/** Chip compacto de evento na grade do mês (somente leitura). */
function MonthChip({ item }: { item: AgendaItem }) {
  const emoji = TIPO_EMOJI[item.tipo] ?? '📅'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 5px', borderRadius: 4, fontSize: 10,
      background: 'var(--color-surface-2)',
      borderLeft: `2px solid var(--color-${item.cor})`,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      <span aria-hidden>{emoji}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.titulo}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de criação/edição de evento manual
// ---------------------------------------------------------------------------

function EventModal({ modal, processos, clientes, isMobile, onClose, onSaved, addToast }: {
  modal: ModalState
  processos: OptionProcesso[]
  clientes: OptionCliente[]
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
  addToast: (type: 'error' | 'success' | 'warning' | 'info', text: string) => void
}) {
  const editing = modal?.mode === 'edit' ? modal.item : null
  const isEdit = !!editing

  const [form, setForm] = useState<FormState>(() => (editing ? formFromItem(editing) : emptyForm))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const setField = (key: keyof FormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const markTouched = (key: string) => setTouched(prev => ({ ...prev, [key]: true }))

  const showError = (key: string) => (submitted || touched[key]) && errors[key]

  const validate = (f: FormState): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!f.titulo.trim()) e.titulo = 'O título é obrigatório.'
    else if (f.titulo.length > 200) e.titulo = 'O título deve ter no máximo 200 caracteres.'
    if (!f.dataInicio) e.dataInicio = 'A data de início é obrigatória.'
    return e
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      addToast('error', Object.values(errs)[0])
      return
    }

    const inicio = buildIso(form.dataInicio, form.horaInicio, form.diaInteiro)
    const fim = form.dataFim ? buildIso(form.dataFim, form.horaFim, form.diaInteiro) : undefined

    const payload: Record<string, unknown> = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      descricao: form.descricao,
      diaInteiro: form.diaInteiro,
      inicio,
    }
    if (fim) payload.fim = fim
    if (form.processoId) payload.processoId = form.processoId
    if (form.clienteId) payload.clienteId = form.clienteId

    try {
      const res = isEdit
        ? await api.agenda.atualizarEvento(editing!.id, payload)
        : await api.agenda.criarEvento(payload)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao salvar o evento.'))
        return
      }
      addToast('success', isEdit ? 'Evento atualizado com sucesso!' : 'Evento criado com sucesso!')
      onClose()
      onSaved()
    } catch (err) {
      console.error(err)
      addToast('error', 'Erro ao salvar o evento.')
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    if (!window.confirm('Excluir este evento?')) return
    try {
      const res = await api.agenda.deletarEvento(editing.id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao excluir o evento.'))
        return
      }
      addToast('success', 'Evento excluído.')
      onClose()
      onSaved()
    } catch (err) {
      console.error(err)
      addToast('error', 'Erro ao excluir o evento.')
    }
  }

  if (!modal) return null

  const overlayStyle = {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: isMobile ? 0 : 16,
  }

  const cardStyle = {
    background: 'var(--color-surface)',
    border: isMobile ? 'none' : '1px solid var(--color-border)',
    borderRadius: isMobile ? 0 : 10,
    padding: isMobile ? 20 : 32,
    width: isMobile ? '100%' : 560,
    height: isMobile ? '100%' : 'auto',
    maxHeight: isMobile ? '100%' : '92vh',
    overflowY: 'auto' as const,
    boxShadow: isMobile ? 'none' : '0 20px 60px rgba(0,0,0,0.2)',
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 400 }}>
            {isEdit ? 'Editar Evento' : 'Novo Evento'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ ...iconButtonStyle, width: 40, height: 40 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle(!!showError('titulo'))}>Título *</label>
            <input
              type="text"
              value={form.titulo}
              maxLength={200}
              placeholder="Ex: Audiência de conciliação"
              onChange={e => setField('titulo', e.target.value)}
              onBlur={() => markTouched('titulo')}
              style={inputBase(!!showError('titulo'))}
            />
            {showError('titulo') && <span style={fieldErrorStyle}>⚠️ {errors.titulo}</span>}
          </div>

          <div>
            <label style={labelStyle(false)}>Tipo</label>
            <select
              value={form.tipo}
              onChange={e => setField('tipo', e.target.value)}
              style={inputBase(false)}
            >
              {TIPOS_EVENTO.map(t => (
                <option key={t} value={t}>
                  {t === 'audiencia' ? 'Audiência' : t === 'reuniao' ? 'Reunião' : t === 'prazo' ? 'Prazo' : t === 'diligencia' ? 'Diligência' : 'Outro'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: form.diaInteiro ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle(!!showError('dataInicio'))}>Data Início *</label>
              <input
                type="date"
                value={form.dataInicio}
                onChange={e => setField('dataInicio', e.target.value)}
                onBlur={() => markTouched('dataInicio')}
                style={inputBase(!!showError('dataInicio'))}
              />
              {showError('dataInicio') && <span style={fieldErrorStyle}>⚠️ {errors.dataInicio}</span>}
            </div>
            {!form.diaInteiro && (
              <div>
                <label style={labelStyle(false)}>Hora início</label>
                <input
                  type="time"
                  value={form.horaInicio}
                  onChange={e => setField('horaInicio', e.target.value)}
                  style={inputBase(false)}
                />
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={form.diaInteiro}
              onChange={e => setField('diaInteiro', e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Dia inteiro</span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: form.diaInteiro ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle(false)}>Data Fim (opcional)</label>
              <input
                type="date"
                value={form.dataFim}
                onChange={e => setField('dataFim', e.target.value)}
                style={inputBase(false)}
              />
            </div>
            {!form.diaInteiro && (
              <div>
                <label style={labelStyle(false)}>Hora fim (opcional)</label>
                <input
                  type="time"
                  value={form.horaFim}
                  onChange={e => setField('horaFim', e.target.value)}
                  style={inputBase(false)}
                />
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle(false)}>Descrição (opcional)</label>
            <textarea
              value={form.descricao}
              onChange={e => setField('descricao', e.target.value)}
              rows={3}
              placeholder="Observações do compromisso..."
              style={{ ...inputBase(false), resize: 'vertical' as const, minHeight: 70 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle(false)}>Processo vinculado</label>
              <select
                value={form.processoId}
                onChange={e => setField('processoId', e.target.value)}
                style={inputBase(false)}
              >
                <option value="">Nenhum</option>
                {processos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.id.slice(0, 8)} • {p.cliente ?? ''} ({p.tipo ?? ''})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle(false)}>Cliente vinculado</label>
              <select
                value={form.clienteId}
                onChange={e => setField('clienteId', e.target.value)}
                style={inputBase(false)}
              >
                <option value="">Nenhum</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome ?? ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{ padding: '10px 16px', minHeight: 44, borderRadius: 6, border: '1px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Excluir
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{ padding: '10px 16px', minHeight: 44, border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--color-foreground)' }}>Cancelar</button>
              <button type="submit" style={{ padding: '10px 20px', minHeight: 44, border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {isEdit ? 'Salvar Alterações' : 'Salvar Evento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function Agenda() {
  const [view, setView] = useState<View>('mes')
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()))
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [processos, setProcessos] = useState<OptionProcesso[]>([])
  const [clientes, setClientes] = useState<OptionCliente[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set([dateKey(new Date())]))
  const isMobile = useIsMobile()

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const mes = mesString(cursor)
  const today = startOfDay(new Date())

  // Carrega o mês atual sempre que o cursor muda de mês
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.agenda.getMes(mes)
      .then(data => { if (!cancelled) setItems(Array.isArray(data) ? data : []) })
      .catch(err => { console.error(err); if (!cancelled) addToast('error', 'Não foi possível carregar a agenda.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mes])

  // Popula os selects de processo/cliente uma única vez
  useEffect(() => {
    api.processos.list().then(d => { if (Array.isArray(d)) setProcessos(d) }).catch(() => {})
    api.clientes.list().then(d => { if (Array.isArray(d)) setClientes(d) }).catch(() => {})
  }, [])

  const shift = (delta: number) => {
    setCursor(prev => {
      const next = new Date(prev)
      if (view === 'mes') next.setMonth(next.getMonth() + delta)
      else if (view === 'semana') next.setDate(next.getDate() + delta * 7)
      else next.setDate(next.getDate() + delta)
      return next
    })
  }

  const goToday = () => setCursor(startOfDay(new Date()))

  const openDay = (day: Date) => { setCursor(day); setView('dia') }

  const openCreate = () => setModal({ mode: 'create' })
  const openEdit = (item: AgendaItem) => setModal({ mode: 'edit', item })
  const closeModal = () => setModal(null)
  const refetch = () => {
    api.agenda.getMes(mes)
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(err => { console.error(err); addToast('error', 'Não foi possível atualizar a agenda.') })
  }

  const itemsForDay = (day: Date): AgendaItem[] => sortAgendaItems(items.filter(it => sameDay(parseInicio(it.inicio), day)))

  // Título dinâmico do período exibido
  let viewTitle = ''
  if (view === 'mes') {
    viewTitle = `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`
  } else if (view === 'semana') {
    const ws = startOfWeek(cursor)
    const we = new Date(ws); we.setDate(we.getDate() + 6)
    viewTitle = `${ws.getDate()} ${MESES[ws.getMonth()].slice(0, 3)} – ${we.getDate()} ${MESES[we.getMonth()].slice(0, 3)} de ${we.getFullYear()}`
  } else {
    viewTitle = cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Células da grade do mês (dom→sáb, 42 células com dias dos meses vizinhos)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true })
  }
  let nextDay = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false })
    nextDay++
  }

  // Dias da semana visíveis
  const weekStart = startOfWeek(cursor)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const navButtonStyle = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, minHeight: 44, padding: '8px 14px', borderRadius: 6,
    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
    color: 'var(--color-foreground)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  }

  const renderContent = () => {
    if (loading) {
      return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Carregando agenda...</div>
    }

    // ---------- MÊS ----------
    if (view === 'mes') {
      if (isMobile) {
        const daysOfMonth = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {daysOfMonth.map(day => {
              const key = dateKey(day)
              const dayItems = itemsForDay(day)
              const isExpanded = expandedDays.has(key)
              const isToday = sameDay(day, today)
              return (
                <div key={key} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleDay(key)}
                    aria-expanded={isExpanded}
                    style={{
                      width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '10px 14px', border: 'none', cursor: 'pointer',
                      background: isToday ? 'var(--color-accent-light)' : 'transparent', color: 'var(--color-foreground)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday ? 'var(--color-primary)' : 'transparent', color: isToday ? '#fff' : 'var(--color-foreground)',
                        fontSize: 12, fontWeight: 600,
                      }}>{day.getDate()}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>
                        {day.toLocaleDateString('pt-BR', { weekday: 'long' })}
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {dayItems.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', background: 'var(--color-surface-2)', borderRadius: 10, padding: '1px 8px' }}>{dayItems.length}</span>
                      )}
                      <span style={{ color: 'var(--color-muted)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {dayItems.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '8px 0' }}>Sem eventos.</div>
                      ) : (
                        dayItems.map(item => (
                          <EventRow
                            key={item.id}
                            item={item}
                            onEdit={item.origem === 'manual' ? () => openEdit(item) : undefined}
                            onDelete={item.origem === 'manual' ? () => openEdit(item) : undefined}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      }

      return (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {DIAS_SEMANA.map((d, i) => (
              <div key={d} style={{
                padding: '10px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)',
                fontFamily: 'var(--font-mono)', background: 'var(--color-surface-2)',
                borderRight: i !== 6 ? '1px solid var(--color-border)' : 'none',
                borderBottom: '1px solid var(--color-border)',
              }}>{d}</div>
            ))}
            {cells.map((cell, i) => {
              const dayItems = itemsForDay(cell.date)
              const isToday = sameDay(cell.date, today)
              const visible = dayItems.slice(0, 3)
              const more = dayItems.length - visible.length
              return (
                <div
                  key={`${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`}
                  onClick={() => openDay(cell.date)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openDay(cell.date) }}
                  style={{
                    minHeight: 118, padding: 8, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4,
                    background: isToday ? 'var(--color-accent-light)' : cell.inMonth ? 'var(--color-surface)' : 'var(--color-background)',
                    borderRight: i % 7 !== 6 ? '1px solid var(--color-border)' : 'none',
                    borderTop: i >= 7 ? '1px solid var(--color-border)' : 'none',
                    transition: 'background 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: isToday ? 'var(--color-primary)' : 'transparent',
                      color: isToday ? '#fff' : cell.inMonth ? 'var(--color-foreground)' : 'var(--color-muted)',
                      fontSize: 12, fontWeight: isToday ? 700 : 500,
                    }}>{cell.date.getDate()}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
                    {visible.map(item => <MonthChip key={item.id} item={item} />)}
                    {more > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>+{more} mais</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // ---------- SEMANA ----------
    if (view === 'semana') {
      return (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {weekDays.map(day => {
            const dayItems = itemsForDay(day)
            const isToday = sameDay(day, today)
            return (
              <div key={dateKey(day)} style={{
                flex: '1 1 0%', minWidth: 160, background: 'var(--color-surface)',
                border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 12px', textAlign: 'center',
                  background: isToday ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: isToday ? '#fff' : 'var(--color-foreground)',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,0.75)' : 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                    {DIAS_SEMANA[day.getDay()]}
                  </div>
                  <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{day.getDate()}</div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
                  {dayItems.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textAlign: 'center', padding: '14px 0' }}>—</div>
                  ) : (
                    dayItems.map(item => (
                      <EventRow
                        key={item.id}
                        item={item}
                        onEdit={item.origem === 'manual' ? () => openEdit(item) : undefined}
                        onDelete={item.origem === 'manual' ? () => openEdit(item) : undefined}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    // ---------- DIA ----------
    const dayItems = itemsForDay(cursor)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
        {dayItems.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
            Nenhum evento neste dia.
          </div>
        ) : (
          dayItems.map(item => (
            <EventRow
              key={item.id}
              item={item}
              onEdit={item.origem === 'manual' ? () => openEdit(item) : undefined}
              onDelete={item.origem === 'manual' ? () => openEdit(item) : undefined}
            />
          ))
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '24px 16px' : '32px 40px', maxWidth: 1150, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            CALENDÁRIO DO ESCRITÓRIO
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Agenda
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 4 }}>
            Audiências, prazos e compromissos do escritório em um só lugar.
          </p>
        </div>

        <button
          onClick={openCreate}
          style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', padding: '9px 18px', minHeight: 44, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
        >
          ＋ Novo Evento
        </button>
      </div>

      {/* Toolbar: título do período + alternância de visão + navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: 0, fontWeight: 400, letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
          {viewTitle}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {(['mes', 'semana', 'dia'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  padding: '10px 16px', minHeight: 44, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: view === v ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: view === v ? '#fff' : 'var(--color-muted)',
                }}
              >
                {v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => shift(-1)} aria-label="Anterior" title="Anterior" style={navButtonStyle}>‹</button>
            <button type="button" onClick={goToday} style={navButtonStyle}>Hoje</button>
            <button type="button" onClick={() => shift(1)} aria-label="Próximo" title="Próximo" style={navButtonStyle}>›</button>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {LEGENDA.map(l => (
          <span key={l.tipo} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--color-${l.cor})` }} />
            <span aria-hidden>{TIPO_EMOJI[l.tipo]}</span> {l.label}
          </span>
        ))}
      </div>

      {/* Conteúdo da visão */}
      {renderContent()}

      {/* Estado vazio do mês */}
      {view === 'mes' && !loading && items.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '8px 0 24px' }}>
          Nenhum evento neste mês.
        </div>
      )}

      {/* Modal */}
      <EventModal
        key={modal === null ? 'closed' : modal.mode === 'edit' ? modal.item.id : 'create'}
        modal={modal}
        processos={processos}
        clientes={clientes}
        isMobile={isMobile}
        onClose={closeModal}
        onSaved={refetch}
        addToast={addToast}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
