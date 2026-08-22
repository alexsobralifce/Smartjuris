// ===========================================================================
// Fase 4A — Guard de infraestrutura E2E: fail-closed em TODAS as configurações
// obrigatórias (variável ausente, fora da allowlist de URLs/hosts, Postgres
// inacessível). A suíte E2E NUNCA pula silenciosamente: o perfil E2E é
// OBRIGATÓRIO neste repositório — sem provisionamento, o run falha.
// ===========================================================================

import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { obterE2EDatabaseUrl, verificarInfraE2E } from './e2eInfra.js';

// Carrega .env (E2E_DATABASE_URL, E2E_ALLOWED_*) sem sobrescrever o existente.
await import('../config.js');

const envOriginal = process.env.E2E_DATABASE_URL;
const allowlistOriginal = process.env.E2E_ALLOWED_DATABASE_URLS;
const hostsOriginal = process.env.E2E_ALLOWED_HOSTS;

function restaurarEnv() {
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  set('E2E_DATABASE_URL', envOriginal);
  set('E2E_ALLOWED_DATABASE_URLS', allowlistOriginal);
  set('E2E_ALLOWED_HOSTS', hostsOriginal);
}

after(restaurarEnv);

describe('4A — guard de infraestrutura E2E', () => {
  test('E2E_DATABASE_URL AUSENTE → rejeita ANTES de qualquer acesso ao banco', () => {
    delete process.env.E2E_DATABASE_URL;
    assert.throws(
      () => obterE2EDatabaseUrl(),
      /E2E_DATABASE_URL ausente/,
      'variável obrigatória ausente deve falhar o run',
    );
  });

  test('URL fora da allowlist → rejeitada, mesmo com "test" no nome do banco (contestacao)', () => {
    process.env.E2E_DATABASE_URL = 'postgresql://app:senha@db.internal:5432/contestacao';
    assert.throws(
      () => obterE2EDatabaseUrl(),
      /fora da allowlist/,
      'banco "contestacao" (contém "test" como substring) NÃO pode passar heurística — allowlist decide',
    );
    process.env.E2E_DATABASE_URL = 'postgresql://lexia:lexia@localhost:5433/lexia';
    assert.throws(
      () => obterE2EDatabaseUrl(),
      /fora da allowlist/,
      'banco de dev "lexia" deve ser recusado',
    );
  });

  test('URL na allowlist mas com HOST fora de E2E_ALLOWED_HOSTS → rejeitada antes de conectar', () => {
    process.env.E2E_ALLOWED_DATABASE_URLS = 'postgresql://app:senha@db.internal:5432/qa_lex';
    process.env.E2E_ALLOWED_HOSTS = 'localhost,127.0.0.1';
    process.env.E2E_DATABASE_URL = 'postgresql://app:senha@db.internal:5432/qa_lex';
    assert.throws(
      () => obterE2EDatabaseUrl(),
      /host "db.internal" fora da allowlist/,
      'host não-E2E rejeitado mesmo com URL na allowlist',
    );
    restaurarEnv();
  });

  test('Postgres inacessível → verificarInfraE2E REJEITA (fail-closed, sem skip)', async () => {
    process.env.E2E_ALLOWED_DATABASE_URLS = 'postgresql://e2e:senha@127.0.0.1:1/e2e_test';
    process.env.E2E_ALLOWED_HOSTS = '127.0.0.1';
    await assert.rejects(
      () => verificarInfraE2E('postgresql://e2e:senha@127.0.0.1:1/e2e_test', 2000),
      'probe contra Postgres indisponível deve falhar',
    );
    restaurarEnv();
  });

  test('verificarInfraE2E com URL de banco NÃO-E2E rejeita ANTES de criar conexão', async () => {
    // A validação roda antes de criar o cliente postgres — um banco fora da
    // allowlist NUNCA recebe conexão da suíte E2E.
    await assert.rejects(
      () => verificarInfraE2E('postgresql://app:senha@db.internal:5432/producao', 2000),
      /fora da allowlist/,
      'URL de produção rejeitada pela validação única, sem tentar conectar',
    );
  });

  test('perfil E2E provisionado (variável + allowlist) → guard RESOLVE sem retorno silencioso', async () => {
    // NUNCA retorna cedo: sem E2E_DATABASE_URL o perfil NÃO está provisionado
    // e o run DEVE falhar (a E2E é obrigatória neste repositório).
    assert.ok(envOriginal, 'E2E_DATABASE_URL deve estar provisionada (perfil E2E obrigatório)');
    restaurarEnv();
    const obtida = obterE2EDatabaseUrl();
    assert.equal(obtida, envOriginal, 'URL resolvida da variável exclusiva + allowlist');
    await verificarInfraE2E(obtida, 5000);
  });
});
