// ===========================================================================
// Fase 7F — Testes da lógica pura de exibição/decisão da promoção de
// boas-vindas (1º mês 50% OFF). Cobrem: elegibilidade → checkoutPromocional,
// fallback para checkout normal, resumo de preços (desconto riscado),
// estados inativo/inelegível e o bloco de promoção do painel dev.
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirCheckoutPromocional,
  resumoPrecoPlano,
  resumoUsoPromocao,
  type PromocaoStatusApi,
  type PlanoAssinaturaApi,
} from './promocaoUI.js';

// Status comuns de teste.
const promocaoElegivel: PromocaoStatusApi = {
  ativa: true,
  percentual: 50,
  elegivel: true,
  motivoIneligibilidade: null,
  valorPromocional: { percentual: 50, precoMensal: 180, valorPromocional: 90, valorPromocionalCents: 9000 },
};
const promocaoInativa: PromocaoStatusApi = { ...promocaoElegivel, ativa: false };
const promocaoJaUsou: PromocaoStatusApi = {
  ativa: true, percentual: 50, elegivel: false, motivoIneligibilidade: 'promocao-ja-usada', valorPromocional: null,
};

const planoBasico: PlanoAssinaturaApi = {
  codigo: 'basico', precoMensal: 180, creditos: 20, rotulo: 'Básico',
  promocao: { percentual: 50, valorPromocional: 90, valorPromocionalCents: 9000 },
};
const planoSemPromo: PlanoAssinaturaApi = { ...planoBasico, promocao: null };

describe('7F — decidirCheckoutPromocional', () => {
  test('elegível + ativa → checkout PROMOCIONAL', () => {
    assert.deepEqual(decidirCheckoutPromocional(promocaoElegivel), { promocional: true, motivo: 'elegivel' });
  });

  test('promoção INATIVA → checkout normal (fallback)', () => {
    assert.deepEqual(decidirCheckoutPromocional(promocaoInativa), { promocional: false, motivo: 'promocao-inativa' });
  });

  test('não elegível (já usou) → checkout normal', () => {
    assert.deepEqual(decidirCheckoutPromocional(promocaoJaUsou), { promocional: false, motivo: 'nao-elegivel' });
  });

  test('status ausente/undefined → checkout normal', () => {
    assert.deepEqual(decidirCheckoutPromocional(undefined), { promocional: false, motivo: 'promocao-inativa' });
  });
});

describe('7F — resumoPrecoPlano', () => {
  test('elegível + plano com promoção → destaca valor promocional e mantém integral riscado', () => {
    const r = resumoPrecoPlano(planoBasico, promocaoElegivel);
    assert.equal(r.promocional, true);
    assert.equal(r.valorDestaque, 90);
    assert.equal(r.precoMensal, 180);
    assert.equal(r.percentual, 50);
  });

  test('promoção INATIVA → preço integral sem destaque', () => {
    const r = resumoPrecoPlano(planoBasico, promocaoInativa);
    assert.equal(r.promocional, false);
    assert.equal(r.valorDestaque, 180);
    assert.equal(r.percentual, null);
  });

  test('inelegível (já usou) → preço integral sem destaque', () => {
    const r = resumoPrecoPlano(planoBasico, promocaoJaUsou);
    assert.equal(r.promocional, false);
    assert.equal(r.valorDestaque, 180);
  });

  test('plano SEM campo promocao → preço integral mesmo elegível', () => {
    const r = resumoPrecoPlano(planoSemPromo, promocaoElegivel);
    assert.equal(r.promocional, false);
    assert.equal(r.valorDestaque, 180);
  });

  test('valor promocional zerado/ausente → não destaca (fail-safe)', () => {
    const planoZerado = { ...planoBasico, promocao: { percentual: 50, valorPromocional: 0, valorPromocionalCents: 0 } };
    const r = resumoPrecoPlano(planoZerado, promocaoElegivel);
    assert.equal(r.promocional, false);
    assert.equal(r.valorDestaque, 180);
  });
});

describe('7F — resumoUsoPromocao (painel dev)', () => {
  test('normaliza dados completos de /billing/dev', () => {
    const r = resumoUsoPromocao({
      ativa: true, percentual: 50, validade: '2026-12-31T00:00:00.000Z',
      usos: { total: 7, ultimas24h: 2, porPlano: { basico: 3, profissional: 2, office: 2 } },
    });
    assert.equal(r.ativa, true);
    assert.equal(r.rotuloEstado, 'ATIVA');
    assert.equal(r.percentual, 50);
    assert.equal(r.validade, '2026-12-31T00:00:00.000Z');
    assert.equal(r.usos.total, 7);
    assert.equal(r.usos.ultimas24h, 2);
    assert.equal(r.usos.basico, 3);
    assert.equal(r.usos.profissional, 2);
    assert.equal(r.usos.office, 2);
  });

  test('tolerante a payload vazio/parcial (endpoint novo)', () => {
    const r = resumoUsoPromocao(undefined);
    assert.equal(r.ativa, false);
    assert.equal(r.rotuloEstado, 'INATIVA');
    assert.equal(r.percentual, 50);
    assert.equal(r.usos.total, 0);
    assert.equal(r.usos.basico, 0);

    const parcial = resumoUsoPromocao(null);
    assert.equal(parcial.ativa, false);
    assert.equal(parcial.usos.total, 0);
  });

  test('percentual ausente → default 50', () => {
    const r = resumoUsoPromocao({ ativa: true, usos: { total: 1, ultimas24h: 0, porPlano: { basico: 1, profissional: 0, office: 0 } } } as any);
    assert.equal(r.percentual, 50);
  });
});
