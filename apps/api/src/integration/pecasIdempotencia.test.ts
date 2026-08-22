// ===========================================================================
// Fase 3D — Idempotência DURÁVEL da persistência de peças (migration 0023).
//
// Garantias:
//   1. Replay do POST /api/pecas com a MESMA idempotencyKey (mesmo escritório)
//      retorna a peça EXISTENTE (200) — não cria duplicata (cobre remontagem
//      do componente, reload e repetição após falha ambígua de rede).
//   2. Corrida CONCORRENTE com a mesma chave → exatamente UM registro.
//   3. Isolamento por escritório: a MESMA chave em escritórios distintos gera
//      peças independentes.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql, and, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// Ambiente determinístico para o teste (login não usa OTP).
process.env.REQUIRE_EMAIL_OTP = 'false';

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const authRoutes = (await import('../routes/auth.js')).default;
const pecasRoutes = (await import('../routes/pecas.js')).default;
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { globalApiLimiter } = await import('../middlewares/rateLimit.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/pecas', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, pecasRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const SENHA = 'TesteSenha#2026';
const escIds: string[] = [];
const userIds: string[] = [];
const pecaIds: string[] = [];

let tokenA = '';
let tokenB = '';

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login ${email}`);
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [];
  const cookie = list.find((c) => c.startsWith('smartjuris_token='));
  assert.ok(cookie, 'cookie emitido');
  return cookie!.split(';')[0].slice('smartjuris_token='.length);
}

function payloadBase(conteudo: string) {
  return {
    tipo: 'Contestação',
    area: 'Cível',
    cliente: 'Cliente Idempotência',
    status: 'revisao',
    prazo: '2026-12-31',
    modelo: 'DeepSeek (classificação de servidor + fallback Flash/Pro)',
    fontes: 0,
    conteudo,
  };
}

async function criarPeca(token: string, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(async () => {
  if (!dbDisponivel) return;
  const senhaHash = await bcrypt.hash(SENHA, 10);

  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `Idem Esc A ${randomUUID().slice(0, 8)}`, plano: 'basico', ativo: true, limiteTokensMes: null },
    { nome: `Idem Esc B ${randomUUID().slice(0, 8)}`, plano: 'basico', ativo: true, limiteTokensMes: null },
  ]).returning({ id: s.escritorios.id });
  escIds.push(ea.id, eb.id);

  const users = await db.insert(s.usuarios).values([
    { nome: 'Idem Admin A', email: `idem.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Idem Admin B', email: `idem.b.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, email: s.usuarios.email });
  userIds.push(users[0].id, users[1].id);

  tokenA = await login(users[0].email!, SENHA);
  tokenB = await login(users[1].email!, SENHA);
});

after(async () => {
  if (dbDisponivel) {
    await db.delete(s.auditLog).where(inArray(s.auditLog.actorId, userIds)).catch(() => {});
    await db.delete(s.logins).where(inArray(s.logins.usuarioId, userIds)).catch(() => {});
    for (const id of pecaIds) await db.delete(s.pecas).where(eq(s.pecas.id, id)).catch(() => {});
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  await new Promise<void>((r) => server.close(() => r()));
  await client.end({ timeout: 5 });
});

describe('3D — idempotência durável do POST /api/pecas', () => {
  test('replay da MESMA chave retorna a peça existente, sem duplicata', async () => {
    if (!dbDisponivel) return;
    const chave = `idem-replay-${randomUUID()}`;
    const r1 = await criarPeca(tokenA, { ...payloadBase('Conteúdo idempotente.'), idempotencyKey: chave });
    assert.equal(r1.status, 201, 'primeira criação');
    const pecaId = r1.body?.id;
    assert.ok(pecaId, 'id da peça criada');
    pecaIds.push(pecaId);

    // Replay (remontagem/reload/falha ambígua): mesma chave → 200 + mesma peça.
    const r2 = await criarPeca(tokenA, { ...payloadBase('Conteúdo idempotente.'), idempotencyKey: chave });
    assert.equal(r2.status, 200, 'replay devolve a peça existente');
    assert.equal(r2.body?.id, pecaId, 'mesmo id — nenhuma duplicata');

    // Exatamente UMA linha no banco.
    const linhas = await db.select().from(s.pecas).where(eq(s.pecas.idempotencyKey, chave));
    assert.equal(linhas.length, 1, 'um único registro persistido');
    assert.equal(linhas[0].id, pecaId);
  });

  test('chaves DIFERENTES criam peças independentes', async () => {
    if (!dbDisponivel) return;
    const k1 = `idem-k1-${randomUUID()}`;
    const k2 = `idem-k2-${randomUUID()}`;
    const r1 = await criarPeca(tokenA, { ...payloadBase('Primeira.'), idempotencyKey: k1 });
    const r2 = await criarPeca(tokenA, { ...payloadBase('Segunda.'), idempotencyKey: k2 });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.notEqual(r1.body?.id, r2.body?.id, 'ids distintos');
    pecaIds.push(r1.body?.id, r2.body?.id);
  });

  test('corrida CONCORRENTE com a mesma chave → exatamente UMA peça', async () => {
    if (!dbDisponivel) return;
    const chave = `idem-race-${randomUUID()}`;
    const corpo = { ...payloadBase('Concorrente.'), idempotencyKey: chave };
    const [a, b] = await Promise.all([criarPeca(tokenA, corpo), criarPeca(tokenA, corpo)]);
    const ids = new Set([a.body?.id, b.body?.id].filter(Boolean));
    assert.equal(ids.size, 1, 'uma única peça para duas requisições simultâneas');
    assert.ok([201, 200].includes(a.status) && [201, 200].includes(b.status), `status aceitos (${a.status}, ${b.status})`);
    pecaIds.push([...ids][0]);
  });

  test('corrida CONCORRENTE com a MESMA chave com ESPAÇOS periféricos → 201 + 200 + mesmo id', async () => {
    if (!dbDisponivel) return;
    const chave = ` idem-race-trim-${randomUUID()} `; // espaços periféricos
    const corpo = { ...payloadBase('Concorrente com espaços.'), idempotencyKey: chave };
    const [a, b] = await Promise.all([criarPeca(tokenA, corpo), criarPeca(tokenA, corpo)]);
    // A normalização (trim) faz a corrida colidir na MESMA chave persistida.
    assert.equal(a.body?.id, b.body?.id, 'mesmo id persistido');
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 201], 'um 201 (criação) e um 200 (replay da corrida)');
    pecaIds.push(a.body?.id);
  });

  test('a MESMA chave em escritórios DIFERENTES → peças independentes (tenancy)', async () => {
    if (!dbDisponivel) return;
    const chave = `idem-tenant-${randomUUID()}`;
    const rA = await criarPeca(tokenA, { ...payloadBase('Escritório A.'), idempotencyKey: chave });
    const rB = await criarPeca(tokenB, { ...payloadBase('Escritório B.'), idempotencyKey: chave });
    assert.equal(rA.status, 201);
    assert.equal(rB.status, 201);
    assert.notEqual(rA.body?.id, rB.body?.id, 'escritórios distintos não colidem na mesma chave');
    pecaIds.push(rA.body?.id, rB.body?.id);
  });
});
