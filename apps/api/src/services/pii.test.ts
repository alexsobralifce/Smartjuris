import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarPseudonimizador, redactPII } from './pii.js';

describe('pseudonimização de partes', () => {
  test('troca nomes das partes por marcadores, ignorando caixa, e redige CPF', () => {
    const p = criarPseudonimizador(['Maria da Silva', 'Banco Exemplo S/A']);
    const out = p.sanitize('Autora MARIA DA SILVA (CPF 123.456.789-00) contra banco exemplo s/a.');
    assert.equal(out.includes('Maria'), false);
    assert.equal(out.toLowerCase().includes('banco exemplo'), false);
    assert.equal(out.includes('123.456.789-00'), false);
    assert.match(out, /\[PARTE_\d\]/);
  });

  test('restaurar devolve os nomes reais ao texto do modelo', () => {
    const p = criarPseudonimizador(['Maria da Silva', 'Banco Exemplo']);
    const sanitizado = p.sanitize('Requerente Maria da Silva em face de Banco Exemplo.');
    assert.equal(p.restaurar(sanitizado), 'Requerente Maria da Silva em face de Banco Exemplo.');
  });

  test('ignora nomes curtos (< 4 caracteres) e vazios', () => {
    const p = criarPseudonimizador(['Ana', '', null, undefined]);
    assert.equal(p.sanitize('Ana foi ouvida.'), 'Ana foi ouvida.');
  });

  test('streaming: marcador partido entre chunks é restaurado por inteiro', () => {
    const p = criarPseudonimizador(['Maria da Silva']);
    const r = p.streamRestaurador();
    const partes = [r.processar('Autora [PAR'), r.processar('TE_1] pede. '), r.processar('Fim'), r.finalizar()];
    assert.equal(partes.join(''), 'Autora Maria da Silva pede. Fim');
  });

  test('redactPII continua removendo CNPJ e e-mail', () => {
    assert.equal(redactPII('12.345.678/0001-90 x@y.com.br'), '[CNPJ] [EMAIL]');
  });
});
