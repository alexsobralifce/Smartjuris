# Orquestrador — Banco de Regras de Baliza (Guardrails Anti-Loop)

> **Propósito:** evitar loops excessivos de correção e queima de tokens em rodadas
> de implementação/auditoria. Compilado a partir de pesquisa sobre orquestradores
> e runtimes de agentes conhecidos (Claude Code, OpenRouter Agent SDK, AutoGen/AG2,
> LangGraph, TokenFuse, MartinLoop, ai-agent-loop, AgentPatterns/Harness Engineering,
> LLM-Agents-Ecosystem-Handbook).
>
> Cada regra indica: **gatilho**, **ação**, **onde é aplicada** (runtime/instrução/hook),
> **estado atual no SmartJuris** (✅ existe / ⚠️ parcial / ❌ falta) e **referência**.

---

## 1. Teto de iterações por fase (maxTurns / maxSteps)

| | |
|---|---|
| **Gatilho** | Fase atingiu N rodadas de correção sem `AUDIT_APPROVED` |
| **Ação** | Parar o ciclo e exigir decisão humana (`ai:approve` ou reescopo) |
| **Aplicação** | Runtime (o modelo não pode ignorar) |
| **Referências** | [Claude Code sub-agents `maxTurns`](https://code.claude.com/docs/en/sub-agents) · [ai-agent-loop `maxSteps`](https://github.com/hijrahassalam/ai-agent-loop) · [AG2 `max_consecutive_auto_reply`](https://github.com/ag2ai/ag2) · [LangGraph `recursion_limit`](https://reference.langchain.com/python/deepagents-code/_server_config/ServerConfig/recursion_limit) · [Circuit Breakers (AgentPatterns)](https://raw.githubusercontent.com/agentpatterns-ai/website/refs/heads/main/observability/circuit-breakers.md) |

**Estado no SmartJuris:** ✅ `limits.maxCorrectionAttempts` (automation-config.json) + contagem de rodadas `CORRECTION_PENDING`/`AUDIT_FAILED` (run.ts:403-417).

**Regra de bolso:** o teto é uma **constante do processo**, não um número a ser
inflado quando o revisor insiste. Se a fase precisa de mais rodadas, o problema
é escopo — reescreva a fase, não o teto.

---

## 2. Orçamento de tokens/custo por rodada e por fase (budget)

| | |
|---|---|
| **Gatilho** | Custo acumulado da fase (implementador + revisor) ultrapassa `maxUsdPorFase` (default: R$ 2,00 ≈ US$ 0,40) |
| **Ação** | Abrir circuito: parar, registrar custo, exigir decisão humana |
| **Aplicação** | Runtime (proxy/contador determinístico, como o TokenFuse) |
| **Referências** | [TokenFuse — runtime kill-switch (HTTP 402 antes de cobrar)](https://github.com/TAIPANBOX/tokenfuse) · [MartinLoop `--budget-usd`](https://github.com/Keesan12/Martin-Loop) · [ai-agent-loop `maxTokens`](https://github.com/hijrahassalam/ai-agent-loop) · [Cost Controls & Circuit Breakers](https://learn.agentpatterns.ai/harness-engineering/cost-controls-and-circuit-breakers/) |

**Estado no SmartJuris:** ⚠️ a telemetria já grava `implementerUsage`/`reviewerUsage`
(usd por rodada), mas **não há teto** — nenhum código interrompe a fase por custo.
O dashboard mostra o custo, mas não aplica baliza.

**Regra de bolso:** um loop de correção com custo crescente é o sinal mais forte
de estagnação. Se 2 rodadas seguidas custam mais que a primeira e não aprovam,
pare — não é "quase lá", é divergência.

---

## 3. Detecção de repetição (doom-loop: mesma ação com mesmo input)

| | |
|---|---|
| **Gatilho** | Mesma chamada de ferramenta com mesmos argumentos ≥ N vezes consecutivas; ou resposta idêntica à anterior |
| **Ação** | Escada: `observe` (registra) → `steer` (avisa o modelo) → `block` (recusa a chamada repetida) → `stop` (encerra a rodada) |
| **Aplicação** | Hook determinístico (não depende do modelo obedecer) |
| **Referências** | [OpenRouter Doom-Loop Detection (observe@2, block@3, stop@6; `loopKey`)](https://openrouter.hconeai.com/docs/agent-sdk/call-model/doom-loop-detection) · [ai-agent-loop duplicate prevention](https://github.com/hijrahassalam/ai-agent-loop) · [Hermes agent stall guards](https://github.com/nousresearch/hermes-agent) · [Claude Code hooks](https://code.claude.com/docs/en/hooks) |

**Estado no SmartJuris:** ⚠️ o loopgain por conteúdo (run.ts:162 `convergenciaFalhou`)
detecta **não-convergência de achados** entre rodadas — mas compara chave
`severity::file::requirement`, e o revisor frequentemente reescreve o texto do
achado (chave muda → parece "progresso" mesmo sem resolver nada). **Falta:**
- comparar por **ação/solução** (não por texto) e por **custo por rodada**;
- detectar **retry idêntico de comando** (ex.: mesma suíte falhando 3× com o
  mesmo erro — stop em vez de re-rodar).

**Regra de bolso:** texto diferente ≠ progresso. O progresso é: achado grave
resolvido (mesmo *requirement*), teste novo verde, custo por rodada estável.

---

## 4. Circuit breaker por sinais (5 sinais de parada)

| Sinal | Trip |
|---|---|
| Iteration limit | N rodadas sem aprovação (regra 1) |
| Repeated failure | Mesmo comando/erro repetido (ex.: mesma suíte, mesmo teste falhando) |
| Repetition | Mesma chamada/leitura sem informação nova (regra 3) |
| Context budget | Contexto do revisor/implementador próximo do limite de degradação |
| Cost threshold | Custo > orçamento (regra 2) |

**Referências:** [Circuit Breakers for Agent Loops](https://raw.githubusercontent.com/agentpatterns-ai/website/refs/heads/main/observability/circuit-breakers.md) · [Cost Controls & Circuit Breakers](https://learn.agentpatterns.ai/harness-engineering/cost-controls-and-circuit-breakers/)

**Estado no SmartJuris:** ⚠️ iteration limit ✅ · repeated failure ❌ · repetition ⚠️
(loopgain parcial) · context budget ✅ (já truncamos `maxContextChars` p/ revisor) ·
cost threshold ❌.

**Regra de bolso:** runtime vence instrução. Balizas críticas (teto de rodadas,
orçamento) devem ser **enforcement no código**, nunca "peça ao modelo para parar".

---

## 5. Convergência por conteúdo (loopgain v2)

| | |
|---|---|
| **Gatilho** | Rodada de correção NÃO reduz os achados HIGH/BLOCKER da rodada anterior |
| **Ação** | Abrir circuito → `AUDIT_FAILED` + erro explícito + decisão humana |
| **Aplicação** | Runtime (comparação determinística) |
| **Referência** | [MartinLoop VERIFIED/STOPPED/NEEDS REVIEW + failure classification](https://github.com/Keesan12/Martin-Loop) |

**Estado no SmartJuris:** ✅ loopgain v1 existe (run.ts:162-219) e abriu circuito
na fase 6A. **Limitação conhecida:** chave `severity::file::requirement` — o
revisor muda o texto do achado e a chave "resolve". Refinamento v2:
- chave por **`requirement` normalizado** (minúsculas, sem pontuação) + `file`;
- sinal adicional: **custo da rodada atual > custo da anterior** e nenhum achado
  resolvido ⇒ loop (não convergência).

**Regra de bolso:** convergência é "achados graves diminuem E custo não explode".
Se o revisor troca o texto mas mantém a exigência, é o MESMO achado.

---

## 6. Escalonamento com modelo mais forte (escalate)

| | |
|---|---|
| **Gatilho** | Rodada falhou; antes de gastar outra rodada no mesmo modelo, sobe de tier |
| **Ação** | Próxima rodada usa modelo mais capaz (e/ou consulta externa), com teto `maxEscalations` (ex.: 2 por fase) |
| **Referências** | [OpenRouter doom-loop `escalate` + `maxEscalations`](https://openrouter.hconeai.com/docs/agent-sdk/call-model/doom-loop-detection) · [FrugalGPT cascade (cheap → deterministic gate → capable)](https://learn.agentpatterns.ai/harness-engineering/cost-controls-and-circuit-breakers/) |

**Estado no SmartJuris:** ⚠️ implementador tem escada flash→pro
(`escalateAfterAttempts: 2`), mas o **revisor não tem** — auditoria em loop usa
sempre gpt-5.6-luna. Se o revisor reprova 2× com o mesmo tema, deveria subir
para um modelo de auditoria mais forte OU registrar "loop de revisão" e exigir
humano em vez de rodar a 3ª revisão.

**Regra de bolso:** escalonar é gastar mais UMA vez, não infinitamente. Após o
teto de escalações, pare.

---

## 7. Degradação graciosa (partial results > nothing)

| | |
|---|---|
| **Gatilho** | Qualquer baliza trip |
| **Ação** | 1) parar novas ações; 2) preservar o trabalho concluído (artefatos/evidências); 3) explicar o gatilho e o que falta; 4) escalar a humano se houver gate |
| **Referência** | [Circuit Breakers — Graceful degradation](https://raw.githubusercontent.com/agentpatterns-ai/website/refs/heads/main/observability/circuit-breakers.md) |

**Estado no SmartJuris:** ✅ artefatos por rodada (runs/) + `ai:audit`/`ai:approve`
preservam evidência; erro de circuito aberto explica o motivo.

---

## 8. Wallclock timeout (tempo de parede por rodada)

| | |
|---|---|
| **Gatilho** | Rodada (implementador ou revisor) excede `maxMinutesPorRodada` (ex.: 15 min) |
| **Ação** | Matar a chamada, registrar timeout, tratar como falha (retry com backoff ou parada) |
| **Aplicação** | Runtime |
| **Referências** | [LLM-Agents-Ecosystem-Handbook GUARDRAILS template](https://github.com/oxbshw/LLM-Agents-Ecosystem-Handbook/blob/main/templates/GUARDRAILS.md.template) · [Claude Code streaming idle watchdog](https://code.claude.com/docs/en/changelog) |

**Estado no SmartJuris:** ⚠️ comandos de teste/build têm timeoutMs (600s/900s),
mas a chamada LLM em si não tem teto de duração explícito no run.

---

## 9. Rate limit / backoff (não re-rodar imediatamente)

| | |
|---|---|
| **Gatilho** | 429 / 5xx / timeout |
| **Ação** | Backoff exponencial com jitter; contador de tentativas; após N, stop |
| **Referências** | [AG2 retry/backoff](https://github.com/ag2ai/ag2) · [Nexus agent RetryBackoff](https://pkg.go.dev/github.com/haasonsaas/nexus/internal/agent) |

**Estado no SmartJuris:** ✅ llm.ts já faz retry com backoff em 5xx/429/timeout.

---

## 10. Fail-closed em balizas críticas

| | |
|---|---|
| **Gatilho** | Baliza crítica não consegue ser avaliada (ex.: tabela de idempotência indisponível, lock não adquirido) |
| **Ação** | Fechar (negar) em vez de abrir — nunca executar efeito sem confirmação |
| **Referências** | [TokenFuse — o proxy corta o circuito em tempo real](https://github.com/TAIPANBOX/tokenfuse) · [MartinLoop — control path](https://github.com/Keesan12/Martin-Loop) |

**Estado no SmartJuris:** ✅ billing webhook/checkout usam fail-closed (lease,
x-signature, tabela de idempotência). No orquestrador: ⚠️ loopgain e teto são
fail-closed (abrem circuito), mas o **custo** ainda não fecha.

---

## Resumo do gap (implementação concluída)

| # | Regra | Estado | Onde |
|---|---|---|---|
| 1 | Teto de iterações | ✅ | `limits.maxCorrectionAttempts` (run.ts:403) |
| 2 | **Orçamento de custo por fase** | ✅ | `limits.maxUsdPorFase` (default US$ 0.40) — `checarOrcamentoFase` soma todas as rodadas e abre circuito (guardrails.ts) |
| 3 | **Doom-loop de comando** | ✅ | `limits.maxComandoRepetido` (3) — hash da suíte de testes; mesma saída N× → stop (guardrails.ts + run.ts) |
| 4 | Circuit breaker: repeated failure | ✅ | coberto pelo doom-loop de comando (B2) |
| 5 | **Loopgain v2 (similaridade + custo)** | ✅ | `mesmosRequisitos` (Jaccard ≥ 0.5) — reescrita de texto NÃO conta como resolvido; sinal de custo crescente sem resolução (guardrails.ts) |
| 6 | **Escalada do revisor** | ✅ | `reviewer.escalateAfterAttempts` (2) + `maxEscalations` (1); após teto, exige humano (run.ts) |
| 7 | Degradação graciosa | ✅ | artefatos por rodada preservados |
| 8 | Timeout de LLM por rodada | ⚠️ | parcial (comandos têm timeout; chamada LLM não) — pendente |
| 9 | Backoff | ✅ | llm.ts |
| 10 | Fail-closed | ✅ | custo/lock/idempotência fecham o circuito |

## Regras lidas a cada acionamento

- `docs/ai-development/orquestrador-regras.md` — lista SIMPLES (17 regras de bolso,
  implementador + revisor + runtime) — injetada no prompt do implementador e do
  revisor a cada rodada (run.ts: `lerRegrasDeBaliza`).
- `tools/ai-orchestrator/skills/*.md` — DICAS por relevância: busca automática por
  palavras-chave da fase (objetivo+escopo), anexa até 2 skills (2,5 KB cada) ao
  prompt — contexto enxuto (run.ts: `buscarSkillsRelevantes`).

---

## Regras de ouro (resumo executivo)

1. **Teto é teto** — não inflar `maxCorrectionAttempts` para acomodar o revisor; reescrever o escopo.
2. **Custo fecha o circuito** — se 2 rodadas seguidas custam mais que a primeira e não aprovam, pare.
3. **Texto diferente ≠ progresso** — comparar achados por exigência normalizada, não por redação.
4. **Runtime vence instrução** — balizas críticas são código, não prompt.
5. **Escalar é gastar mais UMA vez** — após o teto de escalações, humano decide.
6. **Degrade graciosamente** — preservar artefatos e explicar antes de parar.
7. **Fail-closed** — sem confirmação (custo, lock, idempotência), não executa.
