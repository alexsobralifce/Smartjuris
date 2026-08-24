# Regras de Baliza — LIDAS A CADA ACIONAMENTO

> Lista simples (anti-loop, anti-queima de tokens). Estas regras valem para TODA
> rodada de implementação e auditoria. Curta de propósito: não encher contexto.
> (Referência completa: `orquestrador-balizas.md`.)

## Para o implementador (DeepSeek)

1. **Escopo é lei** — toque apenas arquivos da fase; nada fora do diff pedido.
2. **Teste é prova** — toda mudança de comportamento vem com teste que falha antes e passa depois.
3. **Migration validada** — nova coluna/tabela: teste em banco limpo + upgrade + reaplicação + rollback.
4. **Concorrência** — idempotência por chave normalizada; 1 linha vencedora; retry não bloqueia.
5. **Fail-closed** — erro estruturado, sem detalhes de provedor; nunca finja sucesso em falha ambígua.
6. **Entregue parciais** — se travar, preserve o que está pronto e explique o que falta.
7. **Não repita a mesma tentativa** — se a suíte falhou igual na rodada anterior, investigue a CAUSA; re-rodar a mesma coisa é desperdício.

## Para o revisor (GPT-5.6 Luna)

8. **Valide o escopo, não expanda** — critique o que a fase prometeu; não invente requisitos novos.
9. **Achado repetido = o mesmo** — se a exigência é a mesma de antes (outra redação), diga que persiste; não disfarce.
10. **Priorize graves** — BLOCKER/HIGH primeiro; MEDIUM/LOW como lista, não bloqueiam.
11. **Exija evidência executável** — testes e build rodados, não "deve funcionar".
12. **Não mova o alvo** — rodada de correção revisa o delta; tópicos aprovados não reabrem.

## Para o orquestrador (runtime — não negociável)

13. **Teto de rodadas**: `maxCorrectionAttempts` (config) — ao atingir, PARE e exija humano.
14. **Orçamento**: custo acumulado da fase > `maxUsdPorFase` → PARE e exija humano.
15. **Doom-loop**: mesma saída de comando (testes) N× seguidas → PARE (re-rodar não corrige).
16. **Convergência**: achados graves não reduziram entre rodadas → PARE (circuito aberto).
17. **Escalada do revisor**: N reprovações consecutivas → escala de modelo; após teto, exige humano.
