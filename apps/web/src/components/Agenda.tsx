import { useState, useEffect, useRef, type FormEvent } from 'react'
import { api, getErrorMessage, type AgendaItem } from '../api/client'
import Toast, { type ToastMessage } from './Toast'
import { Button, EmptyState, Field, FONT, FormGrid, FormRow, inputStyle, Loading, Modal, PageContainer, PageHeader, RADIUS, SPACE, useIsMobile } from '../ui'

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
      display: 'flex', alignItems: 'center', gap: SPACE.sm,
      padding: '8px 10px', borderRadius: RADIUS.control,
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderLeft: `3px solid var(--color-${item.cor})`,
    }}>
      <span style={{ fontSize: FONT.lg, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FONT.md, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.titulo}
        </div>
        {item.cliente && <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: 1 }}>{item.cliente}</div>}
      </div>
      {timeLabel && (
        <span style={{ fontSize: FONT.sm, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', flexShrink: 0 }}>
          {timeLabel}
        </span>
      )}
      {isManual && onEdit && (
        <Button type="button" variant="ghost" size="sm" ariaLabel="Editar evento" title="Editar evento" onClick={onEdit}>✎</Button>
      )}
      {isManual && onDelete && (
        <Button type="button" variant="ghost" size="sm" ariaLabel="Excluir evento" title="Excluir evento" onClick={onDelete}>×</Button>
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
      padding: '2px 5px', borderRadius: RADIUS.chip, fontSize: FONT.xs,
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
  const formRef = useRef<HTMLFormElement>(null)

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

  const dataGridCols = form.diaInteiro || isMobile ? '1fr' : '1fr 1fr'

  return (
    <Modal
      open={modal !== null}
      onClose={onClose}
      title={isEdit ? 'Editar Evento' : 'Novo Evento'}
      width={560}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {isEdit ? (
            <Button type="button" variant="secondary" onClick={handleDelete} style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>
              Excluir
            </Button>
          ) : <span />}
          <div style={{ display: 'flex', gap: SPACE.sm }}>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={() => formRef.current?.requestSubmit()}>
              {isEdit ? 'Salvar Alterações' : 'Salvar Evento'}
            </Button>
          </div>
        </div>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <FormGrid>
          <FormRow span>
            <Field label="Título" required error={showError('titulo') ? errors.titulo : undefined}>
              <input
                type="text"
                value={form.titulo}
                maxLength={200}
                placeholder="Ex: Audiência de conciliação"
                onChange={e => setField('titulo', e.target.value)}
                onBlur={() => markTouched('titulo')}
                style={inputStyle(!!showError('titulo'))}
              />
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Tipo">
              <select
                value={form.tipo}
                onChange={e => setField('tipo', e.target.value)}
                style={inputStyle()}
              >
                {TIPOS_EVENTO.map(t => (
                  <option key={t} value={t}>
                    {t === 'audiencia' ? 'Audiência' : t === 'reuniao' ? 'Reunião' : t === 'prazo' ? 'Prazo' : t === 'diligencia' ? 'Diligência' : 'Outro'}
                  </option>
                ))}
              </select>
            </Field>
          </FormRow>

          <FormRow>
            <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={form.diaInteiro}
                  onChange={e => setField('diaInteiro', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                />
                <span style={{ fontSize: FONT.md, fontWeight: 500 }}>Dia inteiro</span>
              </label>
            </div>
          </FormRow>

          <FormRow>
            <Field label="Data Início" required error={showError('dataInicio') ? errors.dataInicio : undefined}>
              <input
                type="date"
                value={form.dataInicio}
                onChange={e => setField('dataInicio', e.target.value)}
                onBlur={() => markTouched('dataInicio')}
                style={inputStyle(!!showError('dataInicio'))}
              />
            </Field>
          </FormRow>

          {!form.diaInteiro ? (
            <FormRow>
              <Field label="Hora início">
                <input
                  type="time"
                  value={form.horaInicio}
                  onChange={e => setField('horaInicio', e.target.value)}
                  style={inputStyle()}
                />
              </Field>
            </FormRow>
          ) : <FormRow />}

          <FormRow>
            <Field label="Data Fim (opcional)">
              <input
                type="date"
                value={form.dataFim}
                onChange={e => setField('dataFim', e.target.value)}
                style={inputStyle()}
              />
            </Field>
          </FormRow>

          {!form.diaInteiro ? (
            <FormRow>
              <Field label="Hora fim (opcional)">
                <input
                  type="time"
                  value={form.horaFim}
                  onChange={e => setField('horaFim', e.target.value)}
                  style={inputStyle()}
                />
              </Field>
            </FormRow>
          ) : <FormRow />}

          <FormRow>
            <Field label="Processo vinculado">
              <select
                value={form.processoId}
                onChange={e => setField('processoId', e.target.value)}
                style={inputStyle()}
              >
                <option value="">Nenhum</option>
                {processos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.id.slice(0, 8)} • {p.cliente ?? ''} ({p.tipo ?? ''})
                  </option>
                ))}
              </select>
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Cliente vinculado">
              <select
                value={form.clienteId}
                onChange={e => setField('clienteId', e.target.value)}
                style={inputStyle()}
              >
                <option value="">Nenhum</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome ?? ''}</option>
                ))}
              </select>
            </Field>
          </FormRow>

          <FormRow span>
            <Field label="Descrição (opcional)">
              <textarea
                value={form.descricao}
                onChange={e => setField('descricao', e.target.value)}
                rows={3}
                placeholder="Observações do compromisso..."
                style={{ ...inputStyle(), resize: 'vertical', minHeight: 70 }}
              />
            </Field>
          </FormRow>
        </FormGrid>
      </form>
    </Modal>
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

  const renderContent = () => {
    if (loading) {
      return <Loading message="Carregando agenda..." />
    }

    // ---------- MÊS ----------
    if (view === 'mes') {
      if (isMobile) {
        const daysOfMonth = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
            {daysOfMonth.map(day => {
              const key = dateKey(day)
              const dayItems = itemsForDay(day)
              const isExpanded = expandedDays.has(key)
              const isToday = sameDay(day, today)
              return (
                <div key={key} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleDay(key)}
                    aria-expanded={isExpanded}
                    style={{
                      width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: SPACE.sm, padding: '10px 14px', border: 'none', cursor: 'pointer',
                      background: isToday ? 'var(--color-accent-light)' : 'transparent', color: 'var(--color-foreground)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday ? 'var(--color-primary)' : 'transparent', color: isToday ? 'var(--color-on-primary)' : 'var(--color-foreground)',
                        fontSize: FONT.base, fontWeight: 600,
                      }}>{day.getDate()}</span>
                      <span style={{ fontSize: FONT.base, fontWeight: 500, textTransform: 'capitalize' }}>
                        {day.toLocaleDateString('pt-BR', { weekday: 'long' })}
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                      {dayItems.length > 0 && (
                        <span style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)', background: 'var(--color-surface-2)', borderRadius: 10, padding: '1px 8px' }}>{dayItems.length}</span>
                      )}
                      <span style={{ color: 'var(--color-muted)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {dayItems.length === 0 ? (
                        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', padding: '8px 0' }}>Sem eventos.</div>
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
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.card,
          overflow: 'hidden',
          width: '100%',
        }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minWidth: 700 }}>
              {DIAS_SEMANA.map((d, i) => (
                <div key={d} style={{
                  padding: '10px 8px', textAlign: 'center', fontSize: FONT.xs, fontWeight: 600,
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
                        color: isToday ? 'var(--color-on-primary)' : cell.inMonth ? 'var(--color-foreground)' : 'var(--color-muted)',
                        fontSize: FONT.base, fontWeight: isToday ? 700 : 500,
                      }}>{cell.date.getDate()}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
                      {visible.map(item => <MonthChip key={item.id} item={item} />)}
                      {more > 0 && <span style={{ fontSize: FONT.xs, fontWeight: 600, color: 'var(--color-muted)' }}>+{more} mais</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    // ---------- SEMANA ----------
    if (view === 'semana') {
      return (
        <div style={{ display: 'flex', gap: SPACE.sm, overflowX: 'auto', paddingBottom: 4, width: '100%' }}>
          {weekDays.map(day => {
            const dayItems = itemsForDay(day)
            const isToday = sameDay(day, today)
            return (
              <div key={dateKey(day)} style={{
                flex: '1 1 0%', minWidth: 160, background: 'var(--color-surface)',
                border: '1px solid var(--color-border)', borderRadius: RADIUS.card, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 12px', textAlign: 'center',
                  background: isToday ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: isToday ? 'var(--color-on-primary)' : 'var(--color-foreground)',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: isToday ? 'var(--color-on-primary)' : 'var(--color-muted)', fontFamily: 'var(--font-mono)', opacity: isToday ? 0.75 : 1 }}>
                    {DIAS_SEMANA[day.getDay()]}
                  </div>
                  <div style={{ fontSize: FONT.cardTitle, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{day.getDate()}</div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
                  {dayItems.length === 0 ? (
                    <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', textAlign: 'center', padding: '14px 0' }}>—</div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm, width: '100%' }}>
        {dayItems.length === 0 ? (
          <EmptyState message="Nenhum evento neste dia." />
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
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
      {/* Header */}
      <PageHeader
        eyebrow="CALENDÁRIO DO ESCRITÓRIO"
        title="Agenda"
        description="Audiências, prazos e compromissos do escritório em um só lugar."
        action={<Button onClick={openCreate}>＋ Novo Evento</Button>}
      />

      {/* Toolbar: título do período + alternância de visão + navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: 0, fontWeight: 400, letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
          {viewTitle}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: SPACE.xs }}>
            {(['mes', 'semana', 'dia'] as const).map(v => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? 'primary' : 'secondary'}
                onClick={() => setView(v)}
                style={view === v ? undefined : { color: 'var(--color-muted)' }}
              >
                {v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}
              </Button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: SPACE.xs }}>
            <Button size="sm" variant="secondary" ariaLabel="Anterior" title="Anterior" onClick={() => shift(-1)}>‹</Button>
            <Button size="sm" variant="secondary" onClick={goToday}>Hoje</Button>
            <Button size="sm" variant="secondary" ariaLabel="Próximo" title="Próximo" onClick={() => shift(1)}>›</Button>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {LEGENDA.map(l => (
          <span key={l.tipo} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FONT.sm, color: 'var(--color-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--color-${l.cor})` }} />
            <span aria-hidden>{TIPO_EMOJI[l.tipo]}</span> {l.label}
          </span>
        ))}
      </div>

      {/* Conteúdo da visão */}
      {renderContent()}

      {/* Estado vazio do mês */}
      {view === 'mes' && !loading && items.length === 0 && (
        <EmptyState message="Nenhum evento neste mês." />
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
    </PageContainer>
  )
}
