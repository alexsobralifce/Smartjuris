// Sincroniza os artigos PUBLICADOS da API para o build estático do site:
//   seo/blog/<slug>.json  (dados do artigo)  +  public/blog/<slug>.<ext>  (capa)
// Variável: SINCRONIZAR_BLOG_API (ex.: https://smartjuris-api-production.up.railway.app).
// Sem variável ou com API fora do ar, os arquivos existentes são mantidos: o build nunca quebra por causa do blog.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dirDados = path.join(raiz, 'seo', 'blog')
const dirImagens = path.join(raiz, 'public', 'blog')
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

const api = (process.env.SINCRONIZAR_BLOG_API || '').replace(/\/$/, '')
if (!api) {
  console.log('[blog] SINCRONIZAR_BLOG_API não definida: mantendo artigos locais.')
  process.exit(0)
}

try {
  const resp = await fetch(`${api}/api/blog/artigos`, { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const artigos = await resp.json()
  if (!Array.isArray(artigos)) throw new Error('resposta inesperada')

  await mkdir(dirDados, { recursive: true })
  await mkdir(dirImagens, { recursive: true })
  const slugs = new Set()

  for (const a of artigos) {
    if (!/^[a-z0-9-]+$/.test(a.slug)) continue // defesa: slug vira nome de arquivo e URL
    let imagem = null
    if (a.imagemUrl) {
      const r = await fetch(`${api}${a.imagemUrl}`, { signal: AbortSignal.timeout(30_000) })
      const ext = EXT[(r.headers.get('content-type') || '').split(';')[0]]
      if (r.ok && ext) {
        await writeFile(path.join(dirImagens, `${a.slug}.${ext}`), Buffer.from(await r.arrayBuffer()))
        imagem = `/blog/${a.slug}.${ext}`
      }
    }
    const { imagemUrl, imagemMime, ...dados } = a
    await writeFile(path.join(dirDados, `${a.slug}.json`), JSON.stringify({ ...dados, imagem }, null, 2))
    slugs.add(a.slug)
  }

  // Espelha a API: remove o que foi despublicado.
  for (const arq of await readdir(dirDados)) {
    if (arq.endsWith('.json') && !slugs.has(arq.slice(0, -5))) await rm(path.join(dirDados, arq))
  }
  for (const arq of await readdir(dirImagens)) {
    if (!slugs.has(arq.replace(/\.[a-z]+$/, ''))) await rm(path.join(dirImagens, arq))
  }
  console.log(`[blog] ${slugs.size} artigo(s) sincronizado(s).`)
} catch (e) {
  console.warn(`[blog] sincronização ignorada (${e instanceof Error ? e.message : e}); mantendo artigos locais.`)
}
