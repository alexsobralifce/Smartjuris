// ===========================================================================
// Fase 6D — Integração: cache persistente via Redis REAL (quando disponível).
//
// Prova que, com REDIS_URL configurada e Redis funcional:
//   - cacheSet grava a chave no Redis com TTL de 1h (persistência real);
//   - o cache sobrevive à recriação do cliente (hit sem chamada à API);
//   - o Redis é a FONTE ÚNICA quando ativo (deletar a chave no Redis derruba
//     o hit mesmo com o valor ainda presente na memória local).
// Pula quando o Redis não está disponível (fallback em memória é coberto nos
// testes unitários de jurisprudenciaRag).
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from 'redis';
import { buscarJurisprudenciaSeNecessario, desconectarRedis, limparCache } from './jurisprudenciaRag.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let redisDisponivel = false;
let probe: ReturnType<typeof createClient> | null = null;
try {
  probe = createClient({ url: REDIS_URL, socket: { connectTimeout: 1500, reconnectStrategy: false } });
  probe.on('error', () => {});
  await probe.connect();
  redisDisponivel = true;
} catch {
  redisDisponivel = false;
}

function decisao(numero: string, texto: string): Record<string, unknown> {
  return { process_number: numero, rapporteur: 'Min. X', adjudicating_body: 'T1', publication_date: '2026-01-10', court: 'stj', excerpt: texto };
}

describe('cache Redis persistente (fase 6D)', { skip: !redisDisponivel }, () => {
  before(async () => {
    process.env.REDIS_URL = REDIS_URL;
    await desconectarRedis();
    await limparCache();
  });
  after(async () => {
    // Ordem importa: limpa com o cliente ativo, DEPOIS fecha (limparCache
    // reconectaria se a env ainda estivesse setada).
    await limparCache();
    await desconectarRedis();
    try { await probe?.quit(); } catch { /* best-effort */ }
    try { await probe?.disconnect?.(); } catch { /* best-effort */ }
    delete process.env.REDIS_URL;
  });

  test('cacheSet grava no Redis com TTL 1h e o hit sobrevive à recriação do cliente', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [decisao('41', 'Ementa redis real.')], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const input = {
      includeJurisprudence: true,
      area: 'Cível',
      fatos: 'cache persistente redis real sobrevive a recriacao do cliente',
      escritorioId: 'esc-6d-redis',
      searchOverride: mock as never,
      rastreabilidade: () => undefined,
    };

    const b1 = await buscarJurisprudenciaSeNecessario(input);
    assert.ok(b1.bloco, '1ª busca com bloco');
    assert.equal(chamadas, 1);

    // A chave foi gravada no Redis real, sob o prefixo e com TTL de 1h.
    const chaves = await probe!.keys('juris:v1:esc-6d-redis::*');
    assert.ok(chaves.length >= 1, `chave gravada no Redis (${chaves.length})`);
    const ttl = await probe!.ttl(chaves[0]);
    assert.ok(ttl > 3500 && ttl <= 3600, `TTL ~1h (veio ${ttl}s)`);

    // Recria o cliente (simula restart do processo): o hit continua vindo do
    // Redis — zero chamadas novas à API.
    await desconectarRedis();
    const b2 = await buscarJurisprudenciaSeNecessario(input);
    assert.equal(chamadas, 1, 'hit do Redis após recriação do cliente (sobrevive a restart)');
    assert.equal(b2.fromCache, true, 'veio do cache');
    assert.ok(b2.bloco, 'bloco servido do Redis');
  });

  test('Redis é a fonte única quando ativo: deletar a chave derruba o hit (memória não é consultada)', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [decisao('42', 'Ementa fonte unica.')], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const input = {
      includeJurisprudence: true,
      area: 'Cível',
      fatos: 'deletar chave no redis prova que a fonte e o redis nao a memoria',
      escritorioId: 'esc-6d-fonte',
      searchOverride: mock as never,
      rastreabilidade: () => undefined,
    };

    const b1 = await buscarJurisprudenciaSeNecessario(input);
    assert.ok(b1.bloco, '1ª busca grava no Redis');
    assert.equal(chamadas, 1);

    // Remove a chave DIRETAMENTE no Redis (a memória local ainda tem o valor).
    const chaves = await probe!.keys('juris:v1:esc-6d-fonte::*');
    assert.ok(chaves.length >= 1, 'chave presente no Redis');
    await probe!.del(chaves[0]);

    // Com o Redis ativo, o cacheGet consulta SÓ o Redis → miss (mesmo com o
    // valor na memória) → nova chamada à API.
    const b2 = await buscarJurisprudenciaSeNecessario(input);
    assert.equal(chamadas, 2, 'miss no Redis → nova chamada (fonte única = Redis)');
    assert.equal(b2.fromCache, false, 'não veio do cache');
    assert.ok(b2.bloco, 'nova busca funciona');
  });
});
