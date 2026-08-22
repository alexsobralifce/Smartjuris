# SmartJuris — Orquestrador local de desenvolvimento (ai-orchestrator)

Ferramenta local que automatiza a corrente de desenvolvimento descrita em
`docs/ai-development/`:

```text
DeepSeek implementa → testes/build → GPT-5.6 Terra revisa → gate → próxima fase
```

O orquestrador **nunca** faz merge, push ou deploy automáticos. Ele entrega a
branch da fase para revisão humana e só atualiza o roadmap com auditoria
validada por contrato estrito.

## Requisitos

- Node 22+, pnpm 11
- `tools/ai-orchestrator` registrado no workspace (pnpm-workspace.yaml)

## Variáveis de ambiente

| Variável | Uso | Obrigatória |
|---|---|---|
| `DEEPSEEK_API_KEY` | implementador (DeepSeek) | run/audit |
| `DEEPSEEK_BASE_URL` | base URL do DeepSeek (default `https://api.deepseek.com/v1`) | — |
| `DEEPSEEK_MODEL` | modelo do implementador (default: `deepseek-v4-flash`) | — |
| `DEEPSEEK_MODEL_PRO` | modelo complexo (default: `deepseek-v4-pro`) | — |
| `OPENAI_API_KEY` | revisor (GPT-5.6 Terra) | run/audit |
| `OPENAI_REVIEW_MODEL` | modelo do revisor (default: `gpt-5.6-terra`) | — |
| `SMARTJURIS_REPO_ROOT` | raiz do repositório (opcional; inferida do workspace) | — |

Chaves nunca são logadas (logger com redação).

## Comandos

```bash
pnpm ai:next                     # executa a próxima fase PLANNED com dependências aprovadas
pnpm ai:next --print-only        # apenas mostra a próxima fase elegível
pnpm ai:run --phase 2A.1         # executa uma fase específica
pnpm ai:audit --run <run-id>     # reexecuta SÓ a auditoria de um run (ex.: JSON inválido)
pnpm ai:status                   # tabela do roadmap + próxima fase
pnpm ai:approve --phase 2A.1     # gate de aprovação MANUAL (humano) — override consciente
pnpm ai:approve --phase 2A.1 --next   # aprova e mostra a próxima elegível
pnpm ai:retry --phase 2A.1       # reexecuta fase em CORRECTION_PENDING/AUDIT_FAILED
pnpm ai:dry-run [--phase 2A.1]   # plano offline: valida config/roadmap/prompt sem mutar nada
```

## Fluxo de uma execução (`ai:run`)

1. Lê o roadmap e valida que a fase está `PLANNED` (ou `CORRECTION_PENDING`/`AUDIT_FAILED` em retry).
2. Valida que TODAS as dependências estão `AUDIT_APPROVED`.
3. Verifica working tree limpo **exceto** `docs/ai-development/` (o orquestrador
   altera o próprio roadmap — qualquer outro arquivo sujo bloqueia).
4. Cria a branch `phase/<id>` (reusa em retry).
5. Marca `IMPLEMENTING`, monta o envelope de implementação a partir do prompt
   da fase em `smartjuris-phase-prompts.md` e chama o DeepSeek.
6. Coleta evidências: `git status`, `git diff`, `git diff --stat`, testes e
   builds da API/web (somente comandos da allowlist).
7. Salva tudo em `docs/ai-development/runs/<timestamp>-<fase>/`.
8. Marca `AUDIT_PENDING` e monta o contexto de revisão; chama o GPT-5.6 Terra.
9. Valida a resposta com o **contrato JSON estrito** (Zod `.strict()`); uma
   resposta inválida gera 1 chamada de correção com o erro; persistindo, o run
   falha e o roadmap permanece `AUDIT_PENDING` para `ai:audit` manual.
10. Aplica o gate: `APPROVE` + sem BLOCKER/HIGH + `requiredFixes`/`scopeViolations`
    vazios + testes/build/diff verdes → `AUDIT_APPROVED`.
    `APPROVE_WITH_CONDITIONS` → `CORRECTION_PENDING`; `REJECT` → `AUDIT_FAILED`.
11. Atualiza o roadmap (estado + linha no histórico de auditoria). Não avança
    fases automaticamente: a próxima só roda via `ai:next`/`ai:run` após o
    merge manual da branch.

## Artefatos por run (`runs/<timestamp>-<fase>/`)

```
00-prompt-implementer.txt       envelope enviado ao DeepSeek
01-response-implementer.txt     resposta bruta do implementador
02-git-status.txt               03-git-diff-stat.txt   04-git-diff.txt
05-tests.txt                    06-build.txt
07-implementer-report.json      resumo gerado a partir das evidências
08-review-context.txt           contexto enviado ao revisor
09-review-response.txt          resposta(s) bruta(s) do revisor
10-audit-result.json            auditoria validada (contrato estrito)
11-evidence.json                evidências locais (testes/build/diff) para re-auditoria
run.json                        resumo estruturado da execução
```

## Segurança

- **Allowlist de comandos**: somente `git status/diff/checkout -b <phase/*>/rev-parse`
  e `pnpm --filter @lexia/* (test|build)`. `push`, `merge`, `reset`, `rm`,
  `drop`, shell pipes, redirecionamentos e substituição de comando são negados.
- **Sem shell**: `child_process.spawn` com `shell: false`; argumentos vindos da
  configuração são tokenizados e validados caractere a caractere.
- **Respostas de modelos nunca são executadas** e nunca alteram o roadmap sem
  validação de contrato + máquina de estados.
- **Caminhos validados**: `safeJoin` rejeita `..`/absolutos; `run-id` validado.
- **Sem merge/push/deploy automáticos**: a branch fica para revisão humana.
- **Nunca avança com BLOCKER/HIGH** (mesmo que o revisor diga APPROVE) e
  testes/build/diff falhando também bloqueiam o avanço.

## Testes

```bash
pnpm --filter @lexia/ai-orchestrator test
pnpm --filter @lexia/ai-orchestrator build   # tsc --noEmit
```

Cobertura: parser/updater do roadmap, gate de aprovação, contratos Zod,
segurança da allowlist/caminhos e dry-run completo do pipeline com fakes.

## Desvios documentados

- O roadmap é alterado pelo próprio orquestrador; por isso a checagem de
  working tree limpo exclui o diretório `docs/ai-development/`.
- Aprovação manual (`ai:approve`) é um override humano consciente: permite
  `AUDIT_APPROVED` a partir de `AUDIT_PENDING`/`CORRECTION_PENDING`/
  `AUDIT_FAILED`/`IMPLEMENTED` e registra a linha no histórico.
- O orquestrador cria o lock `.orchestrator.lock` em `docs/ai-development/`
  durante execuções que alteram o roadmap (`ai:run`, `ai:audit`, `ai:approve`);
  `runs/` e o lock são gitignored.
