// ===========================================================================
// Testes do serviço de billing (Mercado Pago) — unidade, sem rede.
// Cobre: mapeamento de planos, preços, créditos por ciclo, listagem e
// validação de assinatura do webhook (x-signature HMAC-SHA256).
// ===========================================================================

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  BILLING_PLANS,
  planoAssinatura,
  listarPlanosAssinatura,
  validarWebhookSignature,
} from './billing.js';

const SECRET_ORIGINAL = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

afterEach(() => {
  if (SECRET_ORIGINAL !== undefined) {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET_ORIGINAL;
  } else {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  }
});

describe('billing — planos de assinatura', () => {
  it('mapeia aliases de plano para os 3 planos canônicos de cobrança', () => {
    assert.equal(planoAssinatura('basico')?.codigo, 'basico');
    assert.equal(planoAssinatura('Básico')?.codigo, 'basico');
    assert.equal(planoAssinatura('intermediario')?.codigo, 'profissional');
    assert.equal(planoAssinatura('profissional')?.codigo, 'profissional');
    assert.equal(planoAssinatura('avancado')?.codigo, 'office');
    assert.equal(planoAssinatura('office')?.codigo, 'office');
    assert.equal(planoAssinatura('enterprise')?.codigo, 'office');
  });

  it('preços mensais: Básico R$180, Intermediário R$300, Avançado R$500', () => {
    assert.equal(BILLING_PLANS.basico.precoMensal, 180);
    assert.equal(BILLING_PLANS.profissional.precoMensal, 300);
    assert.equal(BILLING_PLANS.office.precoMensal, 500);
  });

  it('créditos por ciclo: 20 / 50 / 100', () => {
    assert.equal(BILLING_PLANS.basico.creditos, 20);
    assert.equal(BILLING_PLANS.profissional.creditos, 50);
    assert.equal(BILLING_PLANS.office.creditos, 100);
  });

  it('plano desconhecido/nulo retorna null', () => {
    assert.equal(planoAssinatura('luxo'), null);
    assert.equal(planoAssinatura(null), null);
    assert.equal(planoAssinatura(undefined), null);
  });

  it('listarPlanosAssinatura retorna exatamente 3 planos (sem duplicar aliases)', () => {
    const planos = listarPlanosAssinatura();
    assert.equal(planos.length, 3);
    assert.deepEqual(planos.map((p) => p.codigo).sort(), ['basico', 'office', 'profissional']);
  });
});

describe('billing — validação de assinatura do webhook (x-signature)', () => {
  it('aceita sem webhook secret configurado (com aviso)', () => {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    const r = validarWebhookSignature({ 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'req' }, { id: '123' });
    assert.equal(r.valido, true);
    assert.match(r.motivo ?? '', /WEBHOOK_SECRET ausente/);
  });

  it('rejeita payload sem headers de assinatura quando o secret está configurado', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'segredo-teste';
    const r = validarWebhookSignature({}, { id: '123' });
    assert.equal(r.valido, false);
  });

  it('valida HMAC-SHA256 correto do manifest id/request-id/ts', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'segredo-teste';
    const ts = String(Math.floor(Date.now() / 1000));
    const dataId = 'abc123';
    const requestId = 'req-xyz';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', 'segredo-teste').update(manifest).digest('hex');
    const r = validarWebhookSignature(
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
      { id: dataId },
    );
    assert.equal(r.valido, true);
  });

  it('rejeita assinatura com HMAC divergente', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'segredo-teste';
    const r = validarWebhookSignature(
      { 'x-signature': `ts=${String(Math.floor(Date.now() / 1000))},v1=0123456789abcdef`, 'x-request-id': 'req-xyz' },
      { id: 'abc123' },
    );
    assert.equal(r.valido, false);
  });
});
