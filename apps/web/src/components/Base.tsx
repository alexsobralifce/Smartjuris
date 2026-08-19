import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import type { Documento } from '@lexia/shared'
import Pagination, { usePagination } from './Pagination'
import Toast, { ToastMessage } from './Toast'

const colecoes = [
  { id: 'previdenciario', nome: 'Legislação Previdenciária', lastSync: '19/08/2026 14:15', status: 'ok', desc: 'Lei 8.213/91, Lei 8.212/91, Decreto 3.048/99 (RPS), IN 128/22 INSS, Súmulas TNU e CRPS' },
  { id: 'legislacao',    nome: 'Legislação Federal Compilada', lastSync: '19/08/2026 14:00', status: 'ok', desc: 'CPC/2015, CLT, Código Civil, CDC, CF/88, CTN — BGE-M3 (1024d)' },
  { id: 'jurisprudencia', nome: 'Jurisprudência Oficial & Súmulas', lastSync: '19/08/2026 12:00', status: 'ok', desc: 'Súmulas Vinculantes STF, Súmulas STJ, TST, TNU e TJs' },
  { id: 'interno',       nome: 'Peças & Modelos do Escritório', lastSync: '18/08/2026 16:30', status: 'ok', desc: 'Peças aprovadas e protocoladas — estilo e teses proprietárias' },
  { id: 'clausulas',     nome: 'Banco de Cláusulas Contratuais', lastSync: '15/08/2026 10:00', status: 'ok', desc: 'Playbooks de minutas contratuais por ramo e tipo de risco' },
]

export default function Base() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadLabel, setUploadLabel] = useState('')
  const [done, setDone] = useState(false)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const reload = async () => {
    try {
      const docs = await api.documentos.list()
      setDocumentos(docs)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => { reload() }, [])

  const docsPagination = usePagination(documentos, 10)

  const contsPorColecao = colecoes.map(c => ({
    ...c,
    docs: documentos.filter(d => d.colecao === c.nome).length,
  }))

  const handleUpload = () => {
    setUploading(true)
    setDone(false)
    const steps: [number, string][] = [
      [25, 'Extraindo texto (Docling)...'],
      [50, 'Segmentando em chunks semânticos...'],
      [75, 'Gerando embeddings BGE-M3...'],
      [95, 'Indexando no vector store (FAISS)...'],
      [100, 'Indexado com sucesso!'],
    ]
    let i = 0
    const run = async () => {
      if (i < steps.length) {
        setUploadProgress(steps[i][0])
        setUploadLabel(steps[i][1])
        i++
        setTimeout(run, 800)
      } else {
        // Send actual mock API request
        try {
          const formData = new FormData()
          formData.append('colecao', 'Jurisprudência')
          // Append a dummy blob to simulate a file
          formData.append('file', new Blob(['fake-pdf-content'], { type: 'application/pdf' }), 'Documento-importado.pdf')
          const res = await api.documentos.upload(formData)
          if (!res.ok) {
            addToast('error', await getErrorMessage(res, 'Erro ao indexar documento.'))
          } else {
            await reload()
          }
        } catch (e) {
          console.error(e)
          addToast('error', 'Erro ao indexar documento.')
        }
        setTimeout(() => { setUploading(false); setDone(true) }, 400)
      }
    }
    run()
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Base de Conhecimento (RAG)</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>{documentos.length} documentos indexados · Motor: FAISS + BM25 hybrid · BGE-M3</div>
        </div>
        <button onClick={handleUpload} disabled={uploading} style={{
          background: 'var(--color-primary)', color: '#fff',
          border: 'none', padding: '9px 18px', borderRadius: 6,
          fontSize: 13, fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1,
        }}>+ Indexar Documentos</button>
      </div>

      {(uploading || done) && (
        <div style={{
          background: done ? 'var(--color-success-light)' : 'var(--color-surface)',
          border: `1px solid ${done ? '#6ee7b7' : 'var(--color-border)'}`,
          borderRadius: 8, padding: '18px 24px', marginBottom: 24,
        }}>
          {uploading && (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Indexando documentos...</div>
              <div style={{ height: 5, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.5s ease' }}/>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{uploadLabel}</div>
            </>
          )}
          {done && <div style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>✓ 3 documentos indexados e salvos na base.</div>}
        </div>
      )}

      {/* Collections */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12 }}>Coleções</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {contsPorColecao.map(c => (
            <div key={c.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                  background: c.status === 'ok' ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                  color: c.status === 'ok' ? 'var(--color-success)' : 'var(--color-warning)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>{c.status === 'ok' ? 'Atualizado' : 'Desatualizado'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 12, lineHeight: 1.5 }}>{c.desc}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.02em' }}>{c.docs}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>documentos</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>Último sync</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{c.lastSync}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent docs */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>
          Documentos Indexados ({documentos.length})
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2)' }}>
              {['Nome do Documento', 'Coleção', 'Tamanho', 'Chunks', 'Indexado em'].map(h => (
                <th key={h} style={{ padding: '8px 22px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docsPagination.pageItems.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--color-border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
              >
                <td style={{ padding: '12px 22px', fontSize: 13 }}>{d.nome}</td>
                <td style={{ padding: '12px 22px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 8px', borderRadius: 4 }}>{d.colecao}</span>
                </td>
                <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{d.tamanho}</td>
                <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.chunks}</td>
                <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{d.indexado}</td>
              </tr>
            ))}
            {documentos.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Nenhum documento indexado ainda.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination {...docsPagination} onPageChange={docsPagination.setPage} />
      </div>

      {/* Config */}
      <div style={{ marginTop: 20, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 24px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Configuração do Pipeline RAG</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Modelo de Embeddings', value: 'BGE-M3 (multilíngue)' },
            { label: 'Vector Store',          value: 'PostgreSQL (pgvector)' },
            { label: 'Chunk Size',            value: '512 tokens' },
            { label: 'Modelo de Geração',     value: 'DeepSeek' },
          ].map(c => (
            <div key={c.label} style={{ padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
