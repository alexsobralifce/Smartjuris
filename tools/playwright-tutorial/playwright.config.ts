// ===========================================================================
// Configuração do Playwright para o tutorial do SmartJuris.
// Captura de screenshots com dados de demonstração (nunca dados reais).
// ===========================================================================

import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './src',
  // Tutorial visual: resolução desktop fixa para imagens consistentes.
  use: {
    baseURL: process.env.TUTORIAL_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
});
