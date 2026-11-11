// ===========================================================================
// Testes da lógica pura de exibição de preço por peça e por dia dos planos.
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { custoPorPeca, custoPorDia, reducaoPercentual, formatarReais } from './planoPreco';

describe('custoPorPeca', () => {
  test('divide o preço mensal pelas peças do plano', () => {
    assert.equal(custoPorPeca(180, 20), 9);
    assert.equal(custoPorPeca(300, 50), 6);
    assert.equal(custoPorPeca(500, 100), 5);
  });

  test('rejeita quantidade de peças zero ou negativa', () => {
    assert.throws(() => custoPorPeca(180, 0));
    assert.throws(() => custoPorPeca(180, -1));
  });
});

describe('custoPorDia', () => {
  test('divide o preço mensal por 30 dias', () => {
    assert.equal(custoPorDia(300), 10);
    assert.equal(custoPorDia(180), 6);
  });
});

describe('reducaoPercentual', () => {
  test('calcula quanto o custo por peça cai em relação a outro plano', () => {
    // Intermediário (R$ 6,00) vs Básico (R$ 9,00): 33% mais barato
    assert.equal(reducaoPercentual(9, 6), 33);
  });

  test('retorna 0 quando o custo não cai', () => {
    assert.equal(reducaoPercentual(5, 9), 0);
  });
});

describe('formatarReais', () => {
  test('formata com vírgula decimal e duas casas', () => {
    assert.equal(formatarReais(9), 'R$ 9,00');
    assert.equal(formatarReais(16.666), 'R$ 16,67');
  });
});
