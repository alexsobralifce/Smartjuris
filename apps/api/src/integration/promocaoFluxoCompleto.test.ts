// ===========================================================================
// Fase 7G — Validação FINAL ponta a ponta do fluxo promocional (Opção C).
//
// Encadeia o fluxo REAL completo:
//   1. Escritório NOVO + admin (login real no Express);
//   2. /api/billing/planos expõe a promoção (50% OFF);
//   3. /api/billing/checkout-promocional → preference avulsa com R$90
//      (50% de R$180) + uso persistido (promocao_usada=true);
//   4. Webhook payment.approved com external_reference `sj-promo:<id>` →
//      escritório ATIVADO + 20 créditos + preapproval DEFINITIVO integral
//      (R$180) com 1ª cobrança ~30 dias;
//   5. /api/billing/status reflete: ativo, promoção consumida (inelegível);
//   6. Fluxo SEM promoção (flag off) permanece inalterado.
//
// App Express real (auth + billing + webhook) + fetch mockado (Mercado Pago).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios, usuarios } from '../db/schema.js';
import { globalApiLimiter } from '../middlewares/rateLimit.js';
import { authMiddleware } from '../middlewares/auth.js';
import { refreshSession } from '../middlewares/refreshSession.js';
import { rejectRoot } from '../middlewares/rejectRoot.js';
import { forcePasswordChange } from '../middlewares/forcePasswordChange.js';
import authRoutes from '../routes/auth.js';
import billingRoutes from '../routes/billing.js';
import billingWebhookRoutes from '../routes/billingWebhook.js';

process.env.REQUIRE_EMAIL_OTP = 'false';
process.env.PROMOCAO_ATIVA = 'true';
process.env.PROMOCAO_PERCENTUAL = '50';
delete process.env.PROMOCAO_VALIDADE;
process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-mock-token';
process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'segredo-7g';
process.env.APP_URL = 'https://app.test.local';
process.env.PUBLIC_API_URL = 'https://api.test.local';

const SUFIXO = randomUUID().slice(0, 8);
const SENHA = 'Promo#2026';

const ESCR_NOVO = randomUUID();
const ESCR_SEM_PROMO = randomUUID();
const UID_NOVO = randomUUID();
const UID_SEM_PROMO = randomUUID();

type MpHandler = (url: string, init?: RequestInit) => { status?: number; body?: unknown };
let mockHandler: MpHandler = () => ({ body: {} });
const originalFetch = globalThis.fetch;
let ultimoPreapprovalBody: any = null;
let chamadasPreapprovalPost = 0;

before(async () => {
  (globalThis as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (!path.includes('api.mercadopago.com')) {
      return originalFetch(url, init);
    }
    if (path.endsWith('/preapproval') && init?.method === 'POST') {
      chamadasPreapprovalPost++;
      try { ultimoPreapprovalBody = JSON.parse(String(init.body)); } catch { /* não-JSON */ }
    }
    const resp = mockHandler(path, init);
    const body = JSON.stringify(resp.body ?? {});
    return {
      ok: (resp.status ?? 200) < 400,
      status: resp.status ?? 200,
      text: async () => body,
      json: async () => JSON.parse(body),
      headers: new Headers(),
    } as unknown as Response;
  };

  const senhaHash = await bcrypt.hash(SENHA, 4);
  await db.insert(escritorios).values([
    { id: ESCR_NOVO, nome: '7G Novo Cliente', plano: 'basico' },
    { id: ESCR_SEM_PROMO, nome: '7G Sem Promo', plano: 'basico' },
  ]).onConflictDoNothing();
  for (const [uid, escId] of [[UID_NOVO, ESCR_NOVO], [UID_SEM_PROMO, ESCR_SEM_PROMO]] as const) {
    await db.insert(usuarios).values({
      id: uid,
      nome: 'Admin 7G',
      email: `7g.${escId.slice(0, 8)}.${SUFIXO}@teste.local`,
      senha: senhaHash,
      role: 'admin',
      ativo: true,
      escritorioId: escId,
      emailVerificado: true,
    }).onConflictDoNothing();
  }
});

after(async () => {
  globalThis.fetch = originalFetch;
  // Fecha conexões keep-alive do servidor de teste antes do close (evita
  // processo pendurado após a suíte).
  (server as any).closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
  for (const k of ['PROMOCAO_ATIVA', 'PROMOCAO_PERCENTUAL', 'PROMOCAO_VALIDADE', 'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'APP_URL', 'PUBLIC_API_URL']) {
    delete (process.env as any)[k];
  }
  await client`DELETE FROM billing_webhook_events WHERE escritorio_id IN (${ESCR_NOVO}, ${ESCR_SEM_PROMO})`.catch(() => {});
  await client`DELETE FROM billing_checkout_operations WHERE escritorio_id IN (${ESCR_NOVO}, ${ESCR_SEM_PROMO})`.catch(() => {});
  await client`DELETE FROM usuarios WHERE id IN (${UID_NOVO}, ${UID_SEM_PROMO})`.catch(() => {});
  // Critério 7G: estado do banco limpo após o teste.
  await client`UPDATE escritorios SET mercado_pago_id = NULL, assinatura_status = 'nenhuma',
    promocao_usada = false, promocao_plano = NULL, promocao_valor_cents = NULL,
    promocao_ativa_em = NULL, promocao_percentual = NULL,
    credits_available = 0, cycle_month = NULL
    WHERE id IN (${ESCR_NOVO}, ${ESCR_SEM_PROMO})`.catch(() => {});
  await client`DELETE FROM escritorios WHERE id IN (${ESCR_NOVO}, ${ESCR_SEM_PROMO})`.catch(() => {});
  await client.end({ timeout: 5 }).catch(() => {});
});

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/billing/webhook', billingWebhookRoutes);
app.use('/api/billing', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, billingRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function cookieDoLogin(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

/** Assinatura x-signature válida (manifest do MP). */
function xSignature(dataId: string, requestId: string): string {
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', 'segredo-7g').update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

async function login(escritorioId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `7g.${escritorioId.slice(0, 8)}.${SUFIXO}@teste.local`, password: SENHA }),
  });
  assert.equal(res.status, 200, `login falhou: ${await res.text()}`);
  return cookieDoLogin(res) ?? '';
}

describe('7G — validação final ponta a ponta (Opção C)', () => {
  test('cliente novo: 1ª mensalidade 50% OFF (R$90) e recorrência INTEGRAL (R$180) no 2º mês', async () => {
    // ---- 1. Planos expõem a promoção ----
    mockHandler = () => ({ body: {} });
    const token = await login(ESCR_NOVO);
    const planosRes = await fetch(`${baseUrl}/api/billing/planos`, { headers: { Cookie: `smartjuris_token=${token}` } });
    const planosData = await planosRes.json();
    const basico = planosData.planos.find((p: any) => p.codigo === 'basico');
    assert.equal(basico.promocao?.valorPromocionalCents, 9000, 'plano expõe R$90 promocional');

    // ---- 2. Checkout promocional: preference avulsa R$90 ----
    mockHandler = (url, init) => {
      if (url.endsWith('/checkout_urls') && init?.method === 'POST') {
        return { body: { id: 'pref-7g', init_point: 'https://mp.test/init/7g', external_reference: 'sj-promo:' + ESCR_NOVO } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const coRes = await fetch(`${baseUrl}/api/billing/checkout-promocional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
      body: JSON.stringify({ plano: 'basico' }),
    });
    const coData = await coRes.json();
    assert.equal(coRes.status, 201, JSON.stringify(coData));
    assert.equal(coData.valorPromocionalCents, 9000, '1ª compra = R$90 (50% OFF)');

    // ---- 3. Webhook da 1ª compra: ativa + cria recorrência integral ----
    mockHandler = (url, init) => {
      if (url.endsWith('/v1/payments/pay-7g-1')) {
        return {
          body: {
            id: 'pay-7g-1',
            external_reference: 'sj-promo:' + ESCR_NOVO,
            status: 'approved',
            date_approved: new Date().toISOString(),
            date_created: new Date().toISOString(),
            payer: { email: `7g.${ESCR_NOVO.slice(0, 8)}.${SUFIXO}@teste.local` },
          },
        };
      }
      if (url.includes('/preapproval/search')) {
        return { body: { results: [] } };
      }
      if (url.endsWith('/preapproval') && init?.method === 'POST') {
        return { body: { id: 'preapp-7g', init_point: 'https://mp.test/preapp/7g', status: 'pending', external_reference: ESCR_NOVO } };
      }
      if (url.includes('/preapproval/preapp-7g')) {
        return { body: { id: 'preapp-7g', status: 'pending', auto_recurring: { start_date: new Date(Date.now() + 30 * 86400000).toISOString() } } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const whRes = await fetch(`${baseUrl}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': xSignature('pay-7g-1', 'req-7g'), 'x-request-id': 'req-7g' },
      body: JSON.stringify({ type: 'payment', data: { id: 'pay-7g-1' } }),
    });
    assert.equal(whRes.status, 200, await whRes.text());

    // ---- 4. Estado final: ativo, créditos, recorrência integral ~30d ----
    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_NOVO)).limit(1);
    assert.equal(esc.ativo, true, 'escritório ativado');
    assert.equal(esc.assinaturaStatus, 'ativa');
    assert.equal(esc.creditsAvailable, 20, '20 créditos do plano Básico recarregados');
    assert.equal(esc.mercadoPagoId, 'preapp-7g', 'recorrência definitiva vinculada');
    assert.ok(esc.assinaturaProximaCobranca instanceof Date, 'próxima cobrança gravada');

    // Preapproval DEFINITIVO: valor INTEGRAL R$180 (não R$90) + ~30 dias.
    assert.equal(chamadasPreapprovalPost, 1);
    assert.equal(ultimoPreapprovalBody?.auto_recurring?.transaction_amount, 180, 'recorrência integral no 2º mês');
    const diffDias = (Date.parse(ultimoPreapprovalBody?.auto_recurring?.start_date ?? '') - Date.now()) / 86400000;
    assert.ok(diffDias >= 28 && diffDias <= 32, `1ª cobrança da recorrência ~30 dias (${diffDias.toFixed(1)})`);

    // ---- 5. Status: promoção consumida (não reaplica) ----
    const stRes = await fetch(`${baseUrl}/api/billing/status`, { headers: { Cookie: `smartjuris_token=${token}` } });
    const stData = await stRes.json();
    assert.equal(stData.promocao.elegivel, false, 'promoção não reaplica após uso');
    assert.equal(stData.promocao.motivoIneligibilidade, 'promocao-ja-usada');
  });

  test('promoção INATIVA: fluxo normal inalterado (checkout promocional bloqueado, normal funciona)', async () => {
    const saved = process.env.PROMOCAO_ATIVA;
    process.env.PROMOCAO_ATIVA = 'false';
    try {
      mockHandler = () => ({ body: {} });
      const token = await login(ESCR_SEM_PROMO);

      // Checkout promocional bloqueado com 400 (flag off).
      const coRes = await fetch(`${baseUrl}/api/billing/checkout-promocional`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
        body: JSON.stringify({ plano: 'basico' }),
      });
      const coData = await coRes.json();
      assert.equal(coRes.status, 400, JSON.stringify(coData));
      assert.equal(coData.code, 'PROMOCAO_INATIVA');

      // Planos sem promoção.
      const planosRes = await fetch(`${baseUrl}/api/billing/planos`, { headers: { Cookie: `smartjuris_token=${token}` } });
      const planosData = await planosRes.json();
      assert.equal(planosData.promocao.ativa, false);
      assert.equal(planosData.planos[0].promocao, null, 'sem valor promocional exposto');

      // Checkout NORMAL (preapproval recorrente) segue funcionando.
      mockHandler = (url, init) => {
        if (url.endsWith('/preapproval') && init?.method === 'POST') {
          return { body: { id: 'preapp-normal', init_point: 'https://mp.test/normal', status: 'pending', external_reference: ESCR_SEM_PROMO } };
        }
        if (url.includes('/preapproval/search')) {
          return { body: { results: [] } };
        }
        return { status: 404, body: { error: 'rota inesperada: ' + url } };
      };
      const chRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
        body: JSON.stringify({ plano: 'basico' }),
      });
      const chData = await chRes.json();
      assert.equal(chRes.status, 201, JSON.stringify(chData));
      assert.equal(chData.initPoint, 'https://mp.test/normal', 'fluxo normal intacto');
    } finally {
      if (saved !== undefined) process.env.PROMOCAO_ATIVA = saved;
      else delete process.env.PROMOCAO_ATIVA;
    }
  });
});
