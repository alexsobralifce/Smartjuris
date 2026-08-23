// ===========================================================================
// Captura o tutorial visual do SmartJuris com Playwright + dados de
// demonstração (fakes). Fluxo:
//   1) verifica API (:3001) e Web (:5173);
//   2) abre o Chromium em 1440x900 (headless);
//   3) landing → login (admin demo) → dashboard;
//   4) navega pelos módulos pela sidebar, aguarda render e captura;
//   5) gera docs/tutorial/README.md (PT-BR) referenciando as imagens.
// Execução: pnpm tutorial:capture (alias na raiz).
// ===========================================================================

// PRIMEIRO: configura o PLAYWRIGHT_BROWSERS_PATH (browsers no workspace).
import './env.js';

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'tutorial', 'images');
const README_PATH = join(ROOT, 'docs', 'tutorial', 'README.md');

const BASE_URL = process.env.TUTORIAL_BASE_URL ?? 'http://localhost:5173';
const API_URL = process.env.TUTORIAL_API_URL ?? 'http://localhost:3001';
const EMAIL = process.env.TUTORIAL_EMAIL ?? 'admin@smartjuris.com';
const SENHA = process.env.TUTORIAL_SENHA ?? 'admin123';

interface Modulo {
  id: string;
  label: string;
  arquivo: string;
  titulo: string;
  instrucao: string;
}

const MODULOS: Modulo[] = [
  { id: 'dashboard', label: 'Painel', arquivo: '02-dashboard.png', titulo: 'Painel (Dashboard)', instrucao: 'Visão geral do escritório: KPIs, peças recentes e prazos críticos.' },
  { id: 'agenda', label: 'Agenda', arquivo: '03-agenda.png', titulo: 'Agenda', instrucao: 'Agenda de audiências, reuniões e prazos — clique em uma data para adicionar um evento.' },
  { id: 'processos', label: 'Processos', arquivo: '04-processos.png', titulo: 'Processos', instrucao: 'Gestão de processos: cadastre, edite e acompanhe o andamento de cada caso com linha do tempo.' },
  { id: 'clientes', label: 'Clientes', arquivo: '05-clientes.png', titulo: 'Clientes', instrucao: 'Cadastro de clientes PF/PJ com máscaras de CPF/CNPJ e busca automática de CEP.' },
  { id: 'pecas', label: 'Gerar Peças', arquivo: '06-gerar-pecas.png', titulo: 'Gerar Peças', instrucao: 'Gerador de peças com IA: escolha o tipo, descreva o caso e gere a petição (RAG + jurisprudência ao vivo).' },
  { id: 'validacao', label: 'Validação', arquivo: '07-validacao.png', titulo: 'Validação', instrucao: 'Fila de validação humana: revise e aprove as peças geradas pela IA antes de protocolizar.' },
  { id: 'jurimetria', label: 'Jurimetria', arquivo: '08-jurimetria.png', titulo: 'Jurimetria', instrucao: 'Analytics de taxa de êxito por área e calculadora preditiva de risco.' },
  { id: 'decisoes', label: 'Decisões & Tribunais', arquivo: '09-decisoes.png', titulo: 'Decisões & Tribunais', instrucao: 'Consulta ao vivo de jurisprudência (busca por termo e por número) via Jurisprudências.ai.' },
  { id: 'financeiro', label: 'Financeiro', arquivo: '10-financeiro.png', titulo: 'Financeiro', instrucao: 'Honorários, despesas e timesheet faturável (horas billable).' },
  { id: 'contratos', label: 'Revisão Contratual', arquivo: '11-contratos.png', titulo: 'Revisão Contratual', instrucao: 'Scanner autônomo de minutas: detecção de riscos e sugestões de redação.' },
  { id: 'crm', label: 'Funil de Clientes', arquivo: '12-crm.png', titulo: 'CRM & Funil', instrucao: 'Funil de vendas: Lead → Diagnóstico → Proposta → Contrato.' },
  { id: 'base', label: 'Base de Conhecimento', arquivo: '13-base.png', titulo: 'Base RAG', instrucao: 'Base de conhecimento vetorial (RAG): coleções indexadas e busca semântica.' },
  { id: 'documentacao', label: 'Documentação', arquivo: '14-documentacao.png', titulo: 'Documentação', instrucao: 'Central de ajuda: manual em 3 passos, arquitetura, LGPD e FAQ.' },
  { id: 'admin', label: 'Administração', arquivo: '15-admin.png', titulo: 'Administração', instrucao: 'Administração do escritório: identidade/timbre, métricas, usuários e permissões.' },
];

async function verificarInfra(): Promise<void> {
  const apiOk = await fetch(`${API_URL}/api/health`).then((r) => r.ok).catch(() => false);
  if (!apiOk) throw new Error(`API não respondeu em ${API_URL}/api/health — suba com: pnpm dev`);
  const webOk = await fetch(BASE_URL).then((r) => r.ok).catch(() => false);
  if (!webOk) throw new Error(`Web não respondeu em ${BASE_URL} — suba com: pnpm dev`);
}

function gerarReadme(imagens: string[]): string {
  const secoes = MODULOS.map((m) => `
### ${m.titulo}

${m.instrucao}

![${m.titulo}](${m.arquivo})
`).join('\n');

  return `# 📘 Tutorial — SmartJuris (sistema jurídico com IA)

> Tutorial visual gerado automaticamente com **Playwright** sobre dados de **demonstração (fakes)**.
> Nenhum dado real foi capturado.

## 🚀 Como acessar

1. Suba o ambiente local: \`pnpm dev\` (API em \`http://localhost:3001\`, Web em \`http://localhost:5173\`).
2. Abra \`http://localhost:5173\` no navegador.
3. Entre com as credenciais de demonstração:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | \`admin@smartjuris.com\` | \`admin123\` |
| Usuário | \`user@smartjuris.com\` | \`user123\` |

> ⚠️ Todas as telas usam **dados fake** de demonstração — nada aqui é um caso real.

## 🧭 Navegação

A navegação é feita pela **barra lateral** (sidebar). O painel principal abre no **Painel (Dashboard)** após o login.

${imagens.includes('01-login.png') ? `### Login

Digite o e-mail institucional e a senha de acesso e clique em **Entrar no Sistema →**.

![Login](./images/01-login.png)
` : ''}

## 📂 Módulos
${secoes}

## 💡 Dicas rápidas

- **Gerar Peças**: descreva o caso, ative a busca de jurisprudência e gere com IA — depois revise em **Validação**.
- **Processos**: cadastre processos e acompanhe intimações resumidas por IA na linha do tempo.
- **Decisões & Tribunais**: busque jurisprudência ao vivo e envie a citação direto para o gerador de peças.
- **Financeiro**: registre honorários e use o cronômetro de timesheet para horas faturáveis.
- **Base RAG**: indexe documentos do escritório para fundamentar as peças com a base interna.

---
*Gerado em ${new Date().toISOString().slice(0, 10)} · Playwright + SmartJuris · dados de demonstração.*
`;
}

async function main(): Promise<void> {
  await verificarInfra();
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const capturadas: string[] = [];

  try {
    // 1) Landing pública.
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT_DIR, '00-landing.png'), fullPage: true });
    capturadas.push('00-landing.png');
    console.log('✔ 00-landing.png');

    // 2) Login pela UI (formulário real).
    await page.fill('input[type="email"]', EMAIL).catch(async () => {
      // Fallback: se a landing exigir abrir o login, clica no CTA de login.
      await page.getByRole('button', { name: /Entrar|Login/i }).first().click();
      await page.fill('input[type="email"]', EMAIL);
    });
    await page.fill('input[type="password"]', SENHA);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '01-login.png') });
    capturadas.push('01-login.png');
    console.log('✔ 01-login.png');

    await page.getByRole('button', { name: /Entrar no Sistema/i }).click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    // Aguarda o dashboard (botão da sidebar "Painel" visível).
    await page.getByRole('button', { name: 'Painel' }).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT_DIR, '02-dashboard.png'), fullPage: true });
    capturadas.push('02-dashboard.png');
    console.log('✔ 02-dashboard.png');

    // 3) Módulos pela sidebar.
    for (const m of MODULOS.slice(1)) {
      await page.getByRole('button', { name: m.label, exact: true }).click();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT_DIR, m.arquivo), fullPage: true });
      capturadas.push(m.arquivo);
      console.log(`✔ ${m.arquivo} (${m.label})`);
    }

    // 4) Tutorial markdown.
    writeFileSync(README_PATH, gerarReadme(capturadas), 'utf8');
    console.log(`\n✅ Tutorial gerado: ${README_PATH}`);
    console.log(`   Imagens: ${capturadas.length} em ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n✖ Falha na captura:', err instanceof Error ? err.message : err);
  process.exit(1);
});
