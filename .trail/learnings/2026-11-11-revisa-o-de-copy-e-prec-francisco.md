---
title: Revisão de copy e preços da landing contra dicas externas
author: Francisco
date: 2026-11-11
branch: main
cost: { minutes: 2, tokens: 99721 }
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
- Dicas externas de copy/preço da landing foram checadas contra o código antes de qualquer mudança. Elas partiam de uma versão antiga: planos citados como R$ 90/150/250 (código: R$ 180/300/500), formulário de contato dito "indisponível" (existe ContatoLead) e WhatsApp ausente (já está no rodapé).
- Ajustes que valem: tirar o formulário de login do hero (LandingPage.tsx, bloco ~1266) e mover "Entrar" para o cabeçalho; um CTA principal; trocar jargão técnico (RAG vetorial, BGE-M3, Qwen) por benefício no hero e nos planos; usar capturas reais de apps/web/public/tutorial/images/.
- Limites dos planos são créditos por mês (20/50/100 em packages/shared), não peças. Operações consomem 1 a 6 créditos, então "20 peças" é aproximação.

## Tried and ruled out
- Aceitar números de conversão e prova social da dica (2%, "dobrar ticket", "73% dos escritórios", "reduzi 80%"): sem fonte, não usar. Depoimento só com autorização real.
- Prometer "sem alucinações", "100% segura" ou "crivo OAB garantido": contradiz o disclaimer da própria página (decisão é do advogado).

## Watch out
- Recalcular qualquer comparação por preço ou por crédito com os valores atuais de PricingSection.tsx antes de publicar.
- Citar jurisprudência (STF/STJ) só se a busca estiver no produto nessa forma.
- Nenhuma mudança de código foi feita nesta revisão; a análise é só de leitura.
