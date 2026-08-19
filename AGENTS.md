# LexIA — Sistema Jurídico com IA

React + Vite + Tailwind CSS v4 rodando no Figma Make.

## Development Server

O servidor Vite já está rodando em `$PORT` (padrão 8443). Não é necessário iniciá-lo manualmente.

- Preview URL: acessível pelo painel de preview do Figma Make
- Hot reload: alterações em arquivos fonte são refletidas imediatamente

---

## Visão Geral do Produto

**LexIA** é um MVP de sistema jurídico com IA para escritórios de advocacia. Combina gestão processual, geração de peças via RAG + LLM, fila de revisão humana obrigatória, jurimetria e gerenciamento da base de conhecimento vetorial.

### Módulos

| Módulo | Rota (estado) | Arquivo | Descrição |
|---|---|---|---|
| Dashboard | `dashboard` | `src/components/Dashboard.tsx` | KPIs do escritório, peças recentes, prazos críticos e status do motor RAG |
| Processos | `processos` | `src/components/Processos.tsx` | CRUD de processos judiciais com busca, filtro por área e painel de detalhes |
| Gerar Peças | `pecas` | `src/components/GeradorPecas.tsx` | Fluxo em 4 etapas: seleção de tipo → dados do caso → geração animada com RAG → revisão |
| Validação | `validacao` | `src/components/Validacao.tsx` | Fila de revisão humana com trilha de auditoria, aprovação/reprovação e metadados de custo |
| Jurimetria | `jurimetria` | `src/components/Jurimetria.tsx` | Gráficos de taxa de êxito, distribuição por área e previsão probabilística de sucesso |
| Base RAG | `base` | `src/components/Base.tsx` | Gerenciamento de coleções indexadas, simulação de ingestão e configuração do pipeline |

---

## Estrutura de Arquivos

```
/
├── index.html                  # Vite HTML shell com #root
├── package.json                # Dependências e scripts
├── vite.config.ts              # Vite + Tailwind v4 + plugin React + alias @→src
├── .mise.toml                  # Versões de Node.js e pnpm
│
└── src/
    ├── main.tsx                # Entrypoint React — importa index.css e monta App
    ├── App.tsx                 # Shell da aplicação: sidebar de navegação + roteamento por estado
    ├── index.css               # CSS global — @import Google Fonts, Tailwind, tokens CSS
    │
    ├── components/
    │   ├── Dashboard.tsx       # Módulo 1 — painel geral
    │   ├── Processos.tsx       # Módulo 2 — gestão de processos (CRUD)
    │   ├── GeradorPecas.tsx    # Módulo 3 — geração de peças com IA
    │   ├── Validacao.tsx       # Módulo 4 — fila de revisão humana
    │   ├── Jurimetria.tsx      # Módulo 5 — analytics e previsão
    │   └── Base.tsx            # Módulo 6 — base de conhecimento RAG
    │
    └── db/
        ├── types.ts            # Tipos TypeScript: Processo, Peca, Documento, DB, StatusProcesso, StatusPeca
        ├── seed.ts             # Dados iniciais (carregados na primeira execução)
        └── store.ts            # API de acesso ao banco local (localStorage)
```

---

## Banco de Dados Local

Persistência via `localStorage` com seed automático na primeira execução. Nenhum backend necessário.

### Entidades (`src/db/types.ts`)

**`Processo`**
```ts
{ id, tipo, cliente, adverso, vara, area, status: 'ativo'|'suspenso'|'arquivado', valor, prazo, advogado }
```

**`Peca`**
```ts
{ id, processoId, tipo, area, cliente, status: 'revisao'|'aprovado'|'protocolado'|'reprovado', prazo, geradoEm, modelo, fontes, conteudo }
```

**`Documento`**
```ts
{ id, nome, colecao, tamanho, indexado, chunks }
```

### API do Store (`src/db/store.ts`)

```ts
// Processos
getProcessos(): Processo[]
addProcesso(p: Processo): void
updateProcesso(id, patch): void
deleteProcesso(id): void

// Peças
getPecas(): Peca[]
addPeca(p: Peca): void
updatePeca(id, patch): void

// Documentos
getDocumentos(): Documento[]
addDocumento(d: Documento): void

// Dev
resetDB(): void     // Restaura dados do seed
exportDB(): string  // Exporta JSON completo
```

A chave no localStorage é `lexia_db`. O seed (`src/db/seed.ts`) é carregado e persistido apenas quando a chave não existe.

---

## Navegação

A navegação é controlada por estado React em `src/App.tsx` — não usa React Router. A rota ativa (`Route`) é passada para o componente `<main>` que renderiza condicionalmente cada módulo.

```ts
type Route = 'dashboard' | 'processos' | 'pecas' | 'validacao' | 'jurimetria' | 'base'
```

A sidebar é colapsável (estado `sidebarOpen`) e exibe badge numérico no item "Validação" quando há peças pendentes.

---

## Paleta de Cores

Tokens CSS definidos em `src/index.css` via `@theme`. Usar sempre as variáveis CSS, nunca valores hardcoded.

| Token CSS | Valor | Uso |
|---|---|---|
| `--color-background` | `#f4f3f0` | Fundo da página (off-white quente) |
| `--color-surface` | `#ffffff` | Cards, painéis, tabelas |
| `--color-surface-2` | `#eeede9` | Linhas de cabeçalho de tabela, fundos secundários |
| `--color-border` | `#d8d6d0` | Bordas de cards, linhas divisórias, inputs |
| `--color-foreground` | `#18170f` | Texto principal (quase-preto quente) |
| `--color-muted` | `#7a7870` | Labels, legendas, texto secundário |
| `--color-primary` | `#1a2744` | Cor primária — navy escuro (botões principais, links, badges de área) |
| `--color-primary-hover` | `#243560` | Hover do primary |
| `--color-accent` | `#c8a84b` | Âmbar — destaque, logo, badges urgentes |
| `--color-accent-light` | `#f5edd6` | Fundo de alertas de acento |
| `--color-success` | `#2d6a4f` | Verde — status aprovado, métricas positivas |
| `--color-success-light` | `#d8ede4` | Fundo de badges e alertas de sucesso |
| `--color-warning` | `#92400e` | Âmbar escuro — prazos urgentes, avisos |
| `--color-warning-light` | `#fef3c7` | Fundo de badges e alertas de aviso |
| `--color-danger` | `#7f1d1d` | Vermelho — reprovado, erros críticos |
| `--color-danger-light` | `#fee2e2` | Fundo de alertas de erro |
| `--color-sidebar` | `#18170f` | Fundo da sidebar (quase-preto quente) |

### Cores derivadas (não são tokens)

- Fundo de badge de área: `#e8eaf0` com texto `--color-primary`
- Fundo de item selecionado em tabela/lista: `#eef0f7`
- Sidebar — texto inativo: `rgba(255,255,255,0.55)`
- Sidebar — item ativo: background `rgba(200,168,75,0.15)`, texto `--color-accent`

---

## Tipografia

Fontes importadas do Google Fonts via `@import` no topo de `src/index.css`.

| Token CSS | Família | Uso |
|---|---|---|
| `--font-display` | DM Serif Display | Títulos de página, valores de KPI, nome do produto |
| `--font-sans` | Outfit | Corpo de texto, labels, botões, inputs (fonte base) |
| `--font-mono` | JetBrains Mono | IDs de processo, datas, valores numéricos, metadados técnicos, cabeçalhos de tabela |

**Hierarquia típica:**
- H1 de página: `font-family: var(--font-display)`, `font-size: 26–28px`, `letter-spacing: -0.02em`
- Rótulos de seção: `font-size: 11px`, `font-weight: 600`, `letter-spacing: 0.06em`, `text-transform: uppercase`, cor `--color-muted`
- KPIs: `font-family: var(--font-display)`, `font-size: 28–32px`, `letter-spacing: -0.03em`
- Dados/IDs: `font-family: var(--font-mono)`, `font-size: 10–12px`

---

## Estética (Stance Swiss)

O sistema segue estética **Swiss/Vignelli**: grid rígido, hierarquia tipográfica clara, paleta de neutros com um único acento cromático (âmbar), sem gradientes decorativos, sem sombras pesadas. Bordas finas `1px` em `--color-border`. Espaçamento generoso e consistente.

Não usar: gradientes em fundos de seção, sombras `box-shadow` pesadas, border-radius acima de `8px` em cards, cores de acento secundárias além do âmbar.

---

## Dependências

- **Runtime:** React 19, React DOM 19
- **Charts:** Recharts 3 — usado em `Jurimetria.tsx` (`BarChart`, `LineChart`, `PieChart`)
- **Estilização:** Tailwind CSS v4 via `@tailwindcss/vite`
- **Build:** Vite 8, TypeScript 5.7, `@vitejs/plugin-react`
- **Formatação:** oxfmt

---

## Padrões de Código

- Strings com apóstrofos usam aspas duplas: `"We're here to help"` (apóstrofo em string single-quoted quebra o build)
- Tags JSX sempre fechadas, chaves balanceadas
- Componentes exportados como `default export`
- Estilos aplicados via `style={{}}` inline usando tokens CSS — Tailwind é usado apenas onde conveniente para utilitários simples
- Sem comentários salvo quando o motivo for não-óbvio
- Estado local com `useState`; sem gerenciador de estado global (Redux, Zustand, etc.)
- Cada módulo carrega seus dados do store com `useEffect` na montagem e chama `reload()` após mutações

---

## Fluxo de Dados Típico

```
Usuário cria processo → addProcesso() → localStorage
Dashboard carrega    → getProcessos(), getPecas() → lê localStorage
Usuário gera peça   → addPeca({ status: 'revisao' }) → localStorage
Validação carrega   → getPecas().filter(revisao|aprovado) → lê localStorage
Revisor aprova      → updatePeca(id, { status: 'aprovado' }) → localStorage
```

---

## Scripts

```bash
pnpm dev      # Servidor de desenvolvimento (já rodando)
pnpm build    # Build de produção para dist/
pnpm preview  # Preview do build
pnpm format   # Formatar com oxfmt
```
