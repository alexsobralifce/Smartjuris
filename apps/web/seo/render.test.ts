// Render estático do blog: capa, fonte citada, JSON-LD e sitemap.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALL_PAGES, AREAS, paginaDoArtigo, type Page } from './content'
import { renderPage, renderSitemap } from './render'

const artigo = paginaDoArtigo({
  slug: 'prazo-recursal-em-dias-uteis',
  titulo: 'Prazo recursal em dias úteis muda a agenda do escritório',
  descricao: 'Entenda o que muda na contagem do prazo para recurso e como ajustar a agenda do escritório com segurança, passo a passo.',
  categoria: 'Prazos e processos',
  autor: 'Equipe SmartJuris',
  resumo: 'A contagem passa a ser em dias úteis. Revise a agenda do escritório.',
  secoes: [{ titulo: 'O que aconteceu', paragrafos: ['Segundo o Consultor Jurídico, algo mudou.'], lista: ['Item A'] }],
  faq: [{ q: 'Muda o prazo?', a: 'Sim.' }],
  fontes: [{ titulo: 'Consultor Jurídico: Novo prazo', url: 'https://www.conjur.com.br/2026-out-13/novo-prazo?a=1&b=2' }],
  imagem: '/blog/prazo-recursal-em-dias-uteis.webp',
  imagemAlt: 'Advogado confere prazos em um notebook',
  imagemCredito: 'Imagem ilustrativa gerada por IA',
  publicadoEm: '2026-10-14T12:00:00.000Z',
  atualizadoEm: '2026-10-15T09:00:00.000Z',
})

describe('artigo da curadoria', () => {
  test('mapeia para Page com data, recurso relacionado e fonte', () => {
    assert.equal(artigo.path, '/blog/prazo-recursal-em-dias-uteis')
    assert.equal(artigo.datePublished, '2026-10-14')
    assert.equal(artigo.dateModified, '2026-10-15')
    assert.ok(artigo.related?.includes('/recursos/gestao-de-processos'))
    assert.equal(artigo.sections[0].ul?.[0], 'Item A')
  })

  const html = renderPage(artigo)
  test('capa com alt, dimensões e crédito; og:image aponta para a capa', () => {
    assert.match(html, /<img src="\/blog\/prazo-recursal-em-dias-uteis\.webp" width="1200" height="800" alt="Advogado confere prazos em um notebook" fetchpriority="high"/)
    assert.match(html, /Imagem ilustrativa gerada por IA/)
    assert.match(html, /<meta property="og:image" content="https:\/\/www\.smartjuris\.com\.br\/blog\/prazo-recursal-em-dias-uteis\.webp">/)
  })
  test('cita a fonte com link seguro e escapa a URL', () => {
    assert.match(html, /<h2 style="margin-top:0">Fonte<\/h2>/)
    assert.match(html, /href="https:\/\/www\.conjur\.com\.br\/2026-out-13\/novo-prazo\?a=1&amp;b=2" rel="noopener noreferrer"/)
  })
  test('BlogPosting traz imagem, dateModified, citation e autor', () => {
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
    const post = ld.find(x => x['@type'] === 'BlogPosting')
    assert.equal(post.image, 'https://www.smartjuris.com.br/blog/prazo-recursal-em-dias-uteis.webp')
    assert.equal(post.dateModified, '2026-10-15')
    assert.deepEqual(post.citation, ['https://www.conjur.com.br/2026-out-13/novo-prazo?a=1&b=2'])
    assert.equal(post.author.name, 'Equipe SmartJuris')
  })
  test('página sem capa usa a og-image padrão e não cria <figure>', () => {
    const sem: Page = { ...artigo, image: undefined, sources: undefined }
    const h = renderPage(sem)
    assert.doesNotMatch(h, /<figure/)
    assert.doesNotMatch(h, />Fonte</)
    assert.match(h, /og:image" content="https:\/\/www\.smartjuris\.com\.br\/og-image\.png"/)
  })
})

describe('sitemap', () => {
  test('inclui páginas fixas e usa data de modificação (não a do build) nos posts', () => {
    const xml = renderSitemap(new Date('2030-01-01T00:00:00Z'))
    assert.match(xml, /<loc>https:\/\/www\.smartjuris\.com\.br\/blog\/ia-na-advocacia-supervisao-humana-e-etica-oab<\/loc><lastmod>2026-09-20<\/lastmod>/)
    assert.match(xml, /<loc>https:\/\/www\.smartjuris\.com\.br\/planos<\/loc><lastmod>2030-01-01<\/lastmod>/)
  })
})

describe('páginas por área do Direito', () => {
  const modelos = readFileSync(new URL('../../api/src/services/modelosPeca.ts', import.meta.url), 'utf8')
  const areaDoModelo: Record<string, string> = {
    '/software-para-advogado-trabalhista': 'Trabalhista',
    '/software-para-advogado-previdenciario': 'Previdenciário',
    '/software-para-advogado-de-familia': 'Família',
    '/software-para-advogado-civel': 'Cível',
    '/software-para-advogado-consumerista': 'Consumerista',
    '/software-para-advogado-tributarista': 'Tributário',
  }
  const todas = ALL_PAGES.map(p => p.path)
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

  test('são 6, entram no sitemap e têm título e descrição únicos e dentro do limite', () => {
    assert.equal(AREAS.length, 6)
    const xml = renderSitemap(new Date('2026-10-14T00:00:00Z'))
    for (const a of AREAS) {
      assert.ok(xml.includes(`<loc>https://www.smartjuris.com.br${a.path}</loc>`), a.path)
      assert.ok(a.title.length <= 65, `${a.path} título com ${a.title.length}`)
      assert.ok(a.description.length >= 120 && a.description.length <= 160, `${a.path} descrição com ${a.description.length}`)
    }
    assert.equal(new Set(AREAS.map(a => a.title)).size, 6)
    assert.equal(new Set(AREAS.map(a => a.description)).size, 6)
    assert.equal(new Set(AREAS.map(a => a.h1)).size, 6)
  })
  test('toda peça citada existe nos modelos do gerador, na área certa', () => {
    for (const a of AREAS) {
      const area = areaDoModelo[a.path]
      assert.ok(area, `área mapeada para ${a.path}`)
      const lista = a.sections[0].ul ?? []
      assert.ok(lista.length >= 8, `${a.path} tem peças`)
      for (const peca of lista) {
        const existe = new RegExp(`area: '${area}',\\s*\\n\\s*tipo: '${escapar(peca)}'`).test(modelos)
        assert.ok(existe, `${a.path}: "${peca}" não existe nos modelos de ${area}`)
      }
    }
  })
  test('links internos existem, há FAQ e a seção de rotina é exclusiva de cada página', () => {
    for (const a of AREAS) {
      for (const r of a.related ?? []) assert.ok(todas.includes(r), `${a.path} → ${r} não existe`)
      assert.ok((a.faq?.length ?? 0) >= 3)
    }
    assert.equal(new Set(AREAS.map(a => a.sections[1].p?.join(' '))).size, 6)
  })
  test('sem promessa de resultado nem termos vedados pela OAB', () => {
    const proibido = /causa ganha|resultado garantido|ganho garantido|100\s?%|o melhor advogado|sucesso garantido/i
    for (const a of AREAS) {
      const texto = renderPage(a).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
      assert.doesNotMatch(texto, proibido, a.path)
    }
  })
  test('faixa de preços vem de site.ts', () => {
    assert.match(renderPage(AREAS[0]), /R\$ 180 a R\$ 500 por mês/)
  })
})
