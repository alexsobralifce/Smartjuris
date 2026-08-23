# Iniciar orquestrador

Guia rápido para rodar o orquestrador de implementação por fases do SmartJuris.
O orquestrador fica em `tools/ai-orchestrator` e é um pacote pnpm
(`@lexia/ai-orchestrator`). Ele recebe requisitos, quebra em fases, implementa
com DeepSeek, revisa com GPT-5.6 Luna e persiste tudo em
`docs/ai-development/runs/` (gitignored).

---

## 1. Pré-requisitos

- Node.js + pnpm instalados (`pnpm --version`).
- Chaves de API no `.env` da raiz:
  - `DEEPSEEK_API_KEY` — implementador / estruturador de requisitos.
  - `OPENAI_API_KEY` — revisor (GPT-5.6 Luna).
  - `JURISPRUDENCIAS_API_KEY` — só se for usar a busca de tribunais.
- Diretório `docs/ai-development/` com o roadmap, prompts e `automation-config.json`.

---

## 2. Comandos principais (na raiz do projeto)

```bash
pnpm ai:status              # tabela do roadmap (estado das fases)
pnpm ai:relatorio           # relatório de andamento (runs, vereditos, custo, tokens)
pnpm ai:next                # executa a próxima fase elegível (PLANNED com deps aprovadas)
pnpm ai:run --phase 3A      # executa uma fase específica
pnpm ai:retry --phase 3A    # reexecuta fase em CORRECTION_PENDING/AUDIT_FAILED
pnpm ai:audit --run <id>    # reexecuta só a auditoria de um run
pnpm ai:approve --phase 3A --reason "justificativa"   # aprovação manual (humano)
pnpm ai:dry-run --phase 3A  # plano offline, sem mutar nada
pnpm ai:dashboard           # painel web em tempo real (http://localhost:3177)
```

---

## 3. Painel web (dashboard)

O painel mostra em tempo real: custo em US$, tokens, estados das fases,
verificações (Testes/Build/Diff), vereditos e achados abertos, e ainda serve a
**entrada de requisitos** (estruturação em fases).

```bash
pnpm ai:dashboard            # servidor simples (http://localhost:3177)
pnpm ai:dashboard:dev        # com auto-restart (tsx watch) — ideal para desenvolvimento
```

> O `ai:dashboard:dev` reinicia sozinho a cada mudança em `src/` e `web/`.

---

## 4. Enviar novos requisitos

Você escreve em linguagem natural; o orquestrador estrutura em fases enumeradas.

**Por arquivo (CLI):**
```bash
# Escreva o requisito em um arquivo .txt
nano docs/ai-development/requirements/novos.txt

# Mostra as fases estruturadas (sem aplicar)
pnpm ai:req --file docs/ai-development/requirements/novos.txt

# Aplica no roadmap + prompts (grava em requirements/<id>.json)
pnpm ai:req --file docs/ai-development/requirements/novos.txt --apply
```

**Formatos de entrada suportados** (o orquestrador escolhe o loader pela extensão,
no estilo do LangChain — todos viram o mesmo contrato de fases):

| Extensão | Formato | Como é tratado |
|---|---|---|
| `.txt` / `.md` | Linguagem natural | Estruturado em fases via DeepSeek Flash |
| `.json` | Já estruturado (`{"fases": [...]}` ou array direto) | Validado pelo contrato Zod |

**Pela interface (recomendado):** abra `pnpm ai:dashboard`, seção **"Novos
requisitos"** → cole o texto → "1 · Estruturar em fases" → revise → "2 · Aplicar
no roadmap". Depois é só rodar `pnpm ai:run --phase <ID>`.

---

## 5. Estado atual das fases

| Fase | Descrição | Estado |
|---|---|---|
| 2A | Segurança documental e metadados | `AUDIT_APPROVED` |
| 2A.1 | Testes HTTP de tenancy | `AUDIT_APPROVED` |
| 2A.2 | Correção da exportação | `AUDIT_APPROVED` |
| 2B | Catálogo compartilhado | `AUDIT_APPROVED` |
| 2C | Builder do payload real | `AUDIT_APPROVED` |
| 2D | Desenho da análise documental | `AUDIT_APPROVED` |
| 2E | Migration dos metadados do classificador | `AUDIT_APPROVED` |
| 2F | Idempotência e reserva | `AUDIT_APPROVED` |
| 3A | Unidades de análise documental | `AUDIT_APPROVED` |
| 3B | Fallback Flash/Pro | `AUDIT_APPROVED` |
| 3C | Integração SSE | `AUDIT_APPROVED` |
| 3D | Integração frontend | `AUDIT_APPROVED` |
| 4A | Testes end-to-end | `AUDIT_APPROVED` |
| 4B | Piloto controlado | `AUDIT_APPROVED` |

>> A tabela acima pode estar desatualizada. Rode `pnpm ai:status` para ver o
>> estado real atual.

---

## 6. Solução de problemas

### Erro EACCES / permission denied
Arquivos criados pela automação podem nascer como `root:staff` com modo 600.
Rode o pré-run que corrige isso:
```bash
pnpm --filter @lexia/ai-orchestrator fix-perms
```
ou, para corrigir o repositório inteiro:
```bash
sudo chown -R $(whoami):staff /Users/alexandrerocha/Smartjuris/
```

### Erro "rota não encontrada. Use / para o painel..."
É um servidor **antigo** ainda rodando na porta 3177. Encerre o processo:
```bash
lsof -nP -iTCP:3177 -sTCP:LISTEN   # mostra o PID
kill <PID>
pnpm ai:dashboard
```

### Porta já em uso (EADDRINUSE)
Encerre o painel anterior antes de subir outro:
```bash
lsof -nP -iTCP:3177 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs kill
```

### Revisor não chamado
Se testes/build/diff falharem, o revisor é **poupado** (regra do pre-flight).
Corrija a evidência local antes de re-auditar. Verifique `run.json`
(`skippedReviewer` / `skipReason`).

### Falta de chave
O `ai:status`, `ai:approve` e `ai:dry-run` funcionam offline. Já
`ai:run`/`ai:next`/`ai:req`/estruturar exigem `DEEPSEEK_API_KEY` e `OPENAI_API_KEY`.

---

## 7. Registros e artefatos

- **Roadmap**: `docs/ai-development/implementation-roadmap.md`
- **Prompts por fase**: `docs/ai-development/smartjuris-phase-prompts.md`
- **Config**: `docs/ai-development/automation-config.json`
- **Runs (histórico)**: `docs/ai-development/runs/<timestamp>-<fase>/` (gitignored)
- **Ledger de achados**: `docs/ai-development/runs/ledger/<fase>.json`
- **Requisitos estruturados**: `docs/ai-development/requirements/<id>.json`
- **Plano de extração p/ reuso**: `docs/ai-development/orchestrator-extracao.md`
