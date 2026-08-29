import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  deepseekClient,
  opencodeClient,
  deepseekModel,
  deepseekModelPro,
  opencodeModel,
  opencodeModelPro,
  modeloPorTier,
  ehModeloPro,
  ehErroRetryableParaFallback,
  executarComFallback,
  montarProvedores,
  type ProvedorCreate,
} from './ai.js';

/** Fake de create com contador de chamadas e falha configurável.
 *  `falhar` retorna true para simular rejeição do provedor (ex.: 429). */
function fakeCreate(opts: { falhar?: (params: any) => boolean; erroStatus?: number } = {}) {
  const chamadas: Array<{ params: any; options?: any }> = [];
  const create: ProvedorCreate = async (params: any, options?: any) => {
    chamadas.push({ params, options });
    if (opts.falhar?.(params)) {
      throw Object.assign(new Error('créditos do plano esgotados'), { status: opts.erroStatus ?? 429 });
    }
    return { ok: true, chamadas };
  };
  return { create, chamadas };
}

// Silencia os logs do fallback durante os testes (o fallback loga warn/error).
let origWarn: typeof console.warn;
let origError: typeof console.error;
beforeEach(() => {
  origWarn = console.warn;
  origError = console.error;
  console.warn = () => {};
  console.error = () => {};
});
afterEach(() => {
  console.warn = origWarn;
  console.error = origError;
});

describe('5J — fallback bidirecional de IA (Token Plan <-> OpenCode Go)', () => {
  test('Token Plan esgota créditos (HTTP 429) → a chamada usa o OpenCode Go', async () => {
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 429 });
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    const r = await executarComFallback({ model: deepseekModel, enable_thinking: false }, undefined, principal, reserva);

    assert.equal(tokenPlan.chamadas.length, 1, 'Token Plan tentado 1x');
    assert.equal(opencode.chamadas.length, 1, 'OpenCode chamado no fallback');
    assert.equal(opencode.chamadas[0].params.model, opencodeModel, 'reserva usa o modelo FLASH do OpenCode');
    assert.equal(r.ok, true);
  });

  test('OpenCode Go esgota créditos (429) → usa o Token Plan (PREFER_OPENCODE=true)', async () => {
    const opencode = fakeCreate({ falhar: () => true, erroStatus: 429 });
    const tokenPlan = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, true, tokenPlan.create, opencode.create);

    const r = await executarComFallback({ model: deepseekModel }, undefined, principal, reserva);

    assert.equal(opencode.chamadas.length, 1, 'OpenCode tentado 1x');
    assert.equal(tokenPlan.chamadas.length, 1, 'Token Plan chamado no fallback');
    assert.equal(tokenPlan.chamadas[0].params.model, deepseekModel);
    assert.equal(r.ok, true);
  });

  test('quando o principal responde, o reserva NÃO é chamado', async () => {
    const tokenPlan = fakeCreate();
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    await executarComFallback({ model: deepseekModel }, undefined, principal, reserva);

    assert.equal(tokenPlan.chamadas.length, 1);
    assert.equal(opencode.chamadas.length, 0, 'reserva não deve ser chamado no sucesso');
  });

  test('ambos os provedores falham → propaga o erro do reserva', async () => {
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 429 });
    const opencode = fakeCreate({ falhar: () => true, erroStatus: 503 });
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    await assert.rejects(
      () => executarComFallback({ model: deepseekModel }, undefined, principal, reserva),
      (e: any) => e?.status === 503,
    );
    assert.equal(tokenPlan.chamadas.length, 1);
    assert.equal(opencode.chamadas.length, 1);
  });

  test('4xx de cliente (400) NÃO transborda — erro propagado e reserva não chamado', async () => {
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 400 });
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    await assert.rejects(
      () => executarComFallback({ model: deepseekModel }, undefined, principal, reserva),
      (e: any) => e?.status === 400,
    );
    assert.equal(tokenPlan.chamadas.length, 1, 'principal tentado 1x');
    assert.equal(opencode.chamadas.length, 0, 'reserva NÃO chamado para erro de cliente');
  });

  test('5xx (500) transborda — erro de provedor é retryable', async () => {
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 500 });
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    const r = await executarComFallback({ model: deepseekModel }, undefined, principal, reserva);

    assert.equal(opencode.chamadas.length, 1, '5xx transborda para o reserva');
    assert.equal(r.ok, true);
  });

  test('ehErroRetryableParaFallback: 429/5xx/rede retryable; 4xx e abort não', () => {
    assert.equal(ehErroRetryableParaFallback({ status: 429 }), true, '429 (créditos esgotados)');
    assert.equal(ehErroRetryableParaFallback({ status: 500 }), true, '500');
    assert.equal(ehErroRetryableParaFallback({ status: 503 }), true, '503');
    assert.equal(ehErroRetryableParaFallback(new Error('fetch failed')), true, 'rede (sem status)');
    assert.equal(ehErroRetryableParaFallback({ status: 400 }), false, '400 config/conteúdo');
    assert.equal(ehErroRetryableParaFallback({ status: 401 }), false, '401 auth');
    assert.equal(ehErroRetryableParaFallback({ status: 403 }), false, '403');
    assert.equal(ehErroRetryableParaFallback({ status: 408 }), false, '408 é 4xx (não transborda)');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    assert.equal(ehErroRetryableParaFallback(abort), false, 'AbortError (desconexão SSE) não transborda');
  });

  test('esgotamento no tier PRO → reserva usa o modelo PRO do OpenCode', async () => {
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 429 });
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModelPro }, false, tokenPlan.create, opencode.create);

    await executarComFallback({ model: deepseekModelPro }, undefined, principal, reserva);

    assert.equal(principal.model, deepseekModelPro);
    assert.equal(reserva.model, opencodeModelPro, 'reserva PRO = opencodeModelPro');
    assert.equal(opencode.chamadas[0].params.model, opencodeModelPro);
  });

  test('enable_thinking é removido para modelo não-Qwen e preservado para Qwen', async () => {
    // opencodeModel default = deepseek-v4-flash (não-Qwen) → parâmetro removido.
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 429 });
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);
    await executarComFallback({ model: deepseekModel, enable_thinking: false }, undefined, principal, reserva);
    assert.equal('enable_thinking' in opencode.chamadas[0].params, false, 'não-Qwen: enable_thinking removido');

    // deepseekModel default = qwen3.7-plus (Qwen) → parâmetro preservado.
    const qwen = fakeCreate();
    const qwenReserva = fakeCreate();
    const p2 = montarProvedores({ model: deepseekModel }, false, qwen.create, qwenReserva.create);
    await executarComFallback({ model: deepseekModel, enable_thinking: false }, undefined, p2.principal, p2.reserva);
    assert.equal(qwen.chamadas[0].params.enable_thinking, false, 'Qwen: enable_thinking preservado');
  });

  test('a resposta do fallback anota o modelo efetivamente usado', async () => {
    const tokenPlan = fakeCreate({ falhar: () => true, erroStatus: 429 });
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    const r = await executarComFallback({ model: deepseekModel }, undefined, principal, reserva);

    assert.equal(r.model, opencodeModel, 'resposta anotada com o modelo do provedor reserva');
  });

  test('a resposta do principal anota o modelo pedido (sem fallback)', async () => {
    const tokenPlan = fakeCreate();
    const opencode = fakeCreate();
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false, tokenPlan.create, opencode.create);

    const r = await executarComFallback({ model: deepseekModel }, undefined, principal, reserva);

    assert.equal(r.model, deepseekModel, 'resposta anotada com o modelo do principal');
  });

  test('roteamento FLASH/PRO por nome (inclui legado hardcoded deepseek-v4-pro)', () => {
    assert.equal(ehModeloPro('deepseek-v4-pro'), true);
    assert.equal(ehModeloPro('deepseek-v4-flash'), false);
    assert.equal(ehModeloPro('qwen3.8-max'), true);
    assert.equal(ehModeloPro('qwen3.7-plus'), false);
    assert.equal(modeloPorTier('FLASH'), deepseekModel);
    assert.equal(modeloPorTier('PRO'), deepseekModelPro);

    const { principal, reserva } = montarProvedores({ model: 'deepseek-v4-pro' }, false);
    assert.equal(principal.model, deepseekModelPro, 'nome legado PRO → Token Plan PRO');
    assert.equal(reserva.model, opencodeModelPro, 'nome legado PRO → reserva PRO');
  });

  test('proxy real do deepseekClient instalado e montagem default coerente', () => {
    assert.ok(deepseekClient.chat.completions.create, 'wrapper do fallback existe');
    assert.ok(opencodeClient.chat.completions.create, 'opencodeClient create existe');
    const { principal, reserva } = montarProvedores({ model: deepseekModel }, false);
    assert.equal(principal.model, deepseekModel);
    assert.equal(reserva.model, opencodeModel);
  });
});