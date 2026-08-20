import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import type { Peca } from '@lexia/shared'
import Toast, { ToastMessage } from './Toast'
import EditorRico, { plainToHtml } from './EditorRico'
import { Button, EmptyState, FONT, inputStyle, RADIUS, SPACE, useIsMobile } from '../ui'

const pecaTexto = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO...

FERNANDA OLIVEIRA, brasileira, solteira, vem apresentar RECLAMAÇÃO TRABALHISTA em face de EMPRESA XYZ S.A., pelos fatos e fundamentos a seguir.

I — DOS FATOS

A Reclamante foi admitida em 15/03/2019, percebendo salário de R$ 8.500,00, e foi dispensada sem justa causa em 10/07/2024, sem o pagamento das verbas rescisórias devidas...

II — DO DIREITO

Nos termos da Súmula 291 do TST, a supressão de horas extraordinárias habituais gera direito à indenização...`

export default function Validacao() {
  const isMobile = useIsMobile()
  const [pecas, setPecas] = useState<Peca[]>([])
  const [selected, setSelected] = useState<Peca | null>(null)
  const [comment, setComment] = useState('')
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null)
  const [editJson, setEditJson] = useState<any>(null)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const reload = async () => {
    try {
      const todas = await api.pecas.list()
      const fila = (Array.isArray(todas) ? todas : []).filter((p: Peca) => p.status === 'revisao' || p.status === 'aprovado')
      setPecas(fila)
      setSelected(prev => prev ? fila.find((p: Peca) => p.id === prev.id) ?? fila[0] ?? null : fila[0] ?? null)
    } catch (e) {
      console.error(e)
      addToast('error', 'Não foi possível carregar a fila de validação.')
    }
  }

  useEffect(() => { reload() }, [])

  // Ao trocar de peça, descarta edições do editor anterior.
  useEffect(() => { setEditJson(null) }, [selected?.id])

  const handle = async (action: 'aprovado' | 'reprovado') => {
    if (!selected) return
    try {
      const res = await api.pecas.update(selected.id, { status: action })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao atualizar a peça.'))
        return
      }
      await reload()
      setComment('')
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao atualizar a peça.')
    }
  }

  const pendentes = pecas.filter(p => p.status === 'revisao').length

  const handleDownload = async (format: 'pdf' | 'docx') => {
    if (!selected) return
    setDownloading(format)
    try {
      await api.pecas.export(selected.id, format)
    } catch (e) {
      console.error(e)
      addToast('error', 'Falha ao baixar o arquivo.')
    } finally {
      setDownloading(null)
    }
  }

  const handleSalvarEdicoes = async () => {
    if (!selected || !editJson) return
    try {
      const res = await api.pecas.update(selected.id, { conteudoRico: editJson })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao salvar edições.'))
        return
      }
      addToast('success', 'Edições salvas.')
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao salvar edições.')
    }
  }

  const renderDownloadButtons = () => (
    <>
      <Button
        size="sm"
        onClick={() => handleDownload('pdf')}
        disabled={downloading !== null}
      >
        {downloading === 'pdf' ? 'Baixando…' : 'Baixar PDF'}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => handleDownload('docx')}
        disabled={downloading !== null}
      >
        {downloading === 'docx' ? 'Baixando…' : 'Baixar DOCX'}
      </Button>
    </>
  )

  return (
    <div style={{
      display: 'flex',
      height: isMobile ? 'auto' : '100vh',
      overflow: isMobile ? 'visible' : 'hidden',
      flexDirection: isMobile ? 'column' : 'row',
    }}>
      {/* Queue list */}
      <div style={{
        width: isMobile ? '100%' : 320,
        borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
        borderBottom: isMobile ? '1px solid var(--color-border)' : 'none',
        background: 'var(--color-surface)',
        overflowY: 'auto',
        flexShrink: 0,
        ...(isMobile ? { maxHeight: '40vh' } : {}),
      }}>
        <div style={{ padding: isMobile ? `${SPACE.lg}px` : '24px 20px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.xs }}>
            FILA DE VALIDAÇÃO
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em' }}>Fila de Revisão</div>
          <div style={{ color: 'var(--color-muted)', fontSize: FONT.base, marginTop: 2 }}>{pendentes} peça{pendentes !== 1 ? 's' : ''} aguardando</div>
        </div>
        {pecas.length === 0 && (
          <EmptyState message="Nenhuma peça na fila." />
        )}
        {pecas.map(item => (
          <div key={item.id}
            onClick={() => setSelected(item)}
            style={{
              padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
              cursor: 'pointer', transition: 'background 0.1s',
              background: selected?.id === item.id ? 'var(--color-badge-tint)' : 'transparent',
              borderLeft: selected?.id === item.id ? '3px solid var(--color-primary)' : '3px solid transparent',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)' }}>{item.id}</div>
              {item.status === 'revisao'
                ? <span style={{ fontSize: FONT.xs, fontWeight: 700, color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '2px 8px', borderRadius: RADIUS.chip }}>Pendente</span>
                : <span style={{ fontSize: FONT.xs, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '2px 8px', borderRadius: RADIUS.chip }}>✓ Aprovado</span>}
            </div>
            <div style={{ fontSize: FONT.md, fontWeight: 600, marginBottom: 3 }}>{item.tipo}</div>
            <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginBottom: 4 }}>{item.cliente}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: FONT.xs, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '1px 7px', borderRadius: RADIUS.chip }}>{item.area}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)' }}>prazo: {item.prazo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Review pane */}
      {selected ? (
        <div style={{ flex: 1, overflow: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: isMobile ? `${SPACE.lg}px` : '18px 28px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', flexWrap: 'wrap', gap: SPACE.md }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: FONT.lg }}>{selected.tipo} — {selected.cliente}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: 2 }}>
                {selected.processoId} · Gerado em {selected.geradoEm} · {selected.fontes} fontes RAG
              </div>
            </div>
            {selected.status === 'revisao' && (
              <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="sm" variant="danger" onClick={() => handle('reprovado')}>✕ Reprovar</Button>
                <Button
                  size="sm"
                  onClick={handleSalvarEdicoes}
                  disabled={!editJson}
                  style={{ background: 'var(--color-success)', color: 'var(--color-on-primary)', border: 'none' }}
                >
                  Salvar edições
                </Button>
                <Button size="sm" onClick={() => handle('aprovado')}>✓ Aprovar para Protocolo</Button>
                {renderDownloadButtons()}
              </div>
            )}
            {(selected.status === 'aprovado' || selected.status === 'protocolado') && (
              <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
                {selected.status === 'aprovado' && (
                  <span style={{ fontSize: FONT.base, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '6px 14px', borderRadius: RADIUS.control }}>✓ Aprovado</span>
                )}
                {renderDownloadButtons()}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? `${SPACE.lg}px` : '24px 28px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: SPACE.xl, alignItems: 'start' }}>
            <div>
              {selected.status === 'revisao' && (
                <div style={{ background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)', borderRadius: RADIUS.control, padding: '12px 16px', marginBottom: SPACE.lg, fontSize: FONT.base, display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
                  <span style={{ fontSize: FONT.xl }}>⚠</span>
                  <span><strong>Revisão humana obrigatória.</strong> Esta minuta foi gerada por IA e deve ser revisada antes do protocolo.</span>
                </div>
              )}
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xl }}>
                <EditorRico
                  key={selected.id}
                  initialContent={(selected as any).conteudoRico ?? plainToHtml(selected.conteudo || pecaTexto)}
                  onChange={setEditJson}
                  readOnly={selected.status !== 'revisao'}
                  minHeight={360}
                />
              </div>
              {selected.status === 'revisao' && (
                <div style={{ marginTop: SPACE.lg }}>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    placeholder="Adicionar comentário de revisão..."
                    rows={3}
                    style={{ ...inputStyle(), resize: 'none' }}
                  />
                </div>
              )}
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontSize: FONT.sm, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>Trilha de Auditoria</div>
              {[
                { time: selected.geradoEm, event: 'Geração concluída', detail: `${selected.modelo}` },
                { time: selected.geradoEm, event: `${selected.fontes} fontes recuperadas`, detail: 'RAG híbrido FAISS + BM25' },
                { time: selected.geradoEm, event: 'Enviado para revisão', detail: 'Dr. Marcos Costa' },
              ].map((ev, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)' }}>{ev.time.split(' ')[1] ?? ev.time}</span>
                    <span style={{ fontSize: FONT.sm, fontWeight: 500 }}>{ev.event}</span>
                  </div>
                  <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', paddingLeft: 40 }}>{ev.detail}</div>
                </div>
              ))}
              <div style={{ padding: '12px 16px', background: 'var(--color-surface-2)' }}>
                <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                  Modelo: {selected.modelo}<br/>
                  Fontes: {selected.fontes} chunks<br/>
                  Status atual: {selected.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: FONT.lg, minHeight: isMobile ? 240 : undefined }}>
          Selecione uma peça para revisar.
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
