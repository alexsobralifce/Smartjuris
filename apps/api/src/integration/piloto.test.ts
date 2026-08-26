// ===========================================================================
// Fase 4B — Integração dos bloqueios do piloto controlado (registro, upload,
// status root). Env PILOTO_* lida em tempo de chamada — restaurada no final
// para não vazar para outras suítes do mesmo processo.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql, and, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.REQUIRE_EMAIL_OTP = 'false';

// Fake Token Plan (embeddings) para uploads determinísticos — mock do endpoint
// OpenAI-compat de embeddings (POST /embeddings).
import http from 'node:http';
const embeddingsServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/embeddings') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ embedding: Array(1024).fill(0.01) }] }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise<void>((r) => embeddingsServer.listen(0, '127.0.0.1', r));
process.env.AI_BASE_URL = `http://127.0.0.1:${(embeddingsServer.address() as import('node:net').AddressInfo).port}`;
process.env.DEEP_SEEK_API = 'sk-fake-embeddings-token-plan';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { runMigrations } = await import('../db/migrate.js');
const { contarEscritoriosAtivos } = await import('../services/pilotMode.js');

// Aplica o runner OFICIAL de migrations no banco da suíte (idempotente) —
// garante o schema 0024 (area/usuario_id em documentos) ANTES de qualquer
// fluxo de upload do piloto.
await runMigrations();
const { default: authRoutes } = await import('../routes/auth.js');
const { default: documentosRoutes } = await import('../routes/documentos.js');
const { default: adminEscritorioRoutes } = await import('../routes/adminEscritorio.js');
const { default: pilotoRoutes } = await import('../routes/piloto.js');
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { requireRoot, requireAdmin } = await import('../middlewares/roleGuard.js');
const { globalApiLimiter, resetRateLimiters } = await import('../middlewares/rateLimit.js');

// Infraestrutura OBRIGATÓRIA (Fase 4A/4B): a suíte do piloto NUNCA pula
// silenciosamente — sem Postgres o run FALHA explicitamente (fail-closed).
try {
  await db.execute(sql`SELECT 1`);
} catch {
  throw new Error('4B — banco indisponível: a suíte do piloto exige Postgres acessível (fail-closed, sem skip).');
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/documentos', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, documentosRoutes);
app.use('/api/admin/escritorio', authMiddleware, refreshSession, requireAdmin, forcePasswordChange, adminEscritorioRoutes);
app.use('/api/root/piloto', authMiddleware, refreshSession, requireRoot, pilotoRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

const suffix = randomUUID().slice(0, 8);
const escIds: string[] = [];
const userIds: string[] = [];

// Env do piloto (restaurada no final — suítes compartilham o processo).
const envOrig: Record<string, string | undefined> = {};
for (const k of ['PILOTO_ATIVO', 'PILOTO_MAX_ESCRITORIOS', 'PILOTO_MAX_USUARIOS', 'PILOTO_MAX_DOCUMENTOS']) {
  envOrig[k] = process.env[k];
}
function restaurarEnv() {
  for (const [k, v] of Object.entries(envOrig)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function cookieDoLogin(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

async function login(email: string, senha: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  assert.equal(res.status, 200, `login ${email}`);
  const token = cookieDoLogin(res);
  assert.ok(token);
  return token!;
}

function escPdf(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function gerarPdf(paragrafos: string[]): Buffer {
  const n = paragrafos.length;
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`);
  for (let i = 0; i < n; i++) {
    const streamId = 4 + 2 * i;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${2 * n + 3} 0 R >> >> >>`);
    const stream = `BT /F1 12 Tf 72 720 Td (${escPdf(paragrafos[i])}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push(`<< /Pad (${'y'.repeat(10_000)}) >>`);
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, idx) => {
    offsets.push(out.length);
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function uploadPdf(token: string, filename: string, pdf: Buffer, fields: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${baseUrl}/api/documentos/upload`, {
    method: 'POST',
    headers: { Cookie: `smartjuris_token=${token}` },
    body: fd,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

before(async () => {
  // infraestrutura garantida no topo (fail-closed)
  const hash = await bcrypt.hash('PilotoSenha#2026', 10);
  // 1 escritório ativo + admin — com PILOTO_MAX_ESCRITORIOS=1, o próximo
  // registro deve ser bloqueado.
  const [esc] = await db.insert(s.escritorios).values([
    { nome: `Pilot Esc ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, limiteUsuarios: 100 },
  ]).returning({ id: s.escritorios.id });
  escIds.push(esc.id);
  const [u] = await db.insert(s.usuarios).values([
    { nome: 'Pilot Admin', email: `pilot.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: esc.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id });
  userIds.push(u.id);
});

after(async () => {
  embeddingsServer.close();
  restaurarEnv();
  {
    await db.delete(s.auditLog).where(inArray(s.auditLog.actorId, userIds)).catch(() => {});
    await db.delete(s.logins).where(inArray(s.logins.usuarioId, userIds)).catch(() => {});
    await db.delete(s.documentos).where(inArray(s.documentos.escritorioId, escIds)).catch(() => {});
    await db.delete(s.usuarios).where(inArray(s.usuarios.id, userIds)).catch(() => {});
    // Escritórios/usuários criados pelos registros de teste (concorrente).
    await db.delete(s.usuarios).where(sql`email LIKE ${`conc.${suffix}%`}`).catch(() => {});
    await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc Conc ${suffix}%`}`).catch(() => {});
    await db.delete(s.escritorios).where(inArray(s.escritorios.id, escIds)).catch(() => {});
  }
  server.close();
  await client.end({ timeout: 5 });
});

describe('4B — bloqueios do piloto (HTTP)', () => {
  test('migration 0024 APLICADA via runner oficial: colunas area/usuario_id presentes em documentos ANTES dos uploads', async () => {
    const rows = (await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'documentos' AND column_name IN ('area', 'usuario_id')
    `)) as any[];
    const colunas = rows.map((r: any) => r.column_name).sort();
    assert.deepEqual(colunas, ['area', 'usuario_id'], 'runner oficial aplicou 0024 no banco da suíte');
  });

  test('registro de NOVO escritório bloqueado quando o teto de ativos é atingido (403 PILOTO_LIMITE_ESCRITORIOS)', async () => {
    resetRateLimiters();
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '1'; // já existe 1 ativo
    try {
      const res = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: `Novo Adv ${suffix}`,
          email: `novo.${suffix}@teste.local`,
          senha: 'SenhaNova#2026',
          oab: '123456',
          oabUf: 'SP',
          escritorioNome: `Escritorio Novo ${suffix}`,
        }),
      });
      assert.equal(res.status, 403, 'registro bloqueado no piloto');
      const body = await res.json();
      assert.equal(body.code, 'PILOTO_LIMITE_ESCRITORIOS', 'código do bloqueio');
    } finally {
      delete process.env.PILOTO_ATIVO;
    }
  });

  test('registros CONCORRENTES não ultrapassam o teto do piloto', async () => {
    resetRateLimiters();
    const antes = await contarEscritoriosAtivos();
    const teto = antes + 2;
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = String(teto);
    try {
      const resultados = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const r = await fetch(`${baseUrl}/api/auth/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nome: `Conc Adv ${suffix}-${i}`,
              email: `conc.${suffix}-${i}@teste.local`,
              senha: 'SenhaConc#2026',
              oab: `00${i}${i}0`,
              oabUf: 'RJ',
              escritorioNome: `Esc Conc ${suffix}-${i}`,
            }),
          });
          return { status: r.status, json: await r.json().catch(() => ({})) };
        }),
      );
      const criados = resultados.filter((r) => r.status === 201).length;
      assert.ok(criados <= 2, `no máximo 2 criações (vagas livres) — criados: ${criados}`);
      assert.ok(
        resultados.some((r) => r.status === 403 && r.json.code === 'PILOTO_LIMITE_ESCRITORIOS'),
        'excedentes bloqueados com o código do piloto',
      );
      const depois = await contarEscritoriosAtivos();
      assert.equal(depois - antes, criados, `delta de ativos (${depois - antes}) == criações (${criados}) — nunca ultrapassa o teto`);
    } finally {
      delete process.env.PILOTO_ATIVO;
    }
  });

  test('upload de documento bloqueado quando o teto por escritório é atingido (403 PILOTO_LIMITE_DOCUMENTOS)', async () => {
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_DOCUMENTOS = '0'; // teto zero → qualquer upload bloqueia
    try {
      const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'x.pdf');
      fd.append('colecao', 'piloto');
      const res = await fetch(`${baseUrl}/api/documentos/upload`, {
        method: 'POST',
        headers: { Cookie: `smartjuris_token=${token}` },
        body: fd,
      });
      assert.equal(res.status, 403, 'upload bloqueado no piloto');
      const body = await res.json();
      assert.equal(body.code, 'PILOTO_LIMITE_DOCUMENTOS', 'código do bloqueio');
    } finally {
      delete process.env.PILOTO_ATIVO;
    }
  });

  test('teto de USUÁRIOS do piloto: criação bloqueada (403 PILOTO_LIMITE_USUARIOS)', async () => {
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_USUARIOS = '1'; // já existe 1 admin ativo no escritório
    try {
      const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
      const res = await fetch(`${baseUrl}/api/admin/escritorio/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
        body: JSON.stringify({ nome: `User Novo ${suffix}`, email: `u.novo.${suffix}@teste.local` }),
      });
      assert.equal(res.status, 403, 'criação de usuário bloqueada no piloto');
      const body = await res.json();
      assert.equal(body.code, 'PILOTO_LIMITE_USUARIOS', 'código do bloqueio');
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_USUARIOS;
    }
  });

  test('uploads CONCORRENTES no último slot de documentos: contagem final ≤ teto e excedentes 403', async () => {
    // Escritório com N docs; teto = N+1 → só UM upload vence; demais 403.
    const [escDocs] = await db.insert(s.escritorios).values([
      { nome: `Pilot DocsConc ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escDocs.id);
    const [adminDocs] = await db.insert(s.usuarios).values([
      { nome: 'Pilot Docs Admin', email: `pilot.docs.${suffix}@teste.local`, senha: await bcrypt.hash('PilotoSenha#2026', 10), role: 'admin', escritorioId: escDocs.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(adminDocs.id);
    await db.insert(s.documentos).values([
      { nome: 'base.pdf', colecao: 'piloto', tamanho: '0.01 MB', indexado: new Date(), chunks: 1, sizeBytes: 1024, escritorioId: escDocs.id },
    ]);
    const tokenDocs = await login(`pilot.docs.${suffix}@teste.local`, 'PilotoSenha#2026');

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_DOCUMENTOS = '2'; // 1 base + 1 slot livre
    try {
      const resultados = await Promise.all(
        Array.from({ length: 4 }, (_, i) => uploadPdf(tokenDocs, `conc-${i}-${suffix}.pdf`, gerarPdf([`Contrato de prestacao de servicos juridicos numero ${i} firmado entre as partes em 2026 com clausulas de honorarios e confidencialidade.`]), { colecao: 'piloto' })),
      );
      const statuses = resultados.map((r) => r.status);
      assert.ok(statuses.includes(201), `pelo menos um upload aceito (${statuses.join(',')})`);
      assert.ok(statuses.includes(403), `excedentes bloqueados (${statuses.join(',')})`);
      const bloq = resultados.find((r) => r.status === 403);
      assert.equal(bloq?.json?.code, 'PILOTO_LIMITE_DOCUMENTOS', 'código do bloqueio');
      const [cnt] = await db.select({ total: sql<number>`count(*)::int` }).from(s.documentos).where(eq(s.documentos.escritorioId, escDocs.id));
      assert.ok(Number(cnt?.total ?? 0) <= 2, `contagem final (${cnt?.total}) nunca ultrapassa o teto (2)`);
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_DOCUMENTOS;
    }
  });

  test('criações CONCORRENTES de usuários no último slot: contagem final ≤ teto e excedentes 403', async () => {
    const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_USUARIOS = '2'; // 1 admin ativo + 1 slot livre
    try {
      const resultados = await Promise.all(
        Array.from({ length: 4 }, async (_, i) => {
          const r = await fetch(`${baseUrl}/api/admin/escritorio/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
            body: JSON.stringify({ nome: `Conc User ${suffix}-${i}`, email: `c.u.${suffix}-${i}@teste.local` }),
          });
          return { status: r.status, json: await r.json().catch(() => ({})) };
        }),
      );
      const statuses = resultados.map((r) => r.status);
      assert.ok(statuses.includes(201), `pelo menos uma criação aceita (${statuses.join(',')})`);
      assert.ok(statuses.includes(403), `excedentes bloqueados (${statuses.join(',')})`);
      const bloq = resultados.find((r) => r.status === 403);
      assert.equal(bloq?.json?.code, 'PILOTO_LIMITE_USUARIOS', 'código do bloqueio');
      const [cnt] = await db.select({ total: sql<number>`count(*)::int` }).from(s.usuarios)
        .where(and(eq(s.usuarios.escritorioId, escIds[0]), eq(s.usuarios.ativo, true)));
      assert.ok(Number(cnt?.total ?? 0) <= 2, `contagem final (${cnt?.total}) nunca ultrapassa o teto (2)`);
      // Limpa os usuários criados pelo teste concorrente.
      await db.delete(s.usuarios).where(sql`email LIKE ${`c.u.${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_USUARIOS;
    }
  });

  test('piloto DESLIGADO ou sem limite: caminho NORMAL sem lock/transação de piloto (sem 403)', async () => {
    // Usuário: PILOTO_ATIVO ausente + PILOTO_MAX_USUARIOS=1 com 1 ativo →
    // a criação NÃO é bloqueada (prova que o caminho de piloto não é tomado).
    delete process.env.PILOTO_ATIVO;
    process.env.PILOTO_MAX_USUARIOS = '1';
    try {
      const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
      const res = await fetch(`${baseUrl}/api/admin/escritorio/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
        body: JSON.stringify({ nome: `SemPiloto ${suffix}`, email: `sem.piloto.${suffix}@teste.local` }),
      });
      assert.equal(res.status, 201, 'criação normal sem piloto (sem lock de piloto)');
      await db.delete(s.usuarios).where(sql`email LIKE ${`sem.piloto.${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_MAX_USUARIOS;
    }

    // Upload: PILOTO_ATIVO ausente + PILOTO_MAX_DOCUMENTOS=0 → upload NÃO
    // bloqueado (caminho original, sem lock de piloto).
    process.env.PILOTO_MAX_DOCUMENTOS = '0';
    try {
      const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
      const up = await uploadPdf(token, `sem-piloto-${suffix}.pdf`, gerarPdf(['Contrato de prestacao de servicos juridicos do teste sem piloto firmado entre as partes em 2026.']), { colecao: 'piloto' });
      assert.equal(up.status, 201, 'upload normal sem piloto (sem lock de piloto)');
    } finally {
      delete process.env.PILOTO_MAX_DOCUMENTOS;
    }
  });

  test('OTP: ativação de escritório respeita o teto de ativos (403 PILOTO_LIMITE_ESCRITORIOS)', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'true';
    try {
      const emails = [`otp.${suffix}@teste.local`, `otp2.${suffix}@teste.local`];
      const teto = (await contarEscritoriosAtivos()) + 1; // UMA vaga livre
      process.env.PILOTO_ATIVO = 'true';
      process.env.PILOTO_MAX_ESCRITORIOS = String(teto);
      const ativosAntesReg = await contarEscritoriosAtivos();
      for (const [i, em] of emails.entries()) {
        const r = await fetch(`${baseUrl}/api/auth/registro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: `OTP Adv ${suffix}-${i}`, email: em, senha: 'SenhaOtp#2026', oab: `77${i}${i}7`, oabUf: 'MG', escritorioNome: `Esc OTP ${suffix}-${i}` }),
        });
        assert.equal(r.status, 201, `registro OTP ${i} aceito (cria inativo)`);
      }
      const ativosDepoisReg = await contarEscritoriosAtivos();
      assert.equal(ativosDepoisReg, ativosAntesReg, 'registros OTP NÃO ativam nada (delta zero)');

      // Confirmações CONCORRENTES com UMA vaga: uma vence, a outra é bloqueada.
      const obterCodigo = async (em: string) => {
        const rows = (await db.execute(sql`SELECT codigo FROM codigos_verificacao WHERE email = ${em} ORDER BY created_at DESC LIMIT 1`)) as any[];
        return String(rows[0]?.codigo ?? '');
      };
      const confirmar = (em: string, codigo: string) =>
        fetch(`${baseUrl}/api/auth/verificar-codigo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: em, codigo }),
        });
      const [cod1, cod2] = await Promise.all([obterCodigo(emails[0]), obterCodigo(emails[1])]);
      const [r1, r2] = await Promise.all([confirmar(emails[0], cod1), confirmar(emails[1], cod2)]);
      const statuses = [r1.status, r2.status].sort();
      assert.ok(statuses.includes(200), `pelo menos uma ativação ok (${statuses.join(',')})`);
      assert.ok(statuses.includes(403), `uma ativação bloqueada pelo teto (${statuses.join(',')})`);
      const bloq = r1.status === 403 ? r1 : r2;
      const body = await bloq.json();
      assert.equal(body.code, 'PILOTO_LIMITE_ESCRITORIOS', 'código do bloqueio na ativação');
      const ativosDepois = await contarEscritoriosAtivos();
      assert.equal(ativosDepois, ativosAntesReg + 1, `exatamente UMA ativação venceu (delta 1): ${ativosDepois - ativosAntesReg}`);
      // Limpa escritórios/usuários/códigos dos registros OTP.
      await db.delete(s.codigosVerificacao).where(sql`email LIKE ${`otp%.${suffix}@teste.local`}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email LIKE ${`otp%.${suffix}@teste.local`}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc OTP ${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('OTP com piloto DESLIGADO: registro e ativação fluem sem bloqueio de piloto', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'true';
    delete process.env.PILOTO_ATIVO;
    try {
      const em = `otp.off.${suffix}@teste.local`;
      const r = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `OTP Off ${suffix}`, email: em, senha: 'SenhaOtp#2026', oab: '888888', oabUf: 'GO', escritorioNome: `Esc OTP Off ${suffix}` }),
      });
      assert.equal(r.status, 201, 'registro OTP ok sem piloto');
      const rows = (await db.execute(sql`SELECT codigo FROM codigos_verificacao WHERE email = ${em} ORDER BY created_at DESC LIMIT 1`)) as any[];
      const v = await fetch(`${baseUrl}/api/auth/verificar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, codigo: String(rows[0]?.codigo ?? '') }),
      });
      assert.equal(v.status, 200, 'ativação ok sem piloto (sem bloqueio)');
      await db.delete(s.codigosVerificacao).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc OTP Off ${suffix}%`}`).catch(() => {});
    } finally {
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('OTP BLOQUEADA: estado pré-ativação consistente (escritório inativo, usuário inativo, código utilizável, sem sessão)', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'true';
    try {
      const teto = (await contarEscritoriosAtivos()) + 1;
      process.env.PILOTO_ATIVO = 'true';
      process.env.PILOTO_MAX_ESCRITORIOS = String(teto);
      const emA = `otp.regr.${suffix}@teste.local`;
      const emB = `otp.regr2.${suffix}@teste.local`;
      for (const [i, em] of [emA, emB].entries()) {
        await fetch(`${baseUrl}/api/auth/registro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: `OTP Regr ${suffix}-${i}`, email: em, senha: 'SenhaOtp#2026', oab: `99${i}${i}9`, oabUf: 'PR', escritorioNome: `Esc OTP Regr ${suffix}-${i}` }),
        });
      }
      const codigoDe = async (em: string) => {
        const rows = (await db.execute(sql`SELECT codigo FROM codigos_verificacao WHERE email = ${em} ORDER BY created_at DESC LIMIT 1`)) as any[];
        return String(rows[0]?.codigo ?? '');
      };
      const [rA, rB] = await Promise.all([
        fetch(`${baseUrl}/api/auth/verificar-codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emA, codigo: await codigoDe(emA) }) }),
        fetch(`${baseUrl}/api/auth/verificar-codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emB, codigo: await codigoDe(emB) }) }),
      ]);
      // Identifica o BLOQUEADO (403) — deve permanecer em estado pré-ativação.
      const bloqueado = rA.status === 403 ? emA : emB;
      const vencedor = rA.status === 200 ? emA : emB;
      assert.ok(rA.status === 200 || rB.status === 200, 'um vence');
      assert.ok(rA.status === 403 || rB.status === 403, 'um bloqueado');

      const [userBloq] = (await db.execute(sql`SELECT id, ativo, email_verificado, escritorio_id FROM usuarios WHERE email = ${bloqueado}`)) as any[];
      assert.equal(userBloq.ativo, false, 'usuário bloqueado permanece INATIVO');
      assert.equal(userBloq.email_verificado, false, 'usuário bloqueado permanece NÃO verificado');
      const [escBloq] = (await db.execute(sql`SELECT ativo FROM escritorios WHERE id = ${userBloq.escritorio_id}`)) as any[];
      assert.equal(escBloq.ativo, false, 'escritório bloqueado permanece INATIVO');
      const [codBloq] = (await db.execute(sql`SELECT utilizado FROM codigos_verificacao WHERE email = ${bloqueado} ORDER BY created_at DESC LIMIT 1`)) as any[];
      assert.equal(codBloq.utilizado, false, 'código do bloqueado permanece UTILIZÁVEL (rollback atômico)');

      // Login do usuário bloqueado → SEM sessão (admin parcialmente ativado não entra).
      const loginBloq = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bloqueado, password: 'SenhaOtp#2026' }),
      });
      assert.notEqual(loginBloq.status, 200, 'usuário com ativação bloqueada NÃO obtém sessão');
      // O vencedor obtém sessão normalmente.
      const loginVencedor = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: vencedor, password: 'SenhaOtp#2026' }),
      });
      assert.equal(loginVencedor.status, 200, 'vencedor ativado obtém sessão');

      // Limpeza.
      await db.delete(s.codigosVerificacao).where(sql`email LIKE ${`otp.regr%.${suffix}@teste.local`}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email LIKE ${`otp.regr%.${suffix}@teste.local`}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc OTP Regr ${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('OTP no TETO: registro é ACEITO (cria inativo); confirmação 403 sem vaga e 200 após vaga liberada', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'true';
    // Escritório ativo reservado para liberar vaga depois.
    const [escSlot] = await db.insert(s.escritorios).values([
      { nome: `Pilot Slot ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, limiteUsuarios: 100 },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escSlot.id);
    try {
      const teto = await contarEscritoriosAtivos(); // já no teto
      process.env.PILOTO_ATIVO = 'true';
      process.env.PILOTO_MAX_ESCRITORIOS = String(teto);
      const em = `otp.teto.${suffix}@teste.local`;
      // Registro com OTP no teto → 201 (criação INATIVA não consome vaga).
      const rReg = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `OTP Teto ${suffix}`, email: em, senha: 'SenhaOtp#2026', oab: '123123', oabUf: 'SC', escritorioNome: `Esc OTP Teto ${suffix}` }),
      });
      assert.equal(rReg.status, 201, 'registro OTP aceito MESMO no teto de ativos');
      const rows = (await db.execute(sql`SELECT codigo FROM codigos_verificacao WHERE email = ${em} ORDER BY created_at DESC LIMIT 1`)) as any[];
      const codigo = String(rows[0]?.codigo ?? '');
      // Confirmação SEM vaga → 403 PILOTO_LIMITE_ESCRITORIOS.
      const r403 = await fetch(`${baseUrl}/api/auth/verificar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, codigo }),
      });
      assert.equal(r403.status, 403, 'ativação bloqueada sem vaga');
      assert.equal((await r403.json()).code, 'PILOTO_LIMITE_ESCRITORIOS', 'código do bloqueio');
      // Libera uma vaga (escritório de teste desativado) → confirmação 200.
      await db.update(s.escritorios).set({ ativo: false }).where(eq(s.escritorios.id, escSlot.id));
      const r200 = await fetch(`${baseUrl}/api/auth/verificar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, codigo }),
      });
      assert.equal(r200.status, 200, 'ativação ok após vaga liberada (código permaneceu utilizável)');
      await db.delete(s.codigosVerificacao).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc OTP Teto ${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('PILOTO_MAX_USUARIOS=0: registro SEM OTP bloqueado (403) com rollback integral (sem escritório/admin ativos)', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'false';
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000'; // teto de escritórios alto (banco tem seeds)
    process.env.PILOTO_MAX_USUARIOS = '0';
    try {
      const em = `u0.${suffix}@teste.local`;
      const r = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `U0 Adv ${suffix}`, email: em, senha: 'SenhaU0#2026', oab: '111222', oabUf: 'BA', escritorioNome: `Esc U0 ${suffix}` }),
      });
      assert.equal(r.status, 403, 'registro sem OTP com teto de usuários 0 bloqueia o admin inicial');
      assert.equal((await r.json()).code, 'PILOTO_LIMITE_USUARIOS', 'código do bloqueio');
      const [users] = (await db.execute(sql`SELECT count(*)::int AS n FROM usuarios WHERE email = ${em}`)) as any[];
      assert.equal(users.n, 0, 'rollback: nenhum usuário persistido');
      const [escs] = (await db.execute(sql`SELECT count(*)::int AS n FROM escritorios WHERE nome LIKE ${`Esc U0 ${suffix}%`}`)) as any[];
      assert.equal(escs.n, 0, 'rollback: nenhum escritório persistido');
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_USUARIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('PILOTO_MAX_USUARIOS=0: OTP bloqueada na ATIVAÇÃO preserva estado pré-ativação', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'true';
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000'; // teto de escritórios alto (banco tem seeds)
    process.env.PILOTO_MAX_USUARIOS = '0';
    try {
      const em = `u0.otp.${suffix}@teste.local`;
      const rReg = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `U0 OTP ${suffix}`, email: em, senha: 'SenhaU0#2026', oab: '333444', oabUf: 'CE', escritorioNome: `Esc U0 OTP ${suffix}` }),
      });
      assert.equal(rReg.status, 201, 'registro OTP aceito (cria inativo)');
      const rows = (await db.execute(sql`SELECT codigo FROM codigos_verificacao WHERE email = ${em} ORDER BY created_at DESC LIMIT 1`)) as any[];
      const rConf = await fetch(`${baseUrl}/api/auth/verificar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, codigo: String(rows[0]?.codigo ?? '') }),
      });
      assert.equal(rConf.status, 403, 'ativação bloqueada com teto de usuários 0');
      assert.equal((await rConf.json()).code, 'PILOTO_LIMITE_USUARIOS', 'código do bloqueio');
      const [u] = (await db.execute(sql`SELECT ativo, email_verificado, escritorio_id FROM usuarios WHERE email = ${em}`)) as any[];
      assert.equal(u.ativo, false, 'usuário permanece inativo');
      assert.equal(u.email_verificado, false, 'usuário permanece não verificado');
      const [e] = (await db.execute(sql`SELECT ativo FROM escritorios WHERE id = ${u.escritorio_id}`)) as any[];
      assert.equal(e.ativo, false, 'escritório permanece inativo');
      const [c] = (await db.execute(sql`SELECT utilizado FROM codigos_verificacao WHERE email = ${em} ORDER BY created_at DESC LIMIT 1`)) as any[];
      assert.equal(c.utilizado, false, 'código permanece utilizável');
      await db.delete(s.codigosVerificacao).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc U0 OTP ${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_USUARIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('REATIVAÇÃO respeita PILOTO_MAX_USUARIOS: cadastro pendente ativado via re-registro SEM OTP é bloqueado no teto 0', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    // 1º: cria usuário/escritório INATIVOS com OTP.
    process.env.REQUIRE_EMAIL_OTP = 'true';
    const em = `reat.${suffix}@teste.local`;
    const r1 = await fetch(`${baseUrl}/api/auth/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: `Reat ${suffix}`, email: em, senha: 'SenhaReat#2026', oab: '555666', oabUf: 'PE', escritorioNome: `Esc Reat ${suffix}` }),
    });
    assert.equal(r1.status, 201, 'cadastro OTP inicial criado');
    // 2º: re-registro SEM OTP → caminho de REATIVAÇÃO (ativa usuário+escritório)
    // — com PILOTO_MAX_USUARIOS=0 deve bloquear e manter tudo inativo.
    process.env.REQUIRE_EMAIL_OTP = 'false';
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000'; // teto de escritórios alto (banco tem seeds)
    process.env.PILOTO_MAX_USUARIOS = '0';
    try {
      const r2 = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `Reat ${suffix}`, email: em, senha: 'SenhaReat#2026', oab: '555666', oabUf: 'PE', escritorioNome: `Esc Reat ${suffix}` }),
      });
      assert.equal(r2.status, 403, 'reativação bloqueada com teto de usuários 0');
      assert.equal((await r2.json()).code, 'PILOTO_LIMITE_USUARIOS', 'código do bloqueio');
      const [u] = (await db.execute(sql`SELECT ativo, email_verificado, escritorio_id FROM usuarios WHERE email = ${em}`)) as any[];
      assert.equal(u.ativo, false, 'usuário permanece inativo após reativação bloqueada');
      assert.equal(u.email_verificado, false, 'usuário permanece não verificado');
      const [e] = (await db.execute(sql`SELECT ativo FROM escritorios WHERE id = ${u.escritorio_id}`)) as any[];
      assert.equal(e.ativo, false, 'escritório permanece inativo');
      await db.delete(s.codigosVerificacao).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc Reat ${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_USUARIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('UPLOAD piloto vs NORMAL: metadados EQUIVALENTES (mesmo usuário, área, processo, escritório)', async () => {
    // Escritório dedicado para comparar os dois caminhos.
    const [escEq] = await db.insert(s.escritorios).values([
      { nome: `Pilot Eq ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, limiteUsuarios: 100 },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escEq.id);
    const [userEq] = await db.insert(s.usuarios).values([
      { nome: 'Eq Admin', email: `eq.${suffix}@teste.local`, senha: await bcrypt.hash('EqSenha#2026', 10), role: 'admin', escritorioId: escEq.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(userEq.id);
    const tokenEq = await login(`eq.${suffix}@teste.local`, 'EqSenha#2026');
    const pdf = gerarPdf(['Contrato de prestacao de servicos juridicos do teste de equivalencia entre os dois caminhos de upload com conteudo suficiente para indexacao.']);

    // Caminho NORMAL (piloto desligado).
    delete process.env.PILOTO_ATIVO;
    const normal = await uploadPdf(tokenEq, `eq-${suffix}.pdf`, pdf, { colecao: 'eq', area: 'Cível' });
    assert.equal(normal.status, 201, 'upload normal ok');
    // Caminho PILOTO (mesmo arquivo, área, escritório e usuário).
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000';
    process.env.PILOTO_MAX_DOCUMENTOS = '50';
    try {
      const piloto = await uploadPdf(tokenEq, `eq-${suffix}.pdf`, pdf, { colecao: 'eq', area: 'Cível' });
      assert.equal(piloto.status, 201, 'upload piloto ok');

      const docs = await db.select().from(s.documentos).where(eq(s.documentos.escritorioId, escEq.id));
      assert.equal(docs.length, 2, 'dois documentos (um por caminho)');
      const [dNormal, dPiloto] = docs;
      // Equivalência de metadados persistidos (mesmas colunas no mesmo escritório),
      // INCLUINDO `area` e `usuarioId` (migration 0024 — ambos os caminhos).
      for (const campo of ['nome', 'colecao', 'tamanho', 'escritorioId', 'processoId', 'totalPages', 'indexedStatus', 'failedChunks', 'area', 'usuarioId'] as const) {
        assert.deepEqual(
          dPiloto[campo] ?? null,
          dNormal[campo] ?? null,
          `campo ${campo} equivalente entre caminho piloto e normal`,
        );
      }
      assert.equal(dPiloto.area, 'Cível', 'area persistida no documento (piloto)');
      assert.equal(dNormal.area, 'Cível', 'area persistida no documento (normal)');
      assert.equal(dPiloto.usuarioId, userEq.id, 'usuarioId persistido no documento (piloto)');
      assert.equal(dNormal.usuarioId, userEq.id, 'usuarioId persistido no documento (normal)');
      assert.equal(Number(dPiloto.chunks), Number(dNormal.chunks), 'mesma quantidade de chunks indexados');
      // `area` é preservada nos METADADOS DO CHUNK (mesmo caminho).
      const chunksP = await db.select({ metadata: s.chunks.metadata }).from(s.chunks).where(eq(s.chunks.documentoId, dPiloto.id)).limit(1);
      const chunksN = await db.select({ metadata: s.chunks.metadata }).from(s.chunks).where(eq(s.chunks.documentoId, dNormal.id)).limit(1);
      assert.equal((chunksP[0]?.metadata as any)?.area, 'Cível', 'área no chunk do caminho piloto');
      assert.equal((chunksN[0]?.metadata as any)?.area, 'Cível', 'área no chunk do caminho normal');
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_DOCUMENTOS;
    }
  });

  test('UPLOAD piloto com FALHA na indexação: documento salvo como failed (201 + warning, sem 502) e retry liberado até o teto', async () => {
    const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
    const baseOriginal = process.env.AI_BASE_URL;
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000';
    process.env.PILOTO_MAX_DOCUMENTOS = '3'; // teto 3 (escritório com 1 doc do teste "sem piloto")
    try {
      // (a) Embeddings indisponíveis → 201 + warning; documento SALVO com
      //     status failed (sem busca vetorial), NENHUM chunk persistido.
      const docsAntes = await db.select({ id: s.documentos.id }).from(s.documentos).where(eq(s.documentos.escritorioId, escIds[0]));
      const chsAntes = await db.select({ id: s.chunks.id }).from(s.chunks).where(eq(s.chunks.escritorioId, escIds[0]));
      process.env.AI_BASE_URL = 'http://127.0.0.1:1'; // endpoint de embeddings inalcançável
      const up = await uploadPdf(token, `fail-${suffix}.pdf`, gerarPdf(['Contrato de prestacao de servicos juridicos para teste de falha de indexacao com conteudo longo o suficiente.']), { colecao: 'piloto' });
      assert.equal(up.status, 201, 'embeddings indisponíveis → 201 (documento salvo sem busca vetorial)');
      assert.match(up.json.warning ?? '', /sem indexação vetorial/, 'resposta inclui warning de indexação não realizada');
      assert.equal(up.json.indexedStatus, 'failed', 'documento persistido com status failed');
      assert.equal(Number(up.json.chunks), 0, 'nenhum chunk indexado');
      const docsDepois = await db.select({ id: s.documentos.id }).from(s.documentos).where(eq(s.documentos.escritorioId, escIds[0]));
      assert.equal(docsDepois.length, docsAntes.length + 1, 'documento NOVO persistido (não é órfão nem é removido)');
      const chsDepois = await db.select({ id: s.chunks.id }).from(s.chunks).where(eq(s.chunks.escritorioId, escIds[0]));
      assert.equal(chsDepois.length, chsAntes.length, 'nenhum chunk órfão NOVO (embeddings indisponíveis não persistem chunks)');

      // (b) Retry com embeddings OK: o MESMO escritório ainda pode uploadar
      //     (o documento failed consome o slot, mas o teto 3 ainda comporta o retry).
      process.env.AI_BASE_URL = baseOriginal ?? `http://127.0.0.1:${(embeddingsServer.address() as import('node:net').AddressInfo).port}`;
      const retry = await uploadPdf(token, `retry-${suffix}.pdf`, gerarPdf(['Contrato de prestacao de servicos juridicos para retry apos falha com conteudo longo suficiente para indexacao.']), { colecao: 'piloto' });
      assert.equal(retry.status, 201, 'retry de upload funciona após falha de embeddings (teto não excedido)');
      assert.notEqual(retry.json.indexedStatus, 'failed', 'retry indexado normalmente');
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_DOCUMENTOS;
      if (baseOriginal === undefined) delete process.env.AI_BASE_URL;
      else process.env.AI_BASE_URL = baseOriginal;
    }
  });

  test('SATURAÇÃO de pool: 15 criações CONCORRENTES de usuários concluem sem deadlock (contagem tx-aware)', async () => {
    const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000';
    process.env.PILOTO_MAX_USUARIOS = '20'; // teto alto — exercita o lock sem estourar
    try {
      const comTimeout = async (p: Promise<unknown>, ms: number) =>
        Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: deadlock ou espera indefinida')), ms))]);
      const resultados = (await comTimeout(
        Promise.all(
          Array.from({ length: 15 }, (_, i) =>
            fetch(`${baseUrl}/api/admin/escritorio/usuarios`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
              body: JSON.stringify({ nome: `Sat User ${suffix}-${i}`, email: `sat.u.${suffix}-${i}@teste.local` }),
            }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) })),
          ),
        ),
        20_000,
      )) as Array<{ status: number; json: any }>;
      const criados = resultados.filter((r) => r.status === 201).length;
      assert.equal(criados, 15, 'todas as criações concluíram (sem deadlock sob saturação)');
      await db.delete(s.usuarios).where(sql`email LIKE ${`sat.u.${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_USUARIOS;
    }
  });

  test('SATURAÇÃO de pool: 12 uploads CONCORRENTES concluem sem deadlock (contagem tx-aware)', async () => {
    const token = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '5000';
    process.env.PILOTO_MAX_DOCUMENTOS = '50';
    try {
      const comTimeout = async (p: Promise<unknown>, ms: number) =>
        Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: deadlock ou espera indefinida')), ms))]);
      const resultados = (await comTimeout(
        Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            uploadPdf(token, `sat-${i}-${suffix}.pdf`, gerarPdf([`Contrato de prestacao de servicos juridicos numero ${i} para saturacao de pool com conteudo extenso de indexacao.`]), { colecao: 'piloto' }),
          ),
        ),
        20_000,
      )) as Array<{ status: number; json: any }>;
      assert.equal(resultados.length, 12, 'todos os uploads concluíram (sem deadlock sob saturação)');
      assert.ok(resultados.some((r) => r.status === 201), 'pelo menos um upload aceito');
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      delete process.env.PILOTO_MAX_DOCUMENTOS;
    }
  });

  test('REATIVAÇÃO no TETO exato: passa pelo check TRANSACIONAL (403 correto), não por pré-check; com vaga → 200', async () => {
    resetRateLimiters();
    const otpAnterior = process.env.REQUIRE_EMAIL_OTP;
    process.env.REQUIRE_EMAIL_OTP = 'true';
    const em = `reat.teto.${suffix}@teste.local`;
    // Cria cadastro pendente (usuário/escritório INATIVOS com OTP).
    const r1 = await fetch(`${baseUrl}/api/auth/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: `Reat Teto ${suffix}`, email: em, senha: 'SenhaReat#2026', oab: '777888', oabUf: 'RS', escritorioNome: `Esc Reat Teto ${suffix}` }),
    });
    assert.equal(r1.status, 201, 'cadastro pendente criado');
    process.env.REQUIRE_EMAIL_OTP = 'false';
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = String(await contarEscritoriosAtivos()); // teto EXATO
    try {
      // Reativação no teto: NÃO é bloqueada por pré-check (o registro nem sabe
      // que é reativação) — passa pelo check TRANSACIONAL e recebe 403 correto.
      const rTeto = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `Reat Teto ${suffix}`, email: em, senha: 'SenhaReat#2026', oab: '777888', oabUf: 'RS', escritorioNome: `Esc Reat Teto ${suffix}` }),
      });
      assert.equal(rTeto.status, 403, 'reativação no teto → 403 transacional');
      assert.equal((await rTeto.json()).code, 'PILOTO_LIMITE_ESCRITORIOS', 'código do bloqueio');
      // Estado preservado (usuário/escritório continuam inativos).
      const [u] = (await db.execute(sql`SELECT ativo, email_verificado FROM usuarios WHERE email = ${em}`)) as any[];
      assert.equal(u.ativo, false, 'usuário permanece inativo após reativação bloqueada');

      // Libera vaga (desativa um escritório JÁ CONTADO no teto) → reativação 200.
      await db.update(s.escritorios).set({ ativo: false }).where(eq(s.escritorios.id, escIds[0]));
      const rOk = await fetch(`${baseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `Reat Teto ${suffix}`, email: em, senha: 'SenhaReat#2026', oab: '777888', oabUf: 'RS', escritorioNome: `Esc Reat Teto ${suffix}` }),
      });
      assert.equal(rOk.status, 200, 'reativação com vaga → 200');
      const [u2] = (await db.execute(sql`SELECT ativo FROM usuarios WHERE email = ${em}`)) as any[];
      assert.equal(u2.ativo, true, 'usuário ativado após reativação com vaga');
      await db.update(s.escritorios).set({ ativo: true }).where(eq(s.escritorios.id, escIds[0]));
      await db.delete(s.codigosVerificacao).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.usuarios).where(sql`email = ${em}`).catch(() => {});
      await db.delete(s.escritorios).where(sql`nome LIKE ${`Esc Reat Teto ${suffix}%`}`).catch(() => {});
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_MAX_ESCRITORIOS;
      if (otpAnterior === undefined) delete process.env.REQUIRE_EMAIL_OTP;
      else process.env.REQUIRE_EMAIL_OTP = otpAnterior;
    }
  });

  test('PILOTO_MAX_USUARIOS preexistente: snapshot restaura integralmente o estado do ambiente', async () => {
    const original = envOrig.PILOTO_MAX_USUARIOS; // capturado ANTES dos testes
    // Muta o valor (como os demais testes fazem) e prova que a restauração
    // devolve EXATAMENTE o estado preexistente.
    process.env.PILOTO_MAX_USUARIOS = '9';
    restaurarEnv();
    if (original === undefined) {
      assert.equal(process.env.PILOTO_MAX_USUARIOS, undefined, 'ausente originalmente → removida na restauração');
    } else {
      assert.equal(process.env.PILOTO_MAX_USUARIOS, original, 'valor preexistente restaurado integralmente');
    }
  });

  test('GET /api/root/piloto/status: root vê READY_FOR_PILOT com limites; não-root recebe 403', async () => {
    // Usuário ROOT criado no banco (login real pelo cookie).
    const hash = await bcrypt.hash('RootSenha#2026', 10);
    const [root] = await db.insert(s.usuarios).values([
      { nome: 'Pilot Root', email: `pilot.root.${suffix}@teste.local`, senha: hash, role: 'root', ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(root.id);
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '7';
    try {
      const tokenRoot = await login(`pilot.root.${suffix}@teste.local`, 'RootSenha#2026');
      const res = await fetch(`${baseUrl}/api/root/piloto/status`, {
        headers: { Cookie: `smartjuris_token=${tokenRoot}` },
      });
      assert.equal(res.status, 200, 'status 200 para root');
      const body = await res.json();
      assert.equal(body.status, 'READY_FOR_PILOT', 'resultado READY_FOR_PILOT');
      assert.equal(body.pilotoAtivo, true, 'piloto ativo refletido');
      assert.equal(body.limites.maxEscritorios, 7, 'limite exposto');

      // Não-root (admin) → 403 (autorização root).
      const tokenAdmin = await login(`pilot.${suffix}@teste.local`, 'PilotoSenha#2026');
      const resAdmin = await fetch(`${baseUrl}/api/root/piloto/status`, {
        headers: { Cookie: `smartjuris_token=${tokenAdmin}` },
      });
      assert.equal(resAdmin.status, 403, 'admin não acessa status root');
    } finally {
      delete process.env.PILOTO_ATIVO;
    }
  });
});
