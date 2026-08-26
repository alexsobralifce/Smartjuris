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

# 5E — Migrar cost_cents_reserved para numeric(10,2)

## DeepSeek — implementação

```text
Fase atual: 5E — Migrar cost_cents_reserved para numeric(10,2).

Criar migração que altera a coluna cost_cents_reserved da tabela ai_operations de integer para numeric(10,2), preservando dados legados, com upgrade idempotente e rollback.

Escopo:
Implementar migração de banco de dados (up/down), atualizar tipos no modelo/entidade, garantir que dados legados inteiros sejam lidos como numeric(10,2) sem perda.

Fora do escopo:
Não alterar o cálculo de custo, nem fluxos de liquidação/orçamento.

Testes obrigatórios:
- Teste de migração em banco limpo
- Teste de upgrade a partir de schema anterior com dados legados
- Teste de idempotência da migração
- Teste de rollback da migração

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5E — Migrar cost_cents_reserved para numeric(10,2).

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Coluna cost_cents_reserved é numeric(10,2) após migração
- Dados legados inteiros permanecem com o mesmo valor após migração
- Migração pode ser executada em banco limpo e em banco com dados, sem erro
- Executar a migração duas vezes é idempotente
- Rollback retorna a coluna para integer e preserva os valores

Responda somente no formato JSON do contrato de auditoria.
```

# 5F — Calcular custo reservado com precisão de centésimos de centavo

## DeepSeek — implementação

```text
Fase atual: 5F — Calcular custo reservado com precisão de centésimos de centavo.

Alterar a função calculateAiCostCents em services/usage.ts para calcular o custo total em centavos com duas casas decimais (centésimos de centavo), sem Math.ceil por componente. Arredondar o total para cima na precisão de 0,01 centavo.

Escopo:
Substituir o arredondamento por componente por arredondamento do total a 2 casas decimais (usando teto para não sub-reservar), e ajustar os pontos de leitura utilitários que exigem centavos inteiros. Ajustes específicos nos fluxos de negócio ficam para a fase 5H.

Fora do escopo:
Não alterar a fórmula de custo real do provedor, nem a liquidação/settle. Não revisar fluxos de negócio (fallback, créditos, release).

Testes obrigatórios:
- Teste de que fatias com o dobro de tokens reservam custo diferente
- Teste de que o valor reservado é gravado com até 2 casas decimais
- Teste de que leitura como inteiro continua funcionando

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5F — Calcular custo reservado com precisão de centésimos de centavo.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- calculateAiCostCents retorna número com duas casas decimais em centavos
- Uma operação com 2x tokens reserva custo maior que a operação de 1x (sem colapso para o mesmo inteiro)
- Nenhum Math.ceil por componente permanece no cálculo de reserva
- Leitores que esperam centavos inteiros recebem valor arredondado de forma consistente

Responda somente no formato JSON do contrato de auditoria.
```

# 5G — Ajustar orçamento interno para precisão de reserva

## DeepSeek — implementação

```text
Fase atual: 5G — Ajustar orçamento interno para precisão de reserva.

Atualizar o controle de orçamento interno (maxReserveCents, aviso de 80%, bloqueio 'orcamento-interno-do-ciclo-insuficiente') para trabalhar com somas de reservas numéricas precisas, sem colapsar para inteiro.

Escopo:
Alterar consultas/cálculos de uso de reserva no ciclo para somar numeric(10,2) diretamente, comparar com limite sem arredondamento para inteiro, e ajustar mensagens/aviso para exibição em centavos inteiros quando necessário.

Fora do escopo:
Não alterar a definição de maxReserveCents (continua inteiro em centavos).

Testes obrigatórios:
- Teste de cenário 'FLASH cabe mas PRO estoura' revisto com nova precisão
- Teste de bloqueio por 'orcamento-interno-do-ciclo-insuficiente' com reserva fracionária
- Teste de aviso de reserva acima de 80% com precisão

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5G — Ajustar orçamento interno para precisão de reserva.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Reservas com valores fracionários são consideradas no orçamento sem arredondamento para inteiro
- Uma reserva de 10,4 centavos estoura um maxReserveCents=10, enquanto 10,0 não
- O bloqueio e o aviso de 80% disparam nos limites corretos com precisão

Responda somente no formato JSON do contrato de auditoria.
```

# 5H — Garantir compatibilidade com fluxos e dados legados

## DeepSeek — implementação

```text
Fase atual: 5H — Garantir compatibilidade com fluxos e dados legados.

Ajustar os fluxos existentes (reserva idempotente, fallback Flash→Pro, análise documental, créditos, liquidação, liberação) para operarem com a nova precisão, mantendo compatibilidade com dados legados e sem regressão.

Escopo:
Revisar e corrigir pontos que convertem cost_cents_reserved para inteiro de forma inadequada; garantir que a liquidação usa o custo real do provedor (não o reservado), e que release/credits usam o valor reservado com precisão.

Fora do escopo:
Não alterar regras de negócio de cobrança, nem preços.

Testes obrigatórios:
- Teste de que a liquidação (settle) não cobra a mais com a nova precisão
- Teste de compatibilidade com dados legados (cost_cents_reserved integer antigo)
- Teste de reserva idempotente com valores precisos
- Teste de fallback Flash→Pro sem regressão
- Teste de análise documental sem regressão

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5H — Garantir compatibilidade com fluxos e dados legados.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Suíte de custo/fallback/análise documental passa com ajustes de precisão
- Dados legados integer são tratados corretamente nas operações
- Settle usa custo real do provedor independente da precisão da reserva
- Release libera exatamente o valor reservado com precisão
- Reserva idempotente não duplica nem arredonda incorretamente

Responda somente no formato JSON do contrato de auditoria.
```

# 5I — Expor telemetria com precisão de custo reservado

## DeepSeek — implementação

```text
Fase atual: 5I — Expor telemetria com precisão de custo reservado.

Garantir que o custo reservado com a nova precisão seja rastreável no run/operação, mantendo os mesmos campos da telemetria com valores mais precisos.

Escopo:
Atualizar serialização de eventos/logs de telemetria para incluir cost_cents_reserved com até 2 casas decimais, sem alterar nomes de campos.

Fora do escopo:
Não alterar o schema de telemetria além do valor do campo existente.

Testes obrigatórios:
- Teste de que o campo cost_cents_reserved aparece com precisão decimal na telemetria
- Teste de que eventos legados sem casas decimais continuam sendo aceitos

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 5I — Expor telemetria com precisão de custo reservado.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Telemetria do run/operação registra cost_cents_reserved com valores fracionários
- O formato permanece compatível com leitores que esperam número (inteiro ou decimal)

Responda somente no formato JSON do contrato de auditoria.
```

# 6A — Rastreabilidade persistida da busca ao vivo de jurisprudência

## DeepSeek — implementação

```text
Fase atual: 6A — Rastreabilidade persistida da busca ao vivo de jurisprudência.

Persistir, para cada geração de peça que aciona (ou ignora) a busca de jurisprudência ao vivo, um registro de auditoria com metadados — escritório, usuário, operação, tribunal(ais), termos de busca, número de decisões usadas, origem (ao-vivo/cache/pausa/falha/sem-chave), rate limit restante observado e timestamp — em app_logs ou tabela dedicada, sem persistir conteúdo de decisões nem dados sensíveis.

Escopo:
Criar função de registro persistente de rastreabilidade chamada no fluxo de geração (geracaoSSE) após buscarJurisprudenciaSeNecessario, capturando os metadados do ResultadoJurisprudencia (decisoesUsadas, tribunais, fromCache) e do estado (pausa de rate limit, falha, sem chave, sem termos, zero resultados). Gravar apenas metadados (tenancy e LGPD).

Fora do escopo:
Não alterar regras de negócio de cobrança nem o fluxo best-effort; não persistir o conteúdo das decisões nem os fatos do caso; não mudar o formato do log [jurisprudenciaRag] existente.

Testes obrigatórios:
- Teste de que a rastreabilidade é persistida com metadados corretos (origem ao-vivo/cache, número de decisões, tribunal, termos) após geração com includeJurisprudence=true
- Teste de que nenhum conteúdo de decisão nem dado sensível é persistido

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 6A — Rastreabilidade persistida da busca ao vivo de jurisprudência.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Após gerar peça com includeJurisprudence=true, existe registro persistente de auditoria com origem (ao-vivo/cache), número de decisões usadas e tribunal consultado
- O registro não contém conteúdo de decisões nem dados sensíveis do caso

Responda somente no formato JSON do contrato de auditoria.
```
# 6B — Aviso estruturado quando a peça sai sem jurisprudência ao vivo

## DeepSeek — implementação

```text
Fase atual: 6B — Aviso estruturado quando a peça sai sem jurisprudência ao vivo.

Retornar aviso estruturado no resultado da operação quando includeJurisprudence=true mas a busca ao vivo não produz bloco (falha do provedor, pausa de rate limit, sem chave, sem termos ou zero resultados), com o motivo, para o frontend exibir via SSE e para os metadados da peça registrarem o estado; quando o bloco vier do cache, informar origem 'cache'.

Escopo:
Criar campo estruturado (ex.: jurisprudenciaStatus/jurisprudenciaAvisos) no fluxo SSE e/ou metadados da peça com o motivo (falha do provedor, pausa de rate limit, sem chave, sem termos, zero resultados, cache). Transmitir o aviso nos eventos SSE da geração e persistir/expor nos metadados da peça sem quebrar o contrato de geração existente.

Fora do escopo:
Não alterar o frontend (apenas preparar o contrato de resposta); não mudar a formatação do bloco de fundamentação quando a busca tem sucesso; não alterar os eventos SSE já existentes (apenas adicionar campos).

Testes obrigatórios:
- Teste que fallback por API indisponível produz aviso estruturado na operação e não quebra a geração
- Teste que fallback por pausa de rate limit produz aviso com motivo 'rate limit'
- Teste que fallback por sem chave / zero resultados / sem termos produz aviso correspondente
- Teste que quando o bloco vem do cache o aviso/rastreabilidade indica origem 'cache'
- Teste que a suíte geracaoSSE existente permanece verde

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 6B — Aviso estruturado quando a peça sai sem jurisprudência ao vivo.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Quando a busca ao vivo não produz bloco, a operação/peça carrega aviso visível ao usuário com o motivo
- A geração nunca falha por ausência de jurisprudência ao vivo
- Não há regressão no fluxo SSE existente

Responda somente no formato JSON do contrato de auditoria.
```
# 6C — Política de rate limit configurável e observável

## DeepSeek — implementação

```text
Fase atual: 6C — Política de rate limit configurável e observável.

Tornar configuráveis via env (ex.: JURISPRUDENCIA_RATE_LIMIT_MIN_REMAINING e JURISPRUDENCIA_RATE_LIMIT_PAUSA_MS) o limiar mínimo de requisições restantes e a duração da pausa da busca ao vivo, com os valores atuais como default, e expor o estado observável por escritório (pausado ou não, até quando, motivo: header baixo ou resposta 429), mantendo o comportamento best-effort.

Escopo:
Ler limiar e duração da pausa de envs com default (2 e 60000ms). Expor função/estado observável de pausa por escritório (motivo e expiração) para consumo por admin/dashboard. Registrar motivo da pausa na rastreabilidade.

Fora do escopo:
Não alterar regras de negócio de cobrança; não bloquear a geração por causa do rate limit (best-effort permanece).

Testes obrigatórios:
- Teste de que a política respeita os novos envs configuráveis (limiar e duração da pausa)
- Teste de que o estado observável da pausa expõe motivo e expiração
- Teste de que a pausa não bloqueia a geração (fallback RAG)

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 6C — Política de rate limit configurável e observável.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Limiar e duração da pausa de rate limit são alteráveis via env, sem mudança de código
- O estado de pausa por escritório é consultável (até quando e motivo)
- A geração nunca falha por causa do rate limit

Responda somente no formato JSON do contrato de auditoria.
```
# 6D — Cache persistente de decisões via Redis com fallback em memória

## DeepSeek — implementação

```text
Fase atual: 6D — Cache persistente de decisões via Redis com fallback em memória.

Migrar o cache de decisões de jurisprudência por escritório de memória (Map) para Redis com TTL de 1 hora e chave escopada por (escritório + tribunal + termos normalizados), com fallback para o cache em memória quando o Redis estiver indisponível, garantindo isolamento por escritório e que a geração nunca quebra.

Escopo:
Implementar leitura/escrita do cache via Redis (cliente existente no ambiente) com chaves escopadas por escritório e TTL 1h; fallback transparente para o Map em memória quando o Redis falha ou não está configurado; manter as funções cacheGet/cacheSet/cacheSize com a mesma semântica.

Fora do escopo:
Não alterar a lógica de negócio da geração; não mudar o TTL default; não persistir conteúdo de decisões em banco relacional.

Testes obrigatórios:
- Teste de que segunda geração idêntica usa cache Redis (zero chamadas à API)
- Teste de que o cache Redis é isolado por escritório (mesmos termos/tribunal para escritórios diferentes geram chaves diferentes)
- Teste de que quando Redis está indisponível o fallback para memória funciona e a geração não quebra

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 6D — Cache persistente de decisões via Redis com fallback em memória.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- O cache sobrevive a restart da API (Redis) e é isolado por escritório
- A geração nunca falha por indisponibilidade do Redis

Responda somente no formato JSON do contrato de auditoria.
```
# 6E — Endpoint de telemetria e saúde da integração de jurisprudência

## DeepSeek — implementação

```text
Fase atual: 6E — Endpoint de telemetria e saúde da integração de jurisprudência.

Criar endpoint de telemetria/status (acesso admin/root ou consumido pelo dashboard) que reporte total de chamadas ao vivo, cache hits (Redis/memória), pausas ativas por escritório, rate limit restante da última chamada, falhas recentes e métrica de latência da busca ao vivo, sem expor dados sensíveis.

Escopo:
Manter contadores em memória (chamadas ao vivo, cache hits por origem, falhas, latência média/última) e expor endpoint JSON que agregue estado de pausa (6C) e cache (6D). Garantir que o endpoint não exponha termos, decisões, chaves de API nem dados sensíveis do escritório.

Fora do escopo:
Não alterar a lógica de negócio da geração; não implementar autenticação/roles do dashboard (consumir as existentes); não persistir telemetria em banco (apenas expor estado em memória/contadores).

Testes obrigatórios:
- Teste que o endpoint retorna total de chamadas ao vivo, cache hits, pausas ativas e rate limit restante
- Teste que o endpoint não vaza dados sensíveis (termos, decisões, chaves, dados do escritório)
- Teste que a latência da busca ao vivo é registrada e exposta

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 6E — Endpoint de telemetria e saúde da integração de jurisprudência.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Endpoint de telemetria reporta chamadas ao vivo, cache hits, pausas ativas e rate limit restante, sem dados sensíveis
- A métrica de latência permite monitorar degradação do provedor

Responda somente no formato JSON do contrato de auditoria.
```

# 6F — Acesso ao portal Jurisprudências.ai e URL da API configurável

## DeepSeek — implementação

```text
Fase atual: 6F — Acesso ao portal Jurisprudências.ai e URL da API configurável.

Disponibilizar acesso direto ao portal do provedor (https://jurisprudencias.ai/) a partir do SmartJuris — onde o escritório gerencia a conta, chave, planos e rate limit — e tornar a URL base da API configurável por ambiente (ex.: staging/sandbox do provedor), mantendo o default atual.

Escopo:
Adicionar link/atalho 'Acessar Jurisprudências.ai' na interface (módulo Decisões & Tribunais e/ou painel admin do escritório) abrindo https://jurisprudencias.ai/ em nova aba, junto à área de consulta de jurisprudência. Tornar a URL base da API lida de env (ex.: JURISPRUDENCIAS_API_URL) com default https://jurisprudencias.ai/api/v1, usada por listCourts/searchDecisions/lookupDecision. Manter a chave JURISPRUDENCIAS_API_KEY como hoje.

Fora do escopo:
Não implementar autenticação/SSO com o portal; não alterar o contrato dos endpoints da API existentes; não mudar regras de negócio de cobrança; não expor a chave de API na interface.

Testes obrigatórios:
- Teste de que a URL base da API é lida do env com default correto e usada pelas funções de consulta
- Teste de que a função que expõe o link do portal retorna https://jurisprudencias.ai/ sem vazar a chave
- Teste de que a suíte existente de jurisprudência (jurisprudencias/jurisprudenciaRag) permanece verde com o default

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 6F — Acesso ao portal Jurisprudências.ai e URL da API configurável.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- O usuário consegue acessar o portal Jurisprudências.ai a partir do SmartJuris (link em nova aba)
- A URL base da API é configurável via env sem mudança de código
- A chave de API não é exposta na interface

Responda somente no formato JSON do contrato de auditoria.
```

# 7B — Feature Flags e Lógica de Elegibilidade/Promoção

## DeepSeek — implementação

```text
Fase atual: 7B — Feature Flags e Lógica de Elegibilidade/Promoção.

Implementar variáveis de ambiente e serviços de domínio para cálculo de preço promocional e verificação de elegibilidade de novo cliente.

Escopo:
Adicionar env vars PROMOCAO_ATIVA (default false) e PROMOCAO_PERCENTUAL (default 50). Criar serviço para calcular valor promocional (50% de 180/300/500 = 90/150/250) estritamente no backend. Criar serviço de elegibilidade: novo cliente = escritório sem histórico de assinatura paga (sem mercado_pago_id com payment aprovado) e CNPJ/admin não associado a assinatura ativa/anterior.

Fora do escopo:
Alterar fluxo de checkout existente, criar preferências no Mercado Pago, persistência de uso da promoção.

Testes obrigatórios:
- Teste unitário de cálculo do valor promocional (50% de 180/300/500 = 90/150/250).
- Teste unitário de elegibilidade: novo elegível, re-assinante NÃO elegível, CNPJ repetido NÃO elegível.

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7B — Feature Flags e Lógica de Elegibilidade/Promoção.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Feature flags lidas corretamente do ambiente com defaults corretos.
- Cálculo do valor promocional feito exclusivamente no backend, nunca aceitando valor do cliente.
- Elegibilidade bloqueia re-assinantes e CNPJs com histórico de pagamento.

Responda somente no formato JSON do contrato de auditoria.
```

# 7C — Modelo de Dados e Persistência de Uso da Promoção

## DeepSeek — implementação

```text
Fase atual: 7C — Modelo de Dados e Persistência de Uso da Promoção.

Adicionar estrutura de dados para rastrear o uso da promoção e evitar reutilização (anti-abuso).

Escopo:
Criar nova coluna ou tabela (ex: promocao_uso) no escritório para persistir: promocao_usada (boolean), promocao_plano (string), promocao_valor_cents (integer), promocao_ativa_em (timestamp). Atualizar modelos de domínio e repositórios para suportar leitura e escrita desses campos.

Fora do escopo:
Lógica de webhook, integração com Mercado Pago, criação de preferências.

Testes obrigatórios:
- Teste de repositório para salvar e recuperar dados de uso da promoção.
- Teste de anti-abuso: cancelar e re-assinar não reaplica a promoção (bloqueado por promocao_usada=true).

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7C — Modelo de Dados e Persistência de Uso da Promoção.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Campos promocao_usada, promocao_plano, promocao_valor_cents e promocao_ativa_em persistidos corretamente.
- Promoção UNA vez por escritório: após usar, promocao_usada=true bloqueia nova aplicação.

Responda somente no formato JSON do contrato de auditoria.
```

# 7D — Checkout Promocional (1ª Compra Avulsa)

## DeepSeek — implementação

```text
Fase atual: 7D — Checkout Promocional (1ª Compra Avulsa).

Implementar a criação da preferência de pagamento avulsa no Mercado Pago com o valor promocional para a primeira compra.

Escopo:
Ao assinar como novo cliente elegível com promoção ativa, criar PREFERENCE (Checkout Pro) com items contendo título 'SmartJuris — Plano X (1º mês promocional)', quantity 1, unit_price igual ao valor promocional. Definir external_reference com escritorioId e marcador promocional. Manter back_url/notification_url do fluxo atual. Retornar init_point. Persistir dados de uso da promoção no escritório.

Fora do escopo:
Processamento do webhook de aprovação, criação da assinatura recorrente definitiva.

Testes obrigatórios:
- Teste de integração para criação da preference avulsa com valor promocional correto e external_reference com marcador.

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7D — Checkout Promocional (1ª Compra Avulsa).

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Preference criada com valor promocional calculado no backend.
- external_reference contém marcador promocional para identificação no webhook.
- Dados de uso da promoção persistidos antes de retornar o init_point.

Responda somente no formato JSON do contrato de auditoria.
```

# 7E — Webhook da 1ª Compra e Assinatura Definitiva

## DeepSeek — implementação

```text
Fase atual: 7E — Webhook da 1ª Compra e Assinatura Definitiva.

Processar o pagamento avulso promocional aprovado e criar a assinatura recorrente definitiva com valor integral.

Escopo:
Processar webhook payment.approved do avulso identificando pelo marcador no external_reference. Ativar escritório e recarregar créditos. Criar ASSINATURA DEFINITIVA (preapproval) com transaction_amount INTEGRAL, frequency 1 mês, e primeiro vencimento agendado ~30 dias após a 1ª compra. Gravar mercado_pago_id da assinatura definitiva no escritório. Implementar idempotência (billing_webhook_events) e retry/reconciliação para falhas na criação da assinatura sem duplicar preference ou cobrar 2x.

Fora do escopo:
Fluxo de cobrança mensal padrão a partir do 2º mês (já existente).

Testes obrigatórios:
- Teste de integração (MP real/mock): preference avulsa aprovada gera ativação e criação da assinatura definitiva.
- Teste de idempotência: webhook duplicado não ativa 2x nem duplica a assinatura.

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7E — Webhook da 1ª Compra e Assinatura Definitiva.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Webhook identifica corretamente o pagamento promocional via external_reference.
- Escritório ativado e créditos recarregados.
- Preapproval criado com valor integral e vencimento em ~30 dias.
- Idempotência e retry garantem robustez sem duplicações.

Responda somente no formato JSON do contrato de auditoria.
```

# 7F — Frontend - Exibição da Promoção e Painel de Dev

## DeepSeek — implementação

```text
Fase atual: 7F — Frontend - Exibição da Promoção e Painel de Dev.

Atualizar a interface do usuário para exibir a promoção de boas-vindas e adicionar indicador no painel de desenvolvedor.

Escopo:
Na tela de pricing/assinatura, quando PROMOCAO_ATIVA e escritório elegível, exibir '50% OFF no 1º mês' e resumo '1º mês R$ X -> depois R$ Y/mês'. Mostrar valor promocional da 1ª compra antes de redirecionar ao MP. No painel de dev do billing (root), adicionar indicador de escritórios que usaram a promoção.

Fora do escopo:
Lógica de backend de cálculo, criação de preferências e webhooks.

Testes obrigatórios:
- Teste de UI/E2E para exibição correta dos valores promocionais e resumo na tela de assinatura.
- Teste de UI para indicador no painel de dev (root).

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7F — Frontend - Exibição da Promoção e Painel de Dev.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Frontend exibe corretamente o desconto e o resumo de preços quando elegível.
- Valor promocional mostrado antes do redirect para o MP.
- Painel de dev exibe indicador claro de uso da promoção.

Responda somente no formato JSON do contrato de auditoria.
```

# 7G — Testes de Regressão e Validação Final

## DeepSeek — implementação

```text
Fase atual: 7G — Testes de Regressão e Validação Final.

Garantir que o fluxo sem promoção permanece inalterado e que todos os testes existentes continuam passando.

Escopo:
Executar suíte de testes de regressão com PROMOCAO_ATIVA=false para garantir que o fluxo atual permanece idêntico. Validar que os 398 testes atuais continuam verdes. Consolidar testes de anti-abuso e integração real.

Fora do escopo:
Novas funcionalidades de negócio ou alterações no fluxo padrão.

Testes obrigatórios:
- Teste de regressão: fluxo SEM promoção (PROMOCAO_ATIVA=false) continua idêntico.
- Execução completa da suíte garantindo 398 testes atuais verdes.

Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7G — Testes de Regressão e Validação Final.

Analise o diff, os testes e os resultados executados.

Critérios de aceite (avaliar APENAS estes, sem criar novos):
- Desligada por padrão, sem impacto no fluxo atual quando inativa.
- Todos os 398 testes existentes passam sem falhas.
- Cliente novo paga metade na 1ª mensalidade e integral a partir do 2º mês validado em ponta a ponta.

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
# 7A — Integração Mercado Pago — Assinatura Recorrente (Checkout Pro + Webhooks)

## DeepSeek — implementação

```text
Fase atual: 7A — Integração Mercado Pago — Assinatura Recorrente.

IMPLEMENTAÇÃO JÁ REALIZADA (commit a51687f). Colete evidências e envie ao revisor.

Escopo (implementado):
- Migration 0027: novos campos em `escritorios` (`mercado_pago_id`, `assinatura_status/plano/datas`, ciclo de créditos)
- services/billing.ts: cliente MP via fetch nativo (criar/consultar/cancelar preapproval, validar x-signature HMAC-SHA256, processar webhooks de payment e subscription_preapproval)
- routes/billing.ts · billingWebhook.ts: POST /checkout (admin → initPoint), GET /status, POST /cancelar, POST /webhook (público, sem auth)
- frontend Assinatura.tsx: tela com status, cards plano Básico R$180 / Intermediário R$300 / Avançado R$500, redirecionamento checkout, cancelar assinatura
- api/client.ts · App.tsx: rotas 'assinatura' + retorno post-checkout (?r=assinatura)
- config .env: MERCADO_PAGO_ACCESS_TOKEN/PUBLIC_KEY, APP_URL (validação HTTPS obrigatória)

Fluxo: admin escolhe plano → checkout → redirect init_point → MP cobra → webhook authorized/approved → escritório ativado + recarga mensal de créditos; payment.rejected ou preapproval.paused → desativa escritório.

Comandos de evidência:
- `pnpm --filter @lexia/api build` → tsc deve passar
- `pnpm --filter @lexia/web build` → vite build deve passar
- `pnpm --filter @lexia/api test` → 377 testes passando (9 novos em billing.test.ts)
- `git diff --cached --stat` → arquivos alterados na integração
- Verificar se `apps/api/src/db/migrations/0027_billing_mercado_pago.sql` existe e é válido
- Verificar se `MERCADO_PAGO_ACCESS_TOKEN` está configurado (.env existente e não-vazio)
- Confirmar que `mpConfigurado: true` no endpoint GET /api/billing/status

Execute builds + testes. Entregue diff, resultados, limitações e riscos. Pare para revisão.
```

## GPT-5.6 Luna — revisão

```text
Fase: 7A — Integração Mercado Pago — Assinatura Recorrente.

Analise o diff, os testes e os resultados executados.

Contexto: integração completa de cobrança recorrente via Mercado Pago Subscriptions (preapproval + auto_recurring). Backend: migration SQL (0027), serviço billing.ts (fetch nativo, x-signature validation, webhook handler), rotas /billing/*, autenticação admin-only para checkout/cancelar. Frontend: tela Assinatura.tsx com 3 planos (R$180/300/500), redirecionamento ao initPoint do MP, validação HTTPS obrigatória. Testes unitários billing.test.ts (9 testes — mapeamento de planos, preços, lista, HMAC x-signature). Suíte total 377 testes verdes.

Críticos (avaliar APENAS estes):
- **Segurança**: webhook sem cookie mas com validação HMAC-SHA256 (x-signature); tokens MP apenas em env; back_url exige https://; nenhum dado financeiro sensível exposto; auditoria de todas ações financeiras; requireAdmin no checkout/cancelar.
- **Robustez**: resiliência de resolução escritório (external_reference OU preapproval_id); uso de assinaturaPlano gravado como fallback quando description do payment não bate; tratamento de estados pending/paused/cancelled/rejected corretos; reset seguro do ciclo de créditos (só novo mês ou reativação).
- **Dados**: migration idempotente (ALTER TABLE ADD COLUMN IF NOT EXISTS); colunas nullable/default; cleanup legado após teste real de produção.
- **Testes**: 9 unitários + 377 suíte total verde; checkout real testado (created preapproval → verified cancelable); webhook real testado (pending → sem mudança); cancelamento real no MP confirmado.

Não crie critérios novos. Responda somente no formato JSON do contrato de auditoria.
```

# 8A — Documentos do Cliente

## DeepSeek — implementação

```text
Fase atual: 8A — Documentos do Cliente.


IMPORTANTE — AVISO SOBRE O WORKING TREE: o repositório contém várias alterações locais NÃO relacionadas a esta fase (ex.: Assinatura.tsx, rootStats.ts, travaAssinatura.ts, Config.ts, mcp-server.ts etc.). IGNORE-AS COMPLETAMENTE. Elas NÃO são a implementação desta fase e NÃO devem ser listadas, usadas, modificadas, revertidas ou citadas como "já implementado". A fase 8A ainda NÃO foi implementada: você DEVE criar/alterar apenas os arquivos do escopo abaixo (migration 0038, schema.ts, documento.ts, documentos.ts, schemas.ts, Clientes.tsx e o novo teste de integração). Se a sua resposta não contiver esses arquivos do escopo da fase, a rodada será rejeitada.


Confirme no roadmap que todas as fases anteriores de que esta depende estão `AUDIT_APPROVED`.
Esta fase NÃO tem dependência crítica de IA/créditos; pode ser implementada de forma independente.


---


## Objetivo


Permitir que o advogado vincule documentos (PDFs) diretamente ao cadastro de um cliente no SmartJuris.
O fluxo deve funcionar tanto no momento do cadastro quanto na edição de um cliente já existente.


---


## Escopo técnico obrigatório


### 1. Migration (backend)


Crie a migration `apps/api/src/db/migrations/0038_cliente_documentos.sql`.


A migration deve:
- Adicionar a coluna `cliente_id uuid REFERENCES clientes(id)` na tabela `documentos` (nullable — compatibilidade com documentos já existentes sem cliente vinculado).
- Adicionar um índice simples em `documentos(cliente_id)` para eficiência nas listagens.
- Não alterar nenhuma coluna existente; apenas adicionar.


Atualize o schema Drizzle em `apps/api/src/db/schema.ts`:
- Adicione o campo `clienteId` na tabela `documentos` como referência FK para `clientes.id` (nullable).


---


### 2. Rota de upload (backend — `apps/api/src/routes/documentos.ts`)


No endpoint `POST /api/documentos/upload`, o frontend já pode enviar `processoId` (campo existente).
Adicione suporte ao campo `clienteId` (opcional) no body da requisição, com as mesmas proteções de tenancy do `processoId`:


- Se `clienteId` informado: validar que o cliente pertence ao mesmo `escritorio_id` do usuário autenticado. Cliente de outro escritório → 403 + auditoria `UPLOAD_DOCUMENTO_BLOQUEADO` com motivo `cliente-de-outro-escritorio`.
- `clienteId` é passado para `processarUploadDocumento` e persistido no campo `cliente_id` da tabela `documentos`.
- Nunca aceitar `clienteId` como fonte de escopar o escritório — apenas validar o vínculo.


Adicione o campo `clienteId` no schema de validação Zod centralizado em `apps/api/src/validation/schemas.ts` (campo `colecaoSchema` ou schema equivalente).


---


### 3. Rota de listagem (backend — `apps/api/src/routes/documentos.ts` e `apps/api/src/services/documento.ts`)


Crie uma rota filtrada:
  `GET /api/documentos?clienteId=<uuid>`


Comportamento:
- Se `clienteId` informado: lista apenas os documentos daquele cliente dentro do escritório autenticado.
- Se não informado: mantém o comportamento atual (lista todos os documentos do escritório).
- Documentos em quarentena (`indexed_status = 'unscoped'`) jamais aparecem, nem com filtro de cliente.
- Validar que o cliente pertence ao escritório autenticado antes de filtrar.


Atualize `listarDocumentosDoEscritorio` em `services/documento.ts` para aceitar o parâmetro `clienteId?: string` como filtro opcional.


---


### 4. Rota de deleção de documento (backend — `apps/api/src/routes/documentos.ts`)


Adicione o endpoint:
  `DELETE /api/documentos/:id`


Comportamento:
- Somente `admin` pode deletar (use o middleware `roleGuard(['admin'])` existente).
- Verificar que o documento pertence ao escritório autenticado (tenancy).
- Deletar chunks associados (tabela `chunks`) antes de deletar o documento (integridade referencial).
- Registrar auditoria `DELETE_DOCUMENTO` com `alvoId` = id do documento.
- Retornar 204 em sucesso.


---


### 5. Frontend — tela de Clientes (`apps/web/src/components/Clientes.tsx`)


Na visualização de detalhe de um cliente (quando o advogado clica para ver ou editar um cliente), adicione uma seção "Documentos do Cliente" com:


**5.1 Listagem de documentos vinculados:**
- Tabela com colunas: Nome, Tamanho, Área, Status de indexação e Data de upload.
- Buscar via `GET /api/documentos?clienteId=<id>` ao abrir o detalhe.
- Exibir estado de carregamento (spinner) e estado vazio com texto "Nenhum documento vinculado a este cliente." e ícone.


**5.2 Upload de novo documento:**
- Botão "Anexar Documento" que abre um input `type="file"` aceita apenas PDF.
- Ao selecionar o arquivo, enviar `POST /api/documentos/upload` com:
  - `file`: o PDF selecionado
  - `colecao`: valor fixo `"clientes"` (coleção dedicada a documentos de clientes)
  - `clienteId`: o UUID do cliente em detalhe
- Exibir barra de progresso ou indicador visual durante o upload.
- Ao concluir: exibir toast de sucesso e recarregar a lista de documentos do cliente.
- Em caso de erro: exibir toast com a mensagem da API.
- Limite de 15 MB já é aplicado no backend; o frontend deve validar o tipo (PDF) antes de enviar.


**5.3 Exclusão de documento (somente admin):**
- Para usuários com role `admin`, exibir um ícone de lixeira em cada linha da tabela.
- Ao clicar, exibir um modal de confirmação: "Tem certeza que deseja remover este documento? Esta ação não pode ser desfeita."
- Confirmar → `DELETE /api/documentos/:id` → toast de sucesso + recarregar lista.


**5.4 Experiência visual:**
- A seção de documentos deve seguir o design system existente (`PageContainer`, `TableShell`, `Table`, `Button`, `EmptyRow`, `Toast`).
- Animações/transições nos itens são bem-vindas mas não obrigatórias.
- Não quebre o layout atual do formulário de edição de clientes.


---


### 6. Restrições de escopo (NÃO faça nada disso)


- Não altere o fluxo de geração de peças, classificador, catálogo compartilhado, créditos, reserva ou SSE.
- Não altere a tela Base RAG (`Base.tsx`) — apenas a tela de Clientes (`Clientes.tsx`).
- Não crie uma rota dedicada de "documentos por cliente" em endpoint diferente do existente; use query param no endpoint existente.
- Não altere a autenticação, JWT ou sistema de roles.
- Não adicione colunas além de `cliente_id` na tabela `documentos`.
- Não altere o sistema de chunks, embeddings ou indexação — os documentos de clientes passam pelo mesmo pipeline de indexação existente.


---


### 7. Testes obrigatórios


**Testes de integração HTTP (adicionar em `apps/api/src/integration/`):**


- Upload de documento com `clienteId` válido → persiste `cliente_id` e retorna 201.
- Upload de documento com `clienteId` de outro escritório → retorna 403 + auditoria `UPLOAD_DOCUMENTO_BLOQUEADO`.
- Upload de documento sem `clienteId` → mantém comportamento original (compatibilidade regressiva).
- Listagem sem filtro → retorna todos os documentos do escritório (sem documentos de outros escritórios).
- Listagem com `clienteId` → retorna somente os documentos do cliente dentro do escritório.
- Listagem com `clienteId` de outro escritório → retorna 403.
- Deleção de documento por admin → 204, chunks removidos, auditoria gravada.
- Tentativa de deleção por `user` → 403.
- Tentativa de deletar documento de outro escritório → 403.


**Build:**
- `pnpm build` em `apps/api` deve estar verde.
- `pnpm build` em `apps/web` deve estar verde.


**Testes existentes:**
- Suíte completa deve permanecer verde (sem regressões).

**IMPORTANTE (lista fixa de testes):**
- O script `"test"` em `apps/api/package.json` usa uma LISTA FIXA de arquivos de teste (sem glob). Ao criar o novo arquivo de integração (ex.: `src/integration/clienteDocumentos.test.ts`), ADICIONE-O explicitamente à lista do script `"test"` em `apps/api/package.json`, senão ele não será executado pela suíte oficial (`pnpm --filter @lexia/api test`). Mantenha `NODE_ENV=test EMAIL_DISABLED=true` no script (protege a cota do Resend — nunca enviar e-mail real em testes).


---


## Entrega


Entregue:
1. Diff completo dos arquivos alterados.
2. Número da migration criada.
3. Resultado da suíte de testes (novos + regressão).
4. Resultado do build TypeScript (api + web).
5. Lista de limitações e riscos encontrados.


Aguarde revisão antes de avançar.
```

## GPT-5.6 Luna — revisão

```text
Fase: 8A — Documentos do Cliente.


Analise o diff, os testes executados e os builds.


Verifique:


1. MIGRATION
   - A migration apenas adiciona `cliente_id` (nullable) em `documentos` e o índice correspondente.
   - Nenhuma coluna existente foi alterada ou removida.
   - O schema Drizzle foi atualizado de forma consistente com a migration SQL.
   - O número sequencial da migration é o próximo disponível.


2. TENANCY (crítico)
   - O `clienteId` informado no upload é validado: pertence ao mesmo `escritorio_id` do usuário autenticado.
   - A listagem filtrada por `clienteId` valida o vínculo com o escritório antes de filtrar.
   - Documentos de outro escritório jamais aparecem, nem com filtro de cliente.
   - Documentos em quarentena (`unscoped`) não aparecem na listagem filtrada.
   - Tentativa de upload com `clienteId` de outro escritório gera auditoria `UPLOAD_DOCUMENTO_BLOQUEADO`.


3. ROTA DE UPLOAD
   - O `clienteId` é aceito como campo opcional, não obrigatório (regressão: upload sem cliente deve continuar funcionando).
   - O `clienteId` é validado via Zod antes de ser usado.
   - O `escritorio_id` do documento continua derivado do contexto autenticado (nunca do body).


4. ROTA DE LISTAGEM
   - O filtro por `clienteId` é opcional: sem ele, o comportamento original é preservado.
   - Com `clienteId`, somente documentos daquele cliente e daquele escritório são retornados.


5. ROTA DE DELEÇÃO
   - Somente `admin` pode deletar.
   - Tenancy verificada antes da deleção.
   - Chunks associados são removidos antes do documento.
   - Auditoria `DELETE_DOCUMENTO` gravada.


6. FRONTEND
   - A seção de documentos usa o design system existente (sem estilos ad-hoc fora do padrão).
   - Upload envia `colecao = "clientes"` e `clienteId`.
   - Exclusão disponível apenas para admin.
   - Erros da API são exibidos como toast.
   - Nenhuma alteração foi feita em componentes fora de `Clientes.tsx`.


7. ESCOPO
   - Classificador, catálogo, créditos, reserva, SSE, geração de peças e Base RAG não foram alterados.
   - Somente `Clientes.tsx` foi alterado no frontend.
   - Nenhuma rota nova foi criada fora do padrão descrito.


8. TESTES
   - Os cenários de upload com/sem `clienteId`, listagem filtrada, acesso cruzado, deleção e permissões foram cobertos.
   - Suíte de regressão permanece verde.


9. BUILDS
   - `apps/api` e `apps/web` compilaram sem erros TypeScript.


Responda somente neste formato JSON:


{
  "verdict": "APPROVE | APPROVE_WITH_CONDITIONS | REJECT",
  "findings": [],
  "requiredFixes": [],
  "missingTests": [],
  "advanceAllowed": false
}
```

# 8B — Limite de storage 1GB por escritório

## DeepSeek — implementação

```text
Fase atual: 8B — Limite de storage 1GB por escritório.

Dependência: 8A (AUDIT_APPROVED).

## Objetivo

Limitar o storage total de documentos por escritório a 1GB (1.073.741.824 bytes).

## Escopo técnico

### 1. Migration (`apps/api/src/db/migrations/0039_storage_bytes.sql`)
- Adicionar coluna `size_bytes bigint NOT NULL DEFAULT 0` em `documentos`
- Índice `idx_documentos_escritorio_size` em `documentos(escritorio_id, size_bytes)` para queries de soma

### 2. Schema Drizzle (`apps/api/src/db/schema.ts`)
- Adicionar `sizeBytes: bigint('size_bytes').notNull().default(0)` na tabela `documentos`

### 3. Service (`apps/api/src/services/documento.ts`)
- Exportar constante `STORAGE_LIMIT_BYTES = 1_073_741_824`
- Nova função `calcularStorageEscritorio(escritorioId: string): Promise<number>` que soma `size_bytes` de todos os documentos do escritório
- Em `processarUploadDocumento`: aceitar `sizeBytes` no input e persistir no insert
- Em `indexarChunksDoDocumento`: não precisa mudar (size_bytes é do documento, não dos chunks)

### 4. Rota upload (`apps/api/src/routes/documentos.ts`)
- ANTES de processar o upload: calcular `storageAtual + req.file.size`
- Se exceder `STORAGE_LIMIT_BYTES` → 403 `{ error: 'Limite de storage de 1GB atingido.', code: 'STORAGE_LIMIT_EXCEEDED' }`
- Registrar auditoria `UPLOAD_DOCUMENTO_BLOQUEADO` com motivo `storage-limit-exceeded`
- Passar `sizeBytes: req.file.size` para `processarUploadDocumento` e para o caminho piloto

### 5. Rota GET (`apps/api/src/routes/documentos.ts`)
- Adicionar ao response: `{ documentos: [...], storageUsado: number, storageLimite: STORAGE_LIMIT_BYTES }`
- Quando `clienteId` filtrado, `storageUsado` é do escritório inteiro (não do cliente)

### 6. Frontend (`apps/web/src/components/Clientes.tsx`)
- Na seção "Documentos do Cliente", adicionar barra de progresso: "X MB / 1 GB" com cor dinâmica (verde < 70%, amarelo 70-90%, vermelho > 90%)
- Quando exceder: desabilitar botão "Anexar Documento" com tooltip explicativo

### 7. API client (`apps/web/src/api/client.ts`)
- Atualizar retorno de `documentos.list()` e `documentos.listByCliente()` para incluir `storageUsado` e `storageLimite`

## Restrições
- Não altere multer (15MB por arquivo continua igual)
- Não altere classificador, catálogo, créditos, reserva
- Documentos legados sem `size_bytes` contam como 0

## Testes (`apps/api/src/integration/storageDocumentos.test.ts`)
1. Upload dentro do limite → 201 + `size_bytes` persistido
2. Upload que excede 1GB → 403 `STORAGE_LIMIT_EXCEEDED` + auditoria
3. Deleção libera espaço → upload seguinte funciona
4. GET retorna `storageUsado` e `storageLimite`
5. Upload com `clienteId` + storage check → ambos validados

Adicione o arquivo ao script `"test"` em `apps/api/package.json`.

## Entrega
Diff, migration, testes, build.
```

## GPT-5.6 Luna — revisão

```text
Fase: 8B — Limite de storage 1GB por escritório.

Verifique:
1. MIGRATION — `size_bytes bigint DEFAULT 0` + índice; sem alterar colunas existentes
2. SCHEMA — `sizeBytes` bigint notNull default 0
3. SERVICE — `STORAGE_LIMIT_BYTES = 1_073_741_824`; `calcularStorageEscritorio` soma todos; `processarUploadDocumento` aceita e persiste `sizeBytes`
4. ROTA UPLOAD — valida `storageAtual + novo > limite` ANTES de processar; 403 com auditoria; passa `sizeBytes` ao service
5. ROTA GET — retorna `{ documentos, storageUsado, storageLimite }`
6. FRONTEND — barra de uso com cores dinâmicas; botão desabilitado quando cheio
7. TENANCY — `calcularStorageEscritorio` filtra por `escritorio_id`; nunca soma documentos de outro escritório
8. TESTES — 5 cenários cobertos; build verde

Responda no formato JSON do contrato de auditoria.
```
