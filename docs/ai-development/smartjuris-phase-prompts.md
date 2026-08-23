# SmartJuris — Prompts por Fase

Este arquivo contém os prompts de implementação para o DeepSeek e os prompts de revisão para o GPT-5.6 Luna.

## Como usar

1. Envie o prompt de implementação ao DeepSeek.
2. Aguarde o diff, testes e build.
3. Envie o relatório ao GPT-5.6 Luna.
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

## GPT-5.6 Luna — revisão

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

## GPT-5.6 Luna — revisão

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

## GPT-5.6 Luna — revisão

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

## GPT-5.6 Luna — revisão

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

## GPT-5.6 Luna — revisão

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

## GPT-5.6 Luna — revisão

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

## GPT-5.6 Luna — revisão

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


# 5A — Integrar busca ao vivo de jurisprudência no orquestrador de geração

## DeepSeek — implementação

```text
Fase atual: 5A — Integrar busca ao vivo de jurisprudência no orquestrador de geração.

Criar o orquestrador que, quando includeJurisprudence=true e não for SECTION_REVIEW, aciona a Jurisprudências.ai Live API em paralelo ao RAG local, com fallback best-effort.

Escopo:
Implementar o serviço de orquestração em services/geracaoSSE.ts que: (1) verifica includeJurisprudence e SECTION_REVIEW; (2) se ativo, chama searchDecisions do services/jurisprudencias.ts; (3) mapeia a área canônica para tribunal padrão; (4) extrai termos de busca a partir da área e dos fatos; (5) limita a 5 decisões e ao tamanho máximo de contexto; (6) se falhar ou não houver chave, continua somente com RAG local e registra aviso. Não alterar o módulo de Decisões do frontend.

Fora do escopo:
Alterar o frontend de Decisões, modificar a busca manual, ou mudar o RAG local.

Testes obrigatórios:
- Teste de que includeJurisprudence=true chama searchDecisions com o tribunal mapeado e termos extraídos
- Teste de que includeJurisprudence=false não chama a API ao vivo
- Teste de fallback quando a API está indisponível ou sem chave: geração continua com RAG local e loga aviso
- Teste de limitação de decisões (máximo 5) e tamanho do bloco

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5A — Integrar busca ao vivo de jurisprudência no orquestrador de geração.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- O orquestrador chama a busca ao vivo apenas quando includeJurisprudence=true e operação != SECTION_REVIEW
- Tribunal padrão é STJ quando a área não tem mapeamento
- Falhas na API ou ausência de chave não interrompem a geração
- A quantidade de decisões injetadas não excede 5

Responda somente no formato JSON do contrato de auditoria.
```

# 5B — Injetar bloco de jurisprudência rastreável no prompt de fundamentação

## DeepSeek — implementação

```text
Fase atual: 5B — Injetar bloco de jurisprudência rastreável no prompt de fundamentação.

Formatar as decisões ao vivo como um bloco com fonte rastreável e anexá-lo ao contexto do LLM junto com os chunks do RAG, mantendo a instrução de fundamentar exclusivamente no contexto.

Escopo:
Implementar a formatação do bloco de jurisprudências com tribunal, relator, órgão julgador, número do processo e data; incluir excerpt e summary; anexar o bloco ao contexto enviado ao prompt em services/ai.ts; ajustar a instrução de fundamentação para valer também para o bloco injetado. O bloco deve ser colocado como parte do contexto, com separação clara do RAG local.

Fora do escopo:
Alterar a lógica de geração do texto final ou os parâmetros do LLM.

Testes obrigatórios:
- Teste de que o prompt final contém tribunal, relator, número do processo e trecho da decisão
- Teste de que a instrução de fundamentação continua exigindo uso exclusivo do contexto
- Teste de que o bloco injetado é claramente separado do RAG local

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5B — Injetar bloco de jurisprudência rastreável no prompt de fundamentação.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- LLM recebe identificação completa da fonte para cada decisão
- Prompt mantém a regra de não inventar jurisprudência fora do contexto
- Bloco de jurisprudência é rastreável

Responda somente no formato JSON do contrato de auditoria.
```

# 5C — Adicionar cache por escritório e controle de rate limit na busca ao vivo

## DeepSeek — implementação

```text
Fase atual: 5C — Adicionar cache por escritório e controle de rate limit na busca ao vivo.

Criar cache em memória ou Redis com TTL configurável e chave estável por combinação de tribunal e termos normalizados, escopado por escritório (tenant), e respeitar os headers de rate limit.

Escopo:
Implementar cache para resultados de searchDecisions com chave include tenant; extrair e interpretar headers de rate limit do services/jurisprudencias.ts; se restarem poucas requisições, reduzir ou pausar novas buscas ao vivo na janela; cenário de rate limit não bloqueia geração, usa RAG local. O cache deve ser usado antes de chamar a API. TTL configuravel com default 1 hora.

Fora do escopo:
Implementar autenticação de usuários, alterar a API de tribunais, ou cache de outras fontes.

Testes obrigatórios:
- Teste de cache: mesma tese e área duas vezes -> segunda usa cache, zero chamadas à API
- Teste de rate limit: headers com poucas requisições restantes -> nova geração não chama API
- Teste de tenancy: escritórios diferentes não compartilham cache
- Teste de TTL: expiração funciona

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5C — Adicionar cache por escritório e controle de rate limit na busca ao vivo.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Segunda geração com mesma tese e área não repete chamada paga
- Cache é isolado por escritório ou tenant
- Rate limit nunca causa falha na geração; fallback para RAG local é usado
- TTL configurável com padrão de 1 hora

Responda somente no formato JSON do contrato de auditoria.
```

# 5D — Registrar rastreabilidade e tratar erros de forma segura

## DeepSeek — implementação

```text
Fase atual: 5D — Registrar rastreabilidade e tratar erros de forma segura.

Adicionar logs estruturados e informações de auditoria sobre decisões usadas na geração, sem expor detalhes internos do provedor ao cliente.

Escopo:
No resultado da operação ou log, registrar quantidade de decisões ao vivo usadas e tribunais de origem; para falhas da API, exibir mensagem genérica ao usuário e logar detalhes internos; não persistir os resultados como dados sensíveis; garantir que nenhum detalhe interno vaze em erros.

Fora do escopo:
Criar dashboard de auditoria, persistir logs fora do padrão existente, ou alterar mensagens de outras operações.

Testes obrigatórios:
- Teste de que o log/resultado contém contagem de decisões usadas e tribunais
- Teste de que erro da API retorna mensagem genérica ao cliente
- Teste de que detalhes internos aparecem somente no log da aplicação

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5D — Registrar rastreabilidade e tratar erros de forma segura.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Toda geração com includeJurisprudence=true registra de forma auditável as decisões ao vivo utilizadas
- Usuário final nunca vê stack trace ou detalhes do provedor
- Resultados de busca não ficam persistidos como dados sensíveis

Responda somente no formato JSON do contrato de auditoria.
```
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

## GPT-5.6 Luna — revisão

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
# 3B — Fallback Flash/Pro

## DeepSeek — implementação

```text
Fase atual: 3B — fallback Flash/Pro.

Confirme que 2F (idempotência e reserva) está `AUDIT_APPROVED`.

Implemente o fallback automático de modelo DeepSeek: quando a execução com
FLASH falhar por motivo recuperável (erro 5xx/429 do provider, timeout de rede,
resposta vazia, erro transitório — NUNCA por recusa de conteúdo/contexto ou
erro de validação de entrada), o sistema pode reexecutar a operação com o
modelo PRO, seguindo o fluxo:

1. Registrar o motivo do fallback (auditável: operação, modelo original,
   motivo, timestamps).
2. Recalcular o custo com o modelo PRO (custo por token do PRO no usage.ts).
3. Revalidar a reserva: conferir se o orçamento disponível do escritório
   (maxReserveCents/maxOpCostCents e créditos do plano) cobre o custo PRO.
4. Executar o PRO SOMENTE se houver orçamento disponível — a reexecução é
   feita como nova operação (nova chave de idempotência derivada, ex. sufixo
   ':pro') para não colidir com a operação FLASH já reservada; a reserva
   FLASH original é liquidada/revertida conforme o resultado.
5. Se NÃO houver orçamento para o PRO, retornar `REQUIRES_ADDITIONAL_CREDITS`
   (estado tipado) sem executar — nunca executar Pro sem saldo.

Requisitos:
- O fallback é uma decisão de servidor (configurável via env, ex.:
  `DEEPSEEK_FALLBACK_TO_PRO` default true), nunca do cliente;
- Integrar ao orquestrador de operação de IA (`services/aiOperation.ts`, 2F):
  o fallback entra como política de reexecução da fase de geração, respeitando
  idempotência por tenant e settle/release corretos (sem débito duplicado:
  cada execução PRO gera seu próprio token_usage; a FLASH falha libera reserva);
- Registrar auditoria com o motivo do fallback (campo auditável na operação);
- Não alterar classifier, catálogo, payloadBuilder, migrations ou frontend.

Testes com banco real (padrão de `aiOperation.test.ts`):
- falha recuperável FLASH → reexecução PRO registrada (motivo + modelo),
  token_usage da execução PRO criado sem duplicar o da FLASH;
- falha recuperável SEM orçamento para PRO → `REQUIRES_ADDITIONAL_CREDITS`,
  nenhuma chamada PRO;
- falha NÃO recuperável (recusa/validação) → sem fallback, operação `failed`;
- isolamento entre escritórios (fallback nunca cruza tenants);
- env desligando o fallback → falha FLASH permanece `failed`.

Não altere rotas, SSE, frontend ou migrations.
```

## GPT-5.6 Luna — revisão

```text
Fase: 3B — fallback Flash/Pro.

Analise o fallback Flash→Pro e os testes.

Confirme:
- motivo do fallback registrado (auditável);
- custo recalculado para o modelo PRO;
- reserva revalidada (orçamento disponível) ANTES de executar o PRO;
- PRO executado somente com orçamento; caso contrário `REQUIRES_ADDITIONAL_CREDITS`
  sem chamada;
- idempotência por tenant preservada (nova chave para a execução PRO; sem
  débito duplicado; settle/release corretos);
- falhas não recuperáveis não disparam fallback;
- decisão de servidor (env), nunca do cliente;
- testes com banco real cobrindo os cenários acima;
- nenhuma alteração fora de escopo.

Retorne o veredito em JSON.
```

# 3C — Integração SSE

## DeepSeek — implementação

```text
Fase atual: 3C — integração SSE.

Confirme que 2F (idempotência e reserva) e 3B (fallback Flash/Pro) estão
`AUDIT_APPROVED`.

Integre o orquestrador de operação de IA (`services/aiOperation.ts`, 2F) ao
fluxo de geração de peças com STREAMING SSE, cobrando corretamente:

Fluxo (roadmap 3C):
estimativa → confirmação → reserva → fila → análise → RAG → redação →
revisão → settle → saldo atualizado

Requisitos:
- Novo endpoint (ou extensão de `routes/rag.ts`/`routes/pecas.ts`) com SSE
  (text/event-stream) que executa o fluxo COMPLETO por peça:
  1. estimativa (estimateAiOperation) e envio de evento inicial de progresso;
  2. reserva idempotente (reserveAiUsage com chave do cliente, validação no
     servidor — 2F);
  3. busca RAG (chunks do escritório, escopo por tenant — 2A) + streaming
     da redação via DeepSeek (modelo conforme classificação/fallback 3B);
  4. eventos SSE de progresso (progresso, label, texto parcial);
  5. settle com uso REAL (tokens do stream) — nunca zero sem confirmação;
  6. evento final com saldo atualizado.
- Eventos SSE tipados e estáveis (ex.: {type:'progresso'|'texto'|'erro'|'concluido',
  dados}), incluindo estado da operação (operationId, status);
- Erros: falha ambígua (timeout/rede) retém reserva (reconciliação) e emite
  evento de erro SEM liberar integralmente; falha confirmada libera reserva;
- Revalidação backend (nunca confiar no cliente: chave, tipo, área, limites);
- Isolamento por escritório em TODAS as etapas (RAG, reserva, settle);
- NÃO alterar classifier, catálogo, migrations ou frontend (3D é a próxima).

Testes com banco real:
- fluxo SSE completo: reserva → streaming → settle → saldo atualizado
  (eventos recebidos em ordem, uso real registrado);
- idempotência: mesma chave não duplica reserva nem settle;
- erro ambíguo → evento de erro + reserva retida (reconciliação);
- erro confirmado → reserva liberada;
- isolamento: escritório B não acessa RAG/reserva de A.

Não altere frontend, migrations, classifier ou catálogo.
```

## GPT-5.6 Luna — revisão

```text
Fase: 3C — integração SSE.

Analise a integração SSE do fluxo completo de geração.

Confirme:
- fluxo estimativa → reserva → RAG → redação (SSE) → settle → saldo;
- eventos SSE tipados/estáveis e ordem correta;
- settle com uso real (nunca zero sem confirmação);
- erro ambíguo retém reserva (reconciliação); confirmado libera;
- revalidação backend (não confiar no cliente);
- isolamento por escritório em todas as etapas;
- idempotência por chave (sem dupla reserva/settle);
- testes com banco real cobrindo os cenários acima;
- nenhuma alteração fora de escopo (sem frontend/migrations).

Retorne o veredito em JSON.
```

# 3D — Integração frontend

## DeepSeek — implementação

```text
Fase atual: 3D — integração frontend.

Confirme que 3C (integração SSE) está `AUDIT_APPROVED`.

Integre o frontend (React/Vite) ao novo endpoint SSE de geração
(`POST /api/pecas/gerar-sse`, Fase 3C), substituindo a chamada antiga ao
`/api/rag/generate`.

Alterações esperadas (roadmap 3D):
- REMOVER o `isComplex` manual do fluxo de geração (a escolha de modelo agora
  é decisão de servidor — classificação 2C + fallback 3B; o cliente não manda
  modelo);
- ENVIAR `pieceType` (e demais campos do contrato: area, dadosCaso,
  processoId, outputSize, includeJurisprudence, idempotencyKey) ao novo
  endpoint;
- consumir os eventos SSE tipados da 3C: operacao → progresso → texto →
  concluido / erro (com reconciliacao quando ambíguo);
- exibir progresso, texto parcial streaming e estado final (saldo/erro) no
  componente `GeradorPecas`;
- idempotencyKey: gerar/estabilizar por peça (evitar dupla cobrança em
  reconexão), sem expor créditos/modelo ao cliente.

Requisitos:
- NUNCA enviar créditos/custo/modelo/limites do cliente (backend revalida);
- manter o design System (paleta tokens CSS existente);
- usar `authFetch`/client existente (cookie httpOnly) para autenticação;
- testes: unitários do parsing de eventos SSE e da montagem do body (sem
  depender de servidor); build web verde + `verify:ui` (zero cores hardcoded).

Não altere o backend, migrations ou catálogo — apenas o frontend.
```

## GPT-5.6 Luna — revisão

```text
Fase: 3D — integração frontend.

Analise a integração do GeradorPecas ao endpoint SSE (3C).

Confirme:
- `isComplex` manual REMOVIDO da geração (modelo é decisão de servidor);
- `pieceType` e campos do contrato enviados ao novo endpoint;
- eventos SSE tipados consumidos (operacao/progresso/texto/concluido/erro);
- erro com `reconciliacao` tratado no frontend;
- idempotencyKey estável por peça (sem dupla cobrança em reconexão);
- nenhum dado financeiro/modelo enviado do cliente;
- design tokens mantidos (verify:ui);
- testes unitários de parsing/montagem; builds verdes.

Retorne o veredito em JSON.
```
# 4A — Testes end-to-end

## DeepSeek — implementação

```text
Fase atual: 4A — Testes end-to-end.

Confirme que 3D (integração frontend) está `AUDIT_APPROVED`.

Crie a suíte de testes END-TO-END do fluxo completo de operação de IA sobre a
stack REAL (Express + Postgres local + orquestrador 2F + classificador 2B/2C +
SSE 3C + idempotência 3D), mockando APENAS o provedor de LLM no limite da
chamada (mesmo padrão de `src/integration/gerarSse.test.ts`).

Cobertura exigida (roadmap 4A) — um cenário único encadeado + casos isolados:
- login (cookie httpOnly, JWT);
- upload de documento e indexação;
- criação de processo vinculado;
- classificação da operação (FLASH/PRO via catálogo compartilhado);
- estimativa + reserva de créditos (credit_ledger);
- geração com SSE (operacao → progresso → texto → concluido);
- fallback Flash→Pro (somente com confirmação estruturada 3B);
- persistência idempotente da peça (replay da MESMA chave → mesma peça);
- validação humana e exportação (status aprovado/protocolado);
- débito real de tokens (uso REAL, nunca aproximado);
- retry idempotente após falha simulada;
- isolamento multi-tenant (escritório B não enxerga/toca dados de A).

Requisitos:
- servidor Express real em porta efêmera + banco real (padrão dos testes de
  integração existentes); NUNCA mockar o banco;
- mock SOMENTE do provider (stream de eventos SSE do DeepSeek), como 3C;
- assertar efeitos financeiros reais (reserva/settle/ledger) e não só status;
- nenhuma chamada de rede real a provedores (determinístico);
- suíte completa verde: `pnpm --filter @lexia/api test` + `web test` + builds.

Não altere código de produção além do estritamente necessário para testar
(helpers exportados se preciso). Evidência: suíte verde + diff.
```

## GPT-5.6 Luna — revisão

```text
Fase: 4A — Testes end-to-end.

Analise a suíte e2e do fluxo completo de operação de IA (stack real, provider
mockado).

Confirme:
- cenário encadeado cobre login→upload→processo→classificação→reserva→
  geração SSE→persistência→validação→exportação→débito;
- retry idempotente (mesma chave) e fallback Flash→Pro com confirmação
  estruturada;
- isolamento multi-tenant verificado de ponta a ponta;
- uso REAL de tokens (nunca aproximado) e efeitos de ledger assertados;
- nenhuma chamada real a provedor; banco real nunca mockado;
- suítes backend E frontend verdes + builds.

Retorne o veredito em JSON.
```
# 4B — Piloto controlado

## DeepSeek — implementação

```text
Fase atual: 4B — Piloto controlado.

Confirme que 4A (testes end-to-end) está `AUDIT_APPROVED`.

Implemente a CAMADA DE CONTROLE do piloto controlado (resultado esperado:
`READY_FOR_PILOT`, NÃO produção automática). Tudo deve ser reversível por
configuração (rollback = desligar as flags; zero efeito em produção sem piloto).

Alterações esperadas (roadmap 4B):
- flag `PILOTO_ATIVO` + limites configuráveis (escritórios, usuários por
  escritório, documentos por escritório, alerta de custo em cents);
- bloqueio no cadastro/registro quando o limite de escritórios ativos for
  atingido (403 com código `PILOTO_LIMITE_ESCRITORIOS`);
- bloqueio na criação de usuário quando o limite por escritório for atingido
  (`PILOTO_LIMITE_USUARIOS`);
- bloqueio no upload de documentos quando o limite por escritório for atingido
  (`PILOTO_LIMITE_DOCUMENTOS`);
- OBSERVABILIDADE: alerta de custo por escritório — quando o custo consumido
  do ciclo (credit_ledger) ultrapassar o limiar, registrar auditoria + log e
  notificar o e-mail raiz (best-effort, sem quebrar o fluxo);
- acompanhamento manual: endpoint root `GET /api/root/piloto/status` com
  contagens, limites e alertas ativos (resultado `READY_FOR_PILOT`);
- rollback preparado: TODAS as decisões derivadas de env (default piloto
  DESLIGADO); documentar rollback no README/roadmap.

Requisitos:
- defaults SEGUROS: piloto desligado por padrão (produção atual intocada);
- os limites usam o catálogo/bd existente (escritorios.limiteUsuarios etc.);
- alerta de custo NUNCA bloqueia geração (só observa/notifica);
- testes: unitários do config/limites + integração dos bloqueios e do alerta;
- suíte completa verde + builds.

Não altere a lógica financeira existente (reserva/settle/fallback) — apenas
ADICIONE a camada de controle.
```

## GPT-5.6 Luna — revisão

```text
Fase: 4B — Piloto controlado.

Analise a camada de controle do piloto (resultado READY_FOR_PILOT).

Confirme:
- piloto DESLIGADO por padrão (rollback = desligar flags; produção intocada);
- bloqueios 403 com códigos PILOTO_LIMITE_* no registro/usuários/upload;
- alerta de custo por escritório (credit_ledger do ciclo) registrado em
  auditoria/log + notificação best-effort, SEM bloquear geração;
- endpoint root de status com contagens/limites/alertas;
- testes unitários + integração dos bloqueios e do alerta; suítes verdes.

Retorne o veredito em JSON.
```
