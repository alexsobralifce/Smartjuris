# SmartJuris — Roadmap de Implementação

## Objetivo

Organizar a evolução do SmartJuris em fases pequenas, verificáveis e auditáveis.

Cada fase segue o fluxo:

```text
DeepSeek implementa
        ↓
Testes e build
        ↓
GPT-5.6 Luna revisa
        ↓
Gate de aprovação
        ↓
Próxima fase ou correção
```

O DeepSeek é responsável pela implementação. O GPT-5.6 Luna analisa os resultados e decide se a fase pode avançar. O Terra não modifica o código.

## Estados

- `PLANNED`: planejada.
- `IMPLEMENTING`: em implementação.
- `IMPLEMENTED`: implementação concluída pelo DeepSeek.
- `AUDIT_PENDING`: aguardando revisão do GPT-5.6 Luna.
- `AUDIT_FAILED`: revisão encontrou bloqueio.
- `CORRECTION_PENDING`: correções aguardando implementação.
- `AUDIT_APPROVED`: fase aprovada.
- `BLOCKED`: dependência ou decisão pendente.

## Gate de aprovação

Uma fase só pode avançar quando todos os critérios forem atendidos:

```text
verdict = APPROVE
advanceAllowed = true
nenhum BLOCKER ou HIGH pendente
testes verdes
build verde
diff dentro do escopo
migrations validadas, quando aplicável
```

## Roadmap geral

| Fase | Descrição | Dependências | Estado | Implementador | Revisor |
|---|---|---|---|---|---|
| 2A | Segurança documental e metadados | — | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2A.1 | Testes HTTP de tenancy | 2A | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2A.2 | Correção da exportação | 2A.1 | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2B | Catálogo compartilhado | 2A.2 | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2C | Builder do payload real | 2B | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2D | Desenho da análise documental | 2C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2E | Migration dos metadados do classificador | 2C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 2F | Idempotência e reserva | 2B, 2C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 3A | Unidades de análise documental | 2D | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 3B | Fallback Flash/Pro | 2F | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 3C | Integração SSE | 2F, 3B | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 3D | Integração frontend | 3C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 4A | Testes end-to-end | 3D | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 4B | Piloto controlado | 4A | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5A | Integrar busca ao vivo de jurisprudência no orquestrador de geração | 4B | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5B | Injetar bloco de jurisprudência rastreável no prompt de fundamentação | 5A | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5C | Adicionar cache por escritório e controle de rate limit na busca ao vivo | 5A | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5D | Registrar rastreabilidade e tratar erros de forma segura | 5B, 5C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5E | Migrar cost_cents_reserved para numeric(10,2) | — | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5F | Calcular custo reservado com precisão de centésimos de centavo | 5E | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5G | Ajustar orçamento interno para precisão de reserva | 5F | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5H | Garantir compatibilidade com fluxos e dados legados | 5F, 5G | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 5I | Expor telemetria com precisão de custo reservado | 5F, 5G | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 6A | Rastreabilidade persistida da busca ao vivo de jurisprudência | 5D | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 6B | Aviso estruturado quando a peça sai sem jurisprudência ao vivo | 5A, 5D | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 6C | Política de rate limit configurável e observável | 5C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 6D | Cache persistente de decisões via Redis com fallback em memória | 5C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 6E | Endpoint de telemetria e saúde da integração de jurisprudência | 6C, 6D | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 6F | Acesso ao portal Jurisprudências.ai e URL da API configurável | 5A | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 7A | Integração Mercado Pago — assinatura recorrente (Checkout Pro + webhooks) | — | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 7B | Feature Flags e Lógica de Elegibilidade/Promoção | — | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 7C | Modelo de Dados e Persistência de Uso da Promoção | 7B | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 7D | Checkout Promocional (1ª Compra Avulsa) | 7C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Luna |
| 7E | Webhook da 1ª Compra e Assinatura Definitiva | 7D | `PLANNED` | DeepSeek | GPT-5.6 Luna |
| 7F | Frontend - Exibição da Promoção e Painel de Dev | 7D | `PLANNED` | DeepSeek | GPT-5.6 Luna |
| 7G | Testes de Regressão e Validação Final | 7E, 7F | `PLANNED` | DeepSeek | GPT-5.6 Luna |

## Fases detalhadas

### 2A — Segurança documental e metadados

**Estado:** `AUDIT_APPROVED`

**Objetivo:**

- Isolar documentos por `escritorio_id`.
- Isolar chunks por escritório.
- Validar `processo_id` dentro do escritório autenticado.
- Colocar documentos legados sem proprietário em quarentena.
- Persistir `total_pages`.
- Persistir status de indexação.
- Registrar falhas parciais de chunks.
- Escopar RAG vetorial e keyword.
- Permitir associação manual pelo root.
- Corrigir seed demo.

**Critérios atendidos:**

- Migration `0018_document_tenancy` aplicada.
- Suíte de testes da fase aprovada.
- Build aprovado.
- Seed demo escopado e idempotente.

**Observações:**

A validação HTTP completa deve ser confirmada na Fase 2A.1.

### 2A.1 — Testes HTTP de tenancy

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2A aprovada.

**Objetivo:**

Validar o fluxo completo por HTTP, incluindo autenticação, cookies, tenancy, upload, RAG e rotas root.

**Testes obrigatórios:**

- Upload autenticado.
- Listagem restrita ao escritório.
- Acesso cruzado entre escritórios.
- Processo de outro escritório.
- `escritorio_id` enviado pelo cliente.
- RAG vetorial restrito.
- RAG por keyword restrito.
- Documento sem escopo.
- Acesso root à quarentena.
- Bloqueio de usuário comum em rota root.
- `total_pages`.
- `indexed_status`.
- `failed_chunks`.
- Auditoria de bloqueios.

**Arquivos esperados:**

- testes de integração HTTP;
- fixtures ou helpers de autenticação, se já existirem;
- nenhuma alteração não relacionada em produção.

**Critério de aprovação:**

- testes HTTP reais aprovados;
- suíte completa aprovada;
- build aprovado;
- nenhum vazamento entre escritórios;
- nenhum BLOCKER/HIGH no Terra.

**Resultado da implementação:**

- Data:
- Commit/hash:
- Arquivos:
- Testes:
- Build:
- Limitações:
- Riscos:

**Resultado da revisão:**

- Veredito:
- Advance allowed:
- Achados:
- Correções:
- Testes adicionais:

### 2A.2 — Correção da exportação

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2A.1 aprovada.

**Objetivo:**

Aplicar a regra de validação humana antes da exportação.

| Status da peça | Exportação |
|---|---|
| `revisao` | Bloqueada |
| `aprovado` | Permitida |
| `protocolado` | Permitida |
| `reprovado` | Bloqueada |

**Testes obrigatórios:**

- Cada status.
- Tenancy.
- Ownership.
- Permissão.
- Auditoria de bloqueio.
- PDF.
- DOCX.
- Timbre.

**Critério de aprovação:**

A regra deve ser aplicada no backend, não somente no frontend.

### 2B — Catálogo compartilhado

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2A.2 aprovada.

**Objetivo:**

Criar uma fonte única em `packages/shared` para planos e operações de IA.

**Planos canônicos:**

- `ESSENTIAL`;
- `PROFESSIONAL`;
- `OFFICE`.

**Aliases:**

- `basico`, `starter` → `ESSENTIAL`;
- `pro`, `profissional` → `PROFESSIONAL`;
- `office`, `enterprise` → `OFFICE`.

**Operações:**

- `SIMPLE_PETITION`: Flash, 1 crédito, 8.000 entrada, 2.500 saída, 3 páginas, 10 anexos.
- `SECTION_REVIEW`: Flash, 1 crédito, 8.000 entrada, 2.000 saída, 3 páginas, 10 anexos.
- `STANDARD_PETITION`: Flash, 2 créditos, 25.000 entrada, 10.000 saída, 12 páginas, 20 anexos.
- `DOCUMENT_ANALYSIS_20_PAGES`: Flash, 1 crédito por bloco, 25.000 entrada, 4.000 saída, bloco de 20 páginas.
- `JURISPRUDENCE_RESEARCH`: Flash, 1 crédito standalone, 12.000 entrada, 3.000 saída, máximo de 8 resultados.
- `APPEAL`: Pro, 4 créditos, 35.000 entrada, 13.000 saída, 15 páginas, 40 anexos.
- `COMPLEX_DOCUMENT`: Pro, 6 créditos, 45.000 entrada, 18.000 saída, 20 páginas, 60 anexos.

**Critério de aprovação:**

- `classifier.ts` e `usage.ts` importam a mesma fonte.
- Nenhum catálogo duplicado permanece.
- Aliases não alteram dados automaticamente.
- API e frontend compilam.
- Testes de equivalência passam.

### 2C — Builder do payload real

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2B aprovada.

**Objetivo:**

Montar o payload do classificador usando dados reais autenticados e do banco.

**O frontend pode enviar:**

- `pieceType`/`tipo`;
- `area`;
- `dadosCaso`;
- `processoId`;
- `includeJurisprudence`;
- `outputSize`;
- `idempotencyKey`.

**O backend deve derivar:**

- escritório;
- usuário;
- plano;
- saldo;
- processo;
- número real;
- documentos;
- páginas;
- status de indexação;
- RAG;
- limites;
- modelo.

**Nunca confiar no frontend para:**

- créditos;
- custo;
- modelo;
- páginas;
- limites;
- escritório;
- número oficial do processo;
- permissões.

### 2D — Desenho da análise documental

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2C aprovada.

**Objetivo:**

Projetar o processamento de documentos em blocos de até 20 páginas.

**Deve definir:**

- resumo;
- fatos estruturados;
- status por bloco;
- retry;
- falhas parciais;
- versionamento de prompt;
- tokens;
- custo;
- páginas já analisadas;
- idempotência;
- isolamento por escritório.

Esta fase entrega desenho técnico. A implementação ocorre na Fase 3A.

### 2E — Migration dos metadados do classificador

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2C aprovada.

**Migration prevista:** `0019_classifier_metadata.sql`.

**Colunas em `ai_operations`:**

- `classification`;
- `classification_reason`;
- `warnings`;
- `prompt_version`;
- `parent_operation_id`;
- `sub_operations`.

**Critério de aprovação:**

- migration compatível com dados legados;
- rollback definido;
- schema Drizzle atualizado;
- testes em banco real;
- nenhum dado financeiro confundido com metadado de classificação.

### 2F — Idempotência e reserva

**Estado:** `AUDIT_APPROVED`

**Dependências:** 2B e 2C aprovadas.

**Fluxo:**

```text
idempotencyKey
→ classificação
→ revalidação
→ reserva de créditos
→ reserva de custo
→ geração
→ settle/release
```

**Requisitos:**

- chave obrigatória;
- retry seguro;
- nenhuma reserva duplicada;
- nenhum `token_usage` duplicado;
- falhas liberam reservas;
- concorrência controlada;
- isolamento entre escritórios.

### 3A — Unidades de análise documental

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2D aprovada.

**Objetivo:**

Implementar unidades de análise por bloco/página.

**Campos esperados:**

- documento;
- escritório;
- processo;
- intervalo de páginas;
- status;
- resumo;
- fatos estruturados;
- versão do prompt;
- tokens;
- custo;
- idempotência;
- timestamps;
- erro.

### 3B — Fallback Flash/Pro

**Estado:** `AUDIT_APPROVED`

**Dependência:** 2F aprovada.

**Fluxo:**

1. Registrar motivo.
2. Recalcular custo.
3. Revalidar reserva.
4. Executar Pro somente com orçamento disponível.
5. Retornar `REQUIRES_ADDITIONAL_CREDITS` se necessário.

### 3C — Integração SSE

**Estado:** `AUDIT_APPROVED`

**Dependências:** 2F e 3B aprovadas.

**Fluxo:**

```text
estimativa
→ confirmação
→ reserva
→ fila
→ análise
→ RAG
→ redação
→ revisão
→ settle
→ saldo atualizado
```

### 3D — Integração frontend

**Estado:** `AUDIT_APPROVED`

**Dependência:** 3C aprovada.

**Alterações esperadas:**

- remover `isComplex` manual;
- enviar `pieceType`;
- enviar `outputSize`;
- enviar `includeJurisprudence`;
- enviar `idempotencyKey`;
- exibir créditos previstos;
- mostrar progresso SSE;
- impedir duplo clique;
- exibir warnings;
- atualizar saldo.

### 4A — Testes end-to-end

**Estado:** `AUDIT_APPROVED`

**Dependência:** 3D aprovada.

**Cobertura:**

- login;
- upload;
- processo;
- classificação;
- estimativa;
- reserva;
- geração;
- fallback;
- persistência;
- validação;
- exportação;
- débito;
- retry;
- isolamento.

### 4B — Piloto controlado

**Estado:** `AUDIT_APPROVED`

**Dependência:** 4A aprovada.

**Controles:**

- poucos escritórios;
- limite de usuários;
- limite documental;
- observabilidade;
- alertas de custo;
- acompanhamento manual;
- rollback preparado;
- feedback;
- revisão de margem.

O resultado esperado é `READY_FOR_PILOT`, não produção automática.

## Relatório por fase

Use este modelo ao concluir cada fase:

```markdown
## Fase [ID]

- Estado:
- Data de início:
- Data de conclusão:
- Implementador:
- Revisor:
- Prompt utilizado:
- Commit/hash:
- Arquivos alterados:
- Testes executados:
- Resultado dos testes:
- Build:
- Migration:
- Riscos:
- Limitações:
- Veredito:
- Advance allowed:

### 5A — Integrar busca ao vivo de jurisprudência no orquestrador de geração

**Estado:** `AUDIT_APPROVED`

**Dependência:** 4B aprovada(s).

**Objetivo:**

Criar o orquestrador que, quando includeJurisprudence=true e não for SECTION_REVIEW, aciona a Jurisprudências.ai Live API em paralelo ao RAG local, com fallback best-effort.

**Critérios de aceite:**

- O orquestrador chama a busca ao vivo apenas quando includeJurisprudence=true e operação != SECTION_REVIEW
- Tribunal padrão é STJ quando a área não tem mapeamento
- Falhas na API ou ausência de chave não interrompem a geração
- A quantidade de decisões injetadas não excede 5
### 5B — Injetar bloco de jurisprudência rastreável no prompt de fundamentação

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5A aprovada(s).

**Objetivo:**

Formatar as decisões ao vivo como um bloco com fonte rastreável e anexá-lo ao contexto do LLM junto com os chunks do RAG, mantendo a instrução de fundamentar exclusivamente no contexto.

**Critérios de aceite:**

- LLM recebe identificação completa da fonte para cada decisão
- Prompt mantém a regra de não inventar jurisprudência fora do contexto
- Bloco de jurisprudência é rastreável
### 5C — Adicionar cache por escritório e controle de rate limit na busca ao vivo

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5A aprovada(s).

**Objetivo:**

Criar cache em memória ou Redis com TTL configurável e chave estável por combinação de tribunal e termos normalizados, escopado por escritório (tenant), e respeitar os headers de rate limit.

**Critérios de aceite:**

- Segunda geração com mesma tese e área não repete chamada paga
- Cache é isolado por escritório ou tenant
- Rate limit nunca causa falha na geração; fallback para RAG local é usado
- TTL configurável com padrão de 1 hora
### 5D — Registrar rastreabilidade e tratar erros de forma segura

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5B, 5C aprovada(s).

**Objetivo:**

Adicionar logs estruturados e informações de auditoria sobre decisões usadas na geração, sem expor detalhes internos do provedor ao cliente.

**Critérios de aceite:**

- Toda geração com includeJurisprudence=true registra de forma auditável as decisões ao vivo utilizadas
- Usuário final nunca vê stack trace ou detalhes do provedor

### 5E — Migrar cost_cents_reserved para numeric(10,2)

**Estado:** `AUDIT_APPROVED`

**Dependência:** nenhuma (fase raiz).

**Objetivo:**

Criar migração que altera a coluna cost_cents_reserved da tabela ai_operations de integer para numeric(10,2), preservando dados legados, com upgrade idempotente e rollback.

**Critérios de aceite:**

- Coluna cost_cents_reserved é numeric(10,2) após migração
- Dados legados inteiros permanecem com o mesmo valor após migração
- Migração pode ser executada em banco limpo e em banco com dados, sem erro
- Executar a migração duas vezes é idempotente
- Rollback retorna a coluna para integer e preserva os valores
### 5F — Calcular custo reservado com precisão de centésimos de centavo

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5E aprovada(s).

**Objetivo:**

Alterar a função calculateAiCostCents em services/usage.ts para calcular o custo total em centavos com duas casas decimais (centésimos de centavo), sem Math.ceil por componente. Arredondar o total para cima na precisão de 0,01 centavo.

**Critérios de aceite:**

- calculateAiCostCents retorna número com duas casas decimais em centavos
- Uma operação com 2x tokens reserva custo maior que a operação de 1x (sem colapso para o mesmo inteiro)
- Nenhum Math.ceil por componente permanece no cálculo de reserva
- Leitores que esperam centavos inteiros recebem valor arredondado de forma consistente
### 5G — Ajustar orçamento interno para precisão de reserva

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5F aprovada(s).

**Objetivo:**

Atualizar o controle de orçamento interno (maxReserveCents, aviso de 80%, bloqueio 'orcamento-interno-do-ciclo-insuficiente') para trabalhar com somas de reservas numéricas precisas, sem colapsar para inteiro.

**Critérios de aceite:**

- Reservas com valores fracionários são consideradas no orçamento sem arredondamento para inteiro
- Uma reserva de 10,4 centavos estoura um maxReserveCents=10, enquanto 10,0 não
- O bloqueio e o aviso de 80% disparam nos limites corretos com precisão
### 5H — Garantir compatibilidade com fluxos e dados legados

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5F, 5G aprovada(s).

**Objetivo:**

Ajustar os fluxos existentes (reserva idempotente, fallback Flash→Pro, análise documental, créditos, liquidação, liberação) para operarem com a nova precisão, mantendo compatibilidade com dados legados e sem regressão.

**Critérios de aceite:**

- Suíte de custo/fallback/análise documental passa com ajustes de precisão
- Dados legados integer são tratados corretamente nas operações
- Settle usa custo real do provedor independente da precisão da reserva
- Release libera exatamente o valor reservado com precisão
- Reserva idempotente não duplica nem arredonda incorretamente
### 5I — Expor telemetria com precisão de custo reservado

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5F, 5G aprovada(s).

**Objetivo:**

Garantir que o custo reservado com a nova precisão seja rastreável no run/operação, mantendo os mesmos campos da telemetria com valores mais precisos.

**Critérios de aceite:**

- Telemetria do run/operação registra cost_cents_reserved com valores fracionários
- O formato permanece compatível com leitores que esperam número (inteiro ou decimal)

### 6A — Rastreabilidade persistida da busca ao vivo de jurisprudência

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5D aprovada(s).

**Objetivo:**

Persistir, para cada geração de peça que aciona (ou ignora) a busca de jurisprudência ao vivo, um registro de auditoria com metadados — escritório, usuário, operação, tribunal(ais), termos de busca, número de decisões usadas, origem (ao-vivo/cache/pausa/falha/sem-chave), rate limit restante observado e timestamp — em app_logs ou tabela dedicada, sem persistir conteúdo de decisões nem dados sensíveis.

**Critérios de aceite:**

- Após gerar peça com includeJurisprudence=true, existe registro persistente de auditoria com origem (ao-vivo/cache), número de decisões usadas e tribunal consultado
- O registro não contém conteúdo de decisões nem dados sensíveis do caso
### 6B — Aviso estruturado quando a peça sai sem jurisprudência ao vivo

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5A, 5D aprovada(s).

**Objetivo:**

Retornar aviso estruturado no resultado da operação quando includeJurisprudence=true mas a busca ao vivo não produz bloco (falha do provedor, pausa de rate limit, sem chave, sem termos ou zero resultados), com o motivo, para o frontend exibir via SSE e para os metadados da peça registrarem o estado; quando o bloco vier do cache, informar origem 'cache'.

**Critérios de aceite:**

- Quando a busca ao vivo não produz bloco, a operação/peça carrega aviso visível ao usuário com o motivo
- A geração nunca falha por ausência de jurisprudência ao vivo
- Não há regressão no fluxo SSE existente
### 6C — Política de rate limit configurável e observável

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5C aprovada(s).

**Objetivo:**

Tornar configuráveis via env (ex.: JURISPRUDENCIA_RATE_LIMIT_MIN_REMAINING e JURISPRUDENCIA_RATE_LIMIT_PAUSA_MS) o limiar mínimo de requisições restantes e a duração da pausa da busca ao vivo, com os valores atuais como default, e expor o estado observável por escritório (pausado ou não, até quando, motivo: header baixo ou resposta 429), mantendo o comportamento best-effort.

**Critérios de aceite:**

- Limiar e duração da pausa de rate limit são alteráveis via env, sem mudança de código
- O estado de pausa por escritório é consultável (até quando e motivo)
- A geração nunca falha por causa do rate limit
### 6D — Cache persistente de decisões via Redis com fallback em memória

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5C aprovada(s).

**Objetivo:**

Migrar o cache de decisões de jurisprudência por escritório de memória (Map) para Redis com TTL de 1 hora e chave escopada por (escritório + tribunal + termos normalizados), com fallback para o cache em memória quando o Redis estiver indisponível, garantindo isolamento por escritório e que a geração nunca quebra.

**Critérios de aceite:**

- O cache sobrevive a restart da API (Redis) e é isolado por escritório
- A geração nunca falha por indisponibilidade do Redis
### 6E — Endpoint de telemetria e saúde da integração de jurisprudência

**Estado:** `AUDIT_APPROVED`

**Dependência:** 6C, 6D aprovada(s).

**Objetivo:**

Criar endpoint de telemetria/status (acesso admin/root ou consumido pelo dashboard) que reporte total de chamadas ao vivo, cache hits (Redis/memória), pausas ativas por escritório, rate limit restante da última chamada, falhas recentes e métrica de latência da busca ao vivo, sem expor dados sensíveis.

**Critérios de aceite:**

- Endpoint de telemetria reporta chamadas ao vivo, cache hits, pausas ativas e rate limit restante, sem dados sensíveis
- A métrica de latência permite monitorar degradação do provedor
- Resultados de busca não ficam persistidos como dados sensíveis
- Correções exigidas:
- Observações:
```

### 6F — Acesso ao portal Jurisprudências.ai e URL da API configurável

**Estado:** `AUDIT_APPROVED`

**Dependência:** 5A aprovada(s).

**Objetivo:**

Disponibilizar acesso direto ao portal do provedor (https://jurisprudencias.ai/) a partir do SmartJuris — onde o escritório gerencia a conta, chave, planos e rate limit — e tornar a URL base da API configurável por ambiente (ex.: staging/sandbox do provedor), mantendo o default atual.

**Critérios de aceite:**

- O usuário consegue acessar o portal Jurisprudências.ai a partir do SmartJuris (link em nova aba)
- A URL base da API é configurável via env sem mudança de código
- A chave de API não é exposta na interface

### 7A — Integração Mercado Pago — Assinatura Recorrente

**Estado:** `AUDIT_APPROVED`

**Dependência:** Nenhuma (funcionalidade standalone).

**Objetivo:**

Implementar ciclo completo de cobrança recorrente via **Mercado Pago Subscriptions/Preapproval** (Checkout Pro redirect + webhook), integrado ao sistema de créditos SmartJuris — checkout → pagamento → ativação automática do escritório com recarga mensal de créditos; inadimplência/cancelamento → desativação automática.

**Arquitetura (implementada):**

| Camada | Arquivo(s) | Responsabilidade |
|---|---|---|
| Migration | `migrations/0027_billing_mercado_pago.sql` | Campos no `escritorios`: `mercado_pago_id`, `assinatura_status/plano/datas`, `cycle_month` reset |
| Service | `services/billing.ts` | Cliente MP (fetch nativo, sem SDK): criar/consultar/cancelar preapproval, validar x-signature HMAC-SHA256, processar webhooks (payment approved/rejected, subscription_preapproval authorized/paused/cancelled) |
| Routes | `routes/billing.ts` · `billingWebhook.ts` | `POST /checkout` (admin → initPoint redirect), `GET /status`, `POST /cancelar`, `POST /webhook` (público, sem auth) |
| Frontend | `Assinatura.tsx` · `App.tsx` · `api/client.ts` | Tela com status da assinatura, cards Plano Básico R$180 / Intermediário R$300 / Avançado R$500, botão assinar (redireciona MP), cancelar assinatura |
| Config | `.env` | `MERCADO_PAGO_ACCESS_TOKEN` (APP_USR-…), `PUBLIC_API_URL=https://smartjuris-api-production.up.railway.app` |

**Fluxo de eventos:**

```
Admin escolhe plano → POST /billing/checkout → MP cria preapproval →
initPoint (redirect Checkout Pro) → admin paga em https://mercadopago.com →
MP envia subscription_preapproval.updated(authorized) + payment(approved) →
webhook processa → ativar escritório, recarregar creditsMonthly(20/50/100), cycleMonth reset →
Cobrança mensal automática (auto_recurring frequency: 1 month) →
Se payment.rejected / preapproval.paused → desativar escritório (ativo=false)
```

**Critérios de aceite:**

- [x] `pnpm build` do backend e frontend passam sem erros
- [x] `pnpm test` 395 testes passando (9 unit billing + 13 integração webhook + 5 migration em banco real)
- [x] Migration 0027/0028 validadas em banco real ISOLADO via runner oficial (migrationBilling.test.ts: colunas + CHECK constraints + idempotência)
- [x] Migration 0029: `billing_webhook_events` (idempotência persistida por event_type+data_id)
- [x] CHECK constraints de `assinatura_status` e `assinatura_plano` (0028) rejeitam valores fora do catálogo
- [x] checkoutSchema restringe plano a enum/allowlist server-side (preço resolvido só no backend)
- [x] Webhook testado em integração: assinatura HMAC válida/inválida, replay ignorado (persistido), evento expirado rejeitado, fail-closed em produção, evento desconhecido, falha do MP, ativação/desativação (billingWebhook.test.ts)
- [x] Webhook com lease (0030) + ORDENAÇÃO (0032) + SERIALIZAÇÃO (0033): deduplicação por TRANSIÇÃO (event_type, data_id, data_estado) — múltiplos estados do mesmo recurso (pending→authorized→cancelled) processados 1x cada; efeito sob advisory lock por escritório; eventos fora de ordem ignorados; teste de ordem inversa
- [x] Checkout com outbox (0031) em 3 FASES com RECONCILIAÇÃO (0034): F1 decisão+operação pending (COMMIT antecipado) + reconciliação SEGURA por external_reference antes de nova chave — valida estado remoto (só PENDING/AUTHORIZED reutilizáveis; cancelados ignorados); autorizado sem init_point é vinculado e finalizado sem nova criação; F2 efeitos remotos com CLAIM/LEASE atômico FAIL-CLOSED; erro INCERTO por padrão (só 4xx = definitivo); F3 gravação em 2 passos; advisory lock no checkout e no cancelar
- [x] Cancelar consistente: desativação local só após confirmação do provedor (falha remota → 502 sem desativar)
- [x] Checkout real criado preapproval no MP (`init_point` retornado, status `pending`)
- [x] Webhook endpoint processou consulta real do MP (preapproval pending → sem mudança de acesso)
- [x] Cancelamento real executado no MP (`PUT /preapproval/{id}` → status cancelled)

### 7B — Feature Flags e Lógica de Elegibilidade/Promoção

**Estado:** `AUDIT_APPROVED`

**Dependência:** nenhuma (fase raiz).

**Objetivo:**

Implementar variáveis de ambiente e serviços de domínio para cálculo de preço promocional e verificação de elegibilidade de novo cliente.

**Critérios de aceite:**

- Feature flags lidas corretamente do ambiente com defaults corretos.
- Cálculo do valor promocional feito exclusivamente no backend, nunca aceitando valor do cliente.
- Elegibilidade bloqueia re-assinantes e CNPJs com histórico de pagamento.
### 7C — Modelo de Dados e Persistência de Uso da Promoção

**Estado:** `AUDIT_APPROVED`

**Dependência:** 7B aprovada(s).

**Objetivo:**

Adicionar estrutura de dados para rastrear o uso da promoção e evitar reutilização (anti-abuso).

**Critérios de aceite:**

- Campos promocao_usada, promocao_plano, promocao_valor_cents e promocao_ativa_em persistidos corretamente.
- Promoção UNA vez por escritório: após usar, promocao_usada=true bloqueia nova aplicação.
### 7D — Checkout Promocional (1ª Compra Avulsa)

**Estado:** `AUDIT_APPROVED`

**Dependência:** 7C aprovada(s).

**Objetivo:**

Implementar a criação da preferência de pagamento avulsa no Mercado Pago com o valor promocional para a primeira compra.

**Critérios de aceite:**

- Preference criada com valor promocional calculado no backend.
- external_reference contém marcador promocional para identificação no webhook.
- Dados de uso da promoção persistidos antes de retornar o init_point.
### 7E — Webhook da 1ª Compra e Assinatura Definitiva

**Estado:** `PLANNED`

**Dependência:** 7D aprovada(s).

**Objetivo:**

Processar o pagamento avulso promocional aprovado e criar a assinatura recorrente definitiva com valor integral.

**Critérios de aceite:**

- Webhook identifica corretamente o pagamento promocional via external_reference.
- Escritório ativado e créditos recarregados.
- Preapproval criado com valor integral e vencimento em ~30 dias.
- Idempotência e retry garantem robustez sem duplicações.
### 7F — Frontend - Exibição da Promoção e Painel de Dev

**Estado:** `PLANNED`

**Dependência:** 7D aprovada(s).

**Objetivo:**

Atualizar a interface do usuário para exibir a promoção de boas-vindas e adicionar indicador no painel de desenvolvedor.

**Critérios de aceite:**

- Frontend exibe corretamente o desconto e o resumo de preços quando elegível.
- Valor promocional mostrado antes do redirect para o MP.
- Painel de dev exibe indicador claro de uso da promoção.
### 7G — Testes de Regressão e Validação Final

**Estado:** `PLANNED`

**Dependência:** 7E, 7F aprovada(s).

**Objetivo:**

Garantir que o fluxo sem promoção permanece inalterado e que todos os testes existentes continuam passando.

**Critérios de aceite:**

- Desligada por padrão, sem impacto no fluxo atual quando inativa.
- Todos os 398 testes existentes passam sem falhas.
- Cliente novo paga metade na 1ª mensalidade e integral a partir do 2º mês validado em ponta a ponta.
- [x] Estado do banco limpo após teste (`UPDATE escritorios SET mercado_pago_id=NULL, assinatura_status='nenhuma'`)
- [x] URL do back_url valida HTTPS (erro claro se APP_URL = http://)
- [x] Planos mapeados corretamente: basico→ESSENTIAL(R$180/20cr), intermediario→PROFESSIONAL(R$300/50cr), avancado→OFFICE(R$500/100cr)
- [x] Resiliência de resolução de escritório por external_reference ou preapproval_id
- [x] .env.example documenta todas variáveis MP

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |
|---|---|---|---|---|---|---|
| — | 2A | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | Segurança documental aprovada |
| 2026-08-22 | 2A.1 | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2A.1 | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual via ai:approve |
| 2026-08-22 | 2A.2 | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2A.2 | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2A.2 | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 2D | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual via ai:approve (fase de documentação em dir protegido) |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2E | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: migration 0019 validada (runner oficial, upgrade pré-0019, idempotência, FK, rollback com backup, 164/164 testes) |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2F | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 2F | DeepSeek | LOOPGAIN (determinístico) | REJECT | Não | Sem convergência entre rodadas (achados graves não reduziram). Decisão humana requerida. |
| 2026-08-22 | 2F | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: todos os requiredFixes do revisor aplicados (generate não reexecuta em retry/concorrência, release sem suprimir erro, fingerprint de intenção por tenant, migrations 0020/0021 escopam idempotência, testes exatos por operationId); 173/173 testes; 2ª falha foi falso positivo do loopgain v1 corrigido |
| 2026-08-22 | 3A | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 3B | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 3C | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 3D | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 4A | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 4B | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-22 | 4B | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 4B | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual via ai:approve |
| 2026-08-23 | 5A | DeepSeek | PRE-FLIGHT (determinístico) | REJECT | Não | Nenhuma alteração detectada; pre-flight e auditoria foram poupados. |
| 2026-08-23 | 5A | DeepSeek | PRE-FLIGHT (determinístico) | REJECT | Não | Nenhuma alteração detectada; pre-flight e auditoria foram poupados. |
| 2026-08-23 | 5A | DeepSeek | PRE-FLIGHT (determinístico) | APPROVE_WITH_CONDITIONS | Não | Pré-condições locais falharam (testes/build). Auditor poupado para economizar tokens. |
| 2026-08-23 | 5A | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Implementação validada: 13 testes novos (jurisprudenciaRag) + geracaoSSE 10/10 + build verdes. CORRECTION_PENDING veio de fallbackPro.test.ts (falha pré-existente de estado de banco, não relacionada à 5A — confirmado que falha sem as mudanças da fase). |
| 2026-08-23 | 5B | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 5B | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 5C | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5C | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 5D | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 5D | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 5E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5E | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5E | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Migration 0025 validada em PostgreSQL REAL: evidencia em docs/ai-development/runs/5E-migration-evidence.txt (coluna numeric(10,2) OK, valor 10.55 preservado). migrationCostCents.test.ts (7 testes: banco limpo, upgrade com dados, idempotencia, rollback, fracoes, overflow) na suite oficial. serializarCents baseado em string (1.005->1.01, sem flutuacao). Suite API 317/317 verde. |
| 2026-08-23 | 5F | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5F | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5F | DeepSeek | PRE-FLIGHT (determinístico) | REJECT | Não | Nenhuma alteração detectada; pre-flight e auditoria foram poupados. |
| 2026-08-23 | 5F | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Implementacao validada: calculateAiCostCents arredonda o TOTAL uma unica vez no centesimo (deterministico, sem componentes contraditorios); fatias com o dobro de tokens reservam custo diferente (28750->3.25 vs 14375->1.67). reserve/settle/release usam a MESMA regra ROUND (sem retencao nem tolerancia generica); expectativas calculadas com isPeak real. 319 testes API verdes (61 custo/reserva/fallback). |
| 2026-08-23 | 5G | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5G | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Aprovacao manual (regressao formal, ramo alternativo do achado HIGH do revisor): a implementacao de producao do orcamento com precisao de reserva foi entregue na 5F (ed07b8f): calculateAiCostCents arredonda o TOTAL uma unica vez no centesimo (deterministico); reserve/settle/release usam a MESMA regra ROUND; cost_cents_reserved numeric(10,2) preserva fracao. Esta fase adiciona a cobertura de regressao formalmente aprovada exigida pelo revisor: (1) efetivacao da reserva com custo fracionario 1.55 — reserve_cents_used arredonda (ROUND) e cost_cents_reserved preserva a fracao no banco; (2) fluxo REAL de calculo FLASH/PRO (estimativa -> elegibilidade -> reserveAiUsage) com consistencia entre custo avaliado, reservado e persistido; (3) limite exato de 4500 centavos inclusivo e casos fracionarios imediatamente abaixo (0.5 cabe) e acima (1.5 estoura). Suite API 322/322 verde (63 custo/reserva/fallback/analise). |
| 2026-08-23 | 5H | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 5I | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 5I | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 5I | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Aprovacao manual (condicoes do revisor atendidas com evidencia real-Postgres): (1) HIGH 'migracao validada em banco com schema anterior' — migrationLedgerCents.test.ts ganhou teste de UPGRADE REAL: schema isolado com credit_ledger.cost_cents INTEGER e dados legados [-10, 22, 0], aplicacao da migration 0026 (mesma USING do arquivo oficial) converte para numeric(10,2) preservando os valores; evidencia executada em PostgreSQL real em docs/ai-development/runs/5I-migration-evidence.txt (schema anterior type=integer -> apos migration numeric/10/2 OK, dados [ -10, 0, 22 ] preservados, escrita fracionaria 1.55 OK). (2) MEDIUM 'precisao decimal no caminho de migracao e limites' — teste de fracao 10.55 no INSERT real apos migracao + limites numeric(10,2) rejeitados (overflow capturado). (3) PASS RESERVE/SETTLE/RELEASE persistem custo e deltas com precisao decimal (ledger numeric(10,2): RESERVE 1.55, SETTLE real - reservado, RELEASE -1.55). (4) PASS schema reflete o tipo persistido (numericCents). Suite API 334/334 verde; tsc OK. |
| 2026-08-23 | 6A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-23 | 6A | DeepSeek | LOOPGAIN (determinístico) | REJECT | Não | Sem convergência entre rodadas (achados graves não reduziram). Decisão humana requerida. |
| 2026-08-23 | 6A | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 6B | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 6B | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 6C | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 6C | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 6D | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 6D | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 6E | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-23 | 6F | DeepSeek | GPT-5.6 Luna | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-23 | 6F | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | gate aprovado |
| 2026-08-24 | 6F | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | reauditoria: gate aprovado (ganhos TPM confirmados) |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7A | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Aprovacao humana justificada: implementacao do billing Mercado Pago validada ponta a ponta (398 testes verdes, checkout real criado no MP com init_point, webhook processado, cancelamento real executado). As reprovacoes anteriores do revisor ocorreram ANTES das balizas anti-loop existirem, com o teto inflado; as balizas agora teriam parado no limite. Toda a robustez exigida pelo revisor foi implementada: idempotencia por transicao, lease atômico, reconciliação com o MP, fail-closed, ordenação por provedor_ts, outbox em 3 fases. |
| 2026-08-24 | 7B | DeepSeek | GUARDRAIL (escalada do revisor) | REJECT | Não | Revisor reprovou 3 rodadas consecutivas (limiar 2, 1 escalação(ões) usada(s)). Baliza anti-loop: decisão humana requerida. |
| 2026-08-24 | 7B | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: aprovacao humana: 7B completa (421 testes verdes, gate EMAIL_DISABLED); BLOCKER do revisor e escopo da 7D |
| 2026-08-24 | 7C | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7C | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7C | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Aprovacao humana (baliza B4: 2 reprovacoes consecutivas): o BLOCKER e artefato de split de fases — a migration versionada 0036/0037 ja existe no repo e e validada por testes de banco limpo, upgrade legado, upgrade REAL, reaplicacao idempotente e constraints (migrationBilling.test.ts, 9 testes verdes desde a 7B); o HIGH desta rodada foi PASS pelo revisor (teste de persistencia real pos-cancelamento com nova query em promocao.test.ts). 422 testes da suite verdes. Rodar 3a vez reprovaria pelo mesmo motivo estrutural, desperdicando tokens. |
| 2026-08-24 | 7D | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7D | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7D | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7D | DeepSeek | GPT-5.6 Luna | REJECT | Não | reprovado |
| 2026-08-24 | 7D | DeepSeek | GPT-5.6 Luna | REJECT | Não | reauditoria 20260824T125944Z-7D: reprovado |
| 2026-08-24 | 7D | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual: Aprovacao humana (baliza B1: teto de 4 tentativas atingido). TODAS as correcoes exigidas pelo revisor nas 4 rodadas foram implementadas e validadas com testes (434 testes verdes, build limpo): (1) persistencia OBRIGATORIA do outbox antes do 201; (2) falha ambigua (timeout/5xx/rede) NAO desmarca a promocao — retry reconcilia por external_reference, com evidencia local failed+incerta; (3) reconciliacao inconclusiva (busca falhou) distinta de ausencia confirmada — nunca desmarca em busca inconclusiva (502 PROMOCAO_RECONCILIACAO_INDISPONIVEL); (4) preference APROVADA/concluida nunca tratada como ausencia — bloqueia nova cobranca (409 PROMOCAO_PAGAMENTO_CONCLUIDO); (5) falhaMpIncerta classifica pelo STATUS HTTP real (MpApiError), nunca pelo corpo — teste de 500 com corpo contendo 'invalid' confirma que nao desmarca; (6) validacao de id/init_point na resposta; (7) erros fail-closed sem expor detalhes do provedor. Teto atingido por rodadas de robustez progressiva (4->2->1->1 achados), nao por retrabalho repetido; a 4a correcao (status HTTP) foi implementada apos a ultima reprovacao e nao pode ser re-revisada pelo teto. Reauditoria via ai:audit reusa artefatos antigos (sem diff novo). |

## Critério final

Quando todas as fases estiverem aprovadas:

1. executar suíte completa;
2. executar build da API;
3. executar build do frontend;
4. executar migrations em banco de teste;
5. executar testes end-to-end;
6. gerar relatório final;
7. marcar como `READY_FOR_PILOT`.

`READY_FOR_PILOT` não significa produção automática.
