// ===========================================================================
// Fase 3C — Integração HTTP da rota POST /api/pecas/gerar-sse.
//
// Cobre o encadeamento REAL: autenticação (login + cookie), middlewares,
// validação do schema (Zod), headers SSE e serialização dos eventos.
// O DeepSeek é mutado para um stream falso (mesmo padrão da suíte 2A).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { sql, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import express from 'express';
import cookieParser from 'cookie-parser';

// 0. Carrega .env (JWT_SECRET etc.) antes de qualquer import do app.
import { readFileSync } from 'node:fs';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  try {
    const env = readFileSync(new URL('../../../../.env', import.meta.url), 'utf8');
    const m = env.match(/^JWT_SECRET=(.+)$/m);
    if (m) process.env.JWT_SECRET = m[1].trim();
  } catch { /* config.ts cuida */ }
}
await import('../config.js');

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { deepseekClient } = await import('../services/ai.js');
const { default: authRoutes } = await import('../routes/auth.js');
const { default: pecasRoutes } = await import('../routes/pecas.js');
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { globalApiLimiter } = await import('../middlewares/rateLimit.js');

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const suffix = randomUUID().slice(0, 8);
const escIds: string[] = [];
const userIds: string[] = [];
let escId = '';
let usuarioId = '';
let token = '';

// App Express real (mesmos middlewares da montagem de produção).
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/pecas', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, pecasRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// Mock do DeepSeek: stream falso com usage real no chunk final.
function mockStreamDeepSeek() {
  (deepseekClient as any).chat = {
    completions: {
      create: async (params: any) => {
        const content = params.messages?.[1]?.content ?? '';
        return (async function* () {
          yield { choices: [{ delta: { content: 'Texto gerado da peça.' } }] };
          yield { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } };
        })();
      },
    },
  };
}

before(async () => {
  if (!dbDisponivel) return;
  const [esc] = await db.insert(s.escritorios).values([
    { nome: `HTTP-SSE ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escId = esc.id;
  escIds.push(esc.id);
  const hash = await bcrypt.hash('Senha#2026', 10);
  const [u] = await db.insert(s.usuarios).values([
    { nome: 'HTTP SSE', email: `http.sse.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: esc.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id });
  usuarioId = u.id;
  userIds.push(u.id);

  // Login real para obter o cookie JWT.
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `http.sse.${suffix}@teste.local`, password: 'Senha#2026' }),
  });
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/smartjuris_token=([^;]+)/);
  if (m) token = m[1];
  mockStreamDeepSeek();
});

after(async () => {
  if (dbDisponivel) {
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  server.close();
  await client.end({ timeout: 5 });
});

describe('3C — rota HTTP /api/pecas/gerar-sse', { skip: !dbDisponivel }, () => {
  test('POST autenticado → headers SSE + eventos serializados (operacao/progresso/texto/concluido)', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/gerar-sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `smartjuris_token=${token}`,
      },
      body: JSON.stringify({
        pieceType: 'Contestação',
        area: 'Cível',
        dadosCaso: `Caso HTTP ${suffix}`,
        idempotencyKey: `http-sse-${suffix}`,
      }),
    });
    assert.equal(res.status, 200, 'status 200');
    assert.equal(res.headers.get('content-type'), 'text/event-stream', 'header Content-Type SSE');
    const body = await res.text();
    const eventos = body.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.replace(/^data: /, '')));
    const tipos = eventos.map((e) => e.type);
    assert.ok(tipos.includes('operacao'), 'evento operacao');
    assert.ok(tipos.includes('progresso'), 'evento progresso');
    assert.ok(tipos.includes('texto'), 'evento texto');
    assert.ok(tipos.includes('concluido'), 'evento concluido');
    const concluido = eventos.find((e) => e.type === 'concluido');
    assert.ok(concluido.saldo && typeof concluido.saldo.credits === 'number', 'saldo no evento concluido');
  });

  test('POST sem idempotencyKey → 400 (validação Zod da rota)', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/gerar-sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
      body: JSON.stringify({ pieceType: 'Contestação' }), // sem idempotencyKey
    });
    assert.equal(res.status, 400, '400 por schema inválido');
  });

  test('POST sem autenticação → 401 (middleware auth)', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/gerar-sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pieceType: 'Contestação', idempotencyKey: `noauth-${suffix}` }),
    });
    assert.equal(res.status, 401, '401 sem cookie');
  });
});
