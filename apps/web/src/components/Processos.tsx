import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import type { Processo, StatusProcesso } from '@lexia/shared'
import Pagination, { usePagination } from './Pagination'
import Toast, { ToastMessage } from './Toast'

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

export default function Processos() {
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* List pane */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Gestão de Processos</div>
            <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>{filtered.length} processos cadastrados</div>
          </div>
          <button onClick={() => setShowForm(true)} style={{
            background: 'var(--color-primary)', color: '#fff', border: 'none',
            padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>+ Novo Processo</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por número, cliente ou tipo..."
              style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {areas.map(a => (
              <button key={a} onClick={() => setAreaFilter(a)} style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: '1px solid var(--color-border)', cursor: 'pointer',
                background: areaFilter === a ? 'var(--color-primary)' : 'var(--color-surface)',
                color: areaFilter === a ? '#fff' : 'var(--color-muted)',
                transition: 'all 0.15s',
              }}>{a}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)' }}>
                {['Nº do Processo', 'Tipo / Cliente', 'Área', 'Advogado', 'Valor da Causa', 'Próximo Prazo', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processosPagination.pageItems.map(p => {
                const s = statusConfig[p.status]
                return (
                  <tr key={p.id}
                    onClick={() => setSelected(selected?.id === p.id ? null : p)}
                    style={{ borderTop: '1px solid var(--color-border)', cursor: 'pointer', background: selected?.id === p.id ? 'var(--color-badge-tint)' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (selected?.id !== p.id) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)' }}
                    onMouseLeave={e => { if (selected?.id !== p.id) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>{p.id.slice(0, 16)}...</div>
                    </td>
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.tipo}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{p.cliente}</div>
                    </td>
                    <td style={{ padding: '13px 18px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 8px', borderRadius: 4 }}>{p.area}</span>
                    </td>
                    <td style={{ padding: '13px 18px', fontSize: 12, color: 'var(--color-muted)' }}>{p.advogado}</td>
                    <td style={{ padding: '13px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{p.valor}</td>
                    <td style={{ padding: '13px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, color: p.prazo === '—' ? 'var(--color-muted)' : 'var(--color-foreground)' }}>{p.prazo}</td>
                    <td style={{ padding: '13px 18px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 4 }}>{s.label}</span>
                    </td>
                    <td style={{ padding: '13px 18px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }}
                        title="Excluir processo"
                      >×</button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Nenhum processo encontrado.</td></tr>
              )}
            </tbody>
          </table>
          <Pagination {...processosPagination} onPageChange={processosPagination.setPage} />
        </div>
      </div>

      {/* Detail & Painel do Processo Pane */}
      {selected && (
        <div style={{ width: 420, borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              PAINEL DO PROCESSO & LINHA DO TEMPO
            </div>
            <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em', marginBottom: 2 }}>{selected.tipo}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>ID: {selected.id}</div>
          </div>

          {/* Ficha rápida */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--color-background)', padding: 14, borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 600 }}>AUTOR / CLIENTE</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{selected.cliente}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 600 }}>RÉU / ADVERSO</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{selected.adverso}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 600 }}>JUÍZO / VARA</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{selected.vara}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 600 }}>VALOR CAUSA</div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>{selected.valor}</div>
            </div>
          </div>

          {/* Seção Linha do Tempo */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📜 Linha do Tempo & Intimações</span>
              <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 500 }}>Resumo IA Nativo</span>
            </div>

            {/* Cadastro de novo andamento */}
            <form onSubmit={handleAddAndamento} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-background)', padding: 12, borderRadius: 6, border: '1px solid var(--color-border)', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={novoTipoAndamento} onChange={e => setNovoTipoAndamento(e.target.value)} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--color-border)', fontSize: 11 }}>
                  <option value="Intimação">Intimação (DJEN)</option>
                  <option value="Despacho">Despacho</option>
                  <option value="Sentença">Sentença</option>
                  <option value="Audiência">Audiência</option>
                </select>
                <input type="text" placeholder="Prazo fatal (dd/mm/aaaa)" value={novoPrazoAndamento} onChange={e => setNovoPrazoAndamento(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--color-border)', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
              </div>
              <textarea placeholder="Cole o texto da intimação para a IA resumir..." value={novaDescricaoAndamento} onChange={e => setNovaDescricaoAndamento(e.target.value)} rows={2} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--color-border)', fontSize: 11, outline: 'none', resize: 'vertical' }} />
              <button disabled={addingAndamento} type="submit" style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end' }}>
                {addingAndamento ? 'IA Resumindo...' : '+ Adicionar & Resumir via IA'}
              </button>
            </form>

            {/* Lista de Andamentos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loadingAndamentos ? (
                <div style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: 12 }}>Carregando linha do tempo...</div>
              ) : andamentosList.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: 12 }}>Nenhum andamento cadastrado ainda.</div>
              ) : (
                andamentosList.map(item => (
                  <div key={item.id} style={{ borderLeft: '2px solid var(--color-primary)', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)' }}>{item.tipo}</span>
                      {item.prazoFatal && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--color-warning-light)', color: 'var(--color-warning)', padding: '1px 6px', borderRadius: 4 }}>
                          Prazo: {item.prazoFatal}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-foreground)', lineHeight: 1.4 }}>{item.descricao}</div>
                    {item.resumoIA && (
                      <div style={{ background: 'var(--color-accent-light)', border: '1px dashed var(--color-accent)', padding: '6px 8px', borderRadius: 4, fontSize: 11, color: 'var(--color-foreground)', marginTop: 2 }}>
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
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-surface)', borderRadius: 10, padding: '32px',
            width: 560, maxHeight: '90vh', overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 24, letterSpacing: '-0.02em' }}>Novo Processo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { key: 'tipo', label: 'Tipo de Ação', placeholder: 'Reclamação Trabalhista', full: true },
                { key: 'cliente', label: 'Cliente', placeholder: 'Nome completo' },
                { key: 'adverso', label: 'Parte Adversa', placeholder: 'Empresa Ltda.' },
                { key: 'vara', label: 'Vara / Tribunal', placeholder: '3ª Vara do Trabalho de SP', full: true },
                { key: 'valor', label: 'Valor da Causa', placeholder: 'R$ 0,00' },
                { key: 'prazo', label: 'Próximo Prazo', placeholder: 'dd/mm/aaaa' },
                { key: 'advogado', label: 'Advogado Responsável', placeholder: 'Dr. Nome' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <input
                    list={f.key === 'cliente' ? 'clientes-processo-datalist' : undefined}
                    value={(form as Record<string, string>)[f.key] || ''}
                    onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none' }}
                  />
                  {f.key === 'cliente' && (
                    <datalist id="clientes-processo-datalist">
                      {clientesList.map(c => (
                        <option key={c.id} value={c.nome}>{c.nome} ({c.cpfCnpj})</option>
                      ))}
                    </datalist>
                  )}
                </div>
              ))}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Área</label>
                <select value={form.area} onChange={e => setForm(v => ({ ...v, area: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none' }}>
                  {['Cível', 'Trabalhista', 'Tributário', 'Penal', 'Previdenciário', 'Consumerista'].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleAdd} style={{ padding: '9px 24px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
