import { useState, useEffect } from 'react'
import { api, Court, Decision, SearchDecisionsResult } from '../api/client'
import Toast, { ToastMessage } from './Toast'

const QUICK_SUGGESTIONS = [
  'dano moral negativação indevida',
  'usucapião extraordinária posse mansa',
  'horas extras cargo de confiança CLT',
  'revisão da vida toda INSS',
  'indenização por desvio de função',
  'pensão alimentícia exoneração maioridade',
  'responsabilidade civil erro médico',
  'rescisão indireta atraso salarial',
]

const DEFAULT_COURTS: Court[] = [
  { id: 'stj', name: 'Superior Tribunal de Justiça', abbreviation: 'STJ', decisions_count: 903006 },
  { id: 'stf', name: 'Supremo Tribunal Federal', abbreviation: 'STF', decisions_count: 451232 },
  { id: 'tst', name: 'Tribunal Superior do Trabalho', abbreviation: 'TST', decisions_count: 338154 },
  { id: 'tjsp', name: 'Tribunal de Justiça de São Paulo', abbreviation: 'TJSP', decisions_count: 3780289 },
  { id: 'tjrj', name: 'Tribunal de Justiça do Rio de Janeiro', abbreviation: 'TJRJ', decisions_count: 438788 },
  { id: 'tjmg', name: 'Tribunal de Justiça de Minas Gerais', abbreviation: 'TJMG', decisions_count: 1720527 },
  { id: 'tjrs', name: 'Tribunal de Justiça do Rio Grande do Sul', abbreviation: 'TJRS', decisions_count: 2906500 },
  { id: 'tjpr', name: 'Tribunal de Justiça do Paraná', abbreviation: 'TJPR', decisions_count: 1494910 },
  { id: 'tjsc', name: 'Tribunal de Justiça de Santa Catarina', abbreviation: 'TJSC', decisions_count: 808323 },
  { id: 'tjgo', name: 'Tribunal de Justiça de Goiás', abbreviation: 'TJGO', decisions_count: 287837 },
  { id: 'tjce', name: 'Tribunal de Justiça do Ceará', abbreviation: 'TJCE', decisions_count: 285131 },
  { id: 'tjma', name: 'Tribunal de Justiça do Maranhão', abbreviation: 'TJMA', decisions_count: 149329 },
  { id: 'tjmt', name: 'Tribunal de Justiça de Mato Grosso', abbreviation: 'TJMT', decisions_count: 238601 },
  { id: 'trf3', name: 'Tribunal Regional Federal da 3ª Região', abbreviation: 'TRF3', decisions_count: 630860 },
  { id: 'trf4', name: 'Tribunal Regional Federal da 4ª Região', abbreviation: 'TRF4', decisions_count: 1635582 },
  { id: 'carf', name: 'Conselho Admin. de Recursos Fiscais', abbreviation: 'CARF', decisions_count: 162314 },
]

export default function Decisoes({ onSelectForPeca }: { onSelectForPeca?: (d: Decision) => void }) {
  const [activeTab, setActiveTab] = useState<'search' | 'lookup'>('search')
  const [courts, setCourts] = useState<Court[]>(DEFAULT_COURTS)
  const [selectedCourt, setSelectedCourt] = useState<string>('stj')
  const [query, setQuery] = useState<string>('')
  const [page, setPage] = useState<number>(0)
  
  // Advanced filters
  const [showFilters, setShowFilters] = useState(false)
  const [pubFrom, setPubFrom] = useState('')
  const [pubTo, setPubTo] = useState('')
  const [trialFrom, setTrialFrom] = useState('')
  const [trialTo, setTrialTo] = useState('')

  // Lookup mode
  const [lookupNumber, setLookupNumber] = useState('')
  const [lookupResult, setLookupResult] = useState<Decision | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // Search state
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Decision[]>([])
  const [meta, setMeta] = useState<{ page: number; per_page: number; has_next_page: boolean }>({
    page: 0,
    per_page: 10,
    has_next_page: false,
  })
  const [searched, setSearched] = useState(false)
  const [lastQuery, setLastQuery] = useState('')

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  // Load courts from API
  useEffect(() => {
    api.jurisprudencias.listCourts()
      .then(res => {
        if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
          setCourts(res.data)
        }
      })
      .catch(err => {
        console.warn('Usando lista padrão de tribunais:', err)
      })
  }, [])

  const handleSearch = async (targetPage = 0) => {
    if (!query.trim()) {
      addToast('warning', 'Digite um termo ou tese jurídica para buscar.')
      return
    }

    setLoading(true)
    setSearched(true)
    setLastQuery(query.trim())
    setPage(targetPage)

    try {
      const res: SearchDecisionsResult = await api.jurisprudencias.search({
        court: selectedCourt,
        q: query.trim(),
        page: targetPage,
        pub_from: pubFrom || undefined,
        pub_to: pubTo || undefined,
        trial_from: trialFrom || undefined,
        trial_to: trialTo || undefined,
      })

      setResults(res.data || [])
      setMeta(res.meta || { page: targetPage, per_page: 10, has_next_page: false })
      if ((res.data || []).length === 0) {
        addToast('info', 'Nenhuma decisão encontrada para os critérios informados.')
      }
    } catch (err: any) {
      console.error(err)
      addToast('error', err?.message || 'Falha ao buscar decisões no tribunal.')
    } finally {
      setLoading(false)
    }
  }

  const handleLookup = async () => {
    if (!lookupNumber.trim()) {
      addToast('warning', 'Digite o número do processo para consultar.')
      return
    }

    setLookupLoading(true)
    setLookupResult(null)

    try {
      const res = await api.jurisprudencias.lookup(selectedCourt, lookupNumber.trim())
      if (res?.data) {
        setLookupResult(res.data)
        addToast('success', 'Decisão localizada com sucesso!')
      } else {
        addToast('warning', 'Decisão não encontrada para este número no tribunal.')
      }
    } catch (err: any) {
      console.error(err)
      addToast('error', err?.message || 'Falha ao consultar decisão por número.')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleCopyCitation = (d: Decision) => {
    const tribunalName = courts.find(c => c.id === selectedCourt)?.abbreviation || d.court?.toUpperCase() || 'Tribunal'
    const texto = `${tribunalName} - ${d.process_type || 'Processo'} nº ${d.process_number}, Relator(a): ${d.rapporteur || 'N/A'}, ${d.adjudicating_body || ''}, Julgamento: ${d.trial_date || 'N/A'}, Publicação: ${d.publication_date || 'N/A'}.\n\nEmenta:\n"${d.excerpt || d.summary || ''}"\n(Fonte: ${d.url})`

    navigator.clipboard.writeText(texto)
    addToast('success', 'Citação jurisprudencial copiada para a área de transferência!')
  }

  const handleUseInPeca = (d: Decision) => {
    if (onSelectForPeca) {
      onSelectForPeca(d)
      addToast('success', 'Jurisprudência anexada ao caso!')
      return
    }

    // Salvar no storage para uso no gerador de peças e disparar navegação
    try {
      const current = localStorage.getItem('smartjuris_selected_jurisprudencia')
      const arr: Decision[] = current ? JSON.parse(current) : []
      if (!arr.find(item => item.process_number === d.process_number)) {
        arr.push(d)
        localStorage.setItem('smartjuris_selected_jurisprudencia', JSON.stringify(arr))
      }
      window.dispatchEvent(new CustomEvent('nav-pecas'))
      addToast('success', 'Jurisprudência salva! Redirecionando para o Gerador de Peças...')
    } catch {
      addToast('info', 'Jurisprudência selecionada.')
    }
  }

  const currentCourt = courts.find(c => c.id === selectedCourt) || courts[0]

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--color-primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.02em', margin: 0 }}>
              Pesquisa de Decisões & Jurisprudência
            </h1>
          </div>
          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>
            Consulta direta em tempo real a 16 tribunais e conselhos federais via <strong style={{ color: 'var(--color-foreground)' }}>Jurisprudências.ai Live API</strong>.
          </p>
        </div>

        {/* Tab Selector */}
        <div style={{
          display: 'flex', background: 'var(--color-surface-2)',
          padding: 3, borderRadius: 8, border: '1px solid var(--color-border)'
        }}>
          <button
            onClick={() => setActiveTab('search')}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: activeTab === 'search' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'search' ? 'var(--color-primary)' : 'var(--color-muted)',
              boxShadow: activeTab === 'search' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            🔍 Busca por Termo / Tese
          </button>
          <button
            onClick={() => setActiveTab('lookup')}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: activeTab === 'lookup' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'lookup' ? 'var(--color-primary)' : 'var(--color-muted)',
              boxShadow: activeTab === 'lookup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            #️⃣ Consulta por Número
          </button>
        </div>
      </div>

      {/* Main Search Controls Box */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '24px',
        marginBottom: 28,
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}>
        {activeTab === 'search' ? (
          <div>
            {/* Top Bar: Court selector + Search Input */}
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr auto', gap: 12, alignItems: 'center' }}>
              {/* Tribunal Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 6 }}>
                  Tribunal de Origem
                </label>
                <select
                  value={selectedCourt}
                  onChange={e => setSelectedCourt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-background)',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--color-foreground)',
                    cursor: 'pointer',
                  }}
                >
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.abbreviation} — {c.name.length > 25 ? c.name.slice(0, 25) + '...' : c.name} ({c.decisions_count ? Number(c.decisions_count).toLocaleString('pt-BR') : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Query Input */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 6 }}>
                  Termos, Ementa, Tese ou Palavras-Chave
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch(0)}
                    placeholder='Ex: "dano moral" negativação SPC -material (use "aspas", OR, -excluir)'
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-background)',
                      fontSize: 13,
                      color: 'var(--color-foreground)',
                      boxSizing: 'border-box',
                    }}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'transparent', border: 'none', color: 'var(--color-muted)',
                        cursor: 'pointer', fontSize: 14,
                      }}
                    >✕</button>
                  )}
                </div>
              </div>

              {/* Search Button */}
              <div style={{ alignSelf: 'flex-end' }}>
                <button
                  onClick={() => handleSearch(0)}
                  disabled={loading}
                  style={{
                    background: 'var(--color-primary)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 22px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: loading ? 0.7 : 1,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>Pesquisar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Suggestions & Filter Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 500 }}>Sugestões rápidas:</span>
                {QUICK_SUGGESTIONS.slice(0, 4).map(s => (
                  <button
                    key={s}
                    onClick={() => { setQuery(s); }}
                    style={{
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 14,
                      padding: '2px 9px',
                      fontSize: 11,
                      color: 'var(--color-foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 12,
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{showFilters ? '▲ Ocultar Filtros de Data' : '▼ Filtros Avançados de Data'}</span>
              </button>
            </div>

            {/* Collapsible Filters */}
            {showFilters && (
              <div style={{
                marginTop: 16,
                padding: '14px 16px',
                background: 'var(--color-surface-2)',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Publicação De</label>
                  <input
                    type="date"
                    value={pubFrom}
                    onChange={e => setPubFrom(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Publicação Até</label>
                  <input
                    type="date"
                    value={pubTo}
                    onChange={e => setPubTo(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Julgamento De</label>
                  <input
                    type="date"
                    value={trialFrom}
                    onChange={e => setTrialFrom(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Julgamento Até</label>
                  <input
                    type="date"
                    value={trialTo}
                    onChange={e => setTrialTo(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12 }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Lookup by Process Number */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 6 }}>
                  Tribunal
                </label>
                <select
                  value={selectedCourt}
                  onChange={e => setSelectedCourt(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--color-border)', background: 'var(--color-background)',
                    fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)',
                  }}
                >
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.abbreviation} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 6 }}>
                  Número do Processo / Registro
                </label>
                <input
                  type="text"
                  value={lookupNumber}
                  onChange={e => setLookupNumber(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  placeholder="Ex: 0123456-78.2023.8.26.0100 ou 202401136976"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--color-border)', background: 'var(--color-background)',
                    fontSize: 13, color: 'var(--color-foreground)', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button
                  onClick={handleLookup}
                  disabled={lookupLoading}
                  style={{
                    background: 'var(--color-primary)', color: '#fff', border: 'none',
                    padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: lookupLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {lookupLoading ? 'Consultando...' : 'Consultar Decisão'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Header / Stats */}
      {searched && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            Exibindo resultados para <strong style={{ color: 'var(--color-foreground)' }}>"{lastQuery}"</strong> no tribunal <span style={{
              background: 'var(--color-surface-2)', padding: '2px 8px', borderRadius: 4, fontWeight: 600, color: 'var(--color-primary)'
            }}>{currentCourt.abbreviation}</span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
            Página {meta.page + 1}
          </div>
        </div>
      )}

      {/* Lookup Result Box */}
      {activeTab === 'lookup' && lookupResult && (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '24px',
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <span style={{
                background: 'var(--color-accent)', color: '#18170f',
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 8,
              }}>
                {selectedCourt.toUpperCase()}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-foreground)' }}>
                {lookupResult.process_type || 'Decisão Judicial'} · {lookupResult.process_number}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleCopyCitation(lookupResult)}
                style={{
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                📋 Copiar Citação
              </button>
              {lookupResult.url && (
                <a
                  href={lookupResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'var(--color-primary)', color: '#fff', textDecoration: 'none',
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  }}
                >
                  Abrir no Tribunal ↗
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: 6, marginBottom: 14, fontSize: 12 }}>
            <div>
              <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: 10 }}>Relator(a)</span>
              <strong>{lookupResult.rapporteur || 'Não informado'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: 10 }}>Órgão Julgador</span>
              <strong>{lookupResult.adjudicating_body || 'Não informado'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: 10 }}>Data de Julgamento</span>
              <strong>{lookupResult.trial_date || 'N/A'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: 10 }}>Data de Publicação</span>
              <strong>{lookupResult.publication_date || 'N/A'}</strong>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>Ementa / Decisão</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-foreground)', background: 'var(--color-background)', padding: 14, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              {lookupResult.summary || lookupResult.excerpt || 'Sem ementa disponível.'}
            </div>
          </div>
        </div>
      )}

      {/* Decision Cards List */}
      {activeTab === 'search' && (
        <div>
          {results.map((d, index) => (
            <div
              key={d.process_number || index}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '20px 24px',
                marginBottom: 16,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* Header of Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    background: 'var(--color-primary)', color: '#fff',
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {currentCourt.abbreviation}
                  </span>

                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-foreground)' }}>
                    {d.process_type || 'Decisão'}
                  </span>

                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                    nº {d.process_number}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleCopyCitation(d)}
                    title="Copiar citação com ementa formatada"
                    style={{
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      color: 'var(--color-foreground)', cursor: 'pointer',
                    }}
                  >
                    📋 Copiar Citação
                  </button>

                  <button
                    onClick={() => handleUseInPeca(d)}
                    title="Enviar para o Gerador de Peças RAG"
                    style={{
                      background: 'var(--color-accent)',
                      border: 'none',
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      color: '#18170f', cursor: 'pointer',
                    }}
                  >
                    ✍️ Usar na Peça
                  </button>

                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir inteiro teor no site oficial do Tribunal"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        color: 'var(--color-primary)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      Fonte Oficial ↗
                    </a>
                  )}
                </div>
              </div>

              {/* Metadata Row */}
              <div style={{
                display: 'flex', gap: 16, flexWrap: 'wrap',
                fontSize: 11, color: 'var(--color-muted)',
                marginBottom: 12, paddingBottom: 10,
                borderBottom: '1px solid var(--color-surface-2)',
              }}>
                {d.rapporteur && (
                  <div>
                    <span style={{ fontWeight: 600 }}>Relator(a):</span> {d.rapporteur}
                  </div>
                )}
                {d.adjudicating_body && (
                  <div>
                    <span style={{ fontWeight: 600 }}>Órgão:</span> {d.adjudicating_body}
                  </div>
                )}
                {d.trial_date && (
                  <div>
                    <span style={{ fontWeight: 600 }}>Julgamento:</span> {d.trial_date}
                  </div>
                )}
                {d.publication_date && (
                  <div>
                    <span style={{ fontWeight: 600 }}>Publicação:</span> {d.publication_date}
                  </div>
                )}
              </div>

              {/* Excerpt */}
              <div style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: 'var(--color-foreground)',
                background: 'var(--color-surface-2)',
                padding: '12px 14px',
                borderRadius: 6,
                borderLeft: '3px solid var(--color-primary)',
              }}>
                {d.excerpt || d.summary || 'Trecho da decisão não disponível.'}
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {results.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => handleSearch(page - 1)}
                disabled={page <= 0 || loading}
                style={{
                  padding: '8px 16px', borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  fontSize: 12, fontWeight: 600,
                  cursor: page <= 0 || loading ? 'not-allowed' : 'pointer',
                  opacity: page <= 0 || loading ? 0.5 : 1,
                }}
              >
                ← Página Anterior
              </button>

              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
                Página {page + 1}
              </span>

              <button
                onClick={() => handleSearch(page + 1)}
                disabled={!meta.has_next_page || loading}
                style={{
                  padding: '8px 16px', borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  fontSize: 12, fontWeight: 600,
                  cursor: !meta.has_next_page || loading ? 'not-allowed' : 'pointer',
                  opacity: !meta.has_next_page || loading ? 0.5 : 1,
                }}
              >
                Próxima Página →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
