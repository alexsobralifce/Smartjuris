---
title: "Blog automático com curadoria semanal (feeds, Qwen, capa por IA, aprovação do root)"
author: Francisco
date: 2026-10-14
branch: main
cost: { minutes: 25, tokens: 421161 }
touches:
  - apps/api/src/db/migrations/0041_blog.sql
---

## Decided
- Portado do gymApp (curadoria): feeds RSS → ranking → redator com validação → rascunho. Qwen via `deepseekClient` (JSON mode), capa via OpenAI Images (`OPENAI_API_KEY`), imagem em `bytea` em `blog_artigos` (migration 0041), sem bucket.
- Sempre RASCUNHO; root revisa em Painel Root > Blog e só publica com capa. Site segue estático: `scripts/sincronizar-blog.mjs` (prebuild) baixa publicados da API; publicar agenda redeploy do web (Railway GraphQL).
- Feeds que funcionam (validados): Conjur (+Advocacia), JOTA, OAB, TST, Agência Brasil Justiça, Senado, Câmara. STF/STJ/CNJ/Migalhas não têm RSS público estável.
- Tokens sem usuário: operação com prefixo `plataforma_` em `trackTokenUsage`.

## Tried and ruled out
- Buscar a matéria inteira antes de escrever: adiado até avaliar a 1ª rodada (direitos autorais e qualidade ainda não medidos). Hoje a IA só vê título + trecho ≤900 caracteres.

## Watch out
- Banco local do SmartJuris é `localhost:5433` (docker compose); o padrão do código é 5432 (outro banco). Rodar testes/migrations com `DATABASE_URL=postgresql://lexia:lexia@localhost:5433/lexia`.
- `services/ai.ts` cria clientes OpenAI na importação e exige chave: em testes, definir `DEEP_SEEK_API`/`OPENCODE_API_KEY` e importar com `await import` depois.
- `git` falha neste Mac por `git-lfs` ausente (`brew install git-lfs`). No macOS, `sed -i ''`.
- 4 erros de tsc e achados do `verify:ui` já existiam (Assinatura.tsx, LandingPage/PricingSection).
- Para ativar em produção: secrets/variáveis `CURADORIA_TOKEN` (API + GitHub), `OPENAI_API_KEY`, `RAILWAY_*`.
