# 📘 Tutorial — SmartJuris (sistema jurídico com IA)

> Tutorial visual gerado automaticamente com **Playwright** sobre dados de **demonstração (fakes)**.
> Nenhum dado real foi capturado.

## 🚀 Como acessar

1. Suba o ambiente local: `pnpm dev` (API em `http://localhost:3001`, Web em `http://localhost:5173`).
2. Abra `http://localhost:5173` no navegador.
3. Entre com as credenciais de demonstração:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@smartjuris.com` | `admin123` |
| Usuário | `user@smartjuris.com` | `user123` |

> ⚠️ Todas as telas usam **dados fake** de demonstração — nada aqui é um caso real.

## 🧭 Navegação

A navegação é feita pela **barra lateral** (sidebar). O painel principal abre no **Painel (Dashboard)** após o login.

### Login

Digite o e-mail institucional e a senha de acesso e clique em **Entrar no Sistema →**.

![Login](./images/01-login.png)


## 📂 Módulos

### Painel (Dashboard)

Visão geral do escritório: KPIs, peças recentes e prazos críticos.

![Painel (Dashboard)](02-dashboard.png)


### Agenda

Agenda de audiências, reuniões e prazos — clique em uma data para adicionar um evento.

![Agenda](03-agenda.png)


### Processos

Gestão de processos: cadastre, edite e acompanhe o andamento de cada caso com linha do tempo.

![Processos](04-processos.png)


### Clientes

Cadastro de clientes PF/PJ com máscaras de CPF/CNPJ e busca automática de CEP.

![Clientes](05-clientes.png)


### Gerar Peças

Gerador de peças com IA: escolha o tipo, descreva o caso e gere a petição (RAG + jurisprudência ao vivo).

![Gerar Peças](06-gerar-pecas.png)


### Validação

Fila de validação humana: revise e aprove as peças geradas pela IA antes de protocolizar.

![Validação](07-validacao.png)


### Jurimetria

Analytics de taxa de êxito por área e calculadora preditiva de risco.

![Jurimetria](08-jurimetria.png)


### Decisões & Tribunais

Consulta ao vivo de jurisprudência (busca por termo e por número) via Jurisprudências.ai.

![Decisões & Tribunais](09-decisoes.png)


### Financeiro

Honorários, despesas e timesheet faturável (horas billable).

![Financeiro](10-financeiro.png)


### Revisão Contratual

Scanner autônomo de minutas: detecção de riscos e sugestões de redação.

![Revisão Contratual](11-contratos.png)


### CRM & Funil

Funil de vendas: Lead → Diagnóstico → Proposta → Contrato.

![CRM & Funil](12-crm.png)


### Base RAG

Base de conhecimento vetorial (RAG): coleções indexadas e busca semântica.

![Base RAG](13-base.png)


### Documentação

Central de ajuda: manual em 3 passos, arquitetura, LGPD e FAQ.

![Documentação](14-documentacao.png)


### Administração

Administração do escritório: identidade/timbre, métricas, usuários e permissões.

![Administração](15-admin.png)


## 💡 Dicas rápidas

- **Gerar Peças**: descreva o caso, ative a busca de jurisprudência e gere com IA — depois revise em **Validação**.
- **Processos**: cadastre processos e acompanhe intimações resumidas por IA na linha do tempo.
- **Decisões & Tribunais**: busque jurisprudência ao vivo e envie a citação direto para o gerador de peças.
- **Financeiro**: registre honorários e use o cronômetro de timesheet para horas faturáveis.
- **Base RAG**: indexe documentos do escritório para fundamentar as peças com a base interna.

---
*Gerado em 2026-08-23 · Playwright + SmartJuris · dados de demonstração.*
