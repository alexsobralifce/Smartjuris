// ===========================================================================
// Fase 2A.2 — Correção da exportação: validação humana aplicada no BACKEND.
//
// Matriz:
//   revisao    → exportação BLOQUEADA (403) + auditoria
//   aprovado   → exportação PERMITIDA (200 PDF/DOCX)
//   protocolado→ exportação PERMITIDA (200 PDF/DOCX)
//   reprovado  → exportação BLOQUEADA (403) + auditoria
//
// Também cobre tenancy/ownership (usuário de B não exporta peça de A).
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
const pecasA: Record<string, string> = {};

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

before(async () => {
  if (!dbDisponivel) return;
  const senhaHash = await bcrypt.hash(SENHA, 10);

  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `Export Esc A ${randomUUID().slice(0, 8)}`, plano: 'basico', ativo: true, limiteTokensMes: null },
    { nome: `Export Esc B ${randomUUID().slice(0, 8)}`, plano: 'basico', ativo: true, limiteTokensMes: null },
  ]).returning({ id: s.escritorios.id });
  escIds.push(ea.id, eb.id);

  const users = await db.insert(s.usuarios).values([
    { nome: 'Export Admin A', email: `export.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Export Admin B', email: `export.b.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, email: s.usuarios.email });
  userIds.push(users[0].id, users[1].id);

  const base = {
    tipo: 'Petição Inicial',
    area: 'Cível',
    cliente: 'Cliente Export',
    prazo: '2026-12-31',
    modelo: 'modelo-teste',
    fontes: 1,
    conteudo: 'Conteúdo da peça para exportação. Pedido de procedência com juros e custas.',
    escritorioId: ea.id,
    usuarioId: users[0].id,
  };
  const rows = await db.insert(s.pecas).values([
    { ...base, status: 'revisao', conteudoRico: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Em revisão.' }] }] } },
    { ...base, status: 'aprovado', conteudoRico: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Aprovada.' }] }] } },
    { ...base, status: 'protocolado', conteudoRico: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Protocolada.' }] }] } },
    { ...base, status: 'reprovado', conteudoRico: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reprovada.' }] }] } },
    { ...base, status: 'desconhecido', conteudoRico: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Status atípico.' }] }] } },
  ]).returning({ id: s.pecas.id, status: s.pecas.status });
  for (const row of rows) pecasA[row.status!] = row.id;
  pecaIds.push(...rows.map((r) => r.id));

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

async function exportar(token: string, id: string, format?: string): Promise<{ status: number; type: string | null; body: Buffer }> {
  const qs = format ? `?format=${format}` : '';
  const res = await fetch(`${baseUrl}/api/pecas/${id}/export${qs}`, {
    headers: { Cookie: `smartjuris_token=${token}` },
  });
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
}

describe('2A.2 — exportação por status (backend)', { skip: !dbDisponivel }, () => {
  test('revisao → 403 bloqueada (mensagem e auditoria)', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/${pecasA.revisao}/export`, { headers: { Cookie: `smartjuris_token=${tokenA}` } });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'Peça em revisão não pode ser exportada até a aprovação.');
  });

  test('reprovado → 403 bloqueada (mensagem e auditoria)', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/${pecasA.reprovado}/export`, { headers: { Cookie: `smartjuris_token=${tokenA}` } });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'Peça reprovada não pode ser exportada.');
  });

  test('aprovado → 200 PDF', async () => {
    const r = await exportar(tokenA, pecasA.aprovado);
    assert.equal(r.status, 200);
    assert.equal(r.type, 'application/pdf');
    assert.ok(r.body.length > 100, 'PDF gerado');
    assert.equal(r.body.subarray(0, 4).toString(), '%PDF', 'magic bytes do PDF');
  });

  test('protocolado → 200 PDF', async () => {
    const r = await exportar(tokenA, pecasA.protocolado);
    assert.equal(r.status, 200);
    assert.equal(r.type, 'application/pdf');
    assert.ok(r.body.length > 100);
  });

  test('aprovado → 200 DOCX', async () => {
    const r = await exportar(tokenA, pecasA.aprovado, 'docx');
    assert.equal(r.status, 200);
    assert.equal(r.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.ok(r.body.length > 100, 'DOCX gerado');
    assert.equal(r.body.subarray(0, 2).toString(), 'PK', 'magic bytes do DOCX (zip)');
  });

  test('protocolado → 200 DOCX', async () => {
    const r = await exportar(tokenA, pecasA.protocolado, 'docx');
    assert.equal(r.status, 200);
    assert.equal(r.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.ok(r.body.length > 100, 'DOCX gerado');
    assert.equal(r.body.subarray(0, 2).toString(), 'PK', 'magic bytes do DOCX (zip)');
  });

  test('status desconhecido → 403 bloqueada (fail-safe) + auditoria', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/${pecasA.desconhecido}/export`, { headers: { Cookie: `smartjuris_token=${tokenA}` } });
    assert.equal(res.status, 403);
    const rows = await db.select().from(s.auditLog).where(and(
      eq(s.auditLog.acao, 'EXPORTACAO_BLOQUEADA'),
      eq(s.auditLog.alvoId, pecasA.desconhecido),
    ));
    assert.ok(rows.some((r) => (r.detalhes as any)?.status === 'desconhecido'), 'status atípico auditado');
  });

  test('tenancy: usuário de B não exporta peça de A (403 Acesso negado)', async () => {
    const r = await exportar(tokenB, pecasA.aprovado);
    assert.equal(r.status, 403);
    assert.equal((await (await fetch(`${baseUrl}/api/pecas/${pecasA.aprovado}/export`, { headers: { Cookie: `smartjuris_token=${tokenB}` } })).json()).error, 'Acesso negado.');
  });

  test('uuid inválido → 400', async () => {
    const res = await fetch(`${baseUrl}/api/pecas/nao-e-uuid/export`, { headers: { Cookie: `smartjuris_token=${tokenA}` } });
    assert.equal(res.status, 400);
  });

  test('auditoria: bloqueios de status registrados com alvo e motivo', async () => {
    const rows = await db.select().from(s.auditLog).where(and(
      eq(s.auditLog.acao, 'EXPORTACAO_BLOQUEADA'),
      inArray(s.auditLog.alvoId, [pecasA.revisao, pecasA.reprovado]),
    ));
    const motivos = rows.map((r) => (r.detalhes as any)?.motivo);
    assert.ok(rows.some((r) => r.alvoId === pecasA.revisao && (r.detalhes as any)?.status === 'revisao'), `revisao auditada: ${JSON.stringify(motivos)}`);
    assert.ok(rows.some((r) => r.alvoId === pecasA.reprovado && (r.detalhes as any)?.status === 'reprovado'), `reprovado auditado: ${JSON.stringify(motivos)}`);
  });
});
