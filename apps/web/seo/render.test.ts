// Render estático do blog: capa, fonte citada, JSON-LD e sitemap.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { paginaDoArtigo, type Page } from './content'
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
