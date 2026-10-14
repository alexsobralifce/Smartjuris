---
title: Auditoria SEO do SmartJuris contra o SEO Starter Guide do Google
author: Francisco
date: 2026-10-14
branch: main
cost: { minutes: 2, tokens: 70899 }
touches:
  - apps/web/seo/plugin.ts
---

## Decided
- A base técnica de SEO já atende ao guia: páginas públicas pré-renderizadas por apps/web/seo/plugin.ts (sitemap com 16 URLs, robots.txt, 404 real com noindex, canonical, OG, JSON-LD, 301 http→https e apex→www).
- Lacunas restantes são off-page e de conteúdo: Search Console/sitemap, backlinks, só 3 artigos no blog, COMPANY vazio em seo/site.ts, home sem imagens com alt, sem vídeo.

## Tried and ruled out
- Nada de técnico precisou de correção; não medi Core Web Vitals (rodar PageSpeed na home).

## Watch out
- Preços e promoção na landing foram restaurados; conformidade OAB do texto é tema separado (commits e17ced6, f7d4ef0).
- Preencher COMPANY exige dados reais do usuário (razão social, CNPJ, endereço, responsável); não inventar.
