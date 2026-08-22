# SmartJuris (LexOS Edition) — Sistema Jurídico com IA

Monorepo pnpm (workspaces) — Backend Express + Drizzle ORM + PostgreSQL (pgvector) · Frontend React 19 + Vite + Tailwind CSS v4 · Pacote compartilhado `@lexia/shared` · Orquestrador de IA `tools/ai-orchestrator`.

> [!IMPORTANT]
> **Leitura Prévia de Skills**: Antes de iniciar o planejamento ou a implementação de qualquer tarefa ou funcionalidade no sistema, o agente de IA **DEVE SEMPRE** verificar e ler atentamente as instruções das **skills do sistema** disponíveis (`.agents/skills/` ou `.gemini/antigravity-ide/builtin/skills/`) para garantir conformidade rigorosa com os fluxos, arquitetura e convenções estabelecidas.

---

## Development Server

- Frontend Web: `http://localhost:5173` (Vite, HMR) — em produção: container `serve` no Railway.
- Backend API: `http://localhost:3001` (Express, `tsx watch`) — em produção: container Express no Railway.
- Banco local via `docker-compose.yml`: PostgreSQL pgvector:16 (porta **5433**), Ollama (11434) e Redis (6379).

---

## Visão Geral do Produto

**SmartJuris (LexOS Edition)** é uma plataforma SaaS de gestão jurídica inteligente, multi-tenant, com IA nativa. Unifica contencioso, consultivo, financeiro, relacionamento com clientes e operação da plataforma em um único sistema, com:

- **Gestão de processos** com Matter Dashboard, linha do tempo e resumo de intimações por IA (BGE-M3 + DeepSeek V4).
- **Geração de peças** com RAG vetorial (pgvector + BGE-M3 via Ollama) e DeepSeek V4 (Flash padrão, fallback Pro), com **fila de validação humana auditável** (crivo ético OAB) e exportação PDF/DOCX.
- **Catálogo compartilhado de IA** (`@lexia/shared`): planos canônicos (ESSENTIAL/PROFESSIONAL/OFFICE) e 7 operações de IA (créditos, modelo FLASH/PRO, limites de tokens/páginas/resultados) — fonte única consumida por classifier e usage.
- **Jurimetria preditiva**, **financeiro & timesheet faturável**, **scanner de revisão contratual**, **CRM/funil** e **base de conhecimento vetorial**.
- **Cadastro self-service** de advogado + escritório (aprovado pelo root) e **consulta de jurisprudência ao vivo** em tribunais.
- **Multi-tenancy** por escritório (roles `root`/`admin`/`user`), sessão deslizante, auditoria completa, créditos/tokens mensais e LGPD.

### Módulos do Sistema (Web)

| Módulo | Rota | Arquivo | Descrição |
|---|---|---|---|
| Dashboard | `dashboard` | `components/Dashboard.tsx` | KPIs gerais, peças recentes, prazos críticos e status do motor RAG |
| Agenda | `agenda` | `components/Agenda.tsx` | Calendário de eventos (audiências, reuniões, prazos) com CRUD e vínculo a processos/clientes |
| Processos | `processos` | `components/Processos.tsx` | Gestão de processos com Matter Dashboard, linha do tempo e resumo de intimações por IA |
| Clientes | `clientes` | `components/Clientes.tsx` | CRUD de clientes PF/PJ com máscaras de CPF/CNPJ e busca de CEP (ViaCEP) |
| Gerar Peças | `pecas` | `components/GeradorPecas.tsx` | Fluxo em 4 etapas: tipo → dados do caso → RAG BGE-M3 + DeepSeek (streaming) → revisão/exportação |
| Validação | `validacao` | `components/Validacao.tsx` | Fila de revisão humana com crivo ético OAB, edição, exportar PDF/DOCX e metadados de custo |
| Jurimetria | `jurimetria` | `components/Jurimetria.tsx` | Analytics de taxa de êxito por área e Calculadora Preditiva de Risco interativa |
| Decisões & Tribunais | `decisoes` | `components/Decisoes.tsx` | Consulta ao vivo de jurisprudência (busca e lookup) via Jurisprudências.ai Live API |
| Financeiro | `financeiro` | `components/Financeiro.tsx` | Honorários fixos/êxito/despesas + Cronômetro de Timesheet faturável (billable hours) |
| Revisão Contratual | `contratos` | `components/Contratos.tsx` | Scanner autônomo de minutas: detecção de riscos e sugestões de redação |
| CRM & Funil | `crm` | `components/Crm.tsx` | Pipeline Kanban em 4 fases (Lead → Diagnóstico → Proposta → Contrato) com alerta de conflito |
| Base RAG | `base` | `components/Base.tsx` | Gerenciamento de coleções vetoriais indexadas e busca semântica em julgados |
| Documentação | `documentacao` | `components/Documentacao.tsx` | Central de ajuda, manual em 3 passos, arquitetura em camadas, LGPD e FAQ |
| Administração | `admin` | `components/AdminEscritorio.tsx` | Painel do admin do escritório: identidade/timbre, métricas, usuários, permissões, reset de senha |
| Operações (Root) | `admin` (root) | `components/RootPainel.tsx` | Painel da plataforma: CRUD de escritórios, créditos, métricas globais, auditoria e logs |
| Landing (pública) | — | `components/LandingPage.tsx` | Marketing, login e cadastro self-service de advogado + escritório (com LGPD) |
| Trocar Senha | — | `components/TrocarSenha.tsx` | Tela de troca de senha (forçada ou voluntária) |
| Pricing | — | `components/PricingSection.tsx` | Seção de preços/planos (landing) |

---

## Autenticação, Roles e Multi-tenancy

- **Auth** (`routes/auth.ts`, público): `POST /login`, `POST /registro` (self-service), `POST /verificar-codigo` / `POST /reenviar-codigo` (OTP opcional), `POST /trocar-senha`, `POST /logout`, `GET /me`.
- **Cadastro self-service**: cria escritório `ativo=false` (pendente de aprovação pelo root), `isDemo=true`, e o advogado como `admin`. O root ativa via `PATCH /api/root/escritorios/:id { ativo: true }`.
- **Roles**: `root` (operações da plataforma), `admin` (gestão do escritório, vê todos os módulos), `user` (advogado, permissões granulares por módulo via `permissoes_usuario`).
- **Sessão**: JWT httpOnly (cookie `smartjuris_token`), sessão deslizante (`refreshSession` renova em cada requisição), tela de sessão expirada, troca de senha forçada (`forcePasswordChange`) e revogação por JTI em memória.
- **Tenancy**: `tenantScope` filtra por `escritorio_id` (admin = escritório; user = escritório + autoria; **root é bloqueado nas rotas de negócio via `rejectRoot`**).
- **Auditoria**: `recordAudit` grava em `audit_log` (quem, quando, o quê, IP) para ações sensíveis (login, peças, escritórios, reset de senha, créditos, exportação, etc.).

---

## Catálogo Compartilhado de IA (`packages/shared`)

Fonte única de verdade para planos e operações de IA — consumida por `classifier.ts` e `usage.ts` (nenhum catálogo duplicado nos consumidores).

- **Planos canônicos** (`PLAN_CODES`): `ESSENTIAL`, `PROFESSIONAL`, `OFFICE`. Aliases centralizados (`PLAN_ALIASES` — `basico`/`starter`→ESSENTIAL, `pro`/`profissional`→PROFESSIONAL, `office`/`enterprise`→OFFICE) e `normalizePlan`.
- **Limites por plano** (`PLAN_LIMITS`): créditos/mês, reserva máxima (cents), custo máximo por operação (cents).

| Plano | Créditos/mês | Max reserva (cents) | Max custo/op (cents) |
|---|---|---|---|
| ESSENTIAL | 20 | 4_500 | 240 |
| PROFESSIONAL | 50 | 7_500 | 400 |
| OFFICE | 100 | 12_500 | 600 |

- **Operações de IA** (`AI_OPERATIONS` + `OPERATION_CATALOG`): 7 operações com contrato completo — `classification` (SIMPLE/STANDARD/COMPLEX), `model` (FLASH/PRO), `credits`, `maxInputTokens`/`maxOutputTokens`/`maxOutputPages`/`maxAttachmentPages`, `resultLimit`, `blockSizePages`, e flags `isDraftingOperation`/`requiresHumanReview`/`isAnalysisOperation`/`isStandaloneSearch`.
  - `SIMPLE_PETITION` (Flash, 1cr), `SECTION_REVIEW` (Flash, 1cr), `STANDARD_PETITION` (Flash, 2cr), `DOCUMENT_ANALYSIS_20_PAGES` (Flash, 1cr, bloco de 20 págs), `JURISPRUDENCE_RESEARCH` (standalone, limite 8 resultados), `APPEAL` (Pro, 4cr), `COMPLEX_DOCUMENT` (Pro, 6cr).
- **Análise documental**: `ANALYSIS_BLOCK_SIZE_PAGES = 20` (crédito por bloco de 20 páginas).
- **Adaptadores**: `classifier.ts` deriva `OPERATION_CATALOG` via `toOperationPolicy`; `usage.ts` deriva `OPERATION_LIMITS` e `PLANS` via `planConfigFromShared` (com guarda de exaustividade que falha se um plano do shared não tiver entrada).

---

## IA e Geração de Conteúdo

- **Modelos** (`services/ai.ts`): cliente DeepSeek (OpenAI-compat, `https://api.deepseek.com/v1`) com `deepseekModel` (default `deepseek-v4-flash`) e `deepseekModelPro` (default `deepseek-v4-pro`) via env; **fallback automático Flash → Pro** na criação da chamada (complexidade alta).
- **RAG** (`routes/rag.ts`): busca vetorial/cosene em `chunks` (embedding BGE-M3 `vector(1024)`) + playbooks de teses (`services/modelosPeca.ts`) + geração com streaming SSE (sem markdown, temperatura 0.3).
- **Classificador** (`services/classifier.ts`): classifica operação → modelo FLASH/PRO, créditos e limites, a partir do catálogo compartilhado.
- **Custo/cota** (`services/usage.ts`): rastreia tokens (pico/fora-pico), precificação por modelo, limites por operação e cota mensal (`checkTokenQuota`).
- **Resumos de intimações** (`routes/andamentos.ts`): resumo em 2 frases com ação recomendada e prazo fatal, com redação de PII antes do envio (`services/pii.ts`).
- **Embeddings**: `services/embedding.ts` gera BGE-M3 via Ollama (com timeout configurável).
- **Jurisprudência**: `services/jurisprudencias.ts` integra a Jurisprudências.ai Live API (`/courts`, `/search`, `/lookup`).
- **E-mail**: `services/email.ts` envia código OTP, boas-vindas e notificações ao root via Resend ou SMTP (Nodemailer).

---

## Estrutura do Monorepo

```
/
├── apps/
│   ├── api/                    # Backend Node.js / Express (ESM, NodeNext)
│   │   ├── src/
│   │   │   ├── server.ts       # Express & montagem das rotas/middlewares
│   │   │   ├── startup.ts      # Startup: auto-migrations SQL e seed automático
│   │   │   ├── config.ts       # Carrega .env (dotenv)
│   │   │   ├── db/             # client.ts, schema.ts, seed.ts, test-seed.ts,
│   │   │   │                   # migrations/ (0000..0018) e drizzle.config.ts
│   │   │   ├── routes/         # auth, escritorios, rootCreditos, rootStats, rootDocumentos,
│   │   │   │                   # adminEscritorio, permissoes, processos, pecas, clientes,
│   │   │   │                   # financeiro, andamentos, documentos, rag, jurimetria,
│   │   │   │                   # jurisprudencias, agenda (+ admin.ts legado não montado)
│   │   │   ├── middlewares/    # auth, refreshSession, roleGuard, rejectRoot,
│   │   │   │                   # forcePasswordChange, moduleGuard, tenantGuard,
│   │   │   │                   # ownership, rateLimit, revocation, audit
│   │   │   ├── services/       # ai, classifier, usage, documento, embedding, email,
│   │   │   │                   # crypto, pii, modelosPeca, jurisprudencias, letterhead,
│   │   │   │                   # documentExport, demoSeed, logger (+ testes *.test.ts)
│   │   │   └── validation/     # schemas.ts (Zod centralizado)
│   │   ├── src/integration/    # Testes HTTP/tenancy/exportação (segurancaDocumentos, exportacaoPecas)
│   │   ├── Dockerfile          # Multi-stage (node:22-alpine): build tsc + runtime dist/startup.js
│   │   └── tsconfig.json       # NodeNext ESM moduleResolution (rootDir ./src)
│   │
│   └── web/                    # Frontend React 19 + Vite 8
│       ├── src/
│       │   ├── App.tsx         # Shell da aplicação: sidebar + roteamento + sessão/troca de senha
│       │   ├── components/     # Todas as telas (ver tabela de Módulos) + EditorRico, Toast, Pagination
│       │   ├── api/            # client.ts (authFetch, api.*) e config.ts (getApiBaseUrl)
│       │   ├── ui/             # Primitivos: Button, Modal, Table, Field, PageHeader, PageContainer,
│       │   │                   # EmptyState, Loading, FormGrid, inputStyle, tokens
│       │   ├── hooks/          # useBreakpoint (mobile/tablet/desktop), useIsMobile, useTheme
│       │   ├── utils/          # masks.ts (CPF/CNPJ/telefone/etc.)
│       │   └── imports/        # arquitetura_sistema_juridico_IA.md (usada na Documentação)
│       └── Dockerfile          # Multi-stage: build Vite + runtime serve estático
│
├── packages/
│   └── shared/                 # Pacote workspace @lexia/shared (compilado para dist/)
│       ├── src/catalog.ts      # Fonte única: planos + operações de IA (Fase 2B)
│       └── src/index.ts        # Re-exporta catalog + tipos (Processo/Peca/Documento/Status*)
│
├── tools/
│   └── ai-orchestrator/        # Orquestrador de implementação por fases (ver seção própria)
│       ├── src/                # cli, commands, run, roadmap, worktree, git, executor,
│       │                       # llm, prompts, audit, auditRun, config, deps, paths, contracts, io
│       └── test/               # 6 suítes de teste (roadmap, gate, contracts, safety, dryRun, worktree)
│
├── package.json                # Workspace root pnpm
├── pnpm-workspace.yaml         # packages: apps/*, packages/*, tools/*
├── railway.json                # Configuração do Railway (builder NIXPACKS)
└── docker-compose.yml          # Postgres pgvector:16, Ollama e Redis (ambiente local)
```

---

## Orquestrador de IA (`tools/ai-orchestrator`)

> Ciclo automatizado de implementação por fases com auditoria por LLM (DeepSeek implementador → GPT-5.6 Terra revisor). Ferramenta de desenvolvimento; **não roda em produção**.

- **Pipeline**: `roadmap` (estado das fases) → `prepareWorkingTree` (proteções/checkpoint) → branch `phase/<ID>` → `IMPLEMENTING` → evidências (testes/builds/diff) → `AUDIT_PENDING` → revisor → gate → estado final → auto-commit se aprovado.
- **Máquina de estados** (roadmap): `PLANNED → IMPLEMENTING → IMPLEMENTED → AUDIT_PENDING → AUDIT_APPROVED | CORRECTION_PENDING | AUDIT_FAILED`; retry permitido de `CORRECTION_PENDING`/`AUDIT_FAILED`.
- **Modos de working tree**: `--dry-run` (não muta), `--no-auto-commit` (exige árvore limpa), `--auto-commit` (checkpoint automático), `--autonomous` (encadeia próxima fase aprovada), `--allow-dirty` (executa sem commit; implementação externa já presente).
- **Segurança**: executor com allowlist (bloqueia `push`/`merge`/`reset`/`clean`/`git add .`/metacaracteres); respostas de LLM nunca executadas; `docs/ai-development` protegido; segredos/suspeitos/artefatos nunca commitados.
- **Robustez de LLM** (`llm.ts`): retry em 5xx/429/resposta vazia/timeout/**erros de rede transitórios** (`terminated`, `fetch failed`, DNS/TCP); fallback de `reasoning_content` quando `content` vazio (modelos de raciocínio); `max_tokens` p/ DeepSeek e `max_completion_tokens` p/ OpenAI.
- **Anti-retrabalho (memória + teto + cache + convergência)**: o revisor recebe o **histórico de auditorias anteriores** e as **correções desta rodada** (`auditHistory`/`correctionsApplied`), com instrução de NÃO reabrir tópicos resolvidos. O diff em rodadas de correção é o **delta desde a rodada anterior** (`previousRunBaseSha`). `maxCorrectionAttempts` bloqueia a fase ao atingir o limite de tentativas. **Cache de auditoria**: contexto idêntico a uma rodada anterior reutiliza o veredito (zero chamada ao revisor — `contextHash`/`fromCache` no run.json). **Loopgain (convergência)**: se uma rodada de correção NÃO reduz os achados HIGH/BLOCKER em relação à anterior, o circuito é **aberto** (AUDIT_FAILED + erro) e exige decisão humana — não gasta mais tokens em loop sem progresso.
- **Comandos** (via root): `pnpm ai:next | ai:run --phase <ID> | ai:audit --run <id> | ai:retry --phase <ID> | ai:status | ai:approve --phase <ID> | ai:dry-run`.
- **Estado do roadmap**: `docs/ai-development/implementation-roadmap.md`; prompts de fase em `docs/ai-development/smartjuris-phase-prompts.md`; runs em `docs/ai-development/runs/` (gitignored).
- **Fases concluídas**: 2A (segurança documental), 2A.1 (testes HTTP de tenancy), 2A.2 (correção da exportação), 2B (catálogo compartilhado), 2C (builder do payload real), 2D (desenho da análise documental), 2E (migration dos metadados do classificador). Próxima elegível: 3A (unidades de análise documental) e 2F (idempotência e reserva).
- **Runner de migrations** (`apps/api/src/db/migrate.ts`, Fase 2E): extraído do startup com transação única + `pg_advisory_xact_lock` (serializa concorrência), hash sha256 por migration (divergência → falha explícita), backfill de registros legados só com `ALLOW_LEGACY_BACKFILL=true`, UNIQUE em hash garantido em tabelas legadas, e suporte a schema isolado para testes. Migration **0019** adiciona metadados de classificação em `ai_operations` (classification, classification_reason, warnings, prompt_version, parent_operation_id, sub_operations) com rollback que preserva metadados em backup. Testes em `migrationClassifier.test.ts` (upgrade pré-0019, idempotência, FK, isolamento, concorrência, injeção).
- **Design da análise documental** (`docs/ai-development/design-analise-documental.md`, Fase 2D): desenho técnico do processamento em blocos de até 20 páginas — resumo/fatos estruturados por bloco, status, retry, falhas parciais, versionamento de prompt, tokens/custo, páginas já analisadas, idempotência e isolamento por escritório. Implementação na 3A; cobrança na 2F.
- **Builder do payload real** (`services/payloadBuilder.ts`, Fase 2C): monta o input do classificador derivando escritório, usuário (ativo + vínculo atual), plano, saldo com rollover, processo (isolado por tenant), documentos (quarentena `unscoped` excluída), RAG (chunks escopados) e área canônica do processo — o cliente envia apenas `pieceType`/`area`/`dadosCaso`/`processoId`/`includeJurisprudence`/`outputSize`/`idempotencyKey`; nunca créditos/custo/modelo/páginas/limites. Testes em `payloadBuilder.test.ts`.
- **Nota de permissões**: o shell de automação roda como root e cria arquivos root-owned; rode `sudo chown -R $(whoami):staff /Users/alexandrerocha/Smartjuris/` se algum comando local reclamar de permissão.

---

## Rotas da API (paths de montagem em `server.ts`)

| Router | Path | Acesso | Endpoints principais |
|---|---|---|---|
| `auth` | `/api/auth` | Público (+ `me`/`logout` autenticados) | login, registro, verificar-codigo, reenviar-codigo, trocar-senha, logout, me |
| `escritorios` | `/api/root/escritorios` | root | CRUD de escritórios, ativar/desativar, excluir permanente, info |
| `rootDocumentos` | `/api/root/documentos` | root | Upload/listagem de documentos da plataforma |
| `rootCreditos` | `/api/root` | root | GET creditos; POST creditos (escritório/usuário); POST usuário reset-password |
| `rootStats` | `/api/root` | root | stats/global, stats/financial, metricas, auditoria, logs (logins/tokens/audit) |
| `adminEscritorio` | `/api/admin/escritorio` | admin | info/letterhead, metricas, CRUD de usuários, stats, reset de senha |
| `permissoes` | `/api/admin/escritorio/permissoes` | admin | GET/PUT permissões de módulo por usuário |
| `processos` | `/api/processos` | negócio | CRUD de processos (DELETE exige admin) |
| `pecas` | `/api/pecas` | negócio | listar, gerar/salvar, PATCH status/edição, GET `/:id/export` (PDF/DOCX) |
| `clientes` | `/api/clientes` | negócio | CRUD de clientes PF/PJ (DELETE exige admin) |
| `financeiro` | `/api/financeiro` | módulo financeiro | GET/POST lancamentos, PATCH, GET/POST timesheet |
| `andamentos` | `/api/andamentos` | negócio | GET por processo; POST com resumo IA e prazo fatal |
| `documentos` | `/api/documentos` | negócio | GET lista; POST upload (multer) para indexação vetorial |
| `rag` | `/api/rag` | módulo pecas | GET modelos (playbooks); POST generate (RAG + DeepSeek streaming) |
| `jurimetria` | `/api/jurimetria` | módulo jurimetria | GET stats (êxito por área/status) |
| `jurisprudencias` | `/api/jurisprudencias` | negócio | GET courts, search, lookup |
| `agenda` | `/api/agenda` | negócio | GET eventos do mês; POST/PUT/DELETE eventos |
| `health` | `/api/health` | público | status ok + timestamp |
| `admin` | *(não montado)* | — | Legado/órfão |

Middlewares aplicados às rotas de negócio: `authMiddleware` → `refreshSession` → `rejectRoot` (bloqueia root) → `forcePasswordChange` → (opcional) `requireModule('financeiro' | 'pecas' | 'jurimetria')`.

### Exportação de peças (Fase 2A.2)

`GET /api/pecas/:id/export` — permite exportar **somente** peças com status `aprovado` ou `protocolado` (PDF/DOCX com timbre). Status `revisao`/`reprovado` (ou desconhecido) são **bloqueados** com `403` + auditoria `EXPORTACAO_BLOQUEADA` (motivo `status`). A regra é aplicada no **backend** (não só no frontend).

---

## Banco de Dados (PostgreSQL + pgvector + Drizzle ORM)

Persistência relacional e vetorial no PostgreSQL com extensão `vector`. Todas as entidades de negócio carregam tenancy `usuario_id`/`escritorio_id`. Migrations SQL aplicadas em `apps/api/src/db/migrations/` (0000–0018, executadas por `startup.ts`).

### Entidades (`apps/api/src/db/schema.ts` — 20 tabelas)

- **`processos`**: `{ id, numero, tipo, cliente, adverso, vara, area, status, valor, prazo, advogado, usuarioId, escritorioId, createdAt }`
- **`pecas`**: `{ id, processoId, tipo, area, cliente, status (revisao/aprovado/protocolado/reprovado), prazo, geradoEm, modelo, fontes, conteudo, conteudoRico (jsonb), updatedAt, updatedBy, usuarioId, escritorioId }`
- **`documentos`**: `{ id, nome, colecao, tamanho, indexado, chunks, usuarioId, escritorioId }` (tenancy da Fase 2A)
- **`chunks`**: `{ id, documentoId, colecao, texto, embedding: vector(1024), metadata }` (índice HNSW cosine)
- **`usuarios`**: `{ id, nome, email (único), senha (hash), role (admin/user/root), ativo, ultimoLogin, oab, oabUf, creditosMes, precisaTrocarSenha, emailVerificado, createdBy, escritorioId, createdAt }`
- **`escritorios`**: `{ id, nome, plano, limiteUsuarios, limitePecasMes, limiteProcessos, limiteTokensMes, isDemo, ativo, createdBy, razaoSocial, cnpj, inscricaoOab, endereco, numero, bairro, cidade, uf, cep, telefone, email, site, logoUrl, createdAt }`
- **`permissoes_usuario`**: `{ id, usuarioId, modulo, ativo }` (único por usuário+módulo)
- **`andamentos`**: `{ id, processoId, data, tipo (Intimação/Despacho/Sentença/Audiência), descricao, resumoIA, prazoFatal, usuarioId, escritorioId }`
- **`lancamentos_financeiros`**: `{ id, processoId, cliente, tipo (Fixo/Êxito/Despesa), valor, vencimento, status, usuarioId, escritorioId }`
- **`timesheet`**: `{ id, processoId, advogado, descricao, minutos, valorHora, faturado, usuarioId, escritorioId, created_at }`
- **`clientes`**: `{ id, tipo (PF/PJ), nome, cpfCnpj, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, qualificacao, dataNascimento, usuarioId, escritorioId, createdAt }`
- **`logins`**: `{ id, usuarioId, emailTentado, ipAddress, userAgent, sucesso, motivoFalha, createdAt }`
- **`token_usage`**: `{ id, usuarioId, modelo, operacao, promptTokens, completionTokens, totalTokens, custoUsd, custoBrl, horarioPico, metadata, createdAt }`
- **`documentos_gerados`**: `{ id, usuarioId, documentoId, pecaId, tipo, titulo, createdAt }`
- **`audit_log`**: `{ id, actorId, acao, alvoId, alvoEmail, detalhes (jsonb), ipAddress, createdAt }`
- **`eventos`**: `{ id, titulo, descricao, tipo (audiencia/reuniao/prazo/diligencia/outro), inicio, fim, diaInteiro, processoId, clienteId, cor, usuarioId, escritorioId, deletedAt }` (índice `escritorio_id + inicio`)
- **`codigos_verificacao`**: `{ id, email, codigo, tipo (OTP), tentativas, utilizado, expiraEm }`
- **`app_logs`**: `{ id, nivel, mensagem, contexto, createdAt }` (logs da aplicação)
- **`ai_operations`**: catálogo de operações de IA persistido (contrato derivado do shared)
- **`credit_ledger`**: ledger de créditos (reservas/consumo por operação)

---

## Serviços e Middlewares

**Serviços (`apps/api/src/services/`):**
- `ai.ts` — Cliente DeepSeek (OpenAI-compat) + geração de peças com streaming; modelos V4 via env com fallback Pro.
- `classifier.ts` — Classifica operação → modelo/créditos/limites (deriva `OPERATION_CATALOG` do shared).
- `usage.ts` — Custo de tokens (pico/fora-pico) + limites por operação + cota mensal (`checkTokenQuota`); deriva `OPERATION_LIMITS`/`PLANS` do shared.
- `documento.ts` — Indexação/escopo documental (`IndexedStatus`, validação de escritório).
- `crypto.ts` — Criptografia AES-256-GCM de campos sensíveis (`encryptField`/`decryptField`, prefixo `enc:v1:`).
- `documentExport.ts` — Exportação de peças em PDF e DOCX (`renderPdf`/`renderDocx`).
- `email.ts` — Envio transacional via Resend ou SMTP (Nodemailer): OTP, boas-vindas, notificação ao root.
- `embedding.ts` — Embeddings BGE-M3 via Ollama (timeout configurável).
- `jurisprudencias.ts` — Integração com Jurisprudências.ai Live API (`listCourts`, `searchDecisions`, `lookupDecision`).
- `letterhead.ts` — Timbre/cabeçalho do escritório (cidade, OAB) para peças exportadas.
- `modelosPeca.ts` — Playbooks de teses (`MODELOS_PECA`) por tipo/área + `buscarModelo`.
- `pii.ts` — `redactPII`: mascaramento de CPF, CNPJ, e-mail, CEP e telefone antes de envio ao LLM.
- `demoSeed.ts` — Seed de demonstração reutilizável.
- `logger.ts` — Logger estruturado.

**Testes de serviço**: `usage.test.ts`, `classifier.test.ts`, `documento.test.ts`, `catalogo.test.ts` (Fase 2B), `demoSeed.test.ts`.

**Testes de integração HTTP** (`apps/api/src/integration/`): `segurancaDocumentos.test.ts` (tenancy documental, Fase 2A), `exportacaoPecas.test.ts` (matriz de status + PDF/DOCX + tenancy, Fase 2A.2).

**Middlewares (`apps/api/src/middlewares/`):**
- `auth.ts` — `authMiddleware`: valida JWT e anexa `req.user`.
- `refreshSession.ts` — Renova sessão/JWT em cada requisição autenticada (sessão deslizante).
- `roleGuard.ts` — `requireRole(...)`, `requireRoot`, `requireAdmin`.
- `rejectRoot.ts` — Rejeita requisições de `root` nas rotas de negócio (403 "Acesso restrito ao escritório").
- `forcePasswordChange.ts` — Bloqueia rotas enquanto `precisaTrocarSenha`.
- `moduleGuard.ts` — `requireModule('modulo')`: libera rotas só se o módulo estiver ativo.
- `tenantGuard.ts` — `tenantScope`/`tenantScopeEscritorioId`: filtro SQL de escritório por role.
- `ownership.ts` — Helpers `isRoot`/`canMutateTenant`.
- `rateLimit.ts` — Limitadores em memória: global, login (15min/10), registro (5min/5) e IA (`aiRateLimiter`). Reiniciar a API zera os contadores.
- `revocation.ts` — Revogação de tokens por JTI (em memória).
- `audit.ts` — `recordAudit`: trilha de auditoria em `audit_log`.

---

## Paleta de Cores (Stance Swiss / Vignelli)

Tokens CSS definidos em `src/index.css` via `@theme` (tema claro + escuro via `data-theme="dark"`).

| Token CSS | Valor (claro) | Uso |
|---|---|---|
| `--color-background` | `#f4f3f0` | Fundo da página (off-white quente) |
| `--color-surface` | `#ffffff` | Cards, painéis, tabelas |
| `--color-surface-2` | `#eeede9` | Cabeçalhos de tabela, fundos secundários |
| `--color-border` | `#d8d6d0` | Bordas de cards, linhas divisórias, inputs |
| `--color-foreground` | `#18170f` | Texto principal (quase-preto quente) |
| `--color-muted` | `#7a7870` | Labels, legendas, texto secundário |
| `--color-primary` | `#1a2744` | Cor primária — navy escuro |
| `--color-primary-hover` | `#243560` | Hover do primary |
| `--color-on-primary` | `#ffffff` | Texto sobre primary |
| `--color-accent` | `#c8a84b` | Âmbar — destaque, logo, badges |
| `--color-on-accent` | `#18170f` | Texto sobre accent |
| `--color-accent-light` | `#f5edd6` | Fundo âmbar claro |
| `--color-success` | `#2d6a4f` | Verde — aprovado, positivo |
| `--color-success-light` | `#d8ede4` | Fundo verde claro |
| `--color-warning` | `#92400e` | Âmbar escuro — prazos urgentes, reset |
| `--color-warning-light` | `#fef3c7` | Fundo âmbar claro de alerta |
| `--color-danger` | `#7f1d1d` | Vermelho — reprovado, erros, risco alto |
| `--color-danger-light` | `#fee2e2` | Fundo vermelho claro |
| `--color-sidebar` | `#18170f` | Fundo da sidebar |
| `--color-badge-tint` | `#e8eaf0` | Badges/informação secundária |

Regras de UI: máx. 2 colunas em formulários (1 no mobile); mobile-first adaptável; touch targets ≥ 44px; zero cores hardcoded fora de `index.css` (validado por `verify:ui`).

---

## Variáveis de Ambiente (backup em `.env.example`)

**Backend (`process.env.*`):** `PORT`, `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `DATA_ENCRYPTION_KEY`, `DEEP_SEEK_API`, `DEEPSEEK_MODEL` (default `deepseek-v4-flash`), `DEEPSEEK_MODEL_PRO` (default `deepseek-v4-pro`), `DEEPSEEK_INPUT_COST_PEAK`/`OFFPEAK` (0.44/0.22), `DEEPSEEK_OUTPUT_COST_PEAK`/`OFFPEAK` (1.32/0.66), `USD_BRL_RATE`, `OLLAMA_URL`, `EMBEDDING_TIMEOUT_MS`, `JURISPRUDENCIAS_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SERVICE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS`, `SMTP_SOCKET_TIMEOUT_MS`, `ROOT_NOTIFICATION_EMAIL`, `ROOT_EMAIL`, `ROOT_PASSWORD`, `ROOT_AUTH_EMAIL`, `ROOT_AUTH_PASSWORD`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`, `REQUIRE_EMAIL_OTP` (default `false`), `ANTHROPIC_API_KEY`.

**Web (`import.meta.env.*`):** `VITE_API_URL` (URL base da API).

> **Nota OTP**: se `REQUIRE_EMAIL_OTP=true`, cadastros novos exigem código de e-mail (usuário nasce `emailVerificado=false`); o login direto continua funcionando.

---

## Scripts

```bash
# Raiz
pnpm dev                         # Ambiente de desenvolvimento (api + web)
pnpm build                       # Build topológico (shared → api → web)
pnpm format                      # Formatação (api + web)

# Orquestrador
pnpm ai:status                   # Tabela do roadmap de fases
pnpm ai:next                     # Executa a próxima fase elegível
pnpm ai:run --phase <ID>         # Executa uma fase específica
pnpm ai:retry --phase <ID>       # Reexecuta fase em CORRECTION_PENDING/AUDIT_FAILED
pnpm ai:audit --run <run-id>     # Reexecuta só a auditoria de um run
pnpm ai:approve --phase <ID>     # Aprovação manual (humano)

# API (apps/api)
pnpm --filter @lexia/api dev     # tsx watch src/startup.ts (predev → shared build)
pnpm --filter @lexia/api build   # tsc (prebuild → shared build)
pnpm --filter @lexia/api start   # node dist/startup.js
pnpm --filter @lexia/api test    # 130 testes (services + integração + catálogo)
pnpm --filter @lexia/api db:push # drizzle-kit push
pnpm --filter @lexia/api db:seed # seed de demonstração
pnpm --filter @lexia/api db:seed:test  # seed QA multi-tenant

# Web (apps/web)
pnpm --filter @lexia/web dev     # vite --host 0.0.0.0 --port 5173
pnpm --filter @lexia/web build   # vite build (prebuild → shared build)
pnpm --filter @lexia/web preview # vite preview
pnpm --filter @lexia/web format  # oxfmt
pnpm --filter @lexia/web verify:ui  # valida zero cores hardcoded

# Shared (packages/shared)
pnpm --filter @lexia/shared build # tsc → dist/ (fonte única de planos/operações)
```

> **Importante**: `packages/shared` compila para `dist/` (main/types apontam para `dist/`). Os consumidores (api/web) têm hooks `predev`/`prebuild`/`pretest` que rodam `pnpm --filter @lexia/shared build` antes, garantindo build reproduzível em checkout limpo. O root `pnpm build` já usa `pnpm -r run build` (ordem topológica).

---

## Deploy (Railway)

- **Integração GitHub**: push para `main` dispara deploy automático dos serviços `smartjuris-web` e `smartjuris-api` (Railway, builder NIXPACKS; `railway.json`).
- **URLs de produção**: `https://smartjuris-web-production.up.railway.app` e `https://smartjuris-api-production.up.railway.app`.
- **CLI**: `railway up -s smartjuris-web|smartjuris-api` (com `-y`/`-d` para não-interativo); `railway status` e `railway deployment list --service <serviço>`.
- **Backend**: Docker multi-stage (node:22-alpine); `startup.ts` executa auto-migrations SQL e seed de admin/root/escritórios demo.
- **Frontend**: build Vite + `serve` estático (porta via `$PORT`).
- **Observação**: `.env*` está no `.gitignore`; variáveis de ambiente são configuradas no painel do Railway.

---

## Configuração de Domínio, DNS e E-mail (Registro.br + Railway + Resend)

> Material didático — fluxo completo de infraestrutura do SmartJuris: domínio `.com.br`, DNS, hospedagem no Railway e e-mail transacional via Resend.

### Visão geral (arquitetura de rede)

```
┌──────────────────────────────┐      ┌──────────────────────────────────┐
│  www.smartjuris.com.br       │      │  smartjuris-api-production.      │
│  (smartjuris-web no Railway) │ ───► │  up.railway.app (smartjuris-api) │
│  SPA + proxy nginx /api      │      │  Express + Postgres (pgvector)   │
└──────────────────────────────┘      └──────────────┬───────────────────┘
                                                     │
                              ┌──────────────────────▼──────────────────────┐
                              │  Resend (e-mail transacional)              │
                              │  Remetente verificado: suporte@smartjuris. │
                              │  com.br (domínio verificado + DKIM/DMARC)  │
                              └────────────────────────────────────────────┘
```

- **Web** e **API** são serviços **separados** no Railway, mas a API é acessada **pela mesma origem** via proxy nginx (`/api` → API) — isso garante cookie `first-party` (evita logout por bloqueio de cookies de terceiros).
- **E-mail** transacional (código OTP, boas-vindas, notificações) vai via **Resend**, com domínio verificado.

### 1) Registro.br — registro e DNS do domínio `.com.br`

**NS padrão:** `a.sec.dns.br` e `b.sec.dns.br` (o DNS do `.br` é gerenciado pelo Registro.br).

**Onde mexer:** https://registro.br → login → **Domínios** → `smartjuris.com.br` → **Zona DNS**.

**Tipos de registro** (o campo "Nome" recebe o host **completo**, ex.: `www.smartjuris.com.br`):

| Tipo | Nome (exemplo) | Dados | Uso |
|---|---|---|---|
| A | `smartjuris.com.br` | IP do servidor | Aponta o domínio raiz |
| CNAME | `www.smartjuris.com.br` | `0nem6tj4.up.railway.app` | Alias p/ o serviço web |
| TXT | `_railway-verify.www.smartjuris.com.br` | `railway-verify=...` | Valida posse do domínio no Railway |
| TXT | `resend._domainkey.smartjuris.com.br` | `p=MIGf...` | DKIM do Resend |
| TXT | `_dmarc.smartjuris.com.br` | `"v=DMARC1; p=none;"` | DMARC |
| MX | `send.smartjuris.com.br` | `10 feedback-smtp...amazonses.com` | MX p/ envio |

**Regra de ouro (conflito CNAME):** um **CNAME não pode coexistir com outros registros no mesmo nome** (RFC). Por isso os TXT de verificação usam `_railway-verify.<sub>` (nome diferente), evitando o conflito.

**Verificação / propagação:**
```bash
dig @a.sec.dns.br www.smartjuris.com.br CNAME +short   # consulta direto no autoritativo
dig api.smartjuris.com.br CNAME +short
```
A propagação no Registro.br costuma ser rápida (minutos); global pode levar até 72h.

### 2) Railway — hospedagem e domínios

**Serviços:** `smartjuris-web` (frontend estático/nginx) e `smartjuris-api` (Express).

**Deploy:** push para `main` dispara deploy automático (integração GitHub). CLI úteis: `railway up -s <serviço>`, `railway status`, `railway deployment list -s <serviço>`, `railway logs -s <serviço>`.

**Custom domain:**
- Painel: serviço → **Settings → Networking → Domains** → adicionar (ex.: `www.smartjuris.com.br`).
- CLI: `railway domain api.smartjuris.com.br -s smartjuris-api` → retorna os **registros DNS** (CNAME + TXT `_railway-verify`) para criar no Registro.br. Remover: `railway domain delete <domínio> -s <serviço> --yes`.

**Variáveis de ambiente:**
```bash
railway variable set KEY=value -s smartjuris-api                  # seta e dispara redeploy
railway variable set KEY=value -s smartjuris-api --skip-deploys   # só seta (sem redeploy)
railway variable list -s smartjuris-api
```
> Alterar variável exige **redeploy** para o processo reler o env. Dica: use `--skip-deploys` ao setar várias e faça um único redeploy no final.

**Cookie cross-site e proxy nginx (caso real deste projeto):**
- Problema: web em domínio próprio + API em `*.railway.app` = **sites diferentes** → cookie de terceiros → bloqueado pelo navegador → **401/logout**.
- `NODE_ENV=production` é necessário para o cookie sair `Secure; SameSite=None` (mas **não** resolve o bloqueio de cookies de terceiros no navegador).
- **Solução aplicada:** o `smartjuris-web` usa **nginx** que serve o SPA **e** faz proxy de `/api` para a API (mesma origem → cookie first-party). Arquivos: `apps/web/Dockerfile`, `apps/web/nginx.conf`, e `getApiBaseUrl()` retorna base **relativa** em produção (`apps/web/src/api/config.ts`).
- Detalhe: a rede privada do Railway (`smartjuris-api.railway.internal`) **não roteou** neste projeto — o `proxy_pass` usa a **URL pública** da API (`https://smartjuris-api-production.up.railway.app`).

### 3) Resend — e-mail transacional

**Chaves/remetente (env da API):**
- `RESEND_API_KEY` — chave de API (ex.: `re_...`).
- `RESEND_FROM_EMAIL` — remetente verificado (ex.: `SmartJuris <suporte@smartjuris.com.br>`). **Não usar** `EMAIL_FROM`/Gmail no Resend: domínio não verificado → erro `domain not verified`.

**Verificação de domínio no Resend:** painel Resend → **Domains** → adicionar `smartjuris.com.br` → o Resend lista os **registros DNS** (principalmente **DKIM** `resend._domainkey`) → criar no Registro.br → aguardar status **Verified**.

**DNS de e-mail típico:** DKIM (TXT `resend._domainkey`), DMARC (TXT `_dmarc`), SPF (TXT `v=spf1 ...` no host de envio).

**Serviço `services/email.ts`:** Resend como transporte **primário**; fallback **SMTP** (Nodemailer/Gmail) se o Resend falhar. Logs: `[Email-Resend] E-mail enviado com sucesso: ID=...` / `[Email-SMTP] ...`.

**Como testar:** cadastrar um usuário (código OTP de 6 dígitos, válido por 1 minuto) → conferir no log `[Email-Resend] E-mail enviado com sucesso` e no painel Resend → **Logs** (status de entrega). O código de confirmação fica na tabela `codigos_verificacao`.

### 4) Checklist (ordem para reproduzir em aula)

1. **Registro.br**: domínio registrado; NS padrão (`a.sec.dns.br` / `b.sec.dns.br`); Zona DNS ativa.
2. **Railway**: serviços web/api; custom domains; `NODE_ENV=production`; variáveis de ambiente configuradas.
3. **Resend**: domínio verificado (DKIM etc.); `RESEND_API_KEY` + `RESEND_FROM_EMAIL` no env da API.
4. **Web com proxy nginx** (same-origin) para sessão estável (cookie first-party).
5. **Testes**: cadastro → OTP → e-mail chega; login persiste (sem logout); `dig` confirma os registros DNS.

---

## Credenciais de Desenvolvimento (seed local)

- **Root**: `root@smartjuris.com` (senha em `ROOT_PASSWORD`; se ausente, o seed gera senha temporária no console do startup).
- **Admin demo**: `admin@smartjuris.com` / `SEED_ADMIN_PASSWORD` (default `admin123`).
- **User demo**: `user@smartjuris.com` / `SEED_USER_PASSWORD` (default `user123`).
- **QA multi-tenant** (`db:seed:test`): `admin.qa@teste.com`, `adv1.qa@teste.com`, `adv2.qa@teste.com` (escritório "Silva & Associados") e `admin.beta@teste.com`, `adv.beta@teste.com` (escritório "Teste Beta").
- **Acesso por role**: root → Painel de Operações (`/api/root/*`); admin/user → módulos do escritório (root é bloqueado nas rotas de negócio).
