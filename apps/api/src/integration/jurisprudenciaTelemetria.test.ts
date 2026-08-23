// ===========================================================================
// Fase 6E — Integração HTTP: GET /api/jurisprudencias/telemetria.
//
// Monta um app Express mínimo com a rota real (authMiddleware + rejectRoot +
// requireAdmin) e valida:
//   - admin autenticado recebe 200 com os contadores da telemetria;
//   - usuário comum (role user) recebe 403 (requireAdmin);
//   - o payload não expõe dados sensíveis (termos, decisões, ids de escritório).
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { eq, sql } from 'drizzle-orm';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { default: authRoutes } = await import('../routes/auth.js');
const { default: jurisprudenciasRoutes } = await import('../routes/jurisprudencias.js');
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { buscarJurisprudenciaSeNecessario, resetTelemetriaJurisprudencia, limparCache, limparRateLimit } = await import('../services/jurisprudenciaRag.js');

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const SENHA = 'TeleSenha#2026';
const suffix = randomUUID().slice(0, 8);
const baseUrl = `http://127.0.0.1:${((globalThis as any).__telePort as number) ?? 0}`;

function cookieDoLogin(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

describe('6E — endpoint de telemetria da jurisprudência (HTTP)', { skip: !dbDisponivel }, () => {
  let server: any;
  let url = '';
  let escId = '';
  let adminId = '';
  let userId = '';
  let adminToken = '';
  let userToken = '';
  let chamadasMock = 0;

  before(async () => {
    resetTelemetriaJurisprudencia();
    limparCache();
    limparRateLimit();

    // Escritório + admin + user para o teste de auth.
    const hash = await bcrypt.hash(SENHA, 4);
    const [esc] = await db.insert(s.escritorios).values({
      nome: `Tele ${suffix}`,
      plano: 'office',
      creditsAvailable: 100,
      reserveCentsUsed: 0,
      cycleMonth: sql`to_char(now(), 'YYYY-MM')`,
    }).returning({ id: s.escritorios.id });
    escId = esc.id;
    const [admin] = await db.insert(s.usuarios).values({
      nome: 'Admin Tele', email: `admin.tele.${suffix}@teste.com`, senha: hash, role: 'admin', escritorioId: esc.id, ativo: true,
    }).returning({ id: s.usuarios.id });
    adminId = admin.id;
    const [user] = await db.insert(s.usuarios).values({
      nome: 'User Tele', email: `user.tele.${suffix}@teste.com`, senha: hash, role: 'user', escritorioId: esc.id, ativo: true,
    }).returning({ id: s.usuarios.id });
    userId = user.id;

    // App mínimo com a rota real (mesmos middlewares da produção).
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/jurisprudencias', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, jurisprudenciasRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Logins.
    async function login(email: string): Promise<string> {
      const res = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: SENHA }),
      });
      assert.equal(res.status, 200, `login ${email}: ${await res.text()}`);
      const token = cookieDoLogin(res);
      assert.ok(token, 'cookie emitido');
      return token!;
    }
    adminToken = await login(`admin.tele.${suffix}@teste.com`);
    userToken = await login(`user.tele.${suffix}@teste.com`);
  });

  after(async () => {
    try { server?.close(); } catch { /* best-effort */ }
    await db.execute(sql`DELETE FROM token_usage WHERE usuario_id IN (${adminId}, ${userId})`).catch(() => {});
    await db.execute(sql`DELETE FROM usuarios WHERE id IN (${adminId}, ${userId})`).catch(() => {});
    await db.delete(s.escritorios).where(eq(s.escritorios.id, escId)).catch(() => {});
    resetTelemetriaJurisprudencia();
    limparRateLimit();
    await client.end({ timeout: 5 });
  });

  test('admin recebe 200 com contadores reais (chamada ao vivo + cache hit) e sem dados sensíveis', async () => {
    // Incrementa os contadores via o caminho REAL (mock apenas da API externa).
    const mock = async () => {
      chamadasMock += 1;
      return { data: [{ process_number: '61', court: 'stj', excerpt: 'Ementa do endpoint.' }], meta: { page: 0, per_page: 10, has_next_page: false }, rateLimit: { limit: '5', remaining: '2', reset: '60' } };
    };
    const input = { includeJurisprudence: true, area: 'Cível', fatos: 'telemetria do endpoint admin', escritorioId: escId, searchOverride: mock as never, rastreabilidade: (() => undefined) as never };
    await buscarJurisprudenciaSeNecessario(input);
    await buscarJurisprudenciaSeNecessario(input); // cache hit

    const res = await fetch(`${url}/api/jurisprudencias/telemetria`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const body = await res.json().catch(() => null);
    assert.equal(res.status, 200, `status ${res.status}: ${JSON.stringify(body)}`);
    assert.equal(body.chamadasAoVivo, 1, 'chamada ao vivo no endpoint');
    assert.equal(body.cacheHits, 1, 'cache hit no endpoint');
    assert.equal(body.ultimoRateLimitRestante, 2, 'rate limit restante da última chamada');
    assert.ok(typeof body.latenciaMediaMs === 'number' || body.latenciaMediaMs === null, 'latência exposta');
    assert.equal(chamadasMock, 1, 'segunda busca veio do cache');

    // Sem dados sensíveis: sem termos, decisões ou ids de escritório.
    const texto = JSON.stringify(body);
    assert.ok(!texto.includes('ementa') && !texto.includes('Ementa'), 'sem conteúdo de decisões');
    assert.ok(!texto.includes(escId), 'sem ids de escritório');
    assert.ok(!('termos' in body), 'sem termos de busca');
  });

  test('usuário comum recebe 403 (requireAdmin)', async () => {
    const res = await fetch(`${url}/api/jurisprudencias/telemetria`, { headers: { Authorization: `Bearer ${userToken}` } });
    assert.equal(res.status, 403, `status ${res.status} (esperado 403)`);
  });

  test('sem autenticação recebe 401', async () => {
    const res = await fetch(`${url}/api/jurisprudencias/telemetria`);
    assert.equal(res.status, 401, `status ${res.status} (esperado 401)`);
  });
});
