import { useState, useEffect } from 'react'
import { getProcessos, addProcesso, deleteProcesso } from '../db/store'
import type { Processo, StatusProcesso } from '../db/types'

const statusConfig: Record<StatusProcesso, { label: string; color: string; bg: string }> = {
  ativo:     { label: 'Ativo',     color: 'var(--color-success)', bg: 'var(--color-success-light)' },
  suspenso:  { label: 'Suspenso',  color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  arquivado: { label: 'Arquivado', color: 'var(--color-muted)',   bg: 'var(--color-surface-2)' },
}

const areas = ['Todas', 'Cível', 'Trabalhista', 'Tributário', 'Penal']

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

  const reload = () => setProcessos(getProcessos())

  useEffect(() => { reload() }, [])

  const filtered = processos.filter(p => {
    const matchArea = areaFilter === 'Todas' || p.area === areaFilter
    const matchSearch = search === '' ||
      p.id.includes(search) ||
      p.cliente.toLowerCase().includes(search.toLowerCase()) ||
      p.tipo.toLowerCase().includes(search.toLowerCase())
    return matchArea && matchSearch
  })

  const handleAdd = () => {
    if (!form.tipo || !form.cliente) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.2024.8.26.0000`
    addProcesso({ id, ...form })
    reload()
    setShowForm(false)
    setForm(emptyForm)
  }

  const handleDelete = (id: string) => {
    deleteProcesso(id)
    if (selected?.id === id) setSelected(null)
    reload()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* List pane */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Processos</div>
            <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>{filtered.length} processos encontrados</div>
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
              {filtered.map(p => {
                const s = statusConfig[p.status]
                return (
                  <tr key={p.id}
                    onClick={() => setSelected(selected?.id === p.id ? null : p)}
                    style={{ borderTop: '1px solid var(--color-border)', cursor: 'pointer', background: selected?.id === p.id ? '#eef0f7' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (selected?.id !== p.id) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)' }}
                    onMouseLeave={e => { if (selected?.id !== p.id) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>{p.id}</div>
                    </td>
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.tipo}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{p.cliente}</div>
                    </td>
                    <td style={{ padding: '13px 18px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', background: '#e8eaf0', padding: '2px 8px', borderRadius: 4 }}>{p.area}</span>
                    </td>
                    <td style={{ padding: '13px 18px', fontSize: 12, color: 'var(--color-muted)' }}>{p.advogado.replace('Dr. ', '').replace('Dra. ', '')}</td>
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
        </div>
      </div>

      {/* Detail pane */}
      {selected && (
        <div style={{ width: 340, borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '28px 24px', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Detalhes do Processo</div>
            <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 4, letterSpacing: '-0.02em' }}>{selected.tipo}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)', marginBottom: 20 }}>{selected.id}</div>
          {[
            { label: 'Cliente', value: selected.cliente },
            { label: 'Parte Adversa', value: selected.adverso },
            { label: 'Vara', value: selected.vara },
            { label: 'Área', value: selected.area },
            { label: 'Advogado Responsável', value: selected.advogado },
            { label: 'Valor da Causa', value: selected.valor },
            { label: 'Próximo Prazo', value: selected.prazo },
          ].map(f => (
            <div key={f.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 3 }}>{f.label}</div>
              <div style={{ fontSize: 13 }}>{f.value || '—'}</div>
            </div>
          ))}
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
                  <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <input
                    value={(form as Record<string, string>)[f.key] || ''}
                    onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Área</label>
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
    </div>
  )
}
