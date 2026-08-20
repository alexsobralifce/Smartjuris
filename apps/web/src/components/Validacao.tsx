import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import type { Peca } from '@lexia/shared'
import Toast, { ToastMessage } from './Toast'

const pecaTexto = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO...

FERNANDA OLIVEIRA, brasileira, solteira, vem apresentar RECLAMAÇÃO TRABALHISTA em face de EMPRESA XYZ S.A., pelos fatos e fundamentos a seguir.

I — DOS FATOS

A Reclamante foi admitida em 15/03/2019, percebendo salário de R$ 8.500,00, e foi dispensada sem justa causa em 10/07/2024, sem o pagamento das verbas rescisórias devidas...

II — DO DIREITO

Nos termos da Súmula 291 do TST, a supressão de horas extraordinárias habituais gera direito à indenização...`

export default function Validacao() {
  const [pecas, setPecas] = useState<Peca[]>([])
  const [selected, setSelected] = useState<Peca | null>(null)
  const [comment, setComment] = useState('')
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null)

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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Queue list */}
      <div style={{ width: 320, borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'auto' }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.02em' }}>Fila de Revisão</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 2 }}>{pendentes} peça{pendentes !== 1 ? 's' : ''} aguardando</div>
        </div>
        {pecas.length === 0 && (
          <div style={{ padding: '24px 20px', color: 'var(--color-muted)', fontSize: 13 }}>Nenhuma peça na fila.</div>
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>{item.id}</div>
              {item.status === 'revisao'
                ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '2px 8px', borderRadius: 4 }}>Pendente</span>
                : <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '2px 8px', borderRadius: 4 }}>✓ Aprovado</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{item.tipo}</div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>{item.cliente}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '1px 7px', borderRadius: 3 }}>{item.area}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>prazo: {item.prazo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Review pane */}
      {selected ? (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{selected.tipo} — {selected.cliente}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                {selected.processoId} · Gerado em {selected.geradoEm} · {selected.fontes} fontes RAG
              </div>
            </div>
            {selected.status === 'revisao' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handle('reprovado')} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--color-danger)' }}>
                  ✕ Reprovar
                </button>
                <button onClick={() => handle('aprovado')} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  ✓ Aprovar para Protocolo
                </button>
              </div>
            )}
            {(selected.status === 'aprovado' || selected.status === 'protocolado') && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selected.status === 'aprovado' && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '6px 14px', borderRadius: 6 }}>✓ Aprovado</span>
                )}
                <button
                  onClick={() => handleDownload('pdf')}
                  disabled={downloading !== null}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: downloading !== null ? 'not-allowed' : 'pointer', opacity: downloading !== null ? 0.5 : 1 }}
                >
                  {downloading === 'pdf' ? 'Baixando…' : 'Baixar PDF'}
                </button>
                <button
                  onClick={() => handleDownload('docx')}
                  disabled={downloading !== null}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-foreground)', fontSize: 12, fontWeight: 600, cursor: downloading !== null ? 'not-allowed' : 'pointer', opacity: downloading !== null ? 0.5 : 1 }}
                >
                  {downloading === 'docx' ? 'Baixando…' : 'Baixar DOCX'}
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
            <div>
              {selected.status === 'revisao' && (
                <div style={{ background: 'var(--color-warning-light)', border: '1px solid #fcd34d', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>⚠</span>
                  <span><strong>Revisão humana obrigatória.</strong> Esta minuta foi gerada por IA e deve ser revisada antes do protocolo.</span>
                </div>
              )}
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '28px 32px', fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 2, whiteSpace: 'pre-wrap' }}>
                {selected.conteudo || pecaTexto}
                <div style={{ marginTop: 24, borderTop: '1px dashed var(--color-border)', paddingTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>
                  [Gerado por IA — modelo={selected.modelo}, fontes={selected.fontes}, status={selected.status}]
                </div>
              </div>
              {selected.status === 'revisao' && (
                <div style={{ marginTop: 16 }}>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    placeholder="Adicionar comentário de revisão..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)', background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none', resize: 'none' }}
                  />
                </div>
              )}
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>Trilha de Auditoria</div>
              {[
                { time: selected.geradoEm, event: 'Geração concluída', detail: `${selected.modelo}` },
                { time: selected.geradoEm, event: `${selected.fontes} fontes recuperadas`, detail: 'RAG híbrido FAISS + BM25' },
                { time: selected.geradoEm, event: 'Enviado para revisão', detail: 'Dr. Marcos Costa' },
              ].map((ev, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>{ev.time.split(' ')[1] ?? ev.time}</span>
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{ev.event}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', paddingLeft: 40 }}>{ev.detail}</div>
                </div>
              ))}
              <div style={{ padding: '12px 16px', background: 'var(--color-surface-2)' }}>
                <div style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                  Modelo: {selected.modelo}<br/>
                  Fontes: {selected.fontes} chunks<br/>
                  Status atual: {selected.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 14 }}>
          Selecione uma peça para revisar.
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
