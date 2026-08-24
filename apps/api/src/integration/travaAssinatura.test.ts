// ===========================================================================
// Testes da TRAVA do plano demo (self-service não assinante):
//   1 peça gerada + 10 clientes cadastrados.
//
// Regras:
//   - flag TRAVA_ASSINATURA off → tudo liberado (fluxo atual inalterado);
//   - assinante (assinatura_status='ativa') → liberado;
//   - escritório NÃO-demo (criado pelo root/legado) → isento;
//   - self-service demo não assinante → 1 peça e 10 clientes (limite).
//
// App Express real + autenticação (login). Sem serviços externos.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios, usuarios, pecas, clientes } from '../db/schema.js';
import { globalApiLimiter } from '../middlewares/rateLimit.js';
import { authMiddleware } from '../middlewares/auth.js';
import { refreshSession } from '../middlewares/refreshSession.js';
import { rejectRoot } from '../middlewares/rejectRoot.js';
import { forcePasswordChange } from '../middlewares/forcePasswordChange.js';
import authRoutes from '../routes/auth.js';
import clientesRoutes from '../routes/clientes.js';
import pecasRoutes from '../routes/pecas.js';

process.env.REQUIRE_EMAIL_OTP = 'false';
process.env.TRAVA_ASSINATURA = 'true';
delete process.env.TRAVA_LIMITE_PECAS;
delete process.env.TRAVA_LIMITE_CLIENTES;

const SUFIXO = randomUUID().slice(0, 8);
const SENHA = 'Trava#2026';

const ESCR_DEMO = randomUUID();        // self-service, sem assinatura → trava
const ESCR_ASSINANTE = randomUUID();   // assinatura ativa → liberado
const ESCR_NAO_DEMO = randomUUID();    // criado pelo root (isDemo=false) → isento
const UIDS: string[] = [];

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/clientes', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, clientesRoutes);
app.use('/api/pecas', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, pecasRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

before(async () => {
  const senhaHash = await bcrypt.hash(SENHA, 4);
  await db.insert(escritorios).values([
    { id: ESCR_DEMO, nome: 'Trava Demo', plano: 'basico', isDemo: true },
    { id: ESCR_ASSINANTE, nome: 'Trava Assinante', plano: 'basico', isDemo: true, assinaturaStatus: 'ativa', assinaturaPlano: 'basico' },
    { id: ESCR_NAO_DEMO, nome: 'Trava Nao Demo', plano: 'basico', isDemo: false },
  ]).onConflictDoNothing();
  for (const escId of [ESCR_DEMO, ESCR_ASSINANTE, ESCR_NAO_DEMO]) {
    const uid = randomUUID();
    UIDS.push(uid);
    await db.insert(usuarios).values({
      id: uid, nome: 'Admin Trava',
      email: `trava.${escId.slice(0, 8)}.${SUFIXO}@teste.local`,
      senha: senhaHash, role: 'admin', ativo: true,
      escritorioId: escId, emailVerificado: true,
    }).onConflictDoNothing();
  }
});

after(async () => {
  await new Promise<void>((r) => { (server as any).closeAllConnections?.(); server.close(() => r()); });
  delete process.env.TRAVA_ASSINATURA;
  await client`DELETE FROM pecas WHERE escritorio_id IN (${ESCR_DEMO}, ${ESCR_ASSINANTE}, ${ESCR_NAO_DEMO})`.catch(() => {});
  await client`DELETE FROM clientes WHERE escritorio_id IN (${ESCR_DEMO}, ${ESCR_ASSINANTE}, ${ESCR_NAO_DEMO})`.catch(() => {});
  await client`DELETE FROM usuarios WHERE id = ANY(${UIDS}::uuid[])`.catch(() => {});
  await client`DELETE FROM escritorios WHERE id IN (${ESCR_DEMO}, ${ESCR_ASSINANTE}, ${ESCR_NAO_DEMO})`.catch(() => {});
  await client.end({ timeout: 5 }).catch(() => {});
});

function cookieOf(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

async function login(escId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `trava.${escId.slice(0, 8)}.${SUFIXO}@teste.local`, password: SENHA }),
  });
  assert.equal(res.status, 200, `login falhou: ${await res.text()}`);
  return cookieOf(res) ?? '';
}

function authed(token: string) {
  return { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` };
}

async function criarCliente(token: string, nome: string) {
  return fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({ tipo: 'PF', nome, cpfCnpj: '12345678901', email: `${nome}@teste.local`, telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'CE', qualificacao: '' }),
  });
}

async function salvarPeca(token: string) {
  return fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({
      tipo: 'Petição Inicial', area: 'Cível', cliente: 'Cliente Teste',
      status: 'revisao', prazo: '2026-12-31', modelo: 'peticao-inicial', fontes: 0,
      conteudo: 'Conteúdo de teste da peça.', idempotencyKey: randomUUID(),
    }),
  });
}

describe('trava do plano demo', () => {
  test('demo sem assinatura: 1ª peça OK, 2ª BLOQUEADA (403 TRAVA_PLANO_DEMO)', async () => {
    const token = await login(ESCR_DEMO);
    const r1 = await salvarPeca(token);
    assert.equal(r1.status, 201, `1ª peça deveria passar: ${await r1.text()}`);
    const r2 = await salvarPeca(token);
    const b2 = await r2.json().catch(() => ({}));
    assert.equal(r2.status, 403, JSON.stringify(b2));
    assert.equal(b2.code, 'TRAVA_PLANO_DEMO');
    assert.equal(b2.limite, 1);
  });

  test('demo sem assinatura: 10º cliente OK, 11º BLOQUEADO (403 TRAVA_PLANO_DEMO)', async () => {
    const token = await login(ESCR_DEMO);
    for (let i = 1; i <= 10; i++) {
      const r = await criarCliente(token, `Cliente ${i}`);
      assert.equal(r.status, 201, `cliente ${i} deveria passar: ${await r.text()}`);
    }
    const r11 = await criarCliente(token, 'Cliente 11');
    const b11 = await r11.json().catch(() => ({}));
    assert.equal(r11.status, 403, JSON.stringify(b11));
    assert.equal(b11.code, 'TRAVA_PLANO_DEMO');
    assert.equal(b11.limite, 10);
  });

  test('assinante (status ativa) → SEM limite', async () => {
    const token = await login(ESCR_ASSINANTE);
    const r1 = await salvarPeca(token);
    assert.equal(r1.status, 201, await r1.text());
    const r2 = await salvarPeca(token);
    assert.equal(r2.status, 201, `assinante pode gerar várias peças: ${await r2.text()}`);
  });

  test('escritório NÃO-demo (criado pelo root) → ISENTO da trava', async () => {
    const token = await login(ESCR_NAO_DEMO);
    const r1 = await salvarPeca(token);
    assert.equal(r1.status, 201, await r1.text());
    const r2 = await salvarPeca(token);
    assert.equal(r2.status, 201, `não-demo isento: ${await r2.text()}`);
  });

  test('flag TRAVA_ASSINATURA off → fluxo atual inalterado (demo liberado)', async () => {
    const saved = process.env.TRAVA_ASSINATURA;
    process.env.TRAVA_ASSINATURA = 'false';
    try {
      const token = await login(ESCR_DEMO);
      const r = await salvarPeca(token);
      assert.equal(r.status, 201, `flag off → liberado: ${await r.text()}`);
    } finally {
      if (saved !== undefined) process.env.TRAVA_ASSINATURA = saved;
      else delete process.env.TRAVA_ASSINATURA;
    }
  });
});
