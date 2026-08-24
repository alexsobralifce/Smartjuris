// ===========================================================================
// Regressão — troca de senha após reset (root).
//
// Bug corrigido: `/trocar-senha` retornava 401 para "senha atual incorreta",
// e o frontend trata TODO 401 como "sessão expirada" (derruba a sessão).
// Agora o erro de validação é 400 + code SENHA_ATUAL_INCORRETA (a sessão
// permanece válida e o usuário vê o erro).
//
// Cobre: login com senha temporária (precisaTrocarSenha=true) → erro de
// senha atual (400, sessão preservada) → troca correta (200, novo login
// funciona com a nova senha).
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
import { escritorios, usuarios } from '../db/schema.js';
import authRoutes from '../routes/auth.js';

process.env.REQUIRE_EMAIL_OTP = 'false';

const ESCR_ID = randomUUID();
const USER_ID = randomUUID();
const SENHA_TEMP = 'Temp#2026';
const SENHA_NOVA = 'NovaSenha#2026';
const EMAIL = `troca.${randomUUID().slice(0, 8)}@teste.local`;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

before(async () => {
  await db.insert(escritorios).values({ id: ESCR_ID, nome: 'Troca Senha Teste', plano: 'basico' }).onConflictDoNothing();
  await db.insert(usuarios).values({
    id: USER_ID,
    nome: 'Usuário Troca',
    email: EMAIL,
    senha: await bcrypt.hash(SENHA_TEMP, 4),
    role: 'admin',
    ativo: true,
    escritorioId: ESCR_ID,
    emailVerificado: true,
    precisaTrocarSenha: true, // senha foi RESETADA pelo root
  }).onConflictDoNothing();
});

after(async () => {
  await new Promise<void>((r) => { (server as any).closeAllConnections?.(); server.close(() => r()); });
  await client`DELETE FROM usuarios WHERE id = ${USER_ID}`.catch(() => {});
  await client`DELETE FROM escritorios WHERE id = ${ESCR_ID}`.catch(() => {});
  await client.end({ timeout: 5 }).catch(() => {});
});

function cookieOf(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

async function login(senha: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: senha }),
  });
  assert.equal(res.status, 200, `login falhou: ${await res.text()}`);
  return cookieOf(res) ?? '';
}

async function trocar(cookie: string, senhaAtual: string, novaSenha: string) {
  return fetch(`${baseUrl}/api/auth/trocar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${cookie}` },
    body: JSON.stringify({ senhaAtual, novaSenha }),
  });
}

describe('trocar-senha após reset (regressão)', () => {
  test('senha atual INCORRETA → 400 + code (não 401 — sessão NÃO cai)', async () => {
    const cookie = await login(SENHA_TEMP);
    const res = await trocar(cookie, 'senha-errada', SENHA_NOVA);
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(body)}`);
    assert.equal(body.code, 'SENHA_ATUAL_INCORRETA');
  });

  test('senha atual correta → 200, precisaTrocarSenha=false e novo login funciona', async () => {
    const cookie = await login(SENHA_TEMP);
    const res = await trocar(cookie, SENHA_TEMP, SENHA_NOVA);
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.user?.precisaTrocarSenha, false);

    // Novo login com a nova senha funciona; a temporária não funciona mais.
    const novoCookie = await login(SENHA_NOVA);
    assert.ok(novoCookie.length > 0, 'login com a nova senha funciona');
    const tempRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: SENHA_TEMP }),
    });
    assert.equal(tempRes.status, 401, 'senha temporária não funciona mais');
  });
});
