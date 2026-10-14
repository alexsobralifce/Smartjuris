import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getErrorMessage } from '../api/client'
import { Button, EmptyState, FONT, Field, inputStyle, Loading, Modal, RADIUS, SPACE, useIsMobile } from '../ui'

type Status = 'RASCUNHO' | 'PUBLICADO' | 'DESPUBLICADO'
type Toaster = (type: 'error' | 'success' | 'warning' | 'info', text: string) => void

interface ArtigoLista {
  id: string
  slug: string
  status: Status
  titulo: string
  descricao: string
  categoria: string
  origem: { veiculo: string; titulo: string; url: string } | null
  publicadoEm: string | null
  criadoEm: string
  temImagem: boolean
}
interface Secao { titulo: string; paragrafos: string[]; lista?: string[] }
interface ArtigoCompleto extends ArtigoLista {
  resumo: string
  secoes: Secao[]
  faq: Array<{ q: string; a: string }>
  imagemAlt: string | null
  imagemCredito: string | null
}
interface Execucao {
  id: string
  status: 'EXECUTANDO' | 'OK' | 'ERRO'
  origem: 'AGENDADA' | 'MANUAL'
  quantidade: number
  geradas: number
  erro: string | null
  iniciadoEm: string
  relatorio?: { descartadas?: Array<{ titulo: string; motivo: string }>; candidatos?: number } | null
}

const CATEGORIAS = ['IA na advocacia', 'Gestão do escritório', 'Prazos e processos', 'Jurimetria', 'Contratos', 'LGPD e ética']

const STATUS_COR: Record<Status, { bg: string; fg: string; label: string }> = {
  RASCUNHO: { bg: 'var(--color-warning-light)', fg: 'var(--color-warning)', label: 'Rascunho' },
  PUBLICADO: { bg: 'var(--color-success-light)', fg: 'var(--color-success)', label: 'Publicado' },
  DESPUBLICADO: { bg: 'var(--color-badge-tint)', fg: 'var(--color-muted)', label: 'Despublicado' },
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

/** Capa carregada com a sessão (cookie) e exibida via blob: funciona também em dev com origens diferentes. */
function Capa({ id, versao, altura = 90 }: { id: string; versao: number; altura?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let atual: string | null = null
    let cancelado = false
    api.raiz.blog.imagem(id).then(async (r) => {
      if (!r.ok || cancelado) return
      atual = URL.createObjectURL(await r.blob())
      setUrl(atual)
    }).catch(() => undefined)
    return () => { cancelado = true; if (atual) URL.revokeObjectURL(atual) }
  }, [id, versao])
  return url
    ? <img src={url} alt="" style={{ width: altura * 1.5, height: altura, objectFit: 'cover', borderRadius: RADIUS.control, display: 'block' }} />
    : <div style={{ width: altura * 1.5, height: altura, borderRadius: RADIUS.control, background: 'var(--color-surface-2)', border: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FONT.sm, color: 'var(--color-muted)', textAlign: 'center' }}>Sem capa</div>
}

export default function RootBlog({ addToast }: { addToast: Toaster }) {
  const isMobile = useIsMobile()
  const [artigos, setArtigos] = useState<ArtigoLista[]>([])
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [revisando, setRevisando] = useState<string | null>(null)
  const [versaoCapa, setVersaoCapa] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([api.raiz.blog.listar(), api.raiz.blog.execucoes()])
      setArtigos(Array.isArray(a) ? a : [])
      setExecucoes(Array.isArray(e) ? e : [])
    } catch {
      addToast('error', 'Erro ao carregar o blog.')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { carregar() }, [carregar])

  // Enquanto uma execução roda, atualiza a lista a cada 8 s.
  const rodando = execucoes.some((x) => x.status === 'EXECUTANDO')
  useEffect(() => {
    if (!rodando) return
    const t = setInterval(carregar, 8000)
    return () => clearInterval(t)
  }, [rodando, carregar])

  const executar = async (fn: () => Promise<Response>, ok: string, erro: string) => {
    const res = await fn()
    if (!res.ok) { addToast('error', await getErrorMessage(res, erro)); return false }
    addToast('success', ok)
    await carregar()
    return true
  }

  const gerar = async () => {
    setGerando(true)
    try { await executar(() => api.raiz.blog.gerarCuradoria(3), 'Curadoria iniciada: os rascunhos aparecem em alguns minutos.', 'Erro ao iniciar a curadoria.') }
    finally { setGerando(false) }
  }

  const alternar = async (a: ArtigoLista) => {
    const alvo: Status = a.status === 'PUBLICADO' ? 'DESPUBLICADO' : 'PUBLICADO'
    await executar(() => api.raiz.blog.status(a.id, alvo), alvo === 'PUBLICADO' ? 'Publicado. O site será atualizado em instantes.' : 'Despublicado.', 'Erro ao alterar status.')
  }

  const excluir = async (a: ArtigoLista) => {
    if (!window.confirm(`Excluir "${a.titulo}"? Esta ação não pode ser desfeita.`)) return
    await executar(() => api.raiz.blog.excluir(a.id), 'Artigo excluído.', 'Erro ao excluir.')
  }

  if (loading) return <Loading message="Carregando blog…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.lg, flexWrap: 'wrap' }}>
        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', maxWidth: 560 }}>
          Toda segunda-feira o robô gera 3 rascunhos a partir de notícias jurídicas. Confira cada texto contra a matéria original antes de publicar.
        </div>
        <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => executar(() => api.raiz.blog.republicarSite(), 'Redeploy do site solicitado.', 'Erro ao republicar o site.')}>Republicar site</Button>
          <Button onClick={gerar} disabled={gerando || rodando}>{rodando ? 'Curadoria em andamento…' : '+ Gerar curadoria agora'}</Button>
        </div>
      </div>

      {artigos.length === 0 ? (
        <EmptyState message="Nenhum artigo ainda. Gere a primeira curadoria para criar rascunhos." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {artigos.map((a) => {
            const cor = STATUS_COR[a.status]
            return (
              <div key={a.id} style={{ display: 'flex', gap: SPACE.lg, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.lg, flexDirection: isMobile ? 'column' : 'row' }}>
                <Capa id={a.id} versao={versaoCapa} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: SPACE.xs }}>
                    <span style={{ background: cor.bg, color: cor.fg, fontSize: FONT.sm, fontWeight: 600, padding: '2px 8px', borderRadius: RADIUS.chip }}>{cor.label}</span>
                    <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{a.categoria} · criado em {fmt(a.criadoEm)}{a.publicadoEm ? ` · publicado em ${fmt(a.publicadoEm)}` : ''}</span>
                  </div>
                  <div style={{ fontSize: FONT.xl, fontWeight: 600, marginBottom: SPACE.xs }}>{a.titulo}</div>
                  <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.sm }}>{a.descricao}</div>
                  {a.origem && (
                    <div style={{ fontSize: FONT.base }}>
                      Fonte: <a href={a.origem.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{a.origem.veiculo} — {a.origem.titulo}</a>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'stretch' }}>
                  <Button size="sm" variant="secondary" onClick={() => setRevisando(a.id)}>Revisar / editar</Button>
                  <Button size="sm" onClick={() => alternar(a)} disabled={a.status !== 'PUBLICADO' && !a.temImagem} title={!a.temImagem && a.status !== 'PUBLICADO' ? 'Gere ou envie a capa antes de publicar' : undefined}>
                    {a.status === 'PUBLICADO' ? 'Despublicar' : 'Publicar'}
                  </Button>
                  {a.status !== 'PUBLICADO' && <Button size="sm" variant="ghost" onClick={() => excluir(a)}>Excluir</Button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.02em', marginBottom: SPACE.md }}>Execuções do robô</div>
        {execucoes.length === 0 ? (
          <div style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>Nenhuma execução registrada.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
            {execucoes.map((x) => (
              <div key={x.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.md, fontSize: FONT.base }}>
                <strong>{fmt(x.iniciadoEm)}</strong> · {x.origem === 'AGENDADA' ? 'Agendada' : 'Manual'} · {x.status === 'EXECUTANDO' ? 'em andamento…' : x.status === 'OK' ? `${x.geradas}/${x.quantidade} rascunhos` : 'erro'}
                {x.erro && <div style={{ color: 'var(--color-danger)', marginTop: SPACE.xs }}>{x.erro}</div>}
                {x.relatorio?.descartadas?.length ? (
                  <details style={{ marginTop: SPACE.xs, color: 'var(--color-muted)' }}>
                    <summary style={{ cursor: 'pointer' }}>{x.relatorio.descartadas.length} descartadas pelo robô</summary>
                    {x.relatorio.descartadas.map((d, i) => <div key={i} style={{ marginTop: 4 }}>• {d.titulo} — {d.motivo}</div>)}
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {revisando && (
        <Revisao
          id={revisando}
          addToast={addToast}
          versaoCapa={versaoCapa}
          onClose={() => setRevisando(null)}
          onMudou={() => { setVersaoCapa((v) => v + 1); carregar() }}
        />
      )}
    </div>
  )
}

function Revisao({ id, addToast, versaoCapa, onClose, onMudou }: { id: string; addToast: Toaster; versaoCapa: number; onClose: () => void; onMudou: () => void }) {
  const [a, setA] = useState<ArtigoCompleto | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  useEffect(() => { api.raiz.blog.obter(id).then(setA).catch(() => addToast('error', 'Erro ao abrir o artigo.')) }, [id, addToast])

  const set = <K extends keyof ArtigoCompleto>(k: K, v: ArtigoCompleto[K]) => setA((p) => (p ? { ...p, [k]: v } : p))
  const setSecao = (i: number, patch: Partial<Secao>) => setA((p) => (p ? { ...p, secoes: p.secoes.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : p))

  const salvar = async () => {
    if (!a) return
    setSalvando(true)
    const res = await api.raiz.blog.editar(id, {
      titulo: a.titulo, descricao: a.descricao, resumo: a.resumo, categoria: a.categoria, imagemAlt: a.imagemAlt ?? undefined,
      secoes: a.secoes.map((s) => ({ titulo: s.titulo, paragrafos: s.paragrafos.filter((p) => p.trim()), lista: (s.lista ?? []).filter((l) => l.trim()) })),
      faq: a.faq.filter((f) => f.q.trim() && f.a.trim()),
    })
    setSalvando(false)
    if (!res.ok) { addToast('error', await getErrorMessage(res, 'Erro ao salvar.')); return }
    addToast('success', 'Alterações salvas.')
    onMudou()
  }

  const regenerar = async () => {
    setOcupado(true)
    const res = await api.raiz.blog.regenerarImagem(id)
    setOcupado(false)
    if (!res.ok) { addToast('error', await getErrorMessage(res, 'Erro ao gerar a capa.')); return }
    addToast('success', 'Nova capa gerada.')
    onMudou()
  }

  const enviar = async (f: File | undefined) => {
    if (!f) return
    setOcupado(true)
    const res = await api.raiz.blog.enviarImagem(id, f)
    setOcupado(false)
    if (!res.ok) { addToast('error', await getErrorMessage(res, 'Erro ao enviar a capa.')); return }
    addToast('success', 'Capa enviada.')
    onMudou()
  }

  return (
    <Modal open onClose={onClose} title="Revisar artigo" width={820}
      footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><Button onClick={salvar} disabled={salvando || !a}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Button></>}>
      {!a ? <Loading message="Carregando…" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {a.origem && (
            <div style={{ background: 'var(--color-accent-light)', borderRadius: RADIUS.card, padding: SPACE.md, fontSize: FONT.base }}>
              Confira o texto com a matéria original:{' '}
              <a href={a.origem.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{a.origem.veiculo} — {a.origem.titulo}</a>
            </div>
          )}
          <div style={{ display: 'flex', gap: SPACE.lg, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Capa id={id} versao={versaoCapa} altura={120} />
            <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={regenerar} disabled={ocupado}>{ocupado ? 'Aguarde…' : 'Regenerar capa (IA)'}</Button>
              <Button size="sm" variant="secondary" onClick={() => arquivo.current?.click()} disabled={ocupado}>Enviar capa</Button>
              <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </div>
          <Field label={`Título (${a.titulo.length}/60)`}><input value={a.titulo} onChange={(e) => set('titulo', e.target.value)} style={inputStyle()} /></Field>
          <Field label={`Descrição para o Google (${a.descricao.length} caracteres, ideal 120–155)`}><textarea value={a.descricao} onChange={(e) => set('descricao', e.target.value)} rows={2} style={inputStyle()} /></Field>
          <Field label="Categoria">
            <select value={a.categoria} onChange={(e) => set('categoria', e.target.value)} style={inputStyle()}>
              {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Resumo (resposta direta)"><textarea value={a.resumo} onChange={(e) => set('resumo', e.target.value)} rows={2} style={inputStyle()} /></Field>
          <Field label="Texto alternativo da capa"><input value={a.imagemAlt ?? ''} onChange={(e) => set('imagemAlt', e.target.value)} style={inputStyle()} /></Field>
          {a.secoes.map((s, i) => (
            <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
              <Field label={`Seção ${i + 1} — título`}><input value={s.titulo} onChange={(e) => setSecao(i, { titulo: e.target.value })} style={inputStyle()} /></Field>
              <Field label="Parágrafos (separe com uma linha em branco)">
                <textarea value={s.paragrafos.join('\n\n')} onChange={(e) => setSecao(i, { paragrafos: e.target.value.split(/\n{2,}/) })} rows={6} style={inputStyle()} />
              </Field>
              <Field label="Lista (um item por linha)">
                <textarea value={(s.lista ?? []).join('\n')} onChange={(e) => setSecao(i, { lista: e.target.value.split('\n') })} rows={3} style={inputStyle()} />
              </Field>
            </div>
          ))}
          {a.faq.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
              <div style={{ fontSize: FONT.md, fontWeight: 600 }}>Perguntas frequentes</div>
              {a.faq.map((f, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                  <input value={f.q} onChange={(e) => set('faq', a.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} style={inputStyle()} aria-label={`Pergunta ${i + 1}`} />
                  <textarea value={f.a} onChange={(e) => set('faq', a.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={2} style={inputStyle()} aria-label={`Resposta ${i + 1}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
