// ===========================================================================
// E2E (Playwright) — Liberação de IA para assinantes e cortesia
// ===========================================================================
// Valida o comportamento NO NAVEGADOR com usuários FICTÍCIOS (role 'user',
// para exercitar a trava de IA do frontend `isNonSubscriber`):
//   • cortesia@e2e.test  → cortesia (isento_mensalidade=true): acessa Gerar
//     Peças / Base RAG SEM ver FeatureLocked;
//   • assinante@e2e.test → assinante (assinatura_status='ativa'): idem;
//   • demo@e2e.test      → demo (isDemo=true, SEM cortesia/assinatura):
//     BLOQUEADO (vê FeatureLocked na geração de peças).
//
// Pré-requisitos:
//   • API (:3001) + Web (:5173) no ar (pnpm dev);
//   • seed E2E aplicado (pnpm --filter @lexia/api e2e:seed:ia).
//
// Execução: pnpm e2e:ia  (alias na raiz)
// ===========================================================================

// PRIMEIRO: configura o PLAYWRIGHT_BROWSERS_PATH (browsers no workspace).
import './env.js';

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.env.TUTORIAL_BASE_URL ?? 'http://localhost:5173';
const API_URL = process.env.TUTORIAL_API_URL ?? 'http://localhost:3001';
const SENHA = 'E2ELiberacao#2026';

const USUARIOS = {
  cortesia: 'cortesia@e2e.test',
  assinante: 'assinante@e2e.test',
  demo: 'demo@e2e.test',
};

async function infraOk(): Promise<boolean> {
  const apiOk = await fetch(`${API_URL}/api/health`).then((r) => r.ok).catch(() => false);
  const webOk = await fetch(BASE_URL).then((r) => r.ok).catch(() => false);
  return apiOk && webOk;
}

async function login(page: import('playwright').Page, email: string): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1200);
  // Landing → login: preenche e-mail/senha. Fallback: clicar no CTA Entrar.
  await page.fill('input[type="email"]', email).catch(async () => {
    await page.getByRole('button', { name: /Entrar|Login/i }).first().click();
    await page.fill('input[type="email"]', email);
  });
  await page.fill('input[type="password"]', SENHA);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Entrar no Sistema/i }).click();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  // Aguarda o dashboard (botão da sidebar "Painel").
  await page.getByRole('button', { name: 'Painel' }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}

async function navegarPara(page: import('playwright').Page, label: string): Promise<void> {
  const btn = page.getByRole('button', { name: label, exact: true });
  await btn.waitFor({ timeout: 15_000 });
  await btn.click({ force: true }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function main(): Promise<void> {
  if (!(await infraOk())) {
    throw new Error('Infra indisponível — suba API (:3001) e Web (:5173) com `pnpm dev`.');
  }
  const browser = await chromium.launch({ headless: true });
  const resultados: { cenario: string; passou: boolean; mensagem: string }[] = [];
  const log = (c: string, passou: boolean, msg: string) => {
    resultados.push({ cenario: c, passou, mensagem: msg });
    console.log(`  ${passou ? '✔' : '✖'} ${c}: ${msg}`);
  };

  try {
    // -----------------------------------------------------------------------
    // 1) CORTESIA: acesso total a IA (sem FeatureLocked)
    // -----------------------------------------------------------------------
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await login(page, USUARIOS.cortesia);
        await navegarPara(page, 'Gerar Peças');
        // Não deve aparecer o FeatureLocked ("disponível apenas para assinantes").
        const bloqueado = await page.getByText(/disponível apenas para assinantes/i).first().isVisible().catch(() => false);
        const geradorVisivel = await page.getByText(/Gerar Peça|Gerar Conteúdo|Gerar/i).first().isVisible().catch(() => false);
        log('Cortesia acessa Gerar Peças sem bloqueio', !bloqueado, bloqueado
          ? 'apareceu FeatureLocked (bloqueado por engano!)'
          : (geradorVisivel ? 'gerador renderizado sem FeatureLocked' : 'recarregou sem FeatureLocked'));
        await navegarPara(page, 'Base de Conhecimento');
        const baseBloqueada = await page.getByText(/disponível apenas para assinantes/i).first().isVisible().catch(() => false);
        log('Cortesia acessa Base RAG sem bloqueio', !baseBloqueada, baseBloqueada
          ? 'apareceu FeatureLocked na Base RAG'
          : 'Base RAG acessível (sem FeatureLocked)');
      } finally {
        await page.close();
      }
    }

    // -----------------------------------------------------------------------
    // 2) ASSINANTE: acesso total a IA (sem FeatureLocked)
    // -----------------------------------------------------------------------
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await login(page, USUARIOS.assinante);
        await navegarPara(page, 'Gerar Peças');
        const bloqueado = await page.getByText(/disponível apenas para assinantes/i).first().isVisible().catch(() => false);
        log('Assinante acessa Gerar Peças sem bloqueio', !bloqueado, bloqueado
          ? 'apareceu FeatureLocked (bloqueado por engano!)'
          : 'gerador renderizado sem FeatureLocked');
      } finally {
        await page.close();
      }
    }

    // -----------------------------------------------------------------------
    // 3) DEMO (sem cortesia/assinatura): deve ser BLOQUEADO (FeatureLocked)
    // -----------------------------------------------------------------------
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await login(page, USUARIOS.demo);
        await navegarPara(page, 'Gerar Peças');
        // Aguarda explicitamente o FeatureLocked ("Geração de Peças não disponível").
        // Timeout generoso; a rota pode demorar a renderizar o estado bloqueado.
        const lockHeading = page.getByText(/Geração de Peças não disponível/i).first();
        await lockHeading.waitFor({ timeout: 20_000 }).catch(() => {});
        const bloqueado = await lockHeading.isVisible().catch(() => false);
        log('Demo sem assinatura é bloqueado', bloqueado, bloqueado
          ? 'FeatureLocked exibido (bloqueado corretamente)'
          : 'NÃO exibiu bloqueio (demo deveria estar bloqueado)');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const falhas = resultados.filter((r) => !r.passou);
  console.log('\n=== E2E LIBERAÇÃO IA — RELATÓRIO ===');
  for (const r of resultados) console.log(`  [${r.passou ? 'PASS' : 'FAIL'}] ${r.cenario} — ${r.mensagem}`);
  console.log(`Resultado: ${resultados.length - falhas.length}/${resultados.length} PASS`);
  if (falhas.length > 0) {
    console.error(`\n✖ ${falhas.length} cenário(s) falharam.`);
    process.exit(1);
  }
  console.log('✅ Todos os cenários E2E de liberação de IA passaram.');
}

main().catch((err) => {
  console.error('\n✖ Falha no E2E:', err instanceof Error ? err.message : err);
  process.exit(1);
});
