# SmartJuris — Corrente de Desenvolvimento com Implementação e Auditoria

## Objetivo

Este documento define um processo faseado para evolução do SmartJuris usando dois modelos:

- **DeepSeek:** implementação de código, testes e build.
- **GPT-5.6 Terra:** revisão técnica independente dos resultados.

A próxima fase só pode começar após a aprovação do resultado da fase atual.

## Fluxo

```text
DeepSeek implementa
        ↓
DeepSeek executa testes e build
        ↓
DeepSeek entrega diff e relatório
        ↓
GPT-5.6 Terra revisa
        ↓
Gate valida resultado
        ↓
Aprovado → próxima fase
Reprovado → correção no DeepSeek
```

## Estados

- `PLANNED`: planejada.
- `IMPLEMENTING`: em implementação.
- `IMPLEMENTED`: implementação concluída.
- `AUDIT_PENDING`: aguardando revisão.
- `AUDIT_FAILED`: revisão encontrou falha.
- `CORRECTION_PENDING`: correções aguardando implementação.
- `AUDIT_APPROVED`: fase aprovada.
- `BLOCKED`: impedida por dependência ou decisão pendente.

## Regra de avanço

Uma fase só avança quando:

```json
{
  "verdict": "APPROVE",
  "advanceAllowed": true,
  "requiredFixes": [],
  "blockingIssues": []
}
```

Não avance quando houver:

- achado `BLOCKER` ou `HIGH`;
- testes falhando;
- build falhando;
- migration não validada;
- alteração fora do escopo;
- falha de isolamento multi-tenant;
- falha de idempotência;
- decisão de produto pendente.

## Roadmap

| Fase | Descrição | Implementador | Revisor | Estado | Dependências |
|---|---|---|---|---|---|
| 2A | Segurança documental e metadados | DeepSeek | GPT-5.6 Terra | `AUDIT_APPROVED` | — |
| 2A.1 | Testes HTTP de tenancy | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2A |
| 2A.2 | Correção da exportação | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2A.1 |
| 2B | Catálogo compartilhado | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2A.2 |
| 2C | Builder do payload real | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2B |
| 2D | Desenho da análise documental | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2C |
| 2E | Migration dos metadados do classificador | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2C |
| 2F | Idempotência e reserva | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2B, 2C |
| 3A | Unidades de análise documental | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2D |
| 3B | Fallback Flash/Pro | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2F |
| 3C | Integração SSE | DeepSeek | GPT-5.6 Terra | `PLANNED` | 2F, 3B |
| 3D | Integração frontend | DeepSeek | GPT-5.6 Terra | `PLANNED` | 3C |
| 4A | Testes end-to-end | DeepSeek | GPT-5.6 Terra | `PLANNED` | 3D |
| 4B | Piloto controlado | DeepSeek | GPT-5.6 Terra | `PLANNED` | 4A |

## Metadados por fase

Cada fase deve registrar:

- objetivo;
- arquivos esperados;
- testes obrigatórios;
- critério de aprovação;
- riscos;
- resultado da implementação;
- resultado da auditoria;
- data;
- commit ou hash do diff;
- versões dos prompts;
- observações.

## Processo de execução

1. Verificar dependências.
2. Marcar fase como `IMPLEMENTING`.
3. Enviar prompt da fase ao DeepSeek.
4. Receber código, diff, testes e build.
5. Marcar como `IMPLEMENTED`.
6. Enviar resultado ao GPT-5.6 Terra.
7. Marcar como `AUDIT_PENDING`.
8. Validar o resultado estruturado.
9. Se aprovado, marcar como `AUDIT_APPROVED`.
10. Se houver condições, marcar como `CORRECTION_PENDING`.
11. Se reprovado, marcar como `AUDIT_FAILED`.
12. Atualizar este roadmap.

## Relatório do implementador

```json
{
  "phase": "string",
  "status": "IMPLEMENTED | BLOCKED",
  "summary": "string",
  "filesChanged": ["string"],
  "diffStat": "string",
  "tests": [
    {
      "command": "string",
      "result": "PASS | FAIL",
      "details": "string"
    }
  ],
  "build": {
    "command": "string",
    "result": "PASS | FAIL",
    "details": "string"
  },
  "migrations": [
    {
      "file": "string",
      "applied": true,
      "details": "string"
    }
  ],
  "decisions": ["string"],
  "limitations": ["string"],
  "risks": ["string"],
  "nextStep": "string"
}
```

## Relatório da revisão

```json
{
  "phase": "string",
  "verdict": "APPROVE | APPROVE_WITH_CONDITIONS | REJECT",
  "advanceAllowed": false,
  "findings": [
    {
      "severity": "BLOCKER | HIGH | MEDIUM | LOW | PASS",
      "file": "string",
      "line": "number|null",
      "requirement": "string",
      "evidence": "string",
      "impact": "string",
      "action": "string"
    }
  ],
  "requiredFixes": ["string"],
  "missingTests": ["string"],
  "scopeViolations": ["string"],
  "migrationRisks": ["string"],
  "securityRisks": ["string"],
  "financialRisks": ["string"],
  "rollbackRisks": ["string"],
  "nextPhase": "string|null"
}
```

## Gate de aprovação

```ts
function canAdvance(audit: AuditResult): boolean {
  const blocking = audit.findings.some(
    (finding) =>
      finding.severity === "BLOCKER" ||
      finding.severity === "HIGH",
  );

  return (
    audit.verdict === "APPROVE" &&
    audit.advanceAllowed === true &&
    !blocking &&
    audit.requiredFixes.length === 0 &&
    audit.scopeViolations.length === 0
  );
}
```

## Evidências exigidas

Para cada fase, coletar:

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

## Intervenção humana obrigatória

A corrente deve parar quando houver:

- risco de segurança;
- migration destrutiva;
- mudança de regra de cobrança;
- alteração de preço;
- alteração de tenancy;
- divergência entre banco e catálogo;
- ambiguidade de produto;
- teste de isolamento falhando;
- alteração fora do escopo.

## Critério final

Quando todas as fases forem aprovadas:

1. executar suíte completa;
2. executar build da API;
3. executar build do frontend;
4. executar migrations em banco de teste;
5. executar testes end-to-end;
6. gerar relatório final;
7. marcar como `READY_FOR_PILOT`.

`READY_FOR_PILOT` não significa produção automática.
