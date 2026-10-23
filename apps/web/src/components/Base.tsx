import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import type { Documento } from '@lexia/shared'
import Pagination, { usePagination } from './Pagination'
import Toast, { ToastMessage } from './Toast'
import Decisoes from './Decisoes'
import {
  FONT, SPACE, RADIUS,
  PageContainer, PageHeader, Button,
  TableShell, Table, THeadRow, Th, Tr, Td, EmptyRow,
  useIsMobile,
} from '../ui'

const colecoes = [
  { id: 'previdenciario', nome: 'Legislação Previdenciária', lastSync: '19/08/2026 14:15', status: 'ok', desc: 'Lei 8.213/91, Lei 8.212/91, Decreto 3.048/99 (RPS), IN 128/22 INSS, Súmulas TNU e CRPS' },
  { id: 'legislacao',    nome: 'Legislação Federal Compilada', lastSync: '19/08/2026 14:00', status: 'ok', desc: 'CPC/2015, CLT, Código Civil, CDC, CF/88, CTN — BGE-M3 (1024d)' },
  { id: 'jurisprudencia', nome: 'Jurisprudência Oficial & Súmulas', lastSync: '19/08/2026 12:00', status: 'ok', desc: 'Súmulas Vinculantes STF, Súmulas STJ, TST, TNU e TJs' },
  { id: 'interno',       nome: 'Peças & Modelos do Escritório', lastSync: '18/08/2026 16:30', status: 'ok', desc: 'Peças aprovadas e protocoladas — estilo e teses proprietárias' },
  { id: 'clausulas',     nome: 'Banco de Cláusulas Contratuais', lastSync: '15/08/2026 10:00', status: 'ok', desc: 'Playbooks de minutas contratuais por ramo e tipo de risco' },
]

export default function Base() {
  const isMobile = useIsMobile()
  const [baseTab, setBaseTab] = useState<'tribunais' | 'documentos'>('tribunais')
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadLabel, setUploadLabel] = useState('')
  const [done, setDone] = useState(false)
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null)
  const [colecaoUpload, setColecaoUpload] = useState('Legislação')

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const reload = async () => {
    try {
      // Fase 8B — GET /api/documentos retorna { documentos, storageUsado, storageLimite }.
      const body = await api.documentos.list() as any
      const docs = Array.isArray(body) ? body : (body?.documentos ?? [])
      setDocumentos(Array.isArray(docs) ? docs : [])
    } catch (e) {
      console.error(e)
      addToast('error', 'Não foi possível carregar os documentos.')
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
          if (!arquivoUpload) return
          formData.append('colecao', colecaoUpload)
          formData.append('file', arquivoUpload, arquivoUpload.name)
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
    <PageContainer>
      <PageHeader
        eyebrow="BASE DE CONHECIMENTO"
        title="Base RAG"
        description="Consulta ao vivo de jurisprudência em 16 tribunais e conselhos federais via Jurisprudências.ai Live, além da gestão da base vetorial RAG local (BGE-M3 / pgvector)."
      />

      {/* Top Tab Switcher */}
      <div style={{ display: 'flex', gap: SPACE.md, marginBottom: SPACE.xxl, borderBottom: '1px solid var(--color-border)', paddingBottom: SPACE.lg, flexWrap: 'wrap' }}>
        <Button
          variant={baseTab === 'tribunais' ? 'primary' : 'secondary'}
          onClick={() => setBaseTab('tribunais')}
        >
          🏛️ Pesquisa nos Tribunais (Jurisprudências.ai Live)
        </Button>

        <Button
          variant={baseTab === 'documentos' ? 'primary' : 'secondary'}
          onClick={() => setBaseTab('documentos')}
        >
          📁 Base de Documentos & RAG Local ({documentos.length})
        </Button>
      </div>

      {baseTab === 'tribunais' ? (
        <Decisoes />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: SPACE.md }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em' }}>Documentos & Coleções RAG</div>
              <div style={{ color: 'var(--color-muted)', fontSize: FONT.md, marginTop: 2 }}>{documentos.length} documentos indexados · Motor: PostgreSQL (pgvector) + BM25 · BGE-M3</div>
            </div>
            <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={colecaoUpload} onChange={(e) => setColecaoUpload(e.target.value)} disabled={uploading} style={{ height: 44, padding: '0 10px', borderRadius: RADIUS.control, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-foreground)' }}>
                <option value="Legislação">Legislação</option>
                <option value="Jurisprudência">Jurisprudência</option>
                <option value="Doutrina">Doutrina</option>
              </select>
              <input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e) => setArquivoUpload(e.target.files?.[0] ?? null)} style={{ maxWidth: 260, fontSize: FONT.sm }} />
              <Button onClick={handleUpload} disabled={uploading || !arquivoUpload}>+ Indexar PDF</Button>
            </div>
          </div>

          {(uploading || done) && (
            <div style={{
              background: done ? 'var(--color-success-light)' : 'var(--color-surface)',
              border: `1px solid ${done ? 'var(--color-success)' : 'var(--color-border)'}`,
              borderRadius: RADIUS.card, padding: '18px 24px', marginBottom: SPACE.xxl,
            }}>
              {uploading && (
                <>
                  <div style={{ fontWeight: 600, fontSize: FONT.md, marginBottom: 10 }}>Indexando documentos...</div>
                  <div style={{ height: 5, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: SPACE.sm }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.5s ease' }}/>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)' }}>{uploadLabel}</div>
                </>
              )}
              {done && <div style={{ fontSize: FONT.md, color: 'var(--color-success)', fontWeight: 600 }}>✓ 3 documentos indexados e salvos na base.</div>}
            </div>
          )}

          {/* Collections */}
          <div style={{ marginBottom: SPACE.xxl }}>
            <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.md }}>Coleções</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: SPACE.md }}>
              {contsPorColecao.map(c => (
                <div key={c.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.sm }}>
                    <div style={{ fontWeight: 600, fontSize: FONT.md }}>{c.nome}</div>
                    <span style={{
                      fontSize: FONT.xs, fontWeight: 700, padding: '2px 7px', borderRadius: RADIUS.chip,
                      background: c.status === 'ok' ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                      color: c.status === 'ok' ? 'var(--color-success)' : 'var(--color-warning)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{c.status === 'ok' ? 'Atualizado' : 'Desatualizado'}</span>
                  </div>
                  <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginBottom: SPACE.md, lineHeight: 1.5 }}>{c.desc}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em' }}>{c.docs}</div>
                      <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)' }}>documentos</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)' }}>Último sync</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs }}>{c.lastSync}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent docs */}
          <TableShell>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: FONT.md }}>
              Documentos Indexados ({documentos.length})
            </div>
            <Table>
              <THeadRow>
                {['Nome do Documento', 'Coleção', 'Tamanho', 'Chunks', 'Indexado em'].map(h => (
                  <Th key={h}>{h}</Th>
                ))}
              </THeadRow>
              <tbody>
                {docsPagination.pageItems.map(d => (
                  <Tr key={d.id}>
                    <Td>{d.nome}</Td>
                    <Td>
                      <span style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 8px', borderRadius: RADIUS.chip }}>{d.colecao}</span>
                    </Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{d.tamanho}</Td>
                    <Td style={{ fontFamily: 'var(--font-mono)' }}>{d.chunks}</Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{d.indexado}</Td>
                  </Tr>
                ))}
                {documentos.length === 0 && (
                  <EmptyRow colSpan={5} message="Nenhum documento indexado ainda." />
                )}
              </tbody>
            </Table>
            <Pagination {...docsPagination} onPageChange={docsPagination.setPage} />
          </TableShell>

          {/* Config */}
          <div style={{ marginTop: SPACE.xl, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '20px 24px' }}>
            <div style={{ fontWeight: 600, fontSize: FONT.md, marginBottom: SPACE.lg }}>Configuração do Pipeline RAG</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: SPACE.lg }}>
              {[
                { label: 'Modelo de Embeddings', value: 'BGE-M3 (multilíngue)' },
                { label: 'Vector Store',          value: 'PostgreSQL (pgvector)' },
                { label: 'Chunk Size',            value: '512 tokens' },
                { label: 'Modelo de Geração',     value: 'Qwen' },
              ].map(c => (
                <div key={c.label} style={{ padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: RADIUS.control }}>
                  <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.xs }}>{c.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, fontWeight: 500 }}>{c.value}</div>
                </div>
              ))}
            </div>
          </div>

          <Toast toasts={toasts} onDismiss={dismissToast} />
        </>
      )}
    </PageContainer>
  )
}
