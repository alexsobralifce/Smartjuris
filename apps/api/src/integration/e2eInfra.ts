// ===========================================================================
// Fase 4A — Guard de infraestrutura para a suíte E2E.
//
// A suíte end-to-end opera EXCLUSIVAMENTE contra um banco de testes isolado:
//   • variável OBRIGATÓRIA `E2E_DATABASE_URL` (sem fallback para `lexia`/dev);
//   • ausente ou não dedicada a testes → REJEITA antes de qualquer acesso;
//   • Postgres inacessível → REJEITA (fail-closed — a E2E nunca pula).
// O comportamento fail-closed é coberto por `e2eInfra.test.ts`.
// ===========================================================================

import postgres from 'postgres';

/**
 * VALIDAÇÃO ÚNICA de URL de banco de testes (usada por TODOS os caminhos,
 * inclusive `verificarInfraE2E` — nenhuma URL chega ao cliente postgres sem
 * passar por aqui). Garantias VERIFICÁVEIS de isolamento (nunca heurística de
 * substring — um banco "contestacao" contém "test" e JAMAIS pode passar):
 *   1. a URL deve corresponder EXATAMENTE a uma entrada da allowlist
 *      `E2E_ALLOWED_DATABASE_URLS` (URL/instância explicitamente destinada a
 *      testes);
 *   2. quando `E2E_ALLOWED_HOSTS` estiver configurada, o HOST da URL deve
 *      pertencer à allowlist de hosts E2E.
 * Ausente/inválida → REJEITA antes de qualquer probe, migration ou escrita.
 */
export function validarE2EDatabaseUrl(url: string): string {
  const alvo = url.trim();
  if (!alvo) {
    throw new Error(
      'E2E_DATABASE_URL ausente: a suíte end-to-end exige um banco de testes ' +
        'isolado e NUNCA opera contra o banco de desenvolvimento.',
    );
  }
  const permitidas = (process.env.E2E_ALLOWED_DATABASE_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (permitidas.length === 0 || !permitidas.includes(alvo)) {
    throw new Error(
      'E2E_DATABASE_URL fora da allowlist de testes: a URL não corresponde ' +
        'exatamente a nenhuma entrada de E2E_ALLOWED_DATABASE_URLS. Recusando ' +
        'para não mutar um banco de dev/homolog/produção.',
    );
  }
  const hostsPermitidos = (process.env.E2E_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (hostsPermitidos.length > 0) {
    const host = hostDaUrl(alvo);
    if (!hostsPermitidos.includes(host)) {
      throw new Error(
        `E2E_DATABASE_URL com host "${host}" fora da allowlist de hosts E2E ` +
          '(E2E_ALLOWED_HOSTS). Recusando antes de qualquer acesso.',
      );
    }
  }
  return alvo;
}

function hostDaUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Resolve a URL obrigatória de banco de testes (`E2E_DATABASE_URL`).
 * Falha ANTES de qualquer acesso ao banco se ausente ou não dedicada a testes.
 */
export function obterE2EDatabaseUrl(): string {
  const url = (process.env.E2E_DATABASE_URL ?? '').trim();
  if (!url) {
    throw new Error(
      'E2E_DATABASE_URL ausente: a suíte end-to-end exige um banco de testes ' +
        'isolado e NUNCA opera contra o banco de desenvolvimento. Defina ' +
        'E2E_DATABASE_URL (ex.: postgresql://.../lexia_test).',
    );
  }
  return validarE2EDatabaseUrl(url);
}

/**
 * Verifica que o Postgres de testes responde `SELECT 1`. Rejeita se a URL
 * estiver ausente, não dedicada a testes (validação ANTES de conectar) ou
 * inacessível dentro do timeout. Sem fallback para banco de dev.
 */
export async function verificarInfraE2E(url?: string, timeoutMs = 3000): Promise<void> {
  const alvo = validarE2EDatabaseUrl(url ?? obterE2EDatabaseUrl());
  const probe = postgres(alvo, {
    max: 1,
    connect_timeout: Math.max(1, Math.floor(timeoutMs / 1000)),
  });
  try {
    await probe`SELECT 1`;
  } finally {
    await probe.end({ timeout: 1 });
  }
}

/** Pré-requisito da suíte E2E: banco isolado de testes acessível. */
export async function verificarPostgresE2E(timeoutMs = 3000): Promise<void> {
  await verificarInfraE2E(obterE2EDatabaseUrl(), timeoutMs);
}
