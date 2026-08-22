# SmartJuris — Roadmap de Implementação

## Objetivo

Organizar a evolução do SmartJuris em fases pequenas, verificáveis e auditáveis.

Cada fase segue o fluxo:

```text
DeepSeek implementa
        ↓
Testes e build
        ↓
GPT-5.6 Terra revisa
        ↓
Gate de aprovação
        ↓
Próxima fase ou correção
```

O DeepSeek é responsável pela implementação. O GPT-5.6 Terra analisa os resultados e decide se a fase pode avançar. O Terra não modifica o código.

## Estados

- `PLANNED`: planejada.
- `IMPLEMENTING`: em implementação.
- `IMPLEMENTED`: implementação concluída pelo DeepSeek.
- `AUDIT_PENDING`: aguardando revisão do GPT-5.6 Terra.
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
| 2A | Segurança documental e metadados | — | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Terra |
| 2A.1 | Testes HTTP de tenancy | 2A | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Terra |
| 2A.2 | Correção da exportação | 2A.1 | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Terra |
| 2B | Catálogo compartilhado | 2A.2 | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Terra |
| 2C | Builder do payload real | 2B | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Terra |
| 2D | Desenho da análise documental | 2C | `AUDIT_APPROVED` | DeepSeek | GPT-5.6 Terra |
| 2E | Migration dos metadados do classificador | 2C | `CORRECTION_PENDING` | DeepSeek | GPT-5.6 Terra |
| 2F | Idempotência e reserva | 2B, 2C | `PLANNED` | DeepSeek | GPT-5.6 Terra |
| 3A | Unidades de análise documental | 2D | `PLANNED` | DeepSeek | GPT-5.6 Terra |
| 3B | Fallback Flash/Pro | 2F | `PLANNED` | DeepSeek | GPT-5.6 Terra |
| 3C | Integração SSE | 2F, 3B | `PLANNED` | DeepSeek | GPT-5.6 Terra |
| 3D | Integração frontend | 3C | `PLANNED` | DeepSeek | GPT-5.6 Terra |
| 4A | Testes end-to-end | 3D | `PLANNED` | DeepSeek | GPT-5.6 Terra |
| 4B | Piloto controlado | 4A | `PLANNED` | DeepSeek | GPT-5.6 Terra |

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

**Estado:** `CORRECTION_PENDING`

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

**Estado:** `PLANNED`

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

**Estado:** `PLANNED`

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

**Estado:** `PLANNED`

**Dependência:** 2F aprovada.

**Fluxo:**

1. Registrar motivo.
2. Recalcular custo.
3. Revalidar reserva.
4. Executar Pro somente com orçamento disponível.
5. Retornar `REQUIRES_ADDITIONAL_CREDITS` se necessário.

### 3C — Integração SSE

**Estado:** `PLANNED`

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

**Estado:** `PLANNED`

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

**Estado:** `PLANNED`

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

**Estado:** `PLANNED`

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
- Correções exigidas:
- Observações:
```

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |
|---|---|---|---|---|---|---|
| — | 2A | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | Segurança documental aprovada |
| 2026-08-22 | 2A.1 | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |
| 2026-08-22 | 2A.1 | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual via ai:approve |
| 2026-08-22 | 2A.2 | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |
| 2026-08-22 | 2A.2 | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2A.2 | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Terra | REJECT | Não | reprovado |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2B | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2C | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | gate aprovado |
| 2026-08-22 | 2D | DeepSeek | Humano (CLI) | APPROVE | Sim | Aprovação manual via ai:approve (fase de documentação em dir protegido) |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |
| 2026-08-22 | 2E | DeepSeek | GPT-5.6 Terra | APPROVE_WITH_CONDITIONS | Não | condições pendentes |

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
