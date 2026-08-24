// ===========================================================================
// Fase 7E — Webhook da 1ª Compra Promocional e Assinatura Definitiva.
//
// Cobre (requisitos 7E):
//   - webhook identifica o pagamento promocional via external_reference
//     `sj-promo:<escritorioId>` (marcador da 7D);
//   - escritório ATIVADO + créditos recarregados (50% pago na 1ª compra);
//   - preapproval DEFINITIVO criado com valor INTEGRAL e 1ª cobrança ~30 dias
//     (auto_recurring.start_date);
//   - idempotência: replay não duplica a assinatura definitiva (reconciliação
//     por external_reference + chave estável);
//   - falha na criação da recorrência NÃO derruba a ativação (registrada).
//
// Banco REAL + fetch global mockado (padrão billingWebhook.test.ts).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios } from '../db/schema.js';
import { processarWebhook } from './billing.js';

const SECRET = 'segredo-teste-webhook-7e';

// Escritórios de teste (1ª compra promocional já paga na 7D: claim feito).
const ESCR_FELIZ = randomUUID();
const ESCR_REPLAY = randomUUID();
const ESCR_FALHA_RECORRENCIA = randomUUID();
const ESCR_NAO_PROMO = randomUUID();

type MpHandler = (url: string, init?: RequestInit) => { status?: number; body?: unknown };
let mockHandler: MpHandler = () => ({ body: {} });
const originalFetch = globalThis.fetch;

let chamadasPreapprovalPost = 0;
let ultimoPreapprovalBody: any = null;

before(async () => {
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET;
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-mock-token';
  (globalThis as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    const resp = mockHandler(path, init);
    if (path.endsWith('/preapproval') && init?.method === 'POST') {
      chamadasPreapprovalPost++;
      try { ultimoPreapprovalBody = JSON.parse(String(init.body)); } catch { /* não-JSON */ }
    }
    const body = JSON.stringify(resp.body ?? {});
    return {
      ok: (resp.status ?? 200) < 400,
      status: resp.status ?? 200,
      text: async () => body,
      json: async () => JSON.parse(body),
      headers: new Headers(),
    } as unknown as Response;
  };

  await db.insert(escritorios).values([
    // Feliz: claim promocional feito na 7D (plano gravado no claim).
    { id: ESCR_FELIZ, nome: '7E Feliz', plano: 'basico', promocaoUsada: true, promocaoPlano: 'basico', promocaoValorCents: 9000 },
    { id: ESCR_REPLAY, nome: '7E Replay', plano: 'basico', promocaoUsada: true, promocaoPlano: 'profissional', promocaoValorCents: 15000 },
    { id: ESCR_FALHA_RECORRENCIA, nome: '7E Falha Recorrência', plano: 'basico', promocaoUsada: true, promocaoPlano: 'basico', promocaoValorCents: 9000 },
    { id: ESCR_NAO_PROMO, nome: '7E Não Promocional', plano: 'basico' },
  ]);
});

after(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  await client`DELETE FROM billing_webhook_events WHERE escritorio_id IN (${ESCR_FELIZ}, ${ESCR_REPLAY}, ${ESCR_FALHA_RECORRENCIA}, ${ESCR_NAO_PROMO})`.catch(() => {});
  await client`DELETE FROM escritorios WHERE id IN (${ESCR_FELIZ}, ${ESCR_REPLAY}, ${ESCR_FALHA_RECORRENCIA}, ${ESCR_NAO_PROMO})`.catch(() => {});
  await client.end({ timeout: 5 }).catch(() => {});
});

describe('7E — webhook da 1ª compra promocional', () => {
  test('payment.approved sj-promo: ativa + cria assinatura DEFINITIVA integral (~30d)', async () => {
    chamadasPreapprovalPost = 0;
    ultimoPreapprovalBody = null;
    mockHandler = (url, init) => {
      if (url.endsWith('/v1/payments/pay-7e-feliz')) {
        return {
          body: {
            id: 'pay-7e-feliz',
            external_reference: 'sj-promo:' + ESCR_FELIZ,
            status: 'approved',
            date_approved: '2026-08-24T00:00:00Z',
            date_created: '2026-08-24T00:00:00Z',
            payer: { email: 'cliente@teste.local' },
          },
        };
      }
      if (url.includes('/preapproval/search')) {
        return { body: { results: [] } }; // sem preapproval anterior
      }
      if (url.endsWith('/preapproval') && init?.method === 'POST') {
        return { body: { id: 'preapp-def-1', init_point: 'https://mp.test/preapp/def1', status: 'pending', external_reference: ESCR_FELIZ } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };

    const r = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-feliz' } });
    assert.equal(r.handled, true, JSON.stringify(r));
    assert.match(r.acao, /assinatura definitiva criada/);

    // Escritório ATIVADO + créditos recarregados (plano do claim: basico = 20).
    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_FELIZ)).limit(1);
    assert.equal(esc.ativo, true);
    assert.equal(esc.assinaturaStatus, 'ativa');
    assert.equal(esc.creditsAvailable, 20);

    // Preapproval DEFINITIVO: valor INTEGRAL (180) e start_date ~30 dias.
    assert.equal(chamadasPreapprovalPost, 1);
    assert.equal(ultimoPreapprovalBody?.auto_recurring?.transaction_amount, 180, 'valor INTEGRAL (não promocional)');
    const start = Date.parse(ultimoPreapprovalBody?.auto_recurring?.start_date ?? '');
    assert.ok(Number.isFinite(start), 'start_date presente');
    const diffDias = (start - Date.now()) / (24 * 60 * 60 * 1000);
    assert.ok(diffDias >= 28 && diffDias <= 32, `start_date ~30 dias (${diffDias.toFixed(1)})`);
    assert.equal(ultimoPreapprovalBody?.external_reference, ESCR_FELIZ);
    assert.match(ultimoPreapprovalBody?.reason ?? '', /Básico/);

    // Vínculo local: mercado_pago_id do preapproval definitivo + próxima cobrança.
    assert.equal(esc.mercadoPagoId, 'preapp-def-1');
    assert.equal(esc.assinaturaPlano, 'basico');
    assert.ok(esc.assinaturaProximaCobranca instanceof Date);
  });

  test('replay do MESMO payment: NÃO duplica a assinatura definitiva (idempotência)', async () => {
    chamadasPreapprovalPost = 0;
    mockHandler = (url, init) => {
      if (url.endsWith('/v1/payments/pay-7e-replay')) {
        return {
          body: {
            id: 'pay-7e-replay',
            external_reference: 'sj-promo:' + ESCR_REPLAY,
            status: 'approved',
            date_created: '2026-08-24T00:00:00Z',
            payer: { email: 'cliente2@teste.local' },
          },
        };
      }
      if (url.includes('/preapproval/search')) {
        return { body: { results: [] } };
      }
      if (url.endsWith('/preapproval') && init?.method === 'POST') {
        return { body: { id: 'preapp-def-2', init_point: 'https://mp.test/preapp/def2', status: 'pending', external_reference: ESCR_REPLAY } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };

    const r1 = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-replay' } });
    assert.equal(r1.handled, true);
    assert.equal(chamadasPreapprovalPost, 1);

    // Replay idêntico → ignorado pela deduplicação por transição.
    const r2 = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-replay' } });
    assert.equal(r2.handled, true);
    assert.match(r2.acao, /replay ignorado|evento não processado/);
    assert.equal(chamadasPreapprovalPost, 1, 'replay não recria a assinatura definitiva');
  });

  test('falha na recorrência: ativação mantida + evento REPROCESSAVEL (retry recria)', async () => {
    let postCount = 0;
    mockHandler = (url, init) => {
      if (url.endsWith('/v1/payments/pay-7e-falha')) {
        return {
          body: {
            id: 'pay-7e-falha',
            external_reference: 'sj-promo:' + ESCR_FALHA_RECORRENCIA,
            status: 'approved',
            date_created: '2026-08-24T00:00:00Z',
            payer: { email: 'cliente3@teste.local' },
          },
        };
      }
      if (url.includes('/preapproval/search')) {
        return { body: { results: [] } };
      }
      if (url.endsWith('/preapproval') && init?.method === 'POST') {
        postCount++;
        if (postCount === 1) {
          return { status: 500, body: { error: 'MP indisponível' } }; // 1ª tentativa falha
        }
        return { body: { id: 'preapp-def-3', init_point: 'https://mp.test/preapp/def3', status: 'pending', external_reference: ESCR_FALHA_RECORRENCIA } };
      }
      if (url.includes('/preapproval/preapp-def-3')) {
        return { body: { id: 'preapp-def-3', status: 'pending', auto_recurring: { start_date: '2026-09-23T00:00:00.000Z' } } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };

    // 1ª tentativa: recorrência falha (5xx) → ativação mantida, evento ERRO.
    const r1 = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-falha' } });
    assert.equal(r1.handled, true, JSON.stringify(r1));
    assert.match(r1.acao, /ativado; recorrência pendente de retry/);
    assert.ok(!JSON.stringify(r1).includes('MP indisponível'), 'não expõe detalhes do provedor');

    const [esc1] = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_FALHA_RECORRENCIA)).limit(1);
    assert.equal(esc1.ativo, true, 'ativação mantida');
    assert.equal(esc1.mercadoPagoId, null, 'sem vínculo na 1ª tentativa');

    // Replay do MP (mesmo evento, agora com MP ok): o evento ERRO é
    // REPROCESSAVEL → recria a recorrência e vincula (sem duplicar).
    const r2 = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-falha' } });
    assert.equal(r2.handled, true, JSON.stringify(r2));
    assert.match(r2.acao, /assinatura definitiva criada/);

    const [esc2] = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_FALHA_RECORRENCIA)).limit(1);
    assert.equal(esc2.mercadoPagoId, 'preapp-def-3', 'retry vincula a recorrência');
    assert.ok(esc2.assinaturaProximaCobranca instanceof Date, 'próxima cobrança gravada');
    // Start_date REAL preservada (extraída do preapproval retornado).
    const diff = Math.abs(esc2.assinaturaProximaCobranca.getTime() - Date.parse('2026-09-23T00:00:00.000Z'));
    assert.ok(diff < 1000, 'start_date REAL persistida (não recalculada)');
    assert.equal(postCount, 2, 'retry criou uma vez (1ª falhou) — sem duplicação');
  });

  test('plano da 1ª compra vem EXCLUSIVAMENTE do claim (description manipulável ignorada)', async () => {
    chamadasPreapprovalPost = 0;
    ultimoPreapprovalBody = null;
    mockHandler = (url, init) => {
      if (url.endsWith('/v1/payments/pay-7e-plano')) {
        return {
          body: {
            id: 'pay-7e-plano',
            // description MENTIROSA (manipulável): não pode vencer o claim.
            external_reference: 'sj-promo:' + ESCR_REPLAY,
            description: 'Plano Avançado',
            status: 'approved',
            date_created: '2026-08-24T00:00:00Z',
            payer: { email: 'cliente4@teste.local' },
          },
        };
      }
      if (url.includes('/preapproval/search')) {
        return { body: { results: [] } };
      }
      if (url.endsWith('/preapproval') && init?.method === 'POST') {
        return { body: { id: 'preapp-def-4', init_point: 'https://mp.test/preapp/def4', status: 'pending', external_reference: ESCR_REPLAY } };
      }
      if (url.includes('/preapproval/preapp-def-4')) {
        return { body: { id: 'preapp-def-4', status: 'pending', auto_recurring: { start_date: '2026-09-23T00:00:00.000Z' } } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };

    const r = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-plano' } });
    assert.equal(r.handled, true, JSON.stringify(r));
    // Claim do ESCR_REPLAY é 'profissional' → preapproval integral R$300,
    // apesar da description mentirosa 'Plano Avançado' (R$500).
    assert.equal(ultimoPreapprovalBody?.auto_recurring?.transaction_amount, 300, 'plano do CLAIM vence a description');
  });

  test('payment SEM marcador sj-promo: fluxo normal inalterado (sem criar recorrência)', async () => {
    chamadasPreapprovalPost = 0;
    mockHandler = (url) => {
      if (url.endsWith('/v1/payments/pay-7e-normal')) {
        return {
          body: {
            id: 'pay-7e-normal',
            external_reference: ESCR_NAO_PROMO,
            status: 'approved',
            date_created: '2026-08-24T00:00:00Z',
          },
        };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };

    const r = await processarWebhook({ type: 'payment', data: { id: 'pay-7e-normal' } });
    assert.equal(r.handled, true);
    assert.match(r.acao, /escritório ativado/);
    assert.doesNotMatch(r.acao, /definitiva/);
    assert.equal(chamadasPreapprovalPost, 0, 'fluxo normal não cria recorrência promocional');
  });
});
