# SmartJuris (LexOS Edition) — Sistema Jurídico com IA

React + Vite + Tailwind CSS v4 + Express + Drizzle ORM + PostgreSQL (pgvector).

## Diretrizes Obrigatórias para Agentes de IA

> [!IMPORTANT]
> **Leitura Prévia de Skills**: Antes de iniciar o planejamento ou a implementação de qualquer tarefa ou funcionalidade no sistema, o agente de IA **DEVE SEMPRE** verificar e ler atentamente as instruções das **skills do sistema** disponíveis (`view_file` nas skills relevantes em `.gemini/antigravity-ide/builtin/skills/` ou `.agents/skills/`) para garantir conformidade rigorosa com os fluxos, arquitetura e convenções estabelecidas.

---

## Development Server

O servidor Vite e o backend Express rodam no monorepo via `pnpm`:

- Frontend Web: `http://localhost:5173` ou container `serve` no Railway
- Backend API: `http://localhost:3001` ou container Express no Railway
- Hot reload: alterações em arquivos fonte são refletidas imediatamente
- Banco local via `docker-compose.yml`: PostgreSQL pgvector:16 (porta 5433), Ollama (11434) e Redis (6379)

---

## Visão Geral do Produto

**SmartJuris (LexOS Edition)** é uma plataforma SaaS de gestão jurídica inteligente, multi-tenant, com IA nativa. Unifica contencioso, consultivo, financeiro, relacionamento com clientes e operação da plataforma em um único sistema, com:

- **Gestão de processos** com Matter Dashboard, linha do tempo e resumo de intimações por IA (BGE-M3 + DeepSeek V4).
- **Geração de peças** com RAG vetorial (pgvector + BGE-M3 via Ollama) e DeepSeek V4 (Flash padrão, fallback Pro), com **fila de validação humana auditável** (crivo ético OAB) e exportação PDF/DOCX.
- **Jurimetria preditiva**, **financeiro & timesheet faturável**, **scanner de revisão contratual**, **CRM/funil** e **base de conhecimento vetorial**.
- **Cadastro self-service** de advogado + escritório (aprovado pelo root) e **consulta de jurisprudência ao vivo** em tribunais.
- **Multi-tenancy** por escritório (roles `root`/`admin`/`user`), sessão deslizante, auditoria completa, créditos/tokens mensais e LGPD.

### Módulos do Sistema

| Módulo | Rota (estado) | Arquivo | Descrição |
|---|---|---|---|
| Dashboard | `dashboard` | `src/components/Dashboard.tsx` | KPIs gerais, peças recentes, prazos críticos e status do motor RAG |
| Agenda | `agenda` | `src/components/Agenda.tsx` | Calendário de eventos (audiências, reuniões, prazos) com CRUD e vínculo a processos/clientes |
| Processos | `processos` | `src/components/Processos.tsx` | Gestão de processos com Matter Dashboard, linha do tempo e resumo de intimações por IA |
| Clientes | `clientes` | `src/components/Clientes.tsx` | CRUD de clientes PF/PJ com máscaras de CPF/CNPJ e busca de CEP (ViaCEP) |
| Gerar Peças | `pecas` | `src/components/GeradorPecas.tsx` | Fluxo em 4 etapas: tipo → dados do caso → RAG BGE-M3 + DeepSeek (streaming) → revisão/exportação |
| Validação | `validacao` | `src/components/Validacao.tsx` | Fila de revisão humana com crivo ético OAB, edição, exportar PDF/DOCX e metadados de custo |
| Jurimetria | `jurimetria` | `src/components/Jurimetria.tsx` | Analytics de taxa de êxito por área e Calculadora Preditiva de Risco interativa |
| Decisões & Tribunais | `decisoes` | `src/components/Decisoes.tsx` | Consulta ao vivo de jurisprudência (busca e lookup) via Jurisprudências.ai Live API |
| Financeiro | `financeiro` | `src/components/Financeiro.tsx` | Honorários fixos/êxito/despesas + Cronômetro de Timesheet faturável (billable hours) |
| Revisão Contratual | `contratos` | `src/components/Contratos.tsx` | Scanner autônomo de minutas: detecção de riscos e sugestões de redação |
| CRM & Funil | `crm` | `src/components/Crm.tsx` | Pipeline Kanban em 4 fases (Lead → Diagnóstico → Proposta → Contrato) com alerta de conflito |
| Base RAG | `base` | `src/components/Base.tsx` | Gerenciamento de coleções vetoriais indexadas e busca semântica em julgados |
| Documentação | `documentacao` | `src/components/Documentacao.tsx` | Central de ajuda, manual em 3 passos, arquitetura em camadas, LGPD e FAQ |
| Administração | `admin` | `src/components/AdminEscritorio.tsx` | Painel do admin do escritório: identidade/timbre, métricas, usuários, permissões, reset de senha |
| Operações (Root) | `admin` (role root) | `src/components/RootPainel.tsx` | Painel da plataforma: CRUD de escritórios, créditos, métricas globais, auditoria e logs |
| Landing (pública) | — | `src/components/LandingPage.tsx` | Marketing, login e cadastro self-service de advogado + escritório (com LGPD) |

---

## Autenticação, Roles e Multi-tenancy

- **Auth** (`routes/auth.ts`, público): `POST /login`, `POST /registro` (self-service), `POST /verificar-codigo` / `POST /reenviar-codigo` (OTP opcional), `POST /trocar-senha`, `POST /logout`, `GET /me`.
- **Cadastro self-service**: cria escritório `ativo=false` (pendente de aprovação pelo root), `isDemo=true`, `limiteTokensMes=10000`, e o advogado como `admin` (`precisaTrocarSenha=false`). O root ativa via `PATCH /api/root/escritorios/:id { ativo: true }`.
- **Roles**: `root` (operações da plataforma), `admin` (gestão do escritório, vê todos os módulos), `user` (advogado, com permissões granulares por módulo via `permissoes_usuario`).
- **Sessão**: JWT httpOnly (cookie `smartjuris_token`), sessão deslizante (`refreshSession` renova em cada requisição), tela de sessão expirada, troca de senha forçada (`forcePasswordChange`) e revogação por JTI em memória.
- **Tenancy**: `tenantScope` filtra por `escritorio_id` (admin = escritório; user = escritório + autoria; root é bloqueado nas rotas de negócio via `rejectRoot`).
- **Auditoria**: `recordAudit` grava em `audit_log` (quem, quando, o quê, IP) para ações sensíveis (login, peças, escritórios, reset de senha, créditos, etc.).

## IA e Geração de Conteúdo

- **Modelos** (`services/ai.ts`): cliente DeepSeek (OpenAI-compat, `https://api.deepseek.com/v1`) com `deepseekModel` (default `deepseek-v4-flash`) e `deepseekModelPro` (default `deepseek-v4-pro`) via env; **fallback automático Flash → Pro** na criação da chamada.
- **RAG** (`routes/rag.ts`): busca vetorial/cosene em `chunks` (embedding BGE-M3 `vector(1024)`) + playbooks de teses (`services/modelosPeca.ts`) + geração com streaming SSE (sem markdown, temperatura 0.3).
- **Resumos de intimações** (`routes/andamentos.ts`): resumo em 2 frases com ação recomendada e prazo fatal, com redação de PII antes do envio (`services/pii.ts`).
- **Embeddings**: `services/embedding.ts` gera BGE-M3 via Ollama (com timeout configurável).
- **Jurisprudência**: `services/jurisprudencias.ts` integra a Jurisprudências.ai Live API (`/courts`, `/search`, `/lookup`).
- **Custo**: `services/usage.ts` rastreia tokens (pico/fora-pico) e aplica cota mensal por usuário/escritório (`checkTokenQuota`).
- **E-mail**: `services/email.ts` envia código OTP, boas-vindas e notificações ao root via Resend ou SMTP (Nodemailer).

---

## Estrutura do Monorepo

```
/
├── apps/
│   ├── api/                    # Backend Node.js / Express (ESM, NodeNext)
│   │   ├── src/
│   │   │   ├── server.ts       # Servidor Express & montagem das rotas/middlewares
│   │   │   ├── startup.ts      # Startup: auto-migrations SQL e seed automático
│   │   │   ├── config.ts       # Carrega .env (dotenv)
│   │   │   ├── db/             # client.ts, schema.ts, seed.ts, test-seed.ts, migrations/ (0000..0014), drizzle.config.ts
│   │   │   ├── routes/         # auth, escritorios, rootCreditos, rootStats, adminEscritorio, permissoes,
│   │   │   │                   # processos, pecas, clientes, financeiro, andamentos, documentos, rag,
│   │   │   │                   # jurimetria, jurisprudencias, agenda (+ admin.ts legado não montado)
│   │   │   ├── middlewares/    # auth, refreshSession, roleGuard, rejectRoot, forcePasswordChange,
│   │   │   │                   # moduleGuard, tenantGuard, ownership, rateLimit, revocation, audit
│   │   │   ├── services/       # ai (DeepSeek), embedding (BGE-M3), email, crypto, pii, usage,
│   │   │   │                   # modelosPeca, jurisprudencias, letterhead, documentExport
│   │   │   └── validation/     # schemas.ts (Zod centralizado)
│   │   ├── Dockerfile          # Multi-stage (node:22-alpine): build tsc + runtime dist/startup.js
│   │   └── tsconfig.json       # NodeNext ESM moduleResolution
│   │
│   └── web/                    # Frontend React 19 + Vite 8
│       ├── src/
│       │   ├── App.tsx         # Shell da aplicação: sidebar + roteamento + sessão/troca de senha
│       │   ├── components/     # Todas as telas (ver tabela de Módulos) + EditorRico, Toast, Pagination
│       │   ├── api/            # client.ts (authFetch, api.*) e config.ts (getApiBaseUrl)
│       │   ├── ui/             # Primitivos: Button, Modal, Table, Field, PageHeader, PageContainer,
│       │   │                   # EmptyState, Loading, inputStyle, tokens (FONT/SPACE/RADIUS/Z)
│       │   ├── hooks/          # useBreakpoint (mobile/tablet/desktop), useIsMobile, useTheme
│       │   ├── utils/          # masks.ts (CPF/CNPJ/telefone/etc.)
│       │   └── imports/        # arquitetura_sistema_juridico_IA.md (usada na Documentação)
│       └── Dockerfile          # Multi-stage: build Vite + runtime serve estático
│
├── packages/shared/            # Pacote workspace compartilhado (@lexia/shared)
├── package.json                # Workspace root pnpm
├── pnpm-workspace.yaml         # Configuração de workspaces pnpm
├── railway.json                # Configuração do Railway (builder NIXPACKS)
└── docker-compose.yml          # Postgres pgvector:16, Ollama e Redis (ambiente local)
```

---

## Rotas da API (paths de montagem em `server.ts`)

| Router | Path | Acesso | Endpoints principais |
|---|---|---|---|
| `auth` | `/api/auth` | Público (+ `me`/`logout` autenticados) | login, registro, verificar-codigo, reenviar-codigo, trocar-senha, logout, me |
| `escritorios` | `/api/root/escritorios` | root | CRUD de escritórios, ativar/desativar, excluir permanente, info |
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
| `admin` | *(não montado)* | — | Legado/órfão |

Middlewares aplicados às rotas de negócio: `authMiddleware` → `refreshSession` → `rejectRoot` (bloqueia root) → `forcePasswordChange` → (opcional) `requireModule('financeiro' | 'pecas' | 'jurimetria')`.

---

## Banco de Dados (PostgreSQL + pgvector + Drizzle ORM)

Persistência relacional e vetorial no PostgreSQL com extensão `vector`. Todas as entidades de negócio carregam tenancy `usuario_id`/`escritorio_id`.

### Entidades (`apps/api/src/db/schema.ts` — 17 tabelas)

- **`processos`**: `{ id, tipo, cliente, adverso, vara, area, status, valor, prazo, advogado, usuarioId, escritorioId, createdAt }`
- **`pecas`**: `{ id, processoId, tipo, area, cliente, status (revisao/aprovado/protocolado/reprovado), prazo, geradoEm, modelo, fontes, conteudo, conteudoRico (jsonb), updatedAt, updatedBy, usuarioId, escritorioId }`
- **`documentos`**: `{ id, nome, colecao, tamanho, indexado, chunks }`
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
- **`eventos`**: `{ id, titulo, descricao, tipo (audiencia/reuniao/prazo/diligencia/outro), inicio, fim, diaInteiro, processoId, clienteId, cor, usuarioId, escritorioId, deletedAt (soft delete) }` (índice `escritorio_id + inicio`)
- **`codigos_verificacao`**: `{ id, email, codigo, tipo (OTP), tentativas, utilizado, expiraEm }`

---

## Serviços e Middlewares

**Serviços (`apps/api/src/services/`):**
- `ai.ts` — Cliente DeepSeek (OpenAI-compat) + geração de peças com streaming; modelos V4 via env com fallback Pro.
- `crypto.ts` — Criptografia AES-256-GCM de campos sensíveis (`encryptField`/`decryptField`, prefixo `enc:v1:`).
- `documentExport.ts` — Exportação de peças em PDF e DOCX (`renderPdf`/`renderDocx`).
- `email.ts` — Envio transacional via Resend ou SMTP (Nodemailer): OTP, boas-vindas, notificação ao root.
- `embedding.ts` — Embeddings BGE-M3 via Ollama (timeout configurável).
- `jurisprudencias.ts` — Integração com Jurisprudências.ai Live API (`listCourts`, `searchDecisions`, `lookupDecision`).
- `letterhead.ts` — Timbre/cabeçalho do escritório (cidade, OAB) para peças exportadas.
- `modelosPeca.ts` — Playbooks de teses (`MODELOS_PECA`) por tipo/área + `buscarModelo`.
- `pii.ts` — `redactPII`: mascaramento de CPF, CNPJ, e-mail, CEP e telefone antes de envio ao LLM.
- `usage.ts` — Rastreio de custo de tokens (pico/fora-pico) + cota mensal (`checkTokenQuota`).

**Middlewares (`apps/api/src/middlewares/`):**
- `auth.ts` — `authMiddleware`: valida JWT e anexa `req.user`.
- `refreshSession.ts` — Renova sessão/JWT em cada requisição autenticada (sessão deslizante).
- `roleGuard.ts` — `requireRole(...)`, `requireRoot`, `requireAdmin`.
- `rejectRoot.ts` — Rejeita requisições de usuários `root` nas rotas de negócio.
- `forcePasswordChange.ts` — Bloqueia rotas enquanto `precisaTrocarSenha`.
- `moduleGuard.ts` — `requireModule('modulo')`: libera rotas só se o módulo estiver ativo.
- `tenantGuard.ts` — `tenantScope`/`tenantScopeEscritorioId`: filtro SQL de escritório por role.
- `ownership.ts` — Helpers `isRoot`/`canMutateTenant`.
- `rateLimit.ts` — Limitadores: global, login, registro e IA (`aiRateLimiter`).
- `revocation.ts` — Revogação de tokens por JTI (em memória).
- `audit.ts` — `recordAudit`: trilha de auditoria em `audit_log`.

---

## Paleta de Cores (Stance Swiss / Vignelli)

Tokens CSS definidos em `src/index.css` via `@theme` (tema claro + tema escuro via `data-theme="dark"`).

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

**Backend (`process.env.*`):** `PORT`, `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `DATA_ENCRYPTION_KEY`, `DEEP_SEEK_API`, `DEEPSEEK_MODEL` (default `deepseek-v4-flash`), `DEEPSEEK_MODEL_PRO` (default `deepseek-v4-pro`), `DEEPSEEK_INPUT_COST_PEAK`/`OFFPEAK` (0.44/0.22), `DEEPSEEK_OUTPUT_COST_PEAK`/`OFFPEAK` (1.32/0.66), `USD_BRL_RATE`, `OLLAMA_URL`, `EMBEDDING_TIMEOUT_MS`, `JURISPRUDENCIAS_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SERVICE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS`, `SMTP_SOCKET_TIMEOUT_MS`, `ROOT_NOTIFICATION_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`, `ROOT_EMAIL`, `ROOT_PASSWORD`, `ROOT_AUTH_EMAIL`, `ROOT_AUTH_PASSWORD`, `REQUIRE_EMAIL_OTP` (default `false`).

**Web (`import.meta.env.*`):** `VITE_API_URL` (URL base da API).

---

## Scripts

```bash
# Raiz
pnpm dev                         # Ambiente de desenvolvimento (api + web)
pnpm build                       # Build de api + web
pnpm format                      # Formatação (api + web)

# API (apps/api)
pnpm --filter @lexia/api dev     # tsx watch src/server.ts
pnpm --filter @lexia/api build   # tsc (compilação TypeScript)
pnpm --filter @lexia/api start   # node dist/server.js
pnpm --filter @lexia/api db:push # drizzle-kit push
pnpm --filter @lexia/api db:migrate   # drizzle-kit generate && migrate
pnpm --filter @lexia/api db:seed # seed de demonstração
pnpm --filter @lexia/api db:seed:test  # seed QA multi-tenant

# Web (apps/web)
pnpm --filter @lexia/web dev     # vite --host 0.0.0.0 --port 5173
pnpm --filter @lexia/web build   # vite build
pnpm --filter @lexia/web preview # vite preview
pnpm --filter @lexia/web format  # oxfmt
pnpm --filter @lexia/web verify:ui  # valida zero cores hardcoded
```

---

## Deploy (Railway)

- **Integração GitHub**: push para `main` dispara deploy automático dos serviços `smartjuris-web` e `smartjuris-api` (Railway, builder NIXPACKS; `railway.json`).
- **URLs de produção**: `https://smartjuris-web-production.up.railway.app` e `https://smartjuris-api-production.up.railway.app`.
- **CLI**: `railway up -s smartjuris-web|smartjuris-api` (com `-y`/`-d` para não-interativo); verificar status com `railway status` e `railway deployment list --service <serviço>`.
- **Backend**: Docker multi-stage (node:22-alpine); `startup.ts` executa auto-migrations SQL e seed de admin/root/escritórios demo.
- **Frontend**: build Vite + `serve` estático (porta via `$PORT`).
- **Observação**: `.env*` está no `.gitignore`; variáveis de ambiente são configuradas no painel do Railway.
