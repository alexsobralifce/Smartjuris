# SmartJuris — Prompts por Fase

Este arquivo contém os prompts de implementação para o DeepSeek e os prompts de revisão para o GPT-5.6 Terra.

## Como usar

1. Envie o prompt de implementação ao DeepSeek.
2. Aguarde o diff, testes e build.
3. Envie o relatório ao GPT-5.6 Terra.
4. Só avance com `APPROVE` e `advanceAllowed: true`.
5. Em caso de condição ou reprovação, envie as correções ao DeepSeek e repita a revisão.

---

# 2A.1 — Testes HTTP de tenancy

## DeepSeek — implementação

```text
Fase atual: 2A.1 — testes HTTP de tenancy.

Confirme primeiro que a Fase 2A está marcada como `AUDIT_APPROVED` em `docs/ai-development/implementation-roadmap.md`.

Implemente somente testes de integração HTTP para documentos e RAG.

Cubra:
- upload por usuário autenticado;
- listagem restrita ao escritório;
- tentativa de acessar documento de outro escritório;
- tentativa de vincular documento a processo de outro escritório;
- rejeição de `escritorio_id` enviado pelo cliente;
- RAG restrito ao escritório;
- quarentena de documentos sem escopo;
- acesso root à quarentena;
- bloqueio de usuário comum em rota root;
- persistência de `total_pages`, `indexed_status` e `failed_chunks`;
- auditoria de bloqueios.

Use banco de teste, autenticação e middlewares reais. Use mocks somente para Ollama, embeddings e DeepSeek.

Não altere classificador, catálogo, reserva, geração, fallback, SSE, frontend ou migrations.

Se uma dependência impedir o teste HTTP real, informe a limitação e não substitua silenciosamente o teste por teste de serviço.

Execute testes específicos, suíte completa e build TypeScript. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2A.1 — testes HTTP de tenancy.

Analise o diff, os testes e os resultados executados.

Verifique:
- se são testes HTTP reais;
- se autenticação e cookies são exercitados;
- se o escritório vem da sessão;
- se documentos e chunks de outro escritório não aparecem;
- se processos de outro escritório são rejeitados;
- se o RAG respeita `escritorio_id`;
- se documentos sem escopo ficam em quarentena;
- se o root é o único autorizado a associá-los;
- se os mocks estão limitados às dependências externas.

Responda somente neste formato JSON:

{
  "verdict": "APPROVE | APPROVE_WITH_CONDITIONS | REJECT",
  "findings": [],
  "requiredFixes": [],
  "missingTests": [],
  "advanceAllowed": false
}
```

---

# 2A.2 — Correção da exportação

## DeepSeek — implementação

```text
Fase atual: 2A.2 — correção da exportação.

Confirme no roadmap que 2A.1 está `AUDIT_APPROVED`.

Aplique estas regras:
- `revisao`: bloqueada;
- `aprovado`: permitida;
- `protocolado`: permitida;
- `reprovado`: bloqueada.

O backend deve aplicar a regra. Preserve autenticação, tenancy, ownership, auditoria, PDF, DOCX e timbre.

Crie testes para todos os status e acessos indevidos.

Não altere classificador, catálogo, créditos, reserva, fallback, SSE, análise documental, landing page ou migrations.

Execute a suíte completa e o build. Entregue diff e relatório. Pare para revisão.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2A.2 — exportação.

Analise o diff e os testes.

Confirme:
- revisão bloqueada no backend;
- aprovação e protocolo permitidos;
- reprovação bloqueada;
- tenancy preservada;
- tentativa bloqueada auditada;
- frontend não é a única camada de proteção;
- nenhuma regra de IA ou crédito foi alterada.

Retorne o veredito no formato JSON aprovado.
```

---

# 2B — Catálogo compartilhado

## DeepSeek — implementação

```text
Fase atual: 2B — catálogo compartilhado.

Confirme no roadmap que 2A.2 está `AUDIT_APPROVED`.

Crie uma fonte única de verdade em `packages/shared` para planos e operações de IA.

Planos canônicos:
- ESSENTIAL;
- PROFESSIONAL;
- OFFICE.

Aliases:
- basico/starter → ESSENTIAL;
- pro/profissional → PROFESSIONAL;
- office/enterprise → OFFICE.

Operações:
- SIMPLE_PETITION;
- SECTION_REVIEW;
- STANDARD_PETITION;
- DOCUMENT_ANALYSIS_20_PAGES;
- JURISPRUDENCE_RESEARCH;
- APPEAL;
- COMPLEX_DOCUMENT.

Cada operação deve conter classificação, modelo, créditos, maxInputTokens, maxOutputTokens, maxOutputPages, maxAttachmentPages, resultLimit, blockSizePages, isDraftingOperation, requiresHumanReview, isAnalysisOperation e isStandaloneSearch.

Valores:
- SIMPLE_PETITION: Flash, 1 crédito, 8.000 entrada, 2.500 saída, 3 páginas, 10 anexos.
- SECTION_REVIEW: Flash, 1 crédito, 8.000 entrada, 2.000 saída, 3 páginas, 10 anexos.
- STANDARD_PETITION: Flash, 2 créditos, 25.000 entrada, 10.000 saída, 12 páginas, 20 anexos.
- DOCUMENT_ANALYSIS_20_PAGES: Flash, 1 crédito por bloco, 25.000 entrada, 4.000 saída, bloco de 20 páginas.
- JURISPRUDENCE_RESEARCH: Flash, 1 crédito standalone, 12.000 entrada, 3.000 saída, máximo de 8 resultados.
- APPEAL: Pro, 4 créditos, 35.000 entrada, 13.000 saída, 15 páginas, 40 anexos.
- COMPLEX_DOCUMENT: Pro, 6 créditos, 45.000 entrada, 18.000 saída, 20 páginas, 60 anexos.

Atualize `classifier.ts` e `usage.ts` para importar a mesma fonte. Remova catálogos duplicados e preserve adaptadores de compatibilidade.

Não crie migration, rota, reserva, geração, SSE ou alteração visual do frontend.

Execute testes do pacote compartilhado, testes da API, build da API, build do frontend e busca por catálogos duplicados. Entregue o relatório e aguarde revisão.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2B — catálogo compartilhado.

Analise diff, arquivos, testes, builds e busca por duplicidades.

Verifique:
- única fonte em `packages/shared`;
- `classifier.ts` e `usage.ts` importando a mesma definição;
- ausência de limites duplicados;
- aliases sem migração silenciosa;
- enum de operação fechado;
- valores exatamente iguais ao contrato;
- compatibilidade NodeNext/ESM;
- compilação dos workspaces;
- análise por bloco de 20 páginas;
- pesquisa limitada a 8 resultados;
- ausência de alterações fora do escopo.

Retorne JSON com verdict, findings, requiredFixes, missingTests e advanceAllowed.
```

---

# 2C — Builder do payload real

## DeepSeek — implementação

```text
Fase atual: 2C — builder do payload real.

Confirme que 2B está `AUDIT_APPROVED`.

Crie uma função backend para montar o input do classificador usando dados autenticados e do banco.

O frontend pode enviar apenas:
- `pieceType`/`tipo`;
- `area`;
- `dadosCaso`;
- `processoId`;
- `includeJurisprudence`;
- `outputSize`;
- `idempotencyKey`.

O backend deve derivar escritório, usuário, plano, saldo, processo, número real, documentos, páginas, indexação, RAG, limites e modelo.

Nunca aceite do cliente créditos, custo, modelo, páginas, limites, escritório, número real do processo ou permissões.

Crie testes com banco realista para processo do mesmo escritório, processo de outro escritório, documento sem escopo, plano legado, saldo real, peça simples, peça padrão, peça complexa, ausência de processo e chave de idempotência ausente.

Não conecte à geração, reserva, SSE ou frontend.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2C — builder do payload real.

Analise a origem de cada campo do payload.

Confirme:
- escritório da autenticação;
- plano e saldo do banco;
- processo filtrado por escritório;
- documentos sem escopo excluídos;
- créditos, modelo e limites do cliente ignorados;
- plano legado normalizado;
- processo falso rejeitado;
- idempotencyKey validada;
- testes com banco/fixtures realistas;
- campos indisponíveis nulos ou com warning.

Liste qualquer campo artificial ou não confiável e retorne o veredito em JSON.
```

---

# 2D — Desenho da análise documental

## DeepSeek — implementação

```text
Fase atual: 2D — desenho da análise documental.

Confirme que 2C está `AUDIT_APPROVED`.

Esta fase entrega DESENHO TÉCNICO (documentação), NÃO implementação — a
implementação ocorre na Fase 3A.

Projete o processamento de documentos em blocos de até 20 páginas
(`ANALYSIS_BLOCK_SIZE_PAGES`), documentando:

- resumo por bloco;
- fatos estruturados extraídos por bloco;
- status por bloco (pending/processing/completed/failed);
- retry (quais falhas retentam, limite de tentativas, backoff);
- falhas parciais (como um bloco com falha afeta os demais e o resultado final);
- versionamento de prompt (identificador de versão por bloco e global);
- tokens (estimativa por bloco: entrada/saída, margem de segurança);
- custo (centavos: como o custo por bloco é calculado e somado);
- páginas já analisadas (rastreio incremental; como evitar reanalisar);
- idempotência (chave derivada: escritório + processo + bloco + versão de prompt);
- isolamento por escritório (nenhum bloco cruza tenants).

Use como fonte de verdade `packages/shared` (OPERATION_CATALOG,
ANALYSIS_BLOCK_SIZE_PAGES), `services/classifier.ts`, `services/usage.ts`,
`services/payloadBuilder.ts` e o schema (`documentos`, `chunks`, `ai_operations`).

Entregue um documento em `docs/ai-development/` (ex.: `design-analise-documental.md`)
com: visão geral, fluxo por bloco, contratos de entrada/saída, regras de retry e
falha parcial, modelo de custo/tokens, estratégia de idempotência, isolamento por
escritório e decisões de projeto. NÃO crie código de implementação.

Não altere classifier, usage, payloadBuilder, catálogo, migrations, rotas ou frontend.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2D — desenho da análise documental.

Analise o desenho técnico (documentação).

Confirme que o desenho cobre:
- blocos de até 20 páginas;
- resumo e fatos estruturados por bloco;
- status por bloco;
- retry com limites;
- falhas parciais definidas;
- versionamento de prompt;
- estimativa de tokens por bloco;
- custo em centavos por bloco;
- páginas já analisadas (rastreio incremental);
- idempotência por bloco (chave derivada sem dupla cobrança);
- isolamento por escritório;
- coerência com o catálogo compartilhado e com classifier/usage/payloadBuilder;
- nenhuma implementação prematura (sem código de produção nesta fase).

Liste qualquer lacuna do desenho e retorne o veredito em JSON.
```

---

# 2E — Migration dos metadados do classificador

## DeepSeek — implementação

```text
Fase atual: 2E — migration dos metadados do classificador.

Confirme que 2C está `AUDIT_APPROVED`.

Crie a migration `0019_classifier_metadata.sql` adicionando as seguintes colunas
à tabela `ai_operations` (metadados de classificação, NUNCA financeiros):

- `classification` (text, nullable);
- `classification_reason` (text, nullable);
- `warnings` (jsonb, nullable — lista de avisos);
- `prompt_version` (text, nullable);
- `parent_operation_id` (uuid, nullable — referência a ai_operations.id);
- `sub_operations` (jsonb, nullable — lista de ids).

Requisitos:

- Compatível com dados legados: todas as colunas nullable com DEFAULT quando
  aplicável; registros existentes não são alterados financeiramente.
- Rollback definido: inclua um bloco de comentário com o SQL de rollback
  (DROP COLUMN) no próprio arquivo.
- Atualize o schema Drizzle (`apps/api/src/db/schema.ts`) com os novos campos.
- Nenhum dado financeiro (créditos, custo, reserva, ledger) é confundido com
  metadado de classificação: mantenha créditos/custos nas colunas existentes.
- Testes em banco real: crie/atualize testes que insiram uma operação com os
  novos metadados, consultem e validem que a migration é idempotente e não
  afeta reservas/ledger existentes.

Não altere classifier, usage, payloadBuilder, rotas, catálogo ou frontend.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2E — migration dos metadados do classificador.

Analise a migration e os testes.

Confirme:
- colunas novas em `ai_operations` (classification, classification_reason,
  warnings, prompt_version, parent_operation_id, sub_operations);
- compatível com dados legados (nullable/defaults, sem alteração financeira);
- rollback definido no arquivo;
- schema Drizzle atualizado e em sincronia;
- testes em banco real: inserção com metadados, consulta, idempotência,
  reservas/ledger intactos;
- nenhum metadado confundido com dado financeiro;
- nenhuma alteração fora do escopo.

Retorne o veredito em JSON.
```

---

# 2F — Idempotência e reserva

## DeepSeek — implementação

```text
Fase atual: 2F — idempotência e reserva.

Confirme que 2B e 2C estão `AUDIT_APPROVED`.

Implemente o fluxo completo de uma operação de IA com idempotência segura:

  idempotencyKey
  → buildClassifierPayload (2C, deriva escritório/plano/saldo/processo/documentos/RAG)
  → classifyAiOperation (classificador)
  → revalidação no backend (nunca confiar nos campos do cliente)
  → reserveAiUsage (reserva de créditos + custo, FOR UPDATE + idempotência UNIQUE)
  → geração (ponto de integração; NÃO conectar SSE/frontend nesta fase)
  → settleAiUsage (liquidação com uso real) ou releaseAiUsageReservation (liberação em falha)

Requisitos:
- chave de idempotência OBRIGATÓRIA (rejeitar sem ela);
- retry seguro: reexecutar a mesma chave reutiliza a operação reservada
  (alreadyReserved), sem débito duplicado;
- nenhuma reserva duplicada (UNIQUE em ai_operations.idempotency_key);
- nenhum token_usage duplicado (settle idempotente por operationId);
- falhas liberam reservas (release devolve créditos/custo);
- concorrência controlada (FOR UPDATE serializa por escritório);
- isolamento entre escritórios (escritorioId sempre do contexto autenticado).

Crie um serviço (ex.: services/aiOperation.ts) que orquestra o fluxo acima
com um resultado tipado (operationId, estado, créditos, custo, payload,
classificação). Adicione testes com banco real: chave repetida, chave ausente,
concorrência (2 reservas simultâneas da mesma chave), falha na geração libera
reserva, settle não duplica token_usage, e isolamento entre escritórios.

Não altere classifier, usage (primitivas já existem), payloadBuilder, catálogo,
rotas, migrations ou frontend — apenas crie o orquestrador + testes.
```

## GPT-5.6 Terra — revisão

```text
Fase: 2F — idempotência e reserva.

Analise o orquestrador de operação e os testes.

Confirme:
- chave de idempotência obrigatória e validada;
- reexecução da mesma chave não duplica reserva nem débito;
- nenhum token_usage duplicado no settle;
- falha na geração libera a reserva (créditos/custo devolvidos);
- concorrência controlada (FOR UPDATE / lock);
- isolamento entre escritórios em todas as etapas;
- revalidação backend (não confiar em campos do cliente);
- testes com banco real para os cenários acima.

Retorne o veredito em JSON.
```

---

# Formato de passagem para o Terra

```text
Fase: [ID]

Objetivo:
[objetivo]

Dependências:
[dependências aprovadas]

Arquivos alterados:
[lista]

Diff:
[git diff da fase]

Testes:
[comandos e resultados]

Build:
[comando e resultado]

Migration:
[se aplicável]

Decisões tomadas:
[decisões]

Limitações:
[limitações]

Riscos:
[riscos]

Analise a implementação e retorne somente o contrato JSON de revisão.
```

## Comandos de evidência

```bash
git status --short
git diff --stat
git diff -- <arquivos da fase>
pnpm --filter @lexia/api test
pnpm --filter @lexia/api build
pnpm --filter @lexia/web build
```

Quando houver migration:

```bash
pnpm --filter @lexia/api db:migrate
```

---

# Regra de avanço

Só avance quando:

```text
DeepSeek concluiu implementação
Terra retornou APPROVE
advanceAllowed=true
não existem BLOCKER/HIGH
requiredFixes está vazio
os testes estão verdes
build está verde
o diff está dentro do escopo
```

Se houver condições:

```text
AUDIT_PENDING
→ CORRECTION_PENDING
→ DeepSeek corrige
→ testes/build novamente
→ Terra revisa novamente
```

Se houver reprovação:

```text
AUDIT_PENDING
→ AUDIT_FAILED
→ relatório de correção
```

A próxima fase não pode iniciar até a aprovação.

# 3A — Unidades de análise documental

## DeepSeek — implementação

```text
Fase atual: 3A — unidades de análise documental.

Confirme que 2D (design) e 2F (idempotência e reserva) estão `AUDIT_APPROVED`.

Implemente o serviço de análise documental em blocos de 20 páginas, seguindo o
design `docs/ai-development/design-analise-documental.md` (seção 2D).

Requisitos:

- Serviço novo (ex.: `apps/api/src/services/analiseDocumental.ts`) com entrada
  tipada `BlocoAnaliseInput` e saída tipada `BlocoAnaliseOutput` e
  `ContextoProcessado` (conforme §3 do design).
- Agrupamento em blocos de `ANALYSIS_BLOCK_SIZE_PAGES` (20, do catálogo
  compartilhado) com ordem estável (documento por created_at/nome; dentro do
  documento por índice de página). `pagesAlreadyAnalyzed` é descontado.
- Escopo: apenas documentos elegíveis do escritório autenticado
  (`escritorio_id` do contexto; `indexed_status <> 'unscoped'`). Nenhum bloco
  cruza tenants.
- Fluxo por bloco: derivar chave de idempotência NO SERVIDOR
  `analise:{escritorioId}:{processoId|'sem-processo'}:{documentoId}:{paginaInicial}-{paginaFinal}:{versaoPrompt}`
  (versaoPrompt = 'analise-documental-v1') → reserva via `reserveAiUsage`
  (chave idempotente; repetição reutiliza alreadyReserved, sem novo débito) →
  chamada IA com a operação `DOCUMENT_ANALYSIS_20_PAGES` (Flash, 1 crédito/bloco,
  limites maxInputTokens/maxOutputTokens do catálogo) → persistir status do
  bloco + resumo/fatos + token_usage → settle com uso real
  (calculateAiSettlementCents, arredondamento nearest) ou release em falha
  (releaseAiUsageReservation devolve créditos/custo; erro de release NÃO é
  suprimido).
- Retry: falhas retryable (timeout, 5xx, 429, resposta vazia, erro transitório
  de rede) até 2 tentativas com backoff curto (1s, 2s); falhas não-retryable
  (bloco ilegível/OCR, contrato inválido) marcam o bloco `failed` sem retry.
- Falha parcial: um bloco `failed` NÃO cancela os demais; blocos `completed`
  permanecem válidos; `pagesAlreadyAnalyzed` conta só blocos concluídos;
  `statusPorBloco` expõe blocos com falha.
- Consolidação: `summariesAvailable`/`structuredFactsAvailable` = true se ≥1
  bloco concluiu; os campos alimentam `documents.summariesAvailable`,
  `documents.structuredFactsAvailable` e `documents.pagesAlreadyAnalyzed`
  (regra Q5 do classificador).
- Integre com o `payloadBuilder` (2C) para derivar o escritório/processo/
  documentos elegíveis; revalide no backend (nunca confiar em campos do cliente).
- NENHUMA conexão com SSE/frontend/rotas nesta fase (Fases 3C/3D).

Testes com banco real (siga o padrão de `aiOperation.test.ts`):
- blocos corretos para N páginas (1 bloco para ≤20, 2 blocos para 21–40, etc.);
- `pagesAlreadyAnalyzed` descontado;
- idempotência por bloco (reprocessar a mesma chave reutiliza, sem novo débito
  nem novo token_usage);
- falha retryable → retry com backoff; falha não-retryable → bloco `failed`;
- falha parcial preserva blocos concluídos;
- isolamento entre escritórios (documentos de outro tenant nunca entram);
- settle usa tokens reais; release devolve créditos em falha.

Não altere classifier, usage, payloadBuilder, catálogo, migrations, rotas,
SSE ou frontend — apenas o novo serviço + testes.
```

## GPT-5.6 Terra — revisão

```text
Fase: 3A — unidades de análise documental.

Analise o serviço de análise documental e os testes (referência: design 2D).

Confirme:
- blocos de 20 páginas com ordem estável e `pagesAlreadyAnalyzed` descontado;
- escopo restrito ao escritório autenticado; documentos `unscoped` excluídos;
  nenhum bloco cruza tenants;
- chave de idempotência derivada no servidor e usada na reserva; reprocessar a
  mesma chave reutiliza (alreadyReserved) sem novo débito nem novo token_usage;
- fluxo reserva → IA (DOCUMENT_ANALYSIS_20_PAGES, Flash, 1 crédito/bloco) →
  persistência → settle (uso real, nearest) / release (falha devolve créditos;
  erro de release não é suprimido);
- retry limitado (2 tentativas, backoff curto) só para falhas retryable;
- falha parcial preserva blocos concluídos e `pagesAlreadyAnalyzed` conta só
  concluídos;
- consolidação alimenta summariesAvailable/structuredFactsAvailable/
  pagesAlreadyAnalyzed (Q5);
- revalidação backend (não confiar no cliente);
- nenhuma alteração fora de escopo (sem SSE/frontend/rotas nesta fase);
- testes com banco real cobrindo os cenários acima.

Retorne o veredito em JSON.
```
