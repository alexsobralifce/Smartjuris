// ===========================================================================
// Fase 7D — Checkout Promocional (1ª compra avulsa com 50% OFF).
//
// Cobre (requisitos 7D):
//   - preference criada com valor promocional calculado NO BACKEND (90/150/250);
//   - external_reference com marcador `sj-promo:` (identificação no webhook 7E);
//   - uso da promoção PERSISTIDO antes de retornar o init_point;
//   - retry reutiliza a preference pendente (não duplica);
//   - falha remota desmarca o uso (elegibilidade restaurada);
//   - escritório não elegível → 409 com motivo.
//
// App Express real (auth + billing) + fetch global mockado (Mercado Pago).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql, eq } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios, usuarios, billingCheckoutOperations } from '../db/schema.js';
import { globalApiLimiter } from '../middlewares/rateLimit.js';
import { authMiddleware } from '../middlewares/auth.js';
import { refreshSession } from '../middlewares/refreshSession.js';
import { rejectRoot } from '../middlewares/rejectRoot.js';
import { forcePasswordChange } from '../middlewares/forcePasswordChange.js';
import authRoutes from '../routes/auth.js';
import billingRoutes from '../routes/billing.js';

// ---------------------------------------------------------------------------
// 0. Ambiente determinístico.
// ---------------------------------------------------------------------------
process.env.REQUIRE_EMAIL_OTP = 'false';
process.env.PROMOCAO_ATIVA = 'true';
process.env.PROMOCAO_PERCENTUAL = '50';
delete process.env.PROMOCAO_VALIDADE;
process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-mock-token';
process.env.APP_URL = 'https://app.test.local';
process.env.PUBLIC_API_URL = 'https://api.test.local';

const SUFIXO = randomUUID().slice(0, 8);
const SENHA = 'Promo#2026';

// IDs de escritórios/usuários criados (limpeza no after).
const ESCR_FELIZ = randomUUID();
const ESCR_RETRY = randomUUID();
const ESCR_FALHA = randomUUID();
const ESCR_AMBIGUA = randomUUID();
const ESCR_RECONC_ERR = randomUUID();
const ESCR_PERSIST = randomUUID();
const ESCR_APROVADA = randomUUID();
const ESCR_500_INVALID = randomUUID();
const ESCR_NAO_ELEGIVEL = randomUUID();
const usuariosCriados: string[] = [];

// ---------------------------------------------------------------------------
// 1. Mock do fetch global (API do Mercado Pago): responde por URL.
// ---------------------------------------------------------------------------
type MpHandler = (url: string, init?: RequestInit) => { status?: number; body?: unknown };
let mockHandler: MpHandler = () => ({ body: {} });
let ultimoBodyMp: any = null;
let tokenFeliz = '';
const originalFetch = globalThis.fetch;

before(async () => {
  // Mock SOMENTE do Mercado Pago (api.mercadopago.com); requisições locais
  // (login no Express de teste) usam o fetch original.
  (globalThis as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (!path.includes('api.mercadopago.com')) {
      return originalFetch(url, init);
    }
    const resp = mockHandler(path, init);
    if (init?.body) {
      try { ultimoBodyMp = JSON.parse(String(init.body)); } catch { /* não-JSON */ }
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

  // Escritórios e usuários admin (login real).
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const novos = [
    { id: ESCR_FELIZ, nome: 'Promo Feliz', plano: 'basico' },
    { id: ESCR_RETRY, nome: 'Promo Retry', plano: 'basico' },
    { id: ESCR_FALHA, nome: 'Promo Falha', plano: 'basico' },
    { id: ESCR_AMBIGUA, nome: 'Promo Ambigua', plano: 'basico' },
    { id: ESCR_RECONC_ERR, nome: 'Promo Reconcilia Erro', plano: 'basico' },
    { id: ESCR_PERSIST, nome: 'Promo Persistencia', plano: 'basico' },
    { id: ESCR_APROVADA, nome: 'Promo Aprovada', plano: 'basico' },
    { id: ESCR_500_INVALID, nome: 'Promo 500 Invalid', plano: 'basico' },
    { id: ESCR_NAO_ELEGIVEL, nome: 'Promo Ja Usou', plano: 'basico', promocaoUsada: true, promocaoPlano: 'basico', promocaoValorCents: 9000 },
  ];
  for (const e of novos) {
    await db.insert(escritorios).values(e).onConflictDoNothing();
    const uid = randomUUID();
    usuariosCriados.push(uid);
    await db.insert(usuarios).values({
      id: uid,
      nome: 'Admin Promo',
      email: `promo.${e.id.slice(0, 8)}.${SUFIXO}@teste.local`,
      senha: senhaHash,
      role: 'admin',
      ativo: true,
      escritorioId: e.id,
      emailVerificado: true,
    }).onConflictDoNothing();
  }
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((r) => server.close(() => r()));
  for (const k of ['PROMOCAO_ATIVA', 'PROMOCAO_PERCENTUAL', 'PROMOCAO_VALIDADE', 'MERCADO_PAGO_ACCESS_TOKEN', 'APP_URL', 'PUBLIC_API_URL']) {
    delete (process.env as any)[k];
  }
  await client`DELETE FROM billing_checkout_operations WHERE idempotency_key LIKE 'sj-promo-%'`.catch(() => {});
  await client`DELETE FROM usuarios WHERE id = ANY(${usuariosCriados}::uuid[])`.catch(() => {});
  await client`DELETE FROM escritorios WHERE id IN (${ESCR_FELIZ}, ${ESCR_RETRY}, ${ESCR_FALHA}, ${ESCR_AMBIGUA}, ${ESCR_RECONC_ERR}, ${ESCR_PERSIST}, ${ESCR_APROVADA}, ${ESCR_500_INVALID}, ${ESCR_NAO_ELEGIVEL})`.catch(() => {});
  await client.end({ timeout: 5 }).catch(() => {});
});

// ---------------------------------------------------------------------------
// 2. App Express real (auth + billing, mesmos middlewares de produção).
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
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

async function login(escritorioId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `promo.${escritorioId.slice(0, 8)}.${SUFIXO}@teste.local`, password: SENHA }),
  });
  assert.equal(res.status, 200, `login falhou: ${await res.text()}`);
  return cookieDoLogin(res) ?? '';
}

async function checkoutPromocional(token: string, plano = 'basico') {
  return fetch(`${baseUrl}/api/billing/checkout-promocional`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
    body: JSON.stringify({ plano }),
  });
}

describe('7D — checkout promocional', () => {
  test('feliz: preference com valor promocional backend + uso persistido antes do init_point', async () => {
    mockHandler = (url, init) => {
      if (url.endsWith('/checkout/preferences') && init?.method === 'POST') {
        return { body: { id: 'pref-1', init_point: 'https://mp.test/init/feliz', external_reference: 'sj-promo:' + ESCR_FELIZ } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    tokenFeliz = await login(ESCR_FELIZ);
    const res = await checkoutPromocional(tokenFeliz);
    const body = await res.json();

    assert.equal(res.status, 201, JSON.stringify(body));
    assert.equal(body.promocional, true);
    assert.equal(body.valorPromocionalCents, 9000, '50% de R$180 = R$90 (backend)');
    assert.equal(body.valorPromocional, 90);
    assert.equal(body.initPoint, 'https://mp.test/init/feliz');
    assert.equal(body.preferenceId, 'pref-1');

    // Payload enviado ao MP: unit_price promocional + marcador no external_reference.
    assert.equal(ultimoBodyMp?.items?.[0]?.unit_price, 90);
    assert.equal(ultimoBodyMp?.items?.[0]?.quantity, 1);
    assert.equal(ultimoBodyMp?.external_reference, 'sj-promo:' + ESCR_FELIZ);
    assert.equal(ultimoBodyMp?.notification_url, 'https://api.test.local/api/billing/webhook');
    assert.equal(ultimoBodyMp?.metadata?.promocional, true);

    // Uso PERSISTIDO (anti-abuso): promocao_usada=true com valor/plano/percentual.
    const [esc] = await db.select({
      promocaoUsada: escritorios.promocaoUsada,
      promocaoPlano: escritorios.promocaoPlano,
      promocaoValorCents: escritorios.promocaoValorCents,
      promocaoPercentual: escritorios.promocaoPercentual,
    }).from(escritorios).where(eq(escritorios.id, ESCR_FELIZ)).limit(1);
    assert.equal(esc?.promocaoUsada, true, 'uso persistido antes do init_point');
    assert.equal(esc?.promocaoPlano, 'basico');
    assert.equal(esc?.promocaoValorCents, 9000);
    assert.equal(esc?.promocaoPercentual, 50);
  });

  test('retry: preference pendente reutilizada (não duplica chamada ao MP)', async () => {
    let chamadas = 0;
    mockHandler = (url, init) => {
      if (url.endsWith('/checkout/preferences') && init?.method === 'POST') {
        chamadas++;
        return { body: { id: 'pref-retry', init_point: 'https://mp.test/init/retry', external_reference: 'sj-promo:' + ESCR_RETRY } };
      }
      if (url.includes('/checkout/preferences/pref-retry')) {
        return { body: { id: 'pref-retry', init_point: 'https://mp.test/init/retry' } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const token = await login(ESCR_RETRY);

    const r1 = await checkoutPromocional(token);
    const b1 = await r1.json().catch(() => ({}));
    assert.equal(r1.status, 201, JSON.stringify(b1));
    assert.equal(b1.preferenceId, 'pref-retry');

    const r2 = await checkoutPromocional(token);
    const b2 = await r2.json().catch(() => ({}));
    assert.equal(r2.status, 200, JSON.stringify(b2));
    assert.equal(b2.reutilizada, true, 'segundo clique reutiliza a preference pendente');
    assert.equal(b2.preferenceId, 'pref-retry');
    assert.equal(b2.initPoint, 'https://mp.test/init/retry');
    assert.equal(chamadas, 1, 'preference criada UMA única vez');
  });

  test('falha DEFINITIVA (4xx): uso DESMARCADO (elegibilidade restaurada)', async () => {
    mockHandler = () => ({ status: 400, body: { error: 'payload inválido' } });
    const token = await login(ESCR_FALHA);
    const res = await checkoutPromocional(token);
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 502, JSON.stringify(body));
    // Fail-closed: não expõe o corpo do provedor ao cliente.
    assert.ok(!JSON.stringify(body).includes('payload inválido'), 'erro não vaza detalhes do MP');

    // Compensação: promocao_usada voltou a false (não perde a promoção).
    const [esc] = await db.select({ promocaoUsada: escritorios.promocaoUsada })
      .from(escritorios).where(eq(escritorios.id, ESCR_FALHA)).limit(1);
    assert.equal(esc?.promocaoUsada, false, 'uso desmarcado após falha definitiva');
  });

  test('falha AMBÍGUA (5xx): uso NÃO desmarcado (retry reconcilia, sem duplicar benefício)', async () => {
    mockHandler = () => ({ status: 500, body: { error: 'MP indisponível' } });
    const token = await login(ESCR_AMBIGUA);
    const res = await checkoutPromocional(token);
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 502, JSON.stringify(body));
    assert.ok(!JSON.stringify(body).includes('MP indisponível'), 'erro não vaza detalhes do MP');

    // NÃO desmarcou: o efeito remoto é incerto (pode ter criado a preference).
    const [esc] = await db.select({ promocaoUsada: escritorios.promocaoUsada })
      .from(escritorios).where(eq(escritorios.id, ESCR_AMBIGUA)).limit(1);
    assert.equal(esc?.promocaoUsada, true, 'uso NÃO desmarcado em falha ambígua');

    // Retry com MP disponível → RECONCILIA a preference existente (recupera,
    // não cria outra nem reaplica o benefício).
    let chamadasPost = 0;
    mockHandler = (url, init) => {
      if (url.includes('/checkout/preferences/search')) {
        return { body: { results: [{ id: 'pref-reconciliada', status: 'active', init_point: 'https://mp.test/init/recon' }] } };
      }
      if (url.includes('/checkout/preferences/pref-reconciliada')) {
        return { body: { id: 'pref-reconciliada', init_point: 'https://mp.test/init/recon' } };
      }
      if (url.endsWith('/checkout/preferences') && init?.method === 'POST') {
        chamadasPost++;
        return { body: { id: 'pref-NOVA', init_point: 'https://mp.test/init/nova' } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const r2 = await checkoutPromocional(token);
    const b2 = await r2.json().catch(() => ({}));
    assert.equal(r2.status, 200, JSON.stringify(b2));
    assert.equal(b2.reutilizada, true);
    assert.equal(b2.preferenceId, 'pref-reconciliada');
    assert.equal(chamadasPost, 0, 'retry RECONCILIA — não cria preference nova');
  });

  test('falha ambígua + preference APROVADA no MP → NÃO desmarca, NÃO recria cobrança', async () => {
    // 1ª tentativa: falha ambígua (5xx) → operação failed + incerta, uso mantido.
    mockHandler = () => ({ status: 500, body: { error: 'MP indisponível' } });
    const token = await login(ESCR_APROVADA);
    const r1 = await checkoutPromocional(token);
    const b1 = await r1.json().catch(() => ({}));
    assert.equal(r1.status, 502, JSON.stringify(b1));

    // Retry: a preference EXISTE mas já está APROVADA (pagamento concluído).
    // NUNCA pode ser tratada como ausência → NÃO desmarca, NÃO cria nova.
    let chamadasPost = 0;
    mockHandler = (url, init) => {
      if (url.includes('/checkout/preferences/search')) {
        return { body: { results: [{ id: 'pref-aprovada', status: 'approved', init_point: 'https://mp.test/init/aprovada' }] } };
      }
      if (url.endsWith('/checkout/preferences') && init?.method === 'POST') {
        chamadasPost++;
        return { body: { id: 'pref-NOVA', init_point: 'https://mp.test/init/nova' } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const r2 = await checkoutPromocional(token);
    const b2 = await r2.json().catch(() => ({}));
    assert.equal(r2.status, 409, JSON.stringify(b2));
    assert.equal(b2.code, 'PROMOCAO_PAGAMENTO_CONCLUIDO');
    assert.equal(chamadasPost, 0, 'NENHUMA nova preference criada');

    // Uso permanece marcado (o benefício foi consumido pelo pagamento real).
    const [esc] = await db.select({ promocaoUsada: escritorios.promocaoUsada })
      .from(escritorios).where(eq(escritorios.id, ESCR_APROVADA)).limit(1);
    assert.equal(esc?.promocaoUsada, true, 'uso NÃO desmarcado com preference aprovada');
  });

  test('HTTP 500 com corpo contendo termos 4xx ("invalid") → AMBÍGUO: NÃO desmarca', async () => {
    // A classificação usa o STATUS HTTP, nunca o corpo: um 5xx cujo corpo
    // contém "invalid" NÃO pode virar falha definitiva.
    mockHandler = () => ({ status: 500, body: { error: 'invalid token: bad request not found' } });
    const token = await login(ESCR_500_INVALID);
    const res = await checkoutPromocional(token);
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 502, JSON.stringify(body));

    const [esc] = await db.select({ promocaoUsada: escritorios.promocaoUsada })
      .from(escritorios).where(eq(escritorios.id, ESCR_500_INVALID)).limit(1);
    assert.equal(esc?.promocaoUsada, true, '5xx com corpo enganoso → uso NÃO desmarcado');
  });

  test('reconciliação INCONCLUSIVA (search falha) → 502, uso NÃO desmarcado', async () => {
    // 1ª tentativa: falha ambígua (5xx) → operação failed + incerta, uso mantido.
    mockHandler = () => ({ status: 500, body: { error: 'MP indisponível' } });
    const token = await login(ESCR_RECONC_ERR);
    const r1 = await checkoutPromocional(token);
    const b1 = await r1.json().catch(() => ({}));
    assert.equal(r1.status, 502, JSON.stringify(b1));

    // Retry: busca de reconciliação TAMBÉM falha (inconclusiva) → 502 e NÃO
    // desmarca (busca falha ≠ ausência confirmada; evita duplicar benefício).
    mockHandler = (url) => {
      if (url.includes('/checkout/preferences/search')) {
        return { status: 500, body: { error: 'search indisponível' } };
      }
      return { status: 500, body: { error: 'MP indisponível' } };
    };
    const r2 = await checkoutPromocional(token);
    const b2 = await r2.json().catch(() => ({}));
    assert.equal(r2.status, 502, JSON.stringify(b2));
    assert.equal(b2.code, 'PROMOCAO_RECONCILIACAO_INDISPONIVEL');

    const [esc] = await db.select({ promocaoUsada: escritorios.promocaoUsada })
      .from(escritorios).where(eq(escritorios.id, ESCR_RECONC_ERR)).limit(1);
    assert.equal(esc?.promocaoUsada, true, 'busca inconclusiva → uso NÃO desmarcado');
  });

  test('falha de persistência pós-efeito remoto: retry RECUPERA a preference (sem duplicar)', async () => {
    // 1ª tentativa: preference criada no MP (id pref-persist), mas simulamos
    // que a gravação local do resultado falhou (operação fica pending sem id).
    mockHandler = (url, init) => {
      if (url.endsWith('/checkout/preferences') && init?.method === 'POST') {
        return { body: { id: 'pref-persist', init_point: 'https://mp.test/init/persist' } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const token = await login(ESCR_PERSIST);
    const r1 = await checkoutPromocional(token);
    const b1 = await r1.json().catch(() => ({}));
    assert.equal(r1.status, 201, JSON.stringify(b1));
    // Simula a falha: remove o id da operação local (fica pending sem id) —
    // como se o insert do created tivesse falhado após o efeito remoto.
    await db.update(billingCheckoutOperations)
      .set({ estado: 'pending', mercadoPagoId: null })
      .where(eq(billingCheckoutOperations.idempotencyKey, 'sj-promo-' + ESCR_PERSIST + '-basico'));

    // Retry: reconcilia por external_reference → recupera pref-persist.
    let chamadasPost = 0;
    mockHandler = (url, init) => {
      if (url.includes('/checkout/preferences/search')) {
        return { body: { results: [{ id: 'pref-persist', status: 'active', init_point: 'https://mp.test/init/persist' }] } };
      }
      if (url.includes('/checkout/preferences/pref-persist')) {
        return { body: { id: 'pref-persist', init_point: 'https://mp.test/init/persist' } };
      }
      if (url.endsWith('/checkout/preferences') && init?.method === 'POST') {
        chamadasPost++;
        return { body: { id: 'pref-NOVA', init_point: 'https://mp.test/init/nova' } };
      }
      return { status: 404, body: { error: 'rota inesperada: ' + url } };
    };
    const r2 = await checkoutPromocional(token);
    const b2 = await r2.json().catch(() => ({}));
    assert.equal(r2.status, 200, JSON.stringify(b2));
    assert.equal(b2.reutilizada, true);
    assert.equal(b2.preferenceId, 'pref-persist');
    assert.equal(chamadasPost, 0, 'retry recupera — não cria preference nova');
  });

  test('resposta incompleta do MP (sem init_point) → NÃO retorna 201 (fail-closed)', async () => {
    const ESCR_INCOMPLETO = randomUUID();
    const uidIncompleto = randomUUID();
    const senhaHash = await bcrypt.hash(SENHA, 4);
    await db.insert(escritorios).values({ id: ESCR_INCOMPLETO, nome: 'Promo Incompleta', plano: 'basico' }).onConflictDoNothing();
    await db.insert(usuarios).values({
      id: uidIncompleto,
      nome: 'Admin Incompleto',
      email: `promo.${ESCR_INCOMPLETO.slice(0, 8)}.${SUFIXO}@teste.local`,
      senha: senhaHash,
      role: 'admin',
      ativo: true,
      escritorioId: ESCR_INCOMPLETO,
      emailVerificado: true,
    }).onConflictDoNothing();
    usuariosCriados.push(uidIncompleto);
    try {
      mockHandler = () => ({ body: { id: 'pref-sem-init' } }); // 200 mas SEM init_point
      const token = await login(ESCR_INCOMPLETO);
      const res = await checkoutPromocional(token);
      const body = await res.json().catch(() => ({}));
      assert.equal(res.status, 502, JSON.stringify(body));
      // Ambíguo: uso NÃO desmarcado (não sabemos se o MP criou o recurso).
      const [esc] = await db.select({ promocaoUsada: escritorios.promocaoUsada })
        .from(escritorios).where(eq(escritorios.id, ESCR_INCOMPLETO)).limit(1);
      assert.equal(esc?.promocaoUsada, true, 'resposta incompleta = ambígua → uso mantido');
    } finally {
      await client`DELETE FROM escritorios WHERE id = ${ESCR_INCOMPLETO}`.catch(() => {});
    }
  });

  test('não elegível (já usou a promoção) → 409 com motivo', async () => {
    mockHandler = () => ({ body: {} });
    const token = await login(ESCR_NAO_ELEGIVEL);
    const res = await checkoutPromocional(token);
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'PROMOCAO_NAO_ELEGIVEL');
    assert.equal(body.motivo, 'promocao-ja-usada');
  });

  test('promoção inativa → 400 (fluxo normal de assinatura inalterado)', async () => {
    const saved = process.env.PROMOCAO_ATIVA;
    process.env.PROMOCAO_ATIVA = 'false';
    try {
      mockHandler = () => ({ body: {} });
      const res = await checkoutPromocional(tokenFeliz);
      const body = await res.json().catch(() => ({}));
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(body.code, 'PROMOCAO_INATIVA');
    } finally {
      if (saved !== undefined) process.env.PROMOCAO_ATIVA = saved;
      else delete process.env.PROMOCAO_ATIVA;
    }
  });
});
