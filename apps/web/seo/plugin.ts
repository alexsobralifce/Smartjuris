import type { HtmlTagDescriptor, Plugin } from 'vite'
import { ALL_PAGES } from './content'
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from './site'
import { ROBOTS_TXT, homeHeadTags, render404, renderHomeStatic, renderPage, renderSitemap } from './render'

/**
 * SEO: canonical/OG/JSON-LD na home, conteúdo estático dentro de #root (crawlers sem JS),
 * páginas públicas pré-renderizadas (/planos, /faq, /recursos/*, /blog/*), sitemap.xml, robots.txt e 404.html.
 * Conteúdo em seo/content.ts; layout em seo/render.ts.
 */
export function seoPlugin(): Plugin {
  return {
    name: 'smartjuris-seo',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const home = homeHeadTags()
        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'canonical', href: `${SITE_URL}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'robots', content: 'index, follow, max-image-preview:large' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:locale', content: 'pt_BR' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${SITE_URL}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:title', content: SITE_TITLE }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:description', content: SITE_DESCRIPTION }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:image', content: OG_IMAGE }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'theme-color', content: '#1a2744' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }, injectTo: 'head' },
          {
            tag: 'link',
            attrs: { rel: 'stylesheet', href: home.fonts, media: 'print', onload: "this.media='all'" },
            injectTo: 'head',
          },
        ]
        // JSON-LD (Organization + WebSite + SoftwareApplication) como script literal.
        const withLd = html.replace('</head>', `${home.ld}\n</head>`)
        return {
          html: withLd.replace('<div id="root"></div>', `<div id="root">${renderHomeStatic()}</div>`),
          tags,
        }
      },
    },
    generateBundle() {
      for (const page of ALL_PAGES) {
        this.emitFile({ type: 'asset', fileName: `${page.path.slice(1)}.html`, source: renderPage(page) })
      }
      this.emitFile({ type: 'asset', fileName: '404.html', source: render404() })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(new Date()) })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: ROBOTS_TXT })
    },
  }
}
