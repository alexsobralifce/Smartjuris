---
title: Verificação de implementação das dicas de precificação da landing
author: Francisco
date: 2026-11-11
branch: main
cost: { minutes: 4, tokens: 57279 }
touches:
  - apps/web/public/og-image.png
  - apps/web/public/tutorial/images/00-landing.png
  - apps/web/public/tutorial/images/01-login.png
  - apps/web/public/tutorial/images/02-dashboard.png
  - apps/web/public/tutorial/images/03-agenda.png
  - apps/web/public/tutorial/images/04-processos.png
  - apps/web/public/tutorial/images/05-clientes.png
  - apps/web/public/tutorial/images/06-gerar-pecas.png
  - apps/web/public/tutorial/images/07-validacao.png
  - apps/web/public/tutorial/images/08-jurimetria.png
---

## Decided
- Auditoria das dicas de Pricing (ancoragem, chamariz, reenquadramento, centro de palco) feita só por leitura de apps/web/src/components/PricingSection.tsx. Nenhuma alteração de código.
- Status atual: ordem dos planos é crescente (Básico, Intermediário, Avançado); não há texto de custo por peça nem reenquadramento diário; o card do meio já tem selo "Em destaque", borda de 2px e botão primary.

## Tried and ruled out
- Usar os preços da dica (R$ 90/150/250): desatualizados. Código atual: R$ 180/300/500.
- Publicar "73% dos escritórios" como prova social: sem fonte.

## Watch out
- Antes de qualquer comparação por peça ou por crédito, recalcular com PLAN_LIMITS (packages/shared) e os preços atuais do componente.
- Um dos planos cita "150 páginas de autos", que é limite de análise; não confundir com créditos.
