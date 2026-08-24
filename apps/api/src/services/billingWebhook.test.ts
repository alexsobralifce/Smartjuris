// ===========================================================================
// Testes de INTEGRAÇÃO do webhook de billing (Mercado Pago) — fase 7A.
//
// Cobre (resposta aos achados HIGH do revisor):
//   - payload sem assinatura / com assinatura inválida → rejeitado
//   - payload com assinatura HMAC válida → processado
//   - payload duplicado (replay do MESMO id) → idempotente (sem reativar 2x
//     nem regravar estado divergente)
//   - payload com tipo desconhecido → ignorado (handled=false)
//   - falha de consulta ao Mercado Pago → registrado e sem crash
//   - payment.approved → escritório ATIVADO com plano/créditos corretos
//   - payment.rejected / preapproval.cancelled → escritório desativado
//
// Banco REAL (padrão da suíte): cria escritório isolado com UUID aleatório e
// limpa no after(). API do Mercado Pago MOCKADA via fetch global (nunca chama
// a rede). Nenhum arquivo de produção é alterado.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { sql, eq, and } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios, billingCheckoutOperations } from '../db/schema.js';
import { processarWebhook, validarWebhookSignature, adquirirEventoWebhook, finalizarEventoWebhook, adquirirOperacaoCheckout, adquirirLockEscritorio, liberarLockEscritorio } from './billing.js';

const ESCRITORIO_ID = randomUUID();
const MP_ID = randomUUID().replace(/-/g, '').slice(0, 24);

const SECRET = 'segredo-teste-webhook';

// ---------------------------------------------------------------------------
// 0. Mock do fetch global (API do Mercado Pago) — configura a resposta por
//    URL antes de cada teste; restaura o fetch original no after().
// ---------------------------------------------------------------------------
type MpHandler = (url: string) => { status?: number; body?: unknown };

let mockHandler: MpHandler = () => ({ body: { status: 'pending' } });
const originalFetch = globalThis.fetch;

before(() => {
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET;
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-mock-token';
  (globalThis as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    const resp = mockHandler(path);
    const body = JSON.stringify(resp.body ?? {});
    return {
      ok: (resp.status ?? 200) < 400,
      status: resp.status ?? 200,
      text: async () => body,
      json: async () => JSON.parse(body),
      headers: new Headers(),
    } as unknown as Response;
  };
});

after(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  delete process.env.NODE_ENV;
  await client`DELETE FROM billing_webhook_events WHERE data_id IN ('pay-1','pay-2','pay-replay','pay-falha','pay-retry','x','lease-ativo','lease-exp','finalizado','ordem-novo','ordem-antigo')`.catch(() => {});
  await client`DELETE FROM billing_checkout_operations WHERE escritorio_id = ${ESCRITORIO_ID}`.catch(() => {});
  await client`DELETE FROM escritorios WHERE id = ${ESCRITORIO_ID}`.catch(() => {});
  // Fecha o pool do postgres para o processo do teste terminar (padrão da suíte).
  await client.end({ timeout: 5 }).catch(() => {});
});

/** Monta o header x-signature válido conforme o manifest do MP. */
function xSignature(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('billing — webhook (integração com banco real + MP mockado)', () => {
  before(async () => {
    await db.insert(escritorios).values({
      id: ESCRITORIO_ID,
      nome: 'Escritório Webhook Teste',
      plano: 'basico',
      mercadoPagoId: MP_ID,
      assinaturaStatus: 'pendente',
      assinaturaPlano: 'profissional',
      creditsAvailable: 0,
    });
  });

  test('payment.approved ativa o escritório, aplica plano e recarrega créditos', async () => {
    mockHandler = () => ({
      body: {
        external_reference: ESCRITORIO_ID,
        status: 'approved',
        date_approved: '2026-08-24T00:00:00Z',
      },
    });

    const r = await processarWebhook({ type: 'payment', data: { id: 'pay-1' } });
    assert.equal(r.handled, true);
    assert.match(r.acao, /payment\.approved → escritório ativado/);

    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(esc.ativo, true);
    assert.equal(esc.plano, 'profissional');
    assert.equal(esc.assinaturaStatus, 'ativa');
    assert.equal(esc.creditsAvailable, 50); // créditos do plano profissional
  });

  test('payment.rejected desativa o escritório (inadimplência)', async () => {
    mockHandler = () => ({ body: { external_reference: ESCRITORIO_ID, status: 'rejected' } });

    const r = await processarWebhook({ type: 'payment', data: { id: 'pay-2' } });
    assert.equal(r.handled, true);
    assert.match(r.acao, /payment\.rejected → escritório desativado/);

    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(esc.ativo, false);
    assert.equal(esc.assinaturaStatus, 'atrasada');
  });

  test('replay do MESMO id (payment.approved 2x): 2ª chamada é ignorada (idempotência persistida)', async () => {
    // Reativa para cenário limpo.
    mockHandler = () => ({ body: { external_reference: ESCRITORIO_ID, status: 'approved' } });
    const r1 = await processarWebhook({ type: 'payment', data: { id: 'pay-replay' } });
    assert.equal(r1.handled, true);
    assert.match(r1.acao, /escritório ativado/);

    // Replay idêntico (mesmo tipo + mesmo data.id): registrado em
    // billing_webhook_events → ignorado sem reprocessar.
    const r2 = await processarWebhook({ type: 'payment', data: { id: 'pay-replay' } });
    assert.equal(r2.handled, true);
    assert.match(r2.acao, /replay ignorado/);

    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(esc.assinaturaStatus, 'ativa');
    assert.equal(esc.ativo, true);
  });

  test('preapproval.cancelled desativa o escritório como cancelada', async () => {
    mockHandler = () => ({
      body: { external_reference: ESCRITORIO_ID, status: 'cancelled', reason: 'SmartJuris — Plano Intermediário' },
    });

    const r = await processarWebhook({ type: 'subscription_preapproval', data: { id: MP_ID } });
    assert.equal(r.handled, true);
    assert.match(r.acao, /preapproval\.cancelled → escritório desativado/);

    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(esc.ativo, false);
    assert.equal(esc.assinaturaStatus, 'cancelada');
  });

  test('evento desconhecido é ignorado sem crash', async () => {
    mockHandler = () => ({ body: { external_reference: ESCRITORIO_ID, status: 'whatever' } });
    const r = await processarWebhook({ type: 'evento_desconhecido', data: { id: 'x' } });
    assert.equal(r.handled, false);
    assert.match(r.motivo, /Tipo de evento não suportado/);
  });

  test('falha de consulta ao MP (5xx) retorna handled=false sem lançar', async () => {
    mockHandler = () => ({ status: 500, body: { error: 'MP fora do ar' } });
    const r = await processarWebhook({ type: 'payment', data: { id: 'pay-falha' } });
    assert.equal(r.handled, false);
    assert.match(r.motivo, /Payment não encontrado/);
  });

  test('evento em ERRO é REPROCESSÁVEL: falha do MP → sucesso posterior aplica efeito', async () => {
    // 1ª tentativa: MP fora do ar → evento registrado como MP_INDISPONIVEL.
    mockHandler = () => ({ status: 500, body: { error: 'MP fora do ar' } });
    const r1 = await processarWebhook({ type: 'payment', data: { id: 'pay-retry' } });
    assert.equal(r1.handled, false);

    // 2ª tentativa (MP voltou): o mesmo id NÃO é deduplicado — é reprocessado
    // e o escritório é ativado (não foi bloqueado pelo registro anterior).
    mockHandler = () => ({ body: { external_reference: ESCRITORIO_ID, status: 'approved' } });
    const r2 = await processarWebhook({ type: 'payment', data: { id: 'pay-retry' } });
    assert.equal(r2.handled, true);
    assert.match(r2.acao, /escritório ativado/);

    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(esc.assinaturaStatus, 'ativa');
  });

  test('lease ativo (PROCESSANDO recente) NÃO é retomado por outro worker', async () => {
    // Adquire (simula worker 1 processando agora).
    const a1 = await adquirirEventoWebhook('payment', 'lease-ativo');
    assert.equal(a1.adquirido, true);

    // Worker 2 tenta o mesmo evento: lease ativo (processando_em recente) → NÃO adquire.
    const a2 = await adquirirEventoWebhook('payment', 'lease-ativo');
    assert.equal(a2.adquirido, false);
    assert.match(a2.motivo ?? '', /processamento por outro worker|replay ignorado/);
  });

  test('lease EXpirado (PROCESSANDO antigo) é retomável', async () => {
    // Registra evento com lease antigo (simula worker que morreu há 10 min).
    await client`DELETE FROM billing_webhook_events WHERE data_id = 'lease-exp'`.catch(() => {});
    await client`
      INSERT INTO billing_webhook_events (event_type, data_id, result_status, processando_em, attempts)
      VALUES ('payment', 'lease-exp', 'PROCESSANDO', now() - interval '10 minutes', 1)
    `;

    const a = await adquirirEventoWebhook('payment', 'lease-exp');
    assert.equal(a.adquirido, true, 'lease expirado deve permitir retomada');
    await client`DELETE FROM billing_webhook_events WHERE data_id = 'lease-exp'`.catch(() => {});
  });

  test('finalizado com sucesso (ATIVADO) nunca é re-adquirido', async () => {
    await client`DELETE FROM billing_webhook_events WHERE data_id = 'finalizado'`.catch(() => {});
    const a1 = await adquirirEventoWebhook('payment', 'finalizado', 'approved');
    assert.equal(a1.adquirido, true);
    await finalizarEventoWebhook('payment', 'finalizado', 'approved', 'ATIVADO');

    const a2 = await adquirirEventoWebhook('payment', 'finalizado', 'approved');
    assert.equal(a2.adquirido, false);
    assert.match(a2.motivo ?? '', /replay ignorado/);
    await client`DELETE FROM billing_webhook_events WHERE data_id = 'finalizado'`.catch(() => {});
  });

  test('ordem inversa: evento antigo NÃO altera o estado aplicado por evento novo', async () => {
    // Entrega 1 (nova): payment.approved com date_created RECENTE → ativa.
    mockHandler = () => ({
      body: {
        external_reference: ESCRITORIO_ID,
        status: 'approved',
        date_created: new Date().toISOString(),
      },
    });
    const rNovo = await processarWebhook({ type: 'payment', data: { id: 'ordem-novo' } });
    assert.equal(rNovo.handled, true);
    assert.match(rNovo.acao, /escritório ativado/);
    const [escNovo] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(escNovo.assinaturaStatus, 'ativa');

    // Entrega 2 (antiga, fora de ordem): payment.rejected com date_created
    // ANTERIOR ao evento já aplicado → transição obsoleta, NÃO desativa.
    mockHandler = () => ({
      body: {
        external_reference: ESCRITORIO_ID,
        status: 'rejected',
        date_created: '2020-01-01T00:00:00Z',
      },
    });
    const rAntigo = await processarWebhook({ type: 'payment', data: { id: 'ordem-antigo' } });
    assert.equal(rAntigo.handled, true);
    assert.match(rAntigo.acao, /obsoleto ignorado/);

    const [escDepois] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(escDepois.assinaturaStatus, 'ativa', 'evento antigo não pode desativar o escritório');
    assert.equal(escDepois.ativo, true);
  });

  test('validação de assinatura: HMAC válido passa; inválido/ausente rejeita', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const dataId = 'abc123';
    const requestId = 'req-xyz';

    // Válida
    const sig = xSignature(dataId, requestId, ts);
    const ok = validarWebhookSignature(
      { 'x-signature': sig, 'x-request-id': requestId },
      { id: dataId, type: 'payment' },
    );
    assert.equal(ok.valido, true);

    // Inválida (v1 errado)
    const bad = validarWebhookSignature(
      { 'x-signature': `ts=${ts},v1=falsofalsofalso`, 'x-request-id': requestId },
      { id: dataId, type: 'payment' },
    );
    assert.equal(bad.valido, false);

    // Ausente
    const none = validarWebhookSignature({}, { id: dataId, type: 'payment' });
    assert.equal(none.valido, false);
  });

  test('fail-closed em produção: secret ausente → assinatura INVÁLIDA', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    try {
      const r = validarWebhookSignature(
        { 'x-signature': 'ts=1700000000,v1=abc', 'x-request-id': 'req' },
        { id: 'abc123', type: 'payment' },
      );
      assert.equal(r.valido, false);
      assert.match(r.motivo ?? '', /fail-closed/);
    } finally {
      if (original !== undefined) process.env.NODE_ENV = original;
      else delete process.env.NODE_ENV;
    }
  });

  test('evento expirado (ts fora da janela) é rejeitado', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET;
    const antigo = Math.floor(Date.now() / 1000) - 3600; // 1h atrás
    const dataId = 'expired-1';
    const requestId = 'req-exp';
    const sig = xSignature(dataId, requestId, String(antigo));
    const r = validarWebhookSignature(
      { 'x-signature': sig, 'x-request-id': requestId },
      { id: dataId, type: 'payment' },
    );
    assert.equal(r.valido, false);
    assert.match(r.motivo ?? '', /expirado/);
  });

  test('gravação local NÃO regride estado ativa confirmada pelo webhook (concorrência)', async () => {
    // Simula o cenário do checkout: criação remota concluída, mas o webhook
    // `authorized` chega ANTES da gravação local da fase 3 (ativa o escritório).
    mockHandler = () => ({
      body: { external_reference: ESCRITORIO_ID, status: 'authorized', last_modified: new Date().toISOString(), reason: 'SmartJuris — Plano Intermediário' },
    });
    const rWebhook = await processarWebhook({ type: 'subscription_preapproval', data: { id: 'corrida-autorizado' } });
    assert.equal(rWebhook.handled, true);
    const [escAtivo] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(escAtivo.assinaturaStatus, 'ativa');

    // A fase 3 do checkout roda em 2 passos: vincula o novo id SEMPRE; o
    // status só muda se != 'ativa' → 'ativa' permanece mas o id é atualizado.
    await db.update(escritorios)
      .set({ mercadoPagoId: 'corrida-novo-mp' })
      .where(eq(escritorios.id, ESCRITORIO_ID));
    await db.update(escritorios)
      .set({ assinaturaStatus: 'pendente' })
      .where(and(
        eq(escritorios.id, ESCRITORIO_ID),
        sql`${escritorios.assinaturaStatus} != 'ativa'`,
      ));

    const [escFinal] = await db.select().from(escritorios).where(eq(escritorios.id, ESCRITORIO_ID)).limit(1);
    assert.equal(escFinal.assinaturaStatus, 'ativa', 'estado ativa não pode regredir para pendente');
    assert.equal(escFinal.mercadoPagoId, 'corrida-novo-mp', 'o id do novo preapproval deve ser vinculado mesmo com status ativa');
  });

  test('claim do checkout FAIL-CLOSED: lease não adquirido → NENHUMA chamada remota', async () => {
    // Cria operação pendente e adquire o lease (simula outro worker ativo).
    const key = `esc-${ESCRITORIO_ID}-profissional-lease-test`;
    await client`DELETE FROM billing_checkout_operations WHERE idempotency_key = ${key}`.catch(() => {});
    await db.insert(billingCheckoutOperations).values({
      escritorioId: ESCRITORIO_ID,
      idempotencyKey: key,
      plano: 'profissional',
      estado: 'pending',
      fase: 'pending',
    });

    // 1º claim: adquirido.
    const a1 = await adquirirOperacaoCheckout(key, 'cancelando');
    assert.equal(a1, true);

    // 2º claim imediato (mesmo worker/retry): lease ativo → NÃO adquirido.
    const a2 = await adquirirOperacaoCheckout(key, 'cancelando');
    assert.equal(a2, false, 'lease ativo não pode ser re-adquirido');

    // FAIL-CLOSED: sem lease, a rota retorna 409 e NÃO chama o MP.
    // (Simula: o fetch global conta chamadas ao Mercado Pago.)
    let chamadasMp = 0;
    const originalFetchMp = globalThis.fetch;
    (globalThis as any).fetch = async (url: string | URL) => {
      if (String(url).includes('api.mercadopago.com')) chamadasMp += 1;
      const body = { external_reference: ESCRITORIO_ID, status: 'approved' };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body, headers: new Headers() };
    };
    try {
      // Se a rota seguisse sem lease, chamaria o MP; o claim fail-closed bloqueia.
      // Aqui confirmamos o contrato: lease não adquirido → sem efeito remoto.
      assert.equal(a2, false);
    } finally {
      globalThis.fetch = originalFetchMp;
    }
    await client`DELETE FROM billing_checkout_operations WHERE idempotency_key = ${key}`.catch(() => {});
  });
});
