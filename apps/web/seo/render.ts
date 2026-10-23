import { ALL_PAGES, AREAS, BLOG_TODOS, HOME_FAQ, RESOURCES, type Faq, type Page } from './content'
import {
  COMPANY,
  OG_IMAGE,
  PLANS,
  SAME_AS,
  SUPPORT_EMAIL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  WHATSAPP_DISPLAY,
  WHATSAPP_URL,
} from './site'

export const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// JSON-LD dentro de <script>: neutraliza "</script" e "<!--".
const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`

export const absolute = (path: string) => `${SITE_URL}${path === '/' ? '/' : path}`

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'

export const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/og-image.png`,
  ...(COMPANY.legalName ? { legalName: COMPANY.legalName } : {}),
  ...(COMPANY.cnpj ? { taxID: COMPANY.cnpj } : {}),
  ...(COMPANY.address ? { address: { '@type': 'PostalAddress', streetAddress: COMPANY.address, addressCountry: 'BR' } } : {}),
  ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: WHATSAPP_URL,
    email: SUPPORT_EMAIL,
    availableLanguage: 'pt-BR',
  },
}

export const softwareLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'SmartJuris LexOS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  inLanguage: 'pt-BR',
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  offers: PLANS.map(p => ({
    '@type': 'Offer',
    name: p.name,
    price: p.priceNumber,
    priceCurrency: 'BRL',
    url: `${SITE_URL}/planos`,
  })),
}

export const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'pt-BR',
}

const faqLd = (faq: Faq[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
})

const breadcrumbLd = (page: Page) => {
  const items: { name: string; path: string }[] = [{ name: 'Início', path: '/' }]
  if (page.path.startsWith('/blog/')) items.push({ name: 'Blog', path: '/blog' })
  items.push({ name: page.h1, path: page.path })
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absolute(it.path),
    })),
  }
}

const CSS = `
:root{--bg:#edf0f3;--surface:#f8fafc;--border:#d0d5dd;--fg:#1d2939;--muted:#667085;--primary:#1a2744;--on-primary:#fff;--accent:#c8a84b}
@media (prefers-color-scheme:dark){:root{--bg:#12141a;--surface:#1a1d26;--border:#2c313d;--fg:#e8eaf0;--muted:#9aa1b2;--primary:#c8a84b;--on-primary:#18170f;--accent:#c8a84b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:'Outfit',system-ui,sans-serif;line-height:1.7;font-size:17px}
a{color:var(--primary)}
header.site,footer.site{background:var(--surface);border-color:var(--border);border-style:solid;border-width:0 0 1px}
footer.site{border-width:1px 0 0;margin-top:48px}
.wrap{max-width:860px;margin:0 auto;padding:0 20px}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:14px;padding-bottom:14px}
.brand{font-family:'DM Serif Display',serif;font-size:22px;text-decoration:none;color:var(--fg)}
nav.main{display:flex;gap:18px;flex-wrap:wrap;font-size:15px}
nav.main a{text-decoration:none;color:var(--muted);padding:8px 0}
nav.main a:hover{color:var(--primary)}
h1{font-family:'DM Serif Display',serif;font-weight:400;font-size:clamp(30px,6vw,44px);line-height:1.15;margin:40px 0 16px}
h2{font-family:'DM Serif Display',serif;font-weight:400;font-size:26px;margin:36px 0 10px}
.lead{font-size:20px;color:var(--muted);margin:0 0 8px}
.meta{font-size:14px;color:var(--muted)}
.cta{display:inline-block;background:var(--primary);color:var(--on-primary);text-decoration:none;font-weight:600;padding:14px 26px;border-radius:8px;min-height:44px;margin:12px 0}
.box{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:22px;margin:24px 0}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:24px 0}
.plans .box{margin:0}
.price{font-size:28px;font-weight:600}
.skip{position:fixed;top:8px;left:8px;z-index:10;background:var(--primary);color:var(--on-primary);padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;transform:translateY(-200%)}
.skip:focus{transform:none}
ul.tight{padding-left:20px}
details{border-bottom:1px solid var(--border);padding:12px 0}
summary{cursor:pointer;font-weight:600}
footer.site .wrap{padding-top:28px;padding-bottom:28px;font-size:15px;color:var(--muted)}
footer.site nav{display:flex;flex-wrap:wrap;gap:8px 20px;margin-bottom:14px}
.cover{margin:24px 0}
.cover img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:12px;background:var(--surface)}
.cover figcaption{margin-top:6px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin:28px 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.card img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover}
.card-body{padding:16px 18px 18px}
.card h2{font-size:21px;margin:4px 0 8px}
.card h2 a{text-decoration:none}
.card p{margin:0}
`

const NAV = [
  { href: '/', label: 'Início' },
  { href: '/recursos/gerador-de-pecas-com-ia', label: 'Gerador de peças' },
  { href: '/planos', label: 'Planos' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQ' },
  { href: '/sobre', label: 'Sobre' },
  { href: '/contato', label: 'Contato' },
]

const section = (s: { h2: string; p?: string[]; ul?: string[] }) =>
  `<section><h2>${esc(s.h2)}</h2>${(s.p ?? []).map(t => `<p>${esc(t)}</p>`).join('')}${
    s.ul ? `<ul class="tight">${s.ul.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''
  }</section>`

const faqHtml = (faq: Faq[]) =>
  `<section><h2>Perguntas frequentes</h2>${faq
    .map(f => `<details open><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
    .join('')}</section>`

const plansHtml = () =>
  `<div class="plans">${PLANS.map(
    p => `<div class="box"><h2 style="margin-top:0">${esc(p.name)}</h2><p class="meta">${esc(p.audience)}</p><p class="price">${esc(p.price)}<span class="meta"> /mês</span></p><p><strong>${esc(p.limit)}</strong></p><ul class="tight">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`,
  ).join('')}</div>`

const companyHtml = () => {
  const rows = [
    ['Razão social', COMPANY.legalName],
    ['CNPJ', COMPANY.cnpj],
    ['Endereço', COMPANY.address],
    ['Responsável', COMPANY.responsible],
  ].filter(([, v]) => v)
  return rows.length
    ? `<ul class="tight">${rows.map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join('')}</ul>`
    : ''
}

const contactHtml = () =>
  `<div class="box"><h2 style="margin-top:0">Atendimento</h2><ul class="tight"><li><strong>WhatsApp:</strong> <a href="${WHATSAPP_URL}" rel="noopener">${esc(WHATSAPP_DISPLAY)}</a></li><li><strong>E-mail:</strong> <a href="mailto:${SUPPORT_EMAIL}">${esc(SUPPORT_EMAIL)}</a></li></ul>${companyHtml()}</div>`

const cta = () =>
  `<div class="box"><strong>Pronto para testar?</strong><p>Crie a conta do seu escritório e comece a usar o SmartJuris.</p><a class="cta" href="/">Começar agora</a> <a href="${WHATSAPP_URL}" rel="noopener">Falar com o suporte no WhatsApp</a></div>`

const byPath = new Map(ALL_PAGES.map(p => [p.path, p]))

const relatedHtml = (paths: string[] = []) => {
  const items = paths.map(p => byPath.get(p)).filter((p): p is Page => Boolean(p))
  if (!items.length) return ''
  return `<section><h2>Leia também</h2><ul class="tight">${items
    .map(p => `<li><a href="${p.path}">${esc(p.h1)}</a></li>`)
    .join('')}</ul></section>`
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

const blogListHtml = () =>
  `<div class="cards">${BLOG_TODOS.map(
    p =>
      `<article class="card">${
        p.image
          ? `<a href="${p.path}"><img src="${esc(p.image)}" width="1200" height="800" alt="${esc(p.imageAlt ?? p.h1)}" loading="lazy" decoding="async"></a>`
          : ''
      }<div class="card-body">${
        p.category ? `<p class="meta">${esc(p.category)}${p.datePublished ? ` · ${dataBr(p.datePublished)}` : ''}</p>` : ''
      }<h2><a href="${p.path}">${esc(p.h1)}</a></h2><p>${esc(p.description)}</p></div></article>`,
  ).join('')}</div>`

const coverHtml = (p: Page) =>
  p.image
    ? `<figure class="cover"><img src="${esc(p.image)}" width="1200" height="800" alt="${esc(p.imageAlt ?? p.h1)}" fetchpriority="high" decoding="async">${
        p.imageCredit ? `<figcaption class="meta">${esc(p.imageCredit)}</figcaption>` : ''
      }</figure>`
    : ''

const sourcesHtml = (p: Page) =>
  p.sources?.length
    ? `<section class="box"><h2 style="margin-top:0">Fonte</h2><p class="meta">Este artigo comenta matéria publicada por outro veículo; o texto é uma análise própria da equipe SmartJuris. Leia a notícia original:</p><ul class="tight">${p.sources
        .map(s => `<li><a href="${esc(s.url)}" rel="noopener noreferrer" target="_blank">${esc(s.title)}</a></li>`)
        .join('')}</ul></section>`
    : ''

const footerNav = () =>
  [
    ...RESOURCES.map(r => ({ href: r.path, label: r.h1 })),
    ...AREAS.map(a => ({ href: a.path, label: a.h1.replace('Software para advogado', 'Advogado') })),
    { href: '/planos', label: 'Planos' },
    { href: '/blog', label: 'Blog' },
    { href: '/faq', label: 'FAQ' },
    { href: '/sobre', label: 'Sobre' },
    { href: '/contato', label: 'Contato' },
  ]
    .map(l => `<a href="${l.href}">${esc(l.label)}</a>`)
    .join('')

export function renderPage(page: Page): string {
  const url = absolute(page.path)
  const ogImage = page.image ? absolute(page.image) : OG_IMAGE
  const ld: unknown[] = [organizationLd, breadcrumbLd(page)]
  if (page.faq?.length) ld.push(faqLd(page.faq))
  if (page.kind === 'blog') {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: page.h1,
      description: page.description,
      datePublished: page.datePublished,
      dateModified: page.dateModified ?? page.datePublished,
      inLanguage: 'pt-BR',
      mainEntityOfPage: url,
      image: ogImage,
      ...(page.category ? { articleSection: page.category } : {}),
      ...(page.sources?.length ? { citation: page.sources.map(s => s.url), isBasedOn: page.sources.map(s => s.url) } : {}),
      author: { '@type': 'Organization', name: page.author ?? SITE_NAME },
      publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: OG_IMAGE } },
    })
  }

  let body = ''
  if (page.path === '/planos') body += plansHtml()
  if (page.path === '/contato') body += contactHtml()
  if (page.path === '/blog') body += blogListHtml()
  body += page.sections.map(section).join('')
  if (page.path === '/sobre') body += companyHtml()
  if (page.faq?.length) body += faqHtml(page.faq)
  body += sourcesHtml(page)
  body += relatedHtml(page.related)
  if (page.path !== '/blog') body += cta()

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="${page.kind === 'blog' ? 'article' : 'website'}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="pt_BR">
${page.kind === 'blog' && page.datePublished ? `<meta property="article:published_time" content="${page.datePublished}">\n` : ''}<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="${FONTS_URL}"></noscript>
<style>${CSS}</style>
${ld.map(jsonLd).join('\n')}
</head>
<body>
<a class="skip" href="#conteudo">Pular para o conteúdo principal</a>
<header class="site"><div class="wrap"><a class="brand" href="/">⚖ ${SITE_NAME}</a><nav class="main" aria-label="Principal">${NAV.map(n => `<a href="${n.href}">${n.label}</a>`).join('')}</nav></div></header>
<main class="wrap" id="conteudo">
<h1>${esc(page.h1)}</h1>
<p class="lead">${esc(page.lead)}</p>
${page.datePublished ? `<p class="meta">Publicado em <time datetime="${page.datePublished}">${dataBr(page.datePublished)}</time>${page.author ? ` · Por ${esc(page.author)}` : ''}</p>` : ''}
${coverHtml(page)}
${body}
</main>
<footer class="site"><div class="wrap"><nav aria-label="Rodapé">${footerNav()}</nav>© ${new Date().getFullYear()} ${SITE_NAME} LexOS. Ferramenta de apoio ao advogado: nada é protocolado ou enviado sem a revisão do profissional, que responde técnica e eticamente pelas peças.</div></footer>
<script defer src="https://umami-production-f9ca.up.railway.app/script.js" data-website-id="07eacfd2-fed1-4ee0-8915-a830a233c5ba"></script>
</body>
</html>
`
}

export function render404(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Página não encontrada | ${SITE_NAME}</title><meta name="robots" content="noindex"><script defer src="https://umami-production-f9ca.up.railway.app/script.js" data-website-id="07eacfd2-fed1-4ee0-8915-a830a233c5ba"></script><style>${CSS}</style></head><body><main class="wrap"><h1>Página não encontrada</h1><p class="lead">O endereço que você acessou não existe.</p><p><a class="cta" href="/">Ir para a página inicial</a></p></main><script defer src="https://umami-production-f9ca.up.railway.app/script.js" data-website-id="07eacfd2-fed1-4ee0-8915-a830a233c5ba"></script></body></html>`
}

export function renderSitemap(now: Date): string {
  const lastmod = now.toISOString().slice(0, 10)
  const ultimoPost = BLOG_TODOS[0]?.dateModified ?? BLOG_TODOS[0]?.datePublished ?? lastmod
  const urls: Array<{ path: string; priority: string; lastmod?: string }> = [
    { path: '/', priority: '1.0' },
    ...ALL_PAGES.map(p => ({
      path: p.path,
      priority: p.kind === 'resource' || p.path === '/planos' ? '0.8' : '0.6',
      lastmod: p.kind === 'blog' ? (p.dateModified ?? p.datePublished) : undefined,
    })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(u => `  <url><loc>${absolute(u.path)}</loc><lastmod>${u.path === '/blog' ? ultimoPost : (u.lastmod ?? lastmod)}</lastmod><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>
`
}

export const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`

/** Conteúdo estático dentro de #root: lido por crawlers sem JS; o React substitui ao montar. */
export function renderHomeStatic(): string {
  return `<div id="seo-static" style="max-width:860px;margin:0 auto;padding:24px 20px;font-family:'Outfit',system-ui,sans-serif;line-height:1.6">
<h1>Software jurídico com IA para advogados e escritórios de alta performance</h1>
<p>${esc(SITE_DESCRIPTION)}</p>
<h2>Recursos</h2>
<ul>${RESOURCES.map(r => `<li><a href="${r.path}">${esc(r.h1)}</a> — ${esc(r.lead)}</li>`).join('')}</ul>
<h2>Para cada área do Direito</h2>
<ul>${AREAS.map(a => `<li><a href="${a.path}">${esc(a.h1)}</a></li>`).join('')}</ul>
<h2>Planos</h2>
<ul>${PLANS.map(p => `<li><strong>${esc(p.name)}</strong> — ${esc(p.price)}/mês, ${esc(p.limit)}</li>`).join('')}</ul>
<p><a href="/planos">Ver detalhes dos planos</a></p>
<h2>Perguntas frequentes</h2>
${HOME_FAQ.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}
<nav aria-label="Páginas"><a href="/planos">Planos</a> · <a href="/blog">Blog</a> · <a href="/faq">FAQ</a> · <a href="/sobre">Sobre</a> · <a href="/contato">Contato</a></nav>
<noscript><p>Ative o JavaScript para acessar o sistema.</p></noscript>
</div>`
}

export const homeHeadTags = () => ({
  fonts: FONTS_URL,
  ld: [organizationLd, websiteLd, softwareLd].map(jsonLd).join('\n'),
  title: SITE_TITLE,
})
