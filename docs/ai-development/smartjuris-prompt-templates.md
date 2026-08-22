# SmartJuris — Templates de Prompts para Orquestração

## Envelope de implementação

```text
Fase atual: [ID E NOME]

Dependências aprovadas:
[IDs em AUDIT_APPROVED]

Objetivo:
[objetivo]

Escopo:
[cole o prompt específico da fase]

Fora do escopo:
[arquivos e funcionalidades não envolvidos]

Critério de conclusão:
[testes, build e evidências]

Implemente somente esta fase. Ao concluir, entregue diff, testes, build, riscos e limitações. Pare para revisão.
```

## Envelope de revisão

```text
Fase: [ID E NOME]

Objetivo:
[objetivo]

Dependências:
[dependências]

Arquivos alterados:
[lista]

Diff:
[diff]

Testes:
[comandos e resultados]

Build:
[comando e resultado]

Migrations:
[arquivos e resultado]

Decisões:
[decisões]

Limitações:
[limitações]

Riscos:
[riscos]

Analise o resultado e responda somente com JSON no contrato de revisão.
```

## Contrato do implementador

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

## Contrato do revisor

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

## Gate de aprovação em TypeScript

```ts
type Finding = {
  severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "PASS";
};

type AuditResult = {
  verdict: "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT";
  advanceAllowed: boolean;
  findings: Finding[];
  requiredFixes: string[];
  scopeViolations: string[];
};

export function canAdvance(audit: AuditResult): boolean {
  const hasBlockingFinding = audit.findings.some(
    ({ severity }) => severity === "BLOCKER" || severity === "HIGH",
  );

  return (
    audit.verdict === "APPROVE" &&
    audit.advanceAllowed &&
    !hasBlockingFinding &&
    audit.requiredFixes.length === 0 &&
    audit.scopeViolations.length === 0
  );
}
```

## Transições

```text
PLANNED
  ↓
IMPLEMENTING
  ↓
IMPLEMENTED
  ↓
AUDIT_PENDING

AUDIT_PENDING → AUDIT_APPROVED
AUDIT_PENDING → CORRECTION_PENDING
AUDIT_PENDING → AUDIT_FAILED

CORRECTION_PENDING → IMPLEMENTING

BLOCKED → PLANNED
```

## Registro por fase

```markdown
## Fase [ID]

- Estado:
- Início:
- Fim:
- Implementador:
- Revisor:
- Prompt de implementação:
- Prompt de revisão:
- Commit/hash:
- Arquivos alterados:
- Testes:
- Build:
- Migration:
- Veredito:
- Correções:
- Observações:
```

## Checklist antes de implementação

- [ ] Dependências em `AUDIT_APPROVED`.
- [ ] Escopo definido.
- [ ] Arquivos permitidos definidos.
- [ ] Arquivos proibidos definidos.
- [ ] Testes obrigatórios definidos.
- [ ] Critério de aprovação definido.
- [ ] Decisões de produto resolvidas.

## Checklist antes da revisão

- [ ] Diff disponível.
- [ ] Arquivos alterados listados.
- [ ] Testes executados.
- [ ] Build executado.
- [ ] Migration identificada, se aplicável.
- [ ] Riscos documentados.
- [ ] Limitações documentadas.
- [ ] Resultado enviado ao revisor.

## Checklist de avanço

- [ ] Veredito `APPROVE`.
- [ ] `advanceAllowed=true`.
- [ ] Nenhum BLOCKER.
- [ ] Nenhum HIGH.
- [ ] `requiredFixes=[]`.
- [ ] `scopeViolations=[]`.
- [ ] Testes verdes.
- [ ] Build verde.
- [ ] Roadmap atualizado.
