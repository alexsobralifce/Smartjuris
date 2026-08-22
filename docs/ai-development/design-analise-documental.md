# Design — Análise Documental em Blocos de 20 Páginas (Fase 2D)

> **Fase:** 2D — Desenho da análise documental (entrega técnica; implementação na Fase 3A).
> **Dependência:** 2C `AUDIT_APPROVED` (builder do payload real).
> **Fontes de verdade:** `packages/shared` (catálogo), `services/classifier.ts`, `services/usage.ts`, `services/payloadBuilder.ts`, schema (`documentos`, `chunks`, `ai_operations`).
> **Status:** `PLANNED` → `AUDIT_APPROVED` após revisão.

---

## 1. Visão geral

A análise documental processa documentos jurídicos em **blocos de até 20 páginas**
(`ANALYSIS_BLOCK_SIZE_PAGES = 20`, fonte única em `@lexia/shared`). Cada bloco é
enviado ao modelo de IA para produzir **resumo** e **fatos estruturados**, que
alimentam o contexto processado exigido pelo classificador (regra Q5:
`summariesAvailable` + `structuredFactsAvailable`) antes da redação de peças.

O processamento é **incremental** (páginas já analisadas não são reenviadas),
**idempotente** por bloco (chave derivada, sem dupla cobrança), **isolado por
escritório** (nenhum bloco cruza tenants) e **resiliente a falhas parciais**
(um bloco com falha não descarta os demais).

```
documentos (escopados, não-unscoped)
  → agrupar em blocos de 20 páginas (ordem estável por documento/índice)
  → para cada bloco: reserva de créditos/custo → chamada IA → resumo + fatos
  → registrar status por bloco → consolidar contexto processado
  → liberar/liquidar reservas por bloco (settle/release)
```

---

## 2. Blocos

- **Tamanho:** 20 páginas por bloco (`ANALYSIS_BLOCK_SIZE_PAGES`).
- **Agrupamento:** ordem estável — documento (por `created_at`/nome) e, dentro do
  documento, por índice de página (1–20, 21–40, …). O último bloco pode ser menor.
- **Escopo:** apenas documentos **elegíveis** do escritório autenticado
  (`escritorio_id = X` e `indexed_status <> 'unscoped'`), conforme derivado pelo
  `payloadBuilder` (2C). Documentos em quarentena nunca entram.
- **Blocos por operação:** `ceil(páginas a analisar / 20)`; páginas já analisadas
  (`pagesAlreadyAnalyzed`) são descontadas antes do agrupamento.

---

## 3. Contratos

### 3.1 Entrada por bloco

```ts
interface BlocoAnaliseInput {
  blocoId: string;            // UUID interno (rastreio)
  escritorioId: string;       // autenticado — nunca do cliente
  processoId: string | null;  // escopo do processo (mesmo tenant)
  documentoId: string;        // documento de origem
  paginaInicial: number;      // 1-based (ex.: 21)
  paginaFinal: number;        // ex.: 40
  texto: string;              // conteúdo do bloco (extraído do documento)
  versaoPrompt: string;       // ex.: 'analise-documental-v1'
  idempotencyKey: string;     // chave derivada (ver §8)
  maxInputTokens: number;     // limite do catálogo (OPERATION_CATALOG)
  maxOutputTokens: number;    // limite do catálogo
}
```

### 3.2 Saída por bloco

```ts
interface BlocoAnaliseOutput {
  blocoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resumo: string | null;              // resumo do bloco (null se falhou)
  fatosEstruturados: Fact[] | null;   // fatos extraídos (null se falhou)
  tokensIn: number;                   // uso real (para settle)
  tokensOut: number;
  custoCents: number;                 // custo real em centavos (settle)
  erro: string | null;                // motivo da falha (retryable? ver §5)
  tentativas: number;
}
```

### 3.3 Contexto processado consolidado (alimenta o classificador)

```ts
interface ContextoProcessado {
  summariesAvailable: boolean;           // true se ≥1 bloco completou resumo
  structuredFactsAvailable: boolean;     // true se ≥1 bloco extraiu fatos
  pagesAlreadyAnalyzed: number;          // total de páginas concluídas
  pagesToAnalyze: number;                // total − já analisadas
  analysisBlocks: number;                // blocos restantes
  statusPorBloco: Record<string, 'completed' | 'failed' | 'pending'>;
}
```

Esses campos preenchem `documents.summariesAvailable`,
`documents.structuredFactsAvailable` e `documents.pagesAlreadyAnalyzed` do
`ClassifierInput` (construído pelo `payloadBuilder`), habilitando a regra Q5.

---

## 4. Fluxo por bloco

1. **Leitura:** bloco derivado dos documentos elegíveis do escritório.
2. **Reserva** (Fase 2F conecta ao `reserveAiUsage`): debita créditos e custo
   estimado (centavos) com `FOR UPDATE` no escritório; chave idempotente.
3. **Chamada IA:** `DOCUMENT_ANALYSIS_20_PAGES` (Flash, 1 crédito/bloco) com
   `maxInputTokens`/`maxOutputTokens` do catálogo compartilhado.
4. **Persistência:** status do bloco + resumo/fatos; registra `token_usage`.
5. **Settle/Release:** liquida com uso real (arredondamento nearest) ou libera a
   reserva em falha (Fase 2F).
6. **Consolidação:** ao final, monta o `ContextoProcessado` e marca
   `pagesAlreadyAnalyzed` no processo/documento.

> **Nota:** a reserva/settle/release são desenhados aqui, mas a implementação da
> orquestração financeira completa ocorre na **Fase 2F (Idempotência e reserva)**.
> A 2D define o desenho; a 2F integra o fluxo `classificação → revalidação →
> reserva → geração → settle/release`.

---

## 5. Retry e falhas parciais

- **Falhas retryable:** timeout de rede, `5xx`, `429`, resposta vazia do LLM,
  erro transitório de embedding. Limite: **2 tentativas** por bloco (1 reenvio),
  com backoff exponencial curto (1s, 2s). Alinhado ao retry do orquestrador
  (`llm.ts`) e do `chatCompletion`.
- **Falhas não-retryable:** bloco ilegível (OCR necessário), documento sem
  escopo, contrato inválido. Marcado `failed` sem retry.
- **Falha parcial:** um bloco `failed` NÃO cancela os demais. Blocos
  `completed` permanecem válidos; `pagesAlreadyAnalyzed` conta apenas blocos
  concluídos. O consolidado reporta `summariesAvailable`/`structuredFactsAvailable`
  conforme houver ao menos um bloco concluído, e os blocos com falha aparecem no
  `statusPorBloco` para reprocessamento manual ou retry posterior.
- **Sem dupla cobrança:** bloco reprocessado usa a MESMA chave de idempotência →
  a reserva já existente é reutilizada (`alreadyReserved`), nunca debitada de novo.

---

## 6. Versionamento de prompt

- `versaoPrompt = 'analise-documental-v1'` (identificador por bloco e global).
- O versionamento entra na **chave de idempotência** (§8): mudar a versão gera
  uma chave nova → permite reanalisar com prompt novo sem colidir com a anterior.
- Cada bloco registra a versão usada (metadados) para auditoria e reprocesso.

---

## 7. Tokens e custo

- **Estimativa (pré-reserva):** reutiliza `estimateAiOperation` de `usage.ts`
  (entrada = páginas do bloco × `CHARS_POR_PAGINA` + contexto RAG, +15% de margem;
  saída estimada pelo tamanho). Custos em centavos com `ceil` para reserva.
- **Custo real (settle):** `calculateAiSettlementCents` com arredondamento
  `nearest`, usando tokens reais observados na chamada.
- **Custo por bloco:** o custo total da análise = Σ custo dos blocos. Cada bloco
  respeita `maxOpCostCents` do plano e o orçamento interno do ciclo
  (`maxReserveCents`) — verificados em `avaliarElegibilidade` (2B/usage).
- **Modelo:** `DOCUMENT_ANALYSIS_20_PAGES` → FLASH, 1 crédito por bloco
  (`creditsArePerBlock`).

---

## 8. Idempotência

- **Chave derivada por bloco:**
  `analise:{escritorioId}:{processoId|'sem-processo'}:{documentoId}:{paginaInicial}-{paginaFinal}:{versaoPrompt}`.
- A chave é gerada **no servidor** (nunca aceita do cliente em formato livre) e
  usada em `ai_operations.idempotency_key` (UNIQUE) no `reserveAiUsage`.
- Repetição da chave → reutiliza a operação existente (`alreadyReserved`), sem
  novo débito nem novo `token_usage`.
- Falha após reserva → `releaseAiUsageReservation` devolve créditos/custo.
- Nenhum `token_usage` duplicado: o registro só ocorre no settle do bloco com
  chave única.

---

## 9. Isolamento por escritório

- Todos os acessos a `documentos`, `chunks` e `ai_operations` filtram por
  `escritorio_id` do contexto autenticado (padrão `tenantScope`, Fase 2A/2C).
- Documentos `unscoped` (quarentena) são excluídos (defesa em profundidade,
  mesmo com `escritorio_id` inconsistente — 2C).
- A chave de idempotência inclui `escritorioId` → impossível colidir ou ler
  blocos de outro tenant.
- Nenhum bloco, resumo ou fatos cruza escritórios; auditoria registra cada
  bloco processado com `escritorio_id`.

---

## 10. Decisões de projeto (registradas)

| # | Decisão | Justificativa |
|---|---|---|
| D1 | Bloco fixo de 20 páginas do catálogo | Fonte única (`ANALYSIS_BLOCK_SIZE_PAGES`); crédito por bloco alinhado ao catálogo 2B |
| D2 | `summariesAvailable`/`structuredFactsAvailable` = ≥1 bloco concluído | Habilita Q5 sem exigir análise integral antes de redigir |
| D3 | `pagesAlreadyAnalyzed` = Σ páginas de blocos `completed` | Rastreio incremental; evita reanalisar; descontado no agrupamento |
| D4 | Falha parcial não cancela blocos concluídos | Resiliência; reprocessamento pontual via `statusPorBloco` |
| D5 | Retry limitado a 2 tentativas com backoff curto | Controla custo/uso sem degradar UX |
| D6 | Chave de idempotência derivada no servidor com versão de prompt | Sem dupla cobrança; reanálise com prompt novo é intencional e auditável |
| D7 | Reserva/settle/release por bloco (desenho; implementação financeira na 2F) | Escopo claro: 2D desenha, 2F orquestra cobrança |

---

## 11. Fora de escopo (implementação)

- Código de produção da análise (Fase 3A).
- Orquestração financeira completa reserva/settle/release (Fase 2F).
- Migration de metadados do classificador (Fase 2E).
- Integração SSE/frontend (Fases 3C/3D).
