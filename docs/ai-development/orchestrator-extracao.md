# Orquestrador — Plano de Extração para Reuso (Repositório Próprio)

> **Decisão (2026-08-22):** o `tools/ai-orchestrator` permanece **acoplado ao SmartJuris
> enquanto trabalha nele**. Ao final, será **desacoplado e salvo num repositório próprio**
> para uso em outras aplicações. Este documento é o checklist da extração.

## Estado atual

- O orquestrador é um **pacote pnpm** (`@lexia/ai-orchestrator`) em `tools/ai-orchestrator/`.
- A lógica é **~85% genérica** (agnóstica de domínio): máquina de estados, gate de
  aprovação, findings ledger, cache de auditoria, pre-flight, escada flash→pro,
  telemetria de custo, dashboard web e entrada de requisitos **não dependem do SmartJuris**.
- O acoplamento restante é **config + texto de marca + convenções de caminho/parser**,
  concentrado e já mapeado abaixo — a extração é mecânica, sem reescrever lógica.

## Checklist de extração

### A. Configuração (portátil — já em `automation-config.json`)

- [ ] `project` — identifica a aplicação (ex.: `smartjuris`).
- [ ] `commands.*` — comandos de teste/build (ex.: `pnpm --filter @lexia/api test`).
- [ ] `implementer` / `reviewer` — provedor e modelos.
- [ ] `pricing.models` — tabela de preços por modelo.
- [ ] `preflight.mode` — `collect-all` | `fail-fast`.
- [ ] `limits.maxCorrectionAttempts` — teto de correções.

### B. Textos de marca embutidos no código (trocar por `identity.name` do config)

| Arquivo | Onde | Fixo hoje |
|---|---|---|
| `src/run.ts:62` | `OUT_OF_SCOPE` | "Classificador, catálogo compartilhado, reserva de créditos, geração, fallback, SSE, frontend e migrations" |
| `src/run.ts:67` | `COMPLETION_CRITERIA` | "- Isolamento multi-tenant preservado" etc. |
| `src/prompts.ts:112` | `REVIEWER_TEST_PATTERNS` | 5 padrões de teste (genéricos, mas opinativos) |
| `src/requirements.ts:35` | system prompt do estruturador | "orquestrador do SmartJuris" |
| `src/llm.ts:197` / `src/deps.ts:37` | system prompt do implementador | "implementador do SmartJuris" |
| `src/commands.ts:43,141` | cabeçalhos de relatório | "SmartJuris — Roadmap…" |
| `src/cli.ts:3` | comentário | "CLI do orquestrador local do SmartJuris" |
| `web/dashboard.html:6` | `<title>` | "Painel do Orquestrador — SmartJuris" |

**Ação sugerida:** adicionar `identity: { name, implementerSystemPrompt, outOfScope,
completionCriteria }` ao `automation-config.json` (com defaults genéricos) e ler daí.

### C. Convenções de caminho (parametrizar)

- [ ] `src/paths.ts:46` — `resolveAiDevDir()` exige `docs/ai-development` fixo.
  → aceitar `AI_DEV_DIR` (env) ou `automation-config.json: paths.aiDevDir`, mantendo
  `docs/ai-development` como default.
- [ ] `src/config.ts:10` — `CANONICAL_PREFIX = 'docs/ai-development/'` valida os caminhos.
  → derivar do caminho configurado.

### D. Parser de prompts por configuração de modelos

- [ ] `src/prompts.ts:17,41` — parser espera cabeçalhos literais
  `## DeepSeek — implementação` e `## GPT-5.6 Luna — revisão`.
  → usar `implementer.label` / `reviewer.label` do config (fallback para os atuais),
  para outro projeto com outro revisor (ex.: Claude) funcionar sem tocar o código.

### E. Nome do pacote (decisão de empacotamento)

- [ ] Hoje: `@lexia/ai-orchestrator` (nome carrega "lexia").
- [ ] Na extração: renomear para algo neutro (ex.: `@ai-orchestrator/core`) ou manter,
  conforme a política de naming dos novos repositórios.

### F. Empacotamento standalone

- [ ] Documentar que `tools/ai-orchestrator` é um pacote reutilizável; os scripts
  `pnpm ai:*` ficam no repo da aplicação (root `package.json`), o pacote em si é neutro.
- [ ] Copiar o pacote + `automation-config.json` de referência (não o do SmartJuris).
- [ ] Definir `README.md` do orquestrador com o fluxo de adoção em outra aplicação:
  1. instalar o pacote; 2. criar `automation-config.json`; 3. criar roadmap/prompts
     (via `ai:req` ou manual); 4. rodar `ai:run` / `ai:dashboard`.

## O que NÃO precisa mudar (já é genérico)

- Máquina de estados e transições (`roadmap.ts`).
- Gate de aprovação e evidências (`audit.ts`).
- Findings ledger com IDs estáveis (`ledger.ts`).
- Cache de auditoria por `contextHash` (`run.ts`).
- Pre-flight `collect-all`/`fail-fast` antes do revisor (`run.ts`).
- Escada de modelo implementador flash→pro (`run.ts` + config).
- Contagem de tentativas lida de `runs/` em disco (`run.ts`).
- Telemetria de tokens/custo (`llm.ts`, `pricing.ts`).
- Entrada de requisitos → fases estruturadas (`requirements.ts`).
- Dashboard web em tempo real (`dashboard.ts`, `web/dashboard.html`).

## Riscos / observações

- **Roadmap/prompts são específicos da aplicação**: ficam no repo da aplicação, não no
  pacote (só o template/estrutura é do pacote).
- **`docs/ai-development/runs/` é gitignored**: histórico de execução não migra com o
  pacote; considerar se deve acompanhar na extração.
- **Testes**: 130 testes no pacote são agnósticos (fixtures próprias) — migram sem
  depender do SmartJuris.
- **`.env` / chaves**: o pacote lê `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` do env da
  aplicação — documentar no README da extração.
