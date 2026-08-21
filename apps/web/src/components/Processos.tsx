import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import type { Processo, StatusProcesso } from '@lexia/shared'
import Pagination, { usePagination } from './Pagination'
import Toast, { ToastMessage } from './Toast'
import { Button, EmptyRow, Field, FONT, FormGrid, FormRow, inputStyle, Modal, PageContainer, PageHeader, RADIUS, SPACE, Table, TableShell, Td, Th, THeadRow, Tr, useIsMobile } from '../ui'

const statusConfig: Record<StatusProcesso, { label: string; color: string; bg: string }> = {
  ativo:     { label: 'Ativo',     color: 'var(--color-success)', bg: 'var(--color-success-light)' },
  suspenso:  { label: 'Suspenso',  color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  arquivado: { label: 'Arquivado', color: 'var(--color-muted)',   bg: 'var(--color-surface-2)' },
}

const areas = ['Todas', 'Cível', 'Trabalhista', 'Tributário', 'Penal', 'Consumerista']

const emptyForm: Omit<Processo, 'id'> = {
  tipo: '', cliente: '', adverso: '', vara: '', area: 'Cível',
  status: 'ativo', valor: '', prazo: '', advogado: '',
}

const formFields: { key: string; label: string; placeholder: string; full?: boolean }[] = [
  { key: 'tipo', label: 'Tipo de Ação', placeholder: 'Reclamação Trabalhista', full: true },
  { key: 'cliente', label: 'Cliente', placeholder: 'Nome completo' },
  { key: 'adverso', label: 'Parte Adversa', placeholder: 'Empresa Ltda.' },
  { key: 'vara', label: 'Vara / Tribunal', placeholder: '3ª Vara do Trabalho de SP' },
  { key: 'advogado', label: 'Advogado Responsável', placeholder: 'Dr. Nome' },
  { key: 'valor', label: 'Valor da Causa', placeholder: 'R$ 0,00' },
  { key: 'prazo', label: 'Próximo Prazo', placeholder: 'dd/mm/aaaa' },
]

const areasNovoProcesso = ['Cível', 'Trabalhista', 'Tributário', 'Penal', 'Previdenciário', 'Consumerista']

export default function Processos() {
  const isMobile = useIsMobile()
  const [processos, setProcessos] = useState<Processo[]>([])
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('Todas')
  const [selected, setSelected] = useState<Processo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  // Timeline / Andamentos do processo selecionado
  const [andamentosList, setAndamentosList] = useState<any[]>([])
  const [loadingAndamentos, setLoadingAndamentos] = useState(false)
  const [novoTipoAndamento, setNovoTipoAndamento] = useState('Intimação')
  const [novaDescricaoAndamento, setNovaDescricaoAndamento] = useState('')
  const [novoPrazoAndamento, setNovoPrazoAndamento] = useState('')
  const [addingAndamento, setAddingAndamento] = useState(false)

  // Clientes para Autocomplete
  const [clientesList, setClientesList] = useState<any[]>([])

  // Sistema de Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const reload = async () => {
    try {
      const [data, cData] = await Promise.all([
        api.processos.list(),
        api.clientes.list()
      ])
      setProcessos(Array.isArray(data) ? data : [])
      if (Array.isArray(cData)) setClientesList(cData)
    } catch (e) {
      console.error(e)
      addToast('error', 'Não foi possível carregar os processos.')
    }
  }

  useEffect(() => { reload() }, [])

  // Carrega andamentos do processo selecionado
  useEffect(() => {
    if (selected) {
      setLoadingAndamentos(true)
      api.andamentos.listByProcesso(selected.id)
        .then(data => {
          if (Array.isArray(data)) setAndamentosList(data)
        })
        .catch(err => {
          console.error(err)
          addToast('error', 'Não foi possível carregar os andamentos.')
        })
        .finally(() => setLoadingAndamentos(false))
    }
  }, [selected])

  const filtered = processos.filter(p => {
    const matchArea = areaFilter === 'Todas' || p.area === areaFilter
    const matchSearch = search === '' ||
      p.id.includes(search) ||
      p.cliente.toLowerCase().includes(search.toLowerCase()) ||
      p.tipo.toLowerCase().includes(search.toLowerCase())
    return matchArea && matchSearch
  })

  const processosPagination = usePagination(filtered, 10)

  const handleAdd = async () => {
    if (!form.tipo || !form.cliente) return
    try {
      const res = await api.processos.create(form)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao criar processo.'))
        return
      }
      await reload()
      setShowForm(false)
      setForm(emptyForm)
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao criar processo.')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await api.processos.delete(id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao excluir processo.'))
        return
      }
      if (selected?.id === id) setSelected(null)
      await reload()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao excluir processo.')
    }
  }

  const handleAddAndamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !novaDescricaoAndamento.trim()) return
    setAddingAndamento(true)
    try {
      const res = await api.andamentos.create({
        processoId: selected.id,
        tipo: novoTipoAndamento,
        descricao: novaDescricaoAndamento,
        prazoFatal: novoPrazoAndamento || null
      })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao adicionar andamento.'))
        return
      }
      setNovaDescricaoAndamento('')
      setNovoPrazoAndamento('')
      const updated = await api.andamentos.listByProcesso(selected.id)
      setAndamentosList(Array.isArray(updated) ? updated : [])
    } catch (err) {
      console.error(err)
      addToast('error', 'Erro ao adicionar andamento.')
    } finally {
      setAddingAndamento(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      height: isMobile ? 'auto' : '100vh',
      overflow: isMobile ? 'visible' : 'hidden',
    }}>
      {/* List pane */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        ...(isMobile ? { maxHeight: '45vh', borderBottom: '1px solid var(--color-border)' } : {}),
      }}>
        <PageContainer>
          <PageHeader
            eyebrow="GESTÃO PROCESSUAL"
            title="Processos"
            description={`${filtered.length} processos cadastrados`}
            action={<Button onClick={() => setShowForm(true)}>+ Novo Processo</Button>}
          />

          {/* Filters */}
          <div style={{ display: 'flex', gap: SPACE.md, marginBottom: SPACE.xl, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" fill="none" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por número, cliente ou tipo..."
                style={{ ...inputStyle(), paddingLeft: 36 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {areas.map(a => {
                const active = areaFilter === a
                return (
                  <Button
                    key={a}
                    size="sm"
                    variant={active ? 'primary' : 'secondary'}
                    onClick={() => setAreaFilter(a)}
                    style={active ? undefined : { color: 'var(--color-muted)' }}
                  >
                    {a}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Table */}
          <TableShell>
            <Table style={{ minWidth: 780 }}>
              <THeadRow>
                {['Nº do Processo', 'Tipo / Cliente', 'Área', 'Advogado', 'Valor da Causa', 'Próximo Prazo', 'Status', ''].map(h => (
                  <Th key={h}>{h}</Th>
                ))}
              </THeadRow>
              <tbody>
                {processosPagination.pageItems.map(p => {
                  const s = statusConfig[p.status]
                  const rowSelected = selected?.id === p.id
                  return (
                    <Tr
                      key={p.id}
                      selected={rowSelected}
                      onClick={() => setSelected(rowSelected ? null : p)}
                    >
                      <Td>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)' }}>{p.id.slice(0, 16)}...</div>
                      </Td>
                      <Td>
                        <div style={{ fontSize: FONT.md, fontWeight: 500 }}>{p.tipo}</div>
                        <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: 1 }}>{p.cliente}</div>
                      </Td>
                      <Td>
                        <span style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 8px', borderRadius: RADIUS.chip }}>{p.area}</span>
                      </Td>
                      <Td><span style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>{p.advogado}</span></Td>
                      <Td><span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base, fontWeight: 500 }}>{p.valor}</span></Td>
                      <Td><span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: p.prazo === '—' ? 'var(--color-muted)' : 'var(--color-foreground)' }}>{p.prazo}</span></Td>
                      <Td>
                        <span style={{ fontSize: FONT.xs, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{s.label}</span>
                      </Td>
                      <Td>
                        <Button
                          variant="ghost"
                          size="sm"
                          ariaLabel="Excluir processo"
                          title="Excluir processo"
                          onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                          >×</Button>
                      </Td>
                    </Tr>
                  )
                })}
                {filtered.length === 0 && <EmptyRow colSpan={8} message="Nenhum processo encontrado." />}
              </tbody>
            </Table>
            <Pagination {...processosPagination} onPageChange={processosPagination.setPage} />
          </TableShell>
        </PageContainer>
      </div>

      {/* Detail & Painel do Processo Pane */}
      {selected && (
        <div style={{
          width: isMobile ? '100%' : 420,
          borderLeft: isMobile ? 'none' : '1px solid var(--color-border)',
          borderTop: isMobile ? '1px solid var(--color-border)' : 'none',
          background: 'var(--color-surface)',
          padding: isMobile ? `${SPACE.xxl}px ${SPACE.lg}px` : '24px 20px',
          overflowY: isMobile ? 'visible' : 'auto',
          display: 'flex', flexDirection: 'column', gap: SPACE.xl,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              PAINEL DO PROCESSO & LINHA DO TEMPO
            </div>
            <Button variant="ghost" size="sm" ariaLabel="Fechar painel" onClick={() => setSelected(null)}>×</Button>
          </div>

          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em', marginBottom: 2 }}>{selected.tipo}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)' }}>ID: {selected.id}</div>
          </div>

          {/* Ficha rápida */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--color-background)', padding: 14, borderRadius: RADIUS.control, border: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600 }}>AUTOR / CLIENTE</div>
              <div style={{ fontSize: FONT.base, fontWeight: 600, marginTop: 2 }}>{selected.cliente}</div>
            </div>
            <div>
              <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600 }}>RÉU / ADVERSO</div>
              <div style={{ fontSize: FONT.base, fontWeight: 600, marginTop: 2 }}>{selected.adverso}</div>
            </div>
            <div>
              <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600 }}>JUÍZO / VARA</div>
              <div style={{ fontSize: FONT.sm, marginTop: 2 }}>{selected.vara}</div>
            </div>
            <div>
              <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600 }}>VALOR CAUSA</div>
              <div style={{ fontSize: FONT.sm, fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>{selected.valor}</div>
            </div>
          </div>

          {/* Seção Linha do Tempo */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: SPACE.lg }}>
            <div style={{ fontSize: FONT.base, fontWeight: 600, marginBottom: SPACE.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📜 Linha do Tempo & Intimações</span>
              <span style={{ fontSize: FONT.sm, color: 'var(--color-accent)', fontWeight: 500 }}>Resumo IA Nativo</span>
            </div>

            {/* Cadastro de novo andamento */}
            <form onSubmit={handleAddAndamento} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm, background: 'var(--color-background)', padding: SPACE.md, borderRadius: RADIUS.control, border: '1px solid var(--color-border)', marginBottom: SPACE.lg }}>
              <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                <select value={novoTipoAndamento} onChange={e => setNovoTipoAndamento(e.target.value)} style={{ ...inputStyle(), width: 'auto', padding: '6px 8px', fontSize: FONT.sm }}>
                  <option value="Intimação">Intimação (DJEN)</option>
                  <option value="Despacho">Despacho</option>
                  <option value="Sentença">Sentença</option>
                  <option value="Audiência">Audiência</option>
                </select>
                <input type="text" placeholder="Prazo fatal (dd/mm/aaaa)" value={novoPrazoAndamento} onChange={e => setNovoPrazoAndamento(e.target.value)} style={{ ...inputStyle(), flex: 1, minWidth: 140, padding: '6px 8px', fontSize: FONT.sm, fontFamily: 'var(--font-mono)' }} />
              </div>
              <textarea placeholder="Cole o texto da intimação para a IA resumir..." value={novaDescricaoAndamento} onChange={e => setNovaDescricaoAndamento(e.target.value)} rows={2} style={{ ...inputStyle(), padding: '6px 8px', fontSize: FONT.sm, resize: 'vertical' }} />
              <Button size="sm" type="submit" disabled={addingAndamento} style={{ alignSelf: 'flex-end' }}>
                {addingAndamento ? 'IA Resumindo...' : '+ Adicionar & Resumir via IA'}
              </Button>
            </form>

            {/* Lista de Andamentos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {loadingAndamentos ? (
                <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', textAlign: 'center', padding: SPACE.md }}>Carregando linha do tempo...</div>
              ) : andamentosList.length === 0 ? (
                <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', textAlign: 'center', padding: SPACE.md }}>Nenhum andamento cadastrado ainda.</div>
              ) : (
                andamentosList.map(item => (
                  <div key={item.id} style={{ borderLeft: '2px solid var(--color-primary)', paddingLeft: SPACE.md, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: FONT.sm, fontWeight: 700, color: 'var(--color-primary)' }}>{item.tipo}</span>
                      {item.prazoFatal && (
                        <span style={{ fontSize: FONT.xs, fontFamily: 'var(--font-mono)', background: 'var(--color-warning-light)', color: 'var(--color-warning)', padding: '1px 6px', borderRadius: RADIUS.chip }}>
                          Prazo: {item.prazoFatal}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: FONT.base, color: 'var(--color-foreground)', lineHeight: 1.4 }}>{item.descricao}</div>
                    {item.resumoIA && (
                      <div style={{ background: 'var(--color-accent-light)', border: '1px dashed var(--color-accent)', padding: '6px 8px', borderRadius: RADIUS.chip, fontSize: FONT.sm, color: 'var(--color-foreground)', marginTop: 2 }}>
                        {item.resumoIA}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New processo modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Novo Processo"
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Salvar</Button>
          </>
        }
      >
        <FormGrid>
          {formFields.map(f => (
            <FormRow key={f.key} span={f.full}>
              <Field label={f.label}>
                <input
                  list={f.key === 'cliente' ? 'clientes-processo-datalist' : undefined}
                  value={(form as Record<string, string>)[f.key] || ''}
                  onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inputStyle()}
                />
                {f.key === 'cliente' && (
                  <datalist id="clientes-processo-datalist">
                    {clientesList.map(c => (
                      <option key={c.id} value={c.nome}>{c.nome} ({c.cpfCnpj})</option>
                    ))}
                  </datalist>
                )}
              </Field>
            </FormRow>
          ))}
          <FormRow>
            <Field label="Área">
              <select value={form.area} onChange={e => setForm(v => ({ ...v, area: e.target.value }))} style={inputStyle()}>
                {areasNovoProcesso.map(a => <option key={a}>{a}</option>)}
              </select>
            </Field>
          </FormRow>
        </FormGrid>
      </Modal>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
