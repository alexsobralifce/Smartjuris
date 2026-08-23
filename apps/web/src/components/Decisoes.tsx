import { useState, useEffect } from 'react'
import { api, Court, Decision, SearchDecisionsResult } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import { Button, EmptyState, FONT, Field, inputStyle, PageContainer, PageHeader, RADIUS, SPACE, useIsMobile } from '../ui'

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
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<'search' | 'lookup'>('search')
  const [portalUrl, setPortalUrl] = useState<string>('https://jurisprudencias.ai/')
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

  // Fase 6F — link do portal do provedor (fallback para a URL pública fixa).
  useEffect(() => {
    api.jurisprudencias.portal()
      .then((res: { url?: string }) => {
        if (res?.url) setPortalUrl(res.url)
      })
      .catch(() => { /* fallback: mantém https://jurisprudencias.ai/ */ })
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
    <PageContainer>
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
        {/* Header */}
        <PageHeader
          eyebrow="DECISÕES & TRIBUNAIS"
          title="Decisões & Tribunais"
          description="Consulta direta em tempo real a 16 tribunais e conselhos federais via Jurisprudências.ai Live API."
          action={(
            <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
              {/* Fase 6F — acesso ao portal do provedor (gestão de conta/planos/rate limit). */}
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: FONT.sm, textDecoration: 'none', alignSelf: 'center', fontWeight: 600 }}
              >
                Acessar Jurisprudências.ai ↗
              </a>
              <Button
                size="sm"
                variant={activeTab === 'search' ? 'primary' : 'secondary'}
                onClick={() => setActiveTab('search')}
              >
                🔍 Busca por Termo / Tese
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'lookup' ? 'primary' : 'secondary'}
                onClick={() => setActiveTab('lookup')}
              >
                #️⃣ Consulta por Número
              </Button>
            </div>
          )}
        />

        {/* Main Search Controls Box */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.card,
          padding: SPACE.xxl,
        }}>
          {activeTab === 'search' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              {/* Top Bar: Court selector + Search Input */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr auto', gap: SPACE.md, alignItems: 'center' }}>
                {/* Tribunal Selector */}
                <Field label="TRIBUNAL DE ORIGEM">
                  <select
                    value={selectedCourt}
                    onChange={e => setSelectedCourt(e.target.value)}
                    style={inputStyle()}
                  >
                    {courts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.abbreviation} — {c.name.length > 25 ? c.name.slice(0, 25) + '...' : c.name} ({c.decisions_count ? Number(c.decisions_count).toLocaleString('pt-BR') : ''})
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Query Input */}
                <Field label="TERMOS, EMENTA, TESE OU PALAVRAS-CHAVE">
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch(0)}
                      placeholder='Ex: "dano moral" negativação SPC -material (use "aspas", OR, -excluir)'
                      style={inputStyle()}
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          background: 'transparent', border: 'none', color: 'var(--color-muted)',
                          cursor: 'pointer', fontSize: FONT.lg, padding: 4,
                        }}
                      >✕</button>
                    )}
                  </div>
                </Field>

                {/* Search Button */}
                <div style={{ alignSelf: 'flex-end' }}>
                  <Button
                    onClick={() => handleSearch(0)}
                    disabled={loading}
                    style={{ width: isMobile ? '100%' : undefined }}
                  >
                    {loading ? (
                      <>
                        <div style={{ width: 14, height: 14, border: '2px solid var(--color-on-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
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
                  </Button>
                </div>
              </div>

              {/* Quick Suggestions & Filter Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.sm }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)', fontWeight: 500 }}>Sugestões rápidas:</span>
                  {QUICK_SUGGESTIONS.slice(0, 4).map(s => (
                    <button
                      key={s}
                      onClick={() => { setQuery(s); }}
                      style={{
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        borderRadius: RADIUS.chip,
                        padding: '2px 9px',
                        fontSize: FONT.sm,
                        color: 'var(--color-foreground)',
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  style={{ color: 'var(--color-primary)' }}
                >
                  {showFilters ? '▲ Ocultar Filtros de Data' : '▼ Filtros Avançados de Data'}
                </Button>
              </div>

              {/* Collapsible Filters */}
              {showFilters && (
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--color-surface-2)',
                  borderRadius: RADIUS.card,
                  border: '1px solid var(--color-border)',
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                  gap: SPACE.md,
                }}>
                  <Field label="Publicação De">
                    <input type="date" value={pubFrom} onChange={e => setPubFrom(e.target.value)} style={inputStyle()} />
                  </Field>
                  <Field label="Publicação Até">
                    <input type="date" value={pubTo} onChange={e => setPubTo(e.target.value)} style={inputStyle()} />
                  </Field>
                  <Field label="Julgamento De">
                    <input type="date" value={trialFrom} onChange={e => setTrialFrom(e.target.value)} style={inputStyle()} />
                  </Field>
                  <Field label="Julgamento Até">
                    <input type="date" value={trialTo} onChange={e => setTrialTo(e.target.value)} style={inputStyle()} />
                  </Field>
                </div>
              )}
            </div>
          ) : (
            /* Lookup by Process Number */
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr auto', gap: SPACE.md, alignItems: 'center' }}>
              <Field label="TRIBUNAL">
                <select
                  value={selectedCourt}
                  onChange={e => setSelectedCourt(e.target.value)}
                  style={inputStyle()}
                >
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.abbreviation} — {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="NÚMERO DO PROCESSO / REGISTRO">
                <input
                  type="text"
                  value={lookupNumber}
                  onChange={e => setLookupNumber(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  placeholder="Ex: 0123456-78.2023.8.26.0100 ou 202401136976"
                  style={inputStyle()}
                />
              </Field>

              <div style={{ alignSelf: 'flex-end' }}>
                <Button
                  onClick={handleLookup}
                  disabled={lookupLoading}
                  style={{ width: isMobile ? '100%' : undefined }}
                >
                  {lookupLoading ? 'Consultando...' : 'Consultar Decisão'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Results Header / Stats */}
        {searched && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.sm }}>
            <div style={{ fontSize: FONT.md, color: 'var(--color-muted)' }}>
              Exibindo resultados para <strong style={{ color: 'var(--color-foreground)' }}>"{lastQuery}"</strong> no tribunal{' '}
              <span style={{
                background: 'var(--color-surface-2)', padding: '2px 8px', borderRadius: RADIUS.chip,
                fontWeight: 600, color: 'var(--color-primary)',
              }}>{currentCourt.abbreviation}</span>
            </div>

            <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
              Página {meta.page + 1}
            </div>
          </div>
        )}

        {/* Lookup Result Box */}
        {activeTab === 'lookup' && lookupResult && (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: RADIUS.card,
            padding: SPACE.xxl,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.lg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
                <span style={{
                  background: 'var(--color-accent)', color: 'var(--color-on-accent)',
                  fontSize: FONT.xs, fontWeight: 700, padding: '3px 8px', borderRadius: RADIUS.chip,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {selectedCourt.toUpperCase()}
                </span>
                <span style={{ fontSize: FONT.lg, fontWeight: 700, color: 'var(--color-foreground)' }}>
                  {lookupResult.process_type || 'Decisão Judicial'} · {lookupResult.process_number}
                </span>
              </div>

              <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={() => handleCopyCitation(lookupResult)}>
                  📋 Copiar Citação
                </Button>
                {lookupResult.url && (
                  <a
                    href={lookupResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'var(--color-primary)', color: 'var(--color-on-primary)', textDecoration: 'none',
                      padding: '6px 10px', borderRadius: RADIUS.control, fontSize: FONT.sm, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    Abrir no Tribunal ↗
                  </a>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: SPACE.sm, padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: RADIUS.control, marginBottom: SPACE.lg, fontSize: FONT.base }}>
              <div>
                <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: FONT.xs }}>Relator(a)</span>
                <strong>{lookupResult.rapporteur || 'Não informado'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: FONT.xs }}>Órgão Julgador</span>
                <strong>{lookupResult.adjudicating_body || 'Não informado'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: FONT.xs }}>Data de Julgamento</span>
                <strong>{lookupResult.trial_date || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-muted)', display: 'block', fontSize: FONT.xs }}>Data de Publicação</span>
                <strong>{lookupResult.publication_date || 'N/A'}</strong>
              </div>
            </div>

            <div>
              <div style={{ fontSize: FONT.sm, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.xs }}>Ementa / Decisão</div>
              <div style={{ fontSize: FONT.md, lineHeight: 1.6, color: 'var(--color-foreground)', background: 'var(--color-background)', padding: SPACE.lg, borderRadius: RADIUS.control, whiteSpace: 'pre-wrap' }}>
                {lookupResult.summary || lookupResult.excerpt || 'Sem ementa disponível.'}
              </div>
            </div>
          </div>
        )}

        {/* Decision Cards List */}
        {activeTab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
            {searched && !loading && results.length === 0 && (
              <EmptyState message="Nenhuma decisão encontrada para os critérios informados." icon="📜" />
            )}

            {results.map((d, index) => (
              <div
                key={d.process_number || index}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: RADIUS.card,
                  padding: '20px 24px',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                {/* Header of Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: SPACE.sm }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
                    <span style={{
                      background: 'var(--color-primary)', color: 'var(--color-on-primary)',
                      fontSize: FONT.xs, fontWeight: 700, padding: '2px 7px', borderRadius: RADIUS.chip,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {currentCourt.abbreviation}
                    </span>

                    <span style={{ fontSize: FONT.base, fontWeight: 700, color: 'var(--color-foreground)' }}>
                      {d.process_type || 'Decisão'}
                    </span>

                    <span style={{ fontSize: FONT.base, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                      nº {d.process_number}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopyCitation(d)}
                      title="Copiar citação com ementa formatada"
                    >
                      📋 Copiar Citação
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleUseInPeca(d)}
                      title="Enviar para o Gerador de Peças RAG"
                      style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', border: 'none' }}
                    >
                      ✍️ Usar na Peça
                    </Button>

                    {d.url && (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir inteiro teor no site oficial do Tribunal"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          padding: '5px 9px', borderRadius: RADIUS.control, fontSize: FONT.sm, fontWeight: 600,
                          color: 'var(--color-primary)', textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: SPACE.xs,
                        }}
                      >
                        Fonte Oficial ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Metadata Row */}
                <div style={{
                  display: 'flex', gap: SPACE.lg, flexWrap: 'wrap',
                  fontSize: FONT.sm, color: 'var(--color-muted)',
                  marginTop: SPACE.md, paddingBottom: SPACE.sm,
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
                  fontSize: FONT.base,
                  lineHeight: 1.6,
                  color: 'var(--color-foreground)',
                  background: 'var(--color-surface-2)',
                  padding: '12px 14px',
                  borderRadius: RADIUS.control,
                  borderLeft: '3px solid var(--color-primary)',
                  marginTop: SPACE.md,
                }}>
                  {d.excerpt || d.summary || 'Trecho da decisão não disponível.'}
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {results.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: SPACE.md }}>
                <Button variant="secondary" size="sm" onClick={() => handleSearch(page - 1)} disabled={page <= 0 || loading}>
                  ← Página Anterior
                </Button>

                <span style={{ fontSize: FONT.base, fontWeight: 600, color: 'var(--color-muted)' }}>
                  Página {page + 1}
                </span>

                <Button variant="secondary" size="sm" onClick={() => handleSearch(page + 1)} disabled={!meta.has_next_page || loading}>
                  Próxima Página →
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
