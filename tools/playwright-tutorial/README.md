# Playwright Tutorial — SmartJuris

Automação de navegador (Playwright) para **capturar screenshots do SmartJuris** com dados de
demonstração (fakes) e **gerar o tutorial visual** em `docs/tutorial/README.md`.

## Pré-requisitos

- Node + pnpm (monorepo já configurado, `tools/*` no workspace).
- PostgreSQL local rodando com o banco do SmartJuris (docker-compose).
- API e Web locais acessíveis (ver abaixo).

## Instalação

```bash
# 1) Instala as dependências do workspace (playwright + tsx)
pnpm install

# 2) Instala o browser Chromium (uma vez)
pnpm tutorial:install
```

## Execução

Suba o ambiente local primeiro (API `:3001` + Web `:5173`):

```bash
pnpm dev
```

Depois capture o tutorial:

```bash
pnpm tutorial:capture
```

O script:

1. verifica se a API (`/api/health`) e a Web respondem;
2. abre o Chromium headless em `1440x900`;
3. faz **login pela UI** com as credenciais de demonstração
   (`admin@smartjuris.com` / `admin123` — configuráveis via env);
4. navega pelos módulos pela **sidebar**, aguarda o render e captura cada tela;
5. gera `docs/tutorial/README.md` (PT-BR) referenciando as imagens.

### Saída

- Imagens: `docs/tutorial/images/00-landing.png` … `15-admin.png`
- Tutorial: `docs/tutorial/README.md`

### Variáveis de ambiente (opcionais)

| Variável | Default | Descrição |
|---|---|---|
| `TUTORIAL_BASE_URL` | `http://localhost:5173` | URL da Web |
| `TUTORIAL_API_URL` | `http://localhost:3001` | URL da API (health check) |
| `TUTORIAL_EMAIL` | `admin@smartjuris.com` | E-mail do login |
| `TUTORIAL_SENHA` | `admin123` | Senha do login |

> ⚠️ O tutorial usa **apenas dados de demonstração (fakes)** — nunca dados reais
> de produção (LGPD).

## Notas

- A ferramenta **não altera código de produção** (apps/api, apps/web) — é um
  utilitário externo de captura.
- Reexecutar o comando sobrescreve as imagens e o tutorial (idempotente).
- Requisitos de origem: `docs/ai-development/requirements/playwright-tutorial.txt`
  (implementação manual, sem auditor do orquestrador).
