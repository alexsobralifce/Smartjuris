import { useEffect, useRef, useState } from 'react'
import { api, getErrorMessage } from '../api/client'
import { Button, FONT, SPACE } from '../ui'

type Toaster = (type: 'error' | 'success' | 'warning' | 'info', text: string) => void

interface DocLegislacao {
  id: string
  nome: string
  colecao: string
  indexedStatus: string
  chunks: number | null
  createdAt: string
}

const COLECOES = ['Legislação', 'Jurisprudência', 'Doutrina']

// Base Legislativa: PDFs válidos para todos os escritórios (somente root).
export default function RootLegislacao({ addToast }: { addToast: Toaster }) {
  const [docs, setDocs] = useState<DocLegislacao[]>([])
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [colecao, setColecao] = useState('Legislação')
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = async () => {
    try {
      const lista = await api.raiz.listLegislacao()
      setDocs(Array.isArray(lista) ? lista : [])
    } catch {
      addToast('error', 'Erro ao carregar a Base Legislativa.')
    }
  }

  useEffect(() => { carregar() }, [])

  const enviar = async () => {
    if (!arquivo) return
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('colecao', colecao)
      fd.append('file', arquivo, arquivo.name)
      const res = await api.raiz.uploadLegislacao(fd)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao indexar a legislação.'))
      } else {
        const body = await res.json()
        addToast(body.warning ? 'warning' : 'success', body.warning ?? `"${arquivo.name}" indexado para todos os escritórios.`)
        setArquivo(null)
        if (inputRef.current) inputRef.current.value = ''
        await carregar()
      }
    } catch {
      addToast('error', 'Erro ao indexar a legislação.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: SPACE.lg }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle }}>Base Legislativa</div>
        <div style={{ color: 'var(--color-muted)', fontSize: FONT.md, marginTop: 2 }}>
          Arquivos indexados aqui (PDF, DOCX, HTML, Markdown ou TXT) ficam disponíveis na busca RAG de todos os escritórios.
        </div>
        <div style={{ color: 'var(--color-muted)', fontSize: FONT.sm, marginTop: 6 }}>
          Escolha um arquivo para habilitar o botão de indexação.
        </div>
      </div>

      <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: SPACE.xl }}>
        <select value={colecao} onChange={(e) => setColecao(e.target.value)} disabled={enviando}
          style={{ height: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-foreground)' }}>
          {COLECOES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input ref={inputRef} type="file" accept=".pdf,.docx,.html,.htm,.md,.markdown,.txt" disabled={enviando}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} style={{ maxWidth: 280, fontSize: FONT.sm }} />
        <Button onClick={enviar} disabled={enviando || !arquivo}>{enviando ? 'Indexando...' : arquivo ? `+ Indexar ${arquivo.name}` : '+ Indexar arquivo'}</Button>
      </div>

      {docs.length === 0 ? (
        <div style={{ color: 'var(--color-muted)', fontSize: FONT.md }}>Nenhum documento na Base Legislativa.</div>
      ) : (
        <div style={{ display: 'grid', gap: SPACE.sm }}>
          {docs.map((d) => (
            <div key={d.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: SPACE.md, background: 'var(--color-surface)' }}>
              <div style={{ fontWeight: 600 }}>{d.nome}</div>
              <div style={{ color: 'var(--color-muted)', fontSize: FONT.sm }}>
                {d.colecao} · {d.indexedStatus} · {d.chunks ?? 0} trechos
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
