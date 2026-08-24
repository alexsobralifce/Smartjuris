// ===========================================================================
// Fase 3B — Adaptador real de geração (gerarOperacaoIA).
//
// Cobertura da normalização de falhas e integridade de uso:
//   - 4xx de cliente (400/429) → confirmadoSemProcessamento (fallback ok);
//   - 408/5xx → ambíguo (fail-closed; reserva retida);
//   - erro de rede/timeout → ambíguo;
//   - resposta sem usage → ambíguo (nunca liquida com zero tokens);
//   - resposta com usage → retorna uso real + modelUsed por tier.
// ===========================================================================

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ErroGeracaoIA } from './analiseDocumental.js';
import { deepseekClient, deepseekModel, deepseekModelPro, gerarOperacaoIA } from './ai.js';

const payloadBase = { operation: 'SIMPLE_PETITION', classification: 'SIMPLE', caseContext: 'STANDALONE_REQUEST' } as any;

/** Instala um mock do cliente DeepSeek para o próximo teste. */
function mockCliente(opts: {
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  errStatus?: number;
  errMessage?: string;
  networkError?: boolean;
}) {
  (deepseekClient as any).chat = {
    completions: {
      create: async () => {
        if (opts.errStatus != null) {
          const e = new Error(opts.errMessage ?? 'erro') as Error & { status?: number };
          e.status = opts.errStatus;
          throw e;
        }
        if (opts.networkError) throw new Error(opts.errMessage ?? 'fetch failed');
        if (opts.usage === null) return { usage: undefined };
        return { usage: opts.usage ?? { prompt_tokens: 100, completion_tokens: 50 } };
      },
    },
  };
}

beforeEach(() => {
  mockCliente({});
});

describe('3B — adaptador real (gerarOperacaoIA)', () => {
  test('resposta com usage → retorna uso real e modelUsed do tier', async () => {
    mockCliente({ usage: { prompt_tokens: 123, completion_tokens: 45 } });
    const rFlash = await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'FLASH' });
    assert.equal(rFlash.inputTokens, 123);
    assert.equal(rFlash.outputTokens, 45);
    assert.equal(rFlash.modelUsed, deepseekModel, `modelo FLASH (${rFlash.modelUsed})`);
    const rPro = await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'PRO' });
    assert.equal(rPro.modelUsed, deepseekModelPro, `modelo PRO (${rPro.modelUsed})`);
  });

  test('4xx de cliente (400/429) → confirmadoSemProcessamento (autoriza fallback)', async () => {
    for (const status of [400, 429]) {
      mockCliente({ errStatus: status });
      try {
        await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'FLASH' });
        assert.fail('deveria lançar');
      } catch (e) {
        assert.ok(e instanceof ErroGeracaoIA, 'ErroGeracaoIA');
        assert.equal((e as ErroGeracaoIA).confirmadoSemProcessamento, true, `HTTP ${status} confirma não-processamento`);
        assert.notEqual((e as ErroGeracaoIA).ambigua, true);
      }
    }
  });

  test('408 e 5xx → ambíguo (fail-closed; reserva retida)', async () => {
    for (const status of [408, 500, 502, 503]) {
      mockCliente({ errStatus: status });
      try {
        await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'FLASH' });
        assert.fail('deveria lançar');
      } catch (e) {
        assert.ok(e instanceof ErroGeracaoIA, 'ErroGeracaoIA');
        assert.equal((e as ErroGeracaoIA).ambigua, true, `HTTP ${status} é ambíguo`);
        assert.notEqual((e as ErroGeracaoIA).confirmadoSemProcessamento, true);
      }
    }
  });

  test('erro de rede/timeout → ambíguo', async () => {
    mockCliente({ networkError: true, errMessage: 'fetch failed' });
    try {
      await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'FLASH' });
      assert.fail('deveria lançar');
    } catch (e) {
      assert.ok(e instanceof ErroGeracaoIA);
      assert.equal((e as ErroGeracaoIA).ambigua, true, 'rede sem resposta = ambíguo');
    }
  });

  test('resposta SEM usage → ambíguo (nunca liquida com zero tokens)', async () => {
    mockCliente({ usage: null });
    try {
      await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'FLASH' });
      assert.fail('deveria lançar');
    } catch (e) {
      assert.ok(e instanceof ErroGeracaoIA);
      assert.equal((e as ErroGeracaoIA).ambigua, true, 'sem usage = ambíguo (fail-closed)');
    }
  });

  test('métricas inválidas (negativo/fracionário/NaN) → ambíguo, nunca cobra', async () => {
    const invalidos = [
      { prompt_tokens: -5, completion_tokens: 10 },
      { prompt_tokens: 10.5, completion_tokens: 10 },
      { prompt_tokens: Number.NaN, completion_tokens: 10 },
      { prompt_tokens: 10, completion_tokens: Number.POSITIVE_INFINITY },
    ];
    for (const usage of invalidos) {
      mockCliente({ usage: usage as any });
      try {
        await gerarOperacaoIA({ operationId: 'x', payload: payloadBase, modelTier: 'FLASH' });
        assert.fail(`deveria lançar para ${JSON.stringify(usage)}`);
      } catch (e) {
        assert.ok(e instanceof ErroGeracaoIA, 'ErroGeracaoIA');
        assert.equal((e as ErroGeracaoIA).ambigua, true, 'métrica inválida = ambíguo');
      }
    }
  });
});
