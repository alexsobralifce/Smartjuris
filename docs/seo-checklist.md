# SEO — checklist pós-deploy (SmartJuris)

Domínio canônico: `https://www.smartjuris.com.br`. Conteúdo das páginas públicas: `apps/web/seo/content.ts`.

## Depois do deploy
- [ ] `curl -I https://www.smartjuris.com.br/robots.txt` e `/sitemap.xml` retornam 200 (não HTML da SPA).
- [ ] `curl -I https://smartjuris.com.br/` responde 301 para `https://www.smartjuris.com.br/`.
- [ ] `/planos`, `/faq`, `/blog`, `/recursos/...` respondem 200; `/qualquer-coisa` responde 404.
- [ ] Testar JSON-LD em https://search.google.com/test/rich-results (home, `/faq`, um artigo).
- [ ] Testar preview de link (WhatsApp/LinkedIn) e https://pagespeed.web.dev (mobile).

## Google Search Console
- [ ] Adicionar propriedade de domínio `smartjuris.com.br` (verificação via TXT no Registro.br).
- [ ] Enviar `https://www.smartjuris.com.br/sitemap.xml`.
- [ ] Solicitar indexação de `/`, `/planos`, `/faq` e das páginas de recursos.
- [ ] Acompanhar Cobertura, Core Web Vitals e Consultas mensalmente.
- [ ] Repetir no Bing Webmaster Tools (importa do Search Console).

## Presença e autoridade
- [ ] Google Business Profile, LinkedIn (página da empresa) e Instagram apontando para o site.
- [ ] Diretórios e parcerias jurídicas (OAB seccionais, associações, portais de legaltech) com link para o site.
- [ ] Publicar 1–2 artigos por mês em `BLOG` (`seo/content.ts`) com termos que o público busca.
- [ ] Depoimentos reais com autorização (não usar marcação de avaliação com dados fictícios).

## Pendências técnicas conhecidas
- `Assinatura.tsx` tem 4 erros de tipo pré-existentes (`plano.promocao` possivelmente null) — não afetam o build do Vite.
- A home continua sendo uma SPA; o conteúdo estático em `#root` serve crawlers sem JS e é substituído pelo React ao montar.
