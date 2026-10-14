---
title: "Páginas por área do Direito para SEO (software para advogado <área>)"
author: Francisco
date: 2026-10-14
branch: main
cost: { minutes: 37, tokens: 103027 }
touches:
  - AGENTS.md
  - apps/web/public/og-image.png
  - apps/web/public/tutorial/images/00-landing.png
  - apps/web/public/tutorial/images/01-login.png
  - apps/web/public/tutorial/images/02-dashboard.png
  - apps/web/public/tutorial/images/03-agenda.png
  - apps/web/public/tutorial/images/04-processos.png
  - apps/web/public/tutorial/images/05-clientes.png
  - apps/web/public/tutorial/images/06-gerar-pecas.png
  - apps/web/public/tutorial/images/07-validacao.png
---

## Decided
- Análise do ADVBOX: eles dominam o termo genérico (anunciam "sistema jurídico"), mas não mostram preço, não têm FAQ na página e o sitemap tem só 43 URLs, sem páginas por área, cidade ou glossário. Foco do SmartJuris: cauda longa por área do Direito, preço visível, FAQ e supervisão ética OAB.
- 6 páginas em `apps/web/seo/areas.ts`, com peças reais do gerador e prazos conferidos (CLT 775/895, CPC 219/1.003/1.023, CDC 26/27, CTN 168, Lei 12.016 art. 23, LEF art. 16). Preços vêm de `seo/site.ts`.

## Tried and ruled out
- Página "SmartJuris vs ADVBOX": adiada. Só com fatos verificáveis; prefira guia "como escolher software jurídico".
- Páginas por cidade ou por área clonadas só trocando o nome: o Google tende a ignorar.

## Watch out
- Citar só recursos que o produto tem. Scanner de contratos, jurimetria e jurisprudência ao vivo são dos planos Intermediário e Avançado. O sistema não calcula verbas nem acessa CNIS/Meu INSS.
- No macOS use `sed -i ''`.
