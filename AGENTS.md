# SmartJuris (LexOS Edition) — Sistema Jurídico com IA

React + Vite + Tailwind CSS v4 + Express + Drizzle ORM + PostgreSQL (pgvector).

## Development Server

O servidor Vite e o backend Express rodam no monorepo via `pnpm`:

- Frontend Web: `http://localhost:5173` ou container `serve` no Railway
- Backend API: `http://localhost:3001` ou container Express no Railway
- Hot reload: alterações em arquivos fonte são refletidas imediatamente

---

## Visão Geral do Produto

**SmartJuris (LexOS Edition)** é uma plataforma SaaS de gestão jurídica inteligente. Combina gestão de processos, linha do tempo com resumo de intimações por IA (Matter Dashboard), geração de peças com RAG + DeepSeek (BGE-M3), fila de validação humana auditável, jurimetria preditiva interativa, financeiro & timesheet faturável, scanner de revisão contratual autônomo e CRM de clientes.

### Módulos do Sistema

| Módulo | Rota (estado) | Arquivo | Descrição |
|---|---|---|---|
| Dashboard | `dashboard` | `src/components/Dashboard.tsx` | KPIs gerais, peças recentes, prazos críticos e status do motor RAG |
| Processos | `processos` | `src/components/Processos.tsx` | Gestão de processos com Matter Dashboard, linha do tempo e resumo de intimações por IA |
| Gerar Peças | `pecas` | `src/components/GeradorPecas.tsx` | Fluxo em 4 etapas: seletor de processo vinculado → playbooks de teses em 1 clique → RAG BGE-M3 + DeepSeek → revisão |
| Validação | `validacao` | `src/components/Validacao.tsx` | Fila de revisão humana com crivo ético OAB, aprovação/reprovação e metadados de custo |
| Jurimetria | `jurimetria` | `src/components/Jurimetria.tsx` | Analytics de taxa de êxito, distribuição por área e Calculadora Preditiva de Risco interativa |
| Financeiro | `financeiro` | `src/components/Financeiro.tsx` | Controle de honorários fixos e de êxito (ad exitum) + Cronômetro de Timesheet faturável (billable hours) |
| Contratos | `contratos` | `src/components/Contratos.tsx` | Scanner autônomo de minutas contratuais para detecção de riscos e sugestão de redações do playbook |
| CRM & Funil | `crm` | `src/components/Crm.tsx` | Pipeline Kanban de atração e conversão de clientes em 4 fases (Lead → Diagnóstico → Proposta → Contrato) |
| Base RAG | `base` | `src/components/Base.tsx` | Gerenciamento de coleções vetoriais indexadas e busca semântica em julgados |
| Documentação | `documentacao` | `src/components/Documentacao.tsx` | Central de ajuda, manual de operação em 3 passos, arquitetura em 4 camadas, diretrizes LGPD e FAQ |

---

## Estrutura do Monorepo

```
/
├── apps/
│   ├── api/                    # Backend Node.js / Express
│   │   ├── src/
│   │   │   ├── server.ts       # Servidor Express & rotas
│   │   │   ├── startup.ts      # Startup script: auto-migrations SQL e seed automático
│   │   │   ├── db/             # Drizzle client, schema.ts, seed.ts, migrations/
│   │   │   ├── routes/         # auth, processos, pecas, documentos, rag, jurimetria, financeiro, andamentos
│   │   │   └── services/       # ai.ts (DeepSeek), embedding.ts (BGE-M3)
│   │   ├── Dockerfile          # Multi-stage Docker build da API
│   │   └── tsconfig.json       # NodeNext ESM moduleResolution
│   │
│   └── web/                    # Frontend React 19 + Vite 8
│       ├── src/
│       │   ├── App.tsx         # Shell da aplicação: sidebar + roteamento
│       │   ├── components/     # Dashboard, Processos, GeradorPecas, Validacao, Jurimetria, Financeiro, Contratos, Crm, Base, Documentacao, LandingPage
│       │   └── api/            # client.ts (authFetch) e config.ts (getApiBaseUrl)
│       └── Dockerfile          # Multi-stage Docker build do Web frontend (serve)
│
├── package.json                # Workspace root pnpm
├── pnpm-workspace.yaml         # Configuração de workspaces pnpm
└── railway.json                # Configuração do Railway CLI
```

---

## Banco de Dados (PostgreSQL + pgvector + Drizzle ORM)

Persistência relacional e vetorial no PostgreSQL com extensão `vector`.

### Entidades Principais (`apps/api/src/db/schema.ts`)

- **`processos`**: `{ id, tipo, cliente, adverso, vara, area, status, valor, prazo, advogado, createdAt }`
- **`pecas`**: `{ id, processoId, tipo, area, cliente, status, prazo, geradoEm, modelo, fontes, conteudo }`
- **`documentos`**: `{ id, nome, colecao, tamanho, indexado, chunks }`
- **`chunks`**: `{ id, documentoId, colecao, texto, embedding: vector(1024), metadata }`
- **`usuarios`**: `{ id, nome, email, senha, role, createdAt }`
- **`andamentos`**: `{ id, processoId, data, tipo, descricao, resumoIA, prazoFatal }`
- **`lancamentos_financeiros`**: `{ id, processoId, cliente, tipo, valor, vencimento, status }`
- **`timesheet`**: `{ id, processoId, advogado, descricao, minutos, valorHora, faturado, created_at }`

---

## Paleta de Cores (Stance Swiss / Vignelli)

Tokens CSS definidos em `src/index.css` via `@theme`.

| Token CSS | Valor | Uso |
|---|---|---|
| `--color-background` | `#f4f3f0` | Fundo da página (off-white quente) |
| `--color-surface` | `#ffffff` | Cards, painéis, tabelas |
| `--color-surface-2` | `#eeede9` | Linhas de cabeçalho de tabela, fundos secundários |
| `--color-border` | `#d8d6d0` | Bordas de cards, linhas divisórias, inputs |
| `--color-foreground` | `#18170f` | Texto principal (quase-preto quente) |
| `--color-muted` | `#7a7870` | Labels, legendas, texto secundário |
| `--color-primary` | `#1a2744` | Cor primária — navy escuro |
| `--color-primary-hover` | `#243560` | Hover do primary |
| `--color-accent` | `#c8a84b` | Âmbar — destaque, logo, badges |
| `--color-success` | `#2d6a4f` | Verde — status aprovado, positivo |
| `--color-warning` | `#92400e` | Âmbar escuro — prazos urgentes |
| `--color-danger` | `#7f1d1d` | Vermelho — reprovado, erros, risco alto |
| `--color-sidebar` | `#18170f` | Fundo da sidebar |

---

## Scripts

```bash
pnpm --filter @lexia/api build   # Compilar backend TypeScript
pnpm --filter @lexia/web build   # Compilar frontend Vite
pnpm dev                         # Executar ambiente de desenvolvimento
```
