import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executarComFallback } from './ai.js';

function capturar(model: string) {
  const enviados: any[] = [];
  const client = async (p: any) => {
    enviados.push(p);
    return { model: p.model, choices: [] };
  };
  return { enviados, alvo: { client, model } };
}

describe('adaptação de parâmetros por modelo OpenAI', () => {
  test('gpt-5.6-luna recebe max_completion_tokens e sem temperature customizada', async () => {
    const c = capturar('gpt-5.6-luna');
    await executarComFallback(
      { model: 'gpt-5.6-luna', temperature: 0.3, max_tokens: 500, messages: [] },
      undefined,
      c.alvo,
      c.alvo,
    );
    const p = c.enviados[0];
    assert.equal(p.max_tokens, undefined);
    assert.equal(p.max_completion_tokens, 500);
    assert.equal(p.temperature, undefined);
  });

  test('gpt-4o-mini mantém a temperatura e usa max_completion_tokens', async () => {
    const c = capturar('gpt-4o-mini');
    await executarComFallback(
      { model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 200, messages: [] },
      undefined,
      c.alvo,
      c.alvo,
    );
    const p = c.enviados[0];
    assert.equal(p.temperature, 0.3);
    assert.equal(p.max_completion_tokens, 200);
    assert.equal(p.max_tokens, undefined);
  });
});
