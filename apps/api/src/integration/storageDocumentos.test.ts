// ===========================================================================
// Testes de INTEGRAÇÃO HTTP — Fase 8B (Limite de storage 1GB por escritório)
// ===========================================================================
// Cobre os 5 cenários obrigatórios com AUTENTICAÇÃO REAL (login via
// POST /api/auth/login + cookie JWT) e servidor Express real (mesmos
// middlewares/montagem de server.ts para as rotas em teste).
//
// Mocks utilizados (apenas serviços externos, como autorizado):
//   • Token Plan/embeddings → servidor HTTP falso (POST /embeddings).
//
// NENHUM arquivo de produção é alterado por esta suíte.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { sql, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// 0. Ambiente ANTES de qualquer import do app (config.ts carrega .env sem
//    sobrescrever variáveis já definidas — dotenv não faz override).
// ---------------------------------------------------------------------------

// Servidor falso de embeddings do Token Plan — precisa estar de pé antes de
// setar a env, porque generateEmbedding lê AI_BASE_URL em tempo de chamada.
const embeddingsServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/embeddings') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ embedding: Array(1024).fill(0.01) }] }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'não encontrado' }));
  });
});
await new Promise<void>((r) => embeddingsServer.listen(0, '127.0.0.1', r));
const embeddingsPort = (embeddingsServer.address() as AddressInfo).port;

process.env.AI_BASE_URL = `http://127.0.0.1:${embeddingsPort}`;
process.env.DEEP_SEEK_API = 'sk-fake-embeddings-token-plan';
process.env.REQUIRE_EMAIL_OTP = 'false';

// ---------------------------------------------------------------------------
// 1. Imports dinâmicos do app (módulos reais, singletons por processo)
// ---------------------------------------------------------------------------

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { STORAGE_LIMIT_BYTES } = await import('../services/documento.js');
const authRoutes = (await import('../routes/auth.js')).default;
const documentosRoutes = (await import('../routes/documentos.js')).default;
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { globalApiLimiter } = await import('../middlewares/rateLimit.js');

// ---------------------------------------------------------------------------
// 2. App Express — mesmos middlewares/montagem de server.ts (somente as rotas
//    sob teste).
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/documentos', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, documentosRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ---------------------------------------------------------------------------
// 3. Disponibilidade do banco (mesmo padrão de documento.test.ts)
// ---------------------------------------------------------------------------

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

const SENHA = 'TesteSenha#2026';

// Gera um PDF minimalista válido (1 parágrafo por página) montado à mão com
// offsets de xref exatos. Mesmo padrão de segurancaDocumentos.test.ts.
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

function cookieDoLogin(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login falhou para ${email}: ${await res.text()}`);
  const token = cookieDoLogin(res);
  assert.ok(token, `cookie de sessão não emitido para ${email}`);
  return token!;
}

async function uploadPdf(
  token: string,
  filename: string,
  pdf: Buffer,
  fields: Record<string, string> = {}
): Promise<{ status: number; json: any; text: string }> {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${baseUrl}/api/documentos/upload`, {
    method: 'POST',
    headers: { Cookie: `smartjuris_token=${token}` },
    body: fd,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* inválido */ }
  return { status: res.status, json, text };
}

async function deletarDocumento(token: string, id: string): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/documentos/${id}`, {
    method: 'DELETE',
    headers: { Cookie: `smartjuris_token=${token}` },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* vazio */ }
  return { status: res.status, json, text };
}

async function storageTotalEscritorio(escritorioId: string): Promise<number> {
  const [sumRow] = await db.execute(sql`
    SELECT COALESCE(SUM(size_bytes), 0) AS total FROM documentos WHERE escritorio_id = ${escritorioId}
  `);
  return Number((sumRow as any)?.total ?? 0);
}

// ---------------------------------------------------------------------------
// 5. Fixtures (escritórios, usuários, clientes) + autenticação real
// ---------------------------------------------------------------------------

const escIds: string[] = [];
const userIds: string[] = [];
const clienteIds: string[] = [];
const docIds: string[] = [];

let escA = '';
let escB = '';
let uAdminA = '';
let clienteA = '';
let clienteB = '';
let tokenAdminA = '';
let tokenAdminB = '';

before(async () => {
  if (!dbDisponivel) return;

  const senhaHash = await bcrypt.hash(SENHA, 10);

  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `IT Escritório StorageAlfa ${randomUUID().slice(0, 8)}`, plano: 'basico', limiteTokensMes: null, ativo: true },
    { nome: `IT Escritório StorageBeta ${randomUUID().slice(0, 8)}`, plano: 'basico', limiteTokensMes: null, ativo: true },
  ]).returning({ id: s.escritorios.id });
  escA = ea.id; escB = eb.id;
  escIds.push(escA, escB);

  const users = await db.insert(s.usuarios).values([
    { nome: 'Admin StorageAlfa IT', email: `it.sto.admin.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: escA, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Admin StorageBeta IT', email: `it.sto.admin.b.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: escB, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, email: s.usuarios.email });
  uAdminA = users[0].id;
  userIds.push(users[0].id, users[1].id);

  const clientes = await db.insert(s.clientes).values([
    { tipo: 'PF', nome: 'Cliente Storage Alfa', cpfCnpj: '333.333.333-33', email: 'storage.alfa@teste.local', telefone: '(11) 98888-3333', escritorioId: escA, usuarioId: users[0].id },
    { tipo: 'PJ', nome: 'Cliente Storage Beta', cpfCnpj: '44.444.444/0001-44', email: 'storage.beta@teste.local', telefone: '(11) 98888-4444', escritorioId: escB, usuarioId: users[1].id },
  ]).returning({ id: s.clientes.id });
  clienteA = clientes[0].id; clienteB = clientes[1].id;
  clienteIds.push(clienteA, clienteB);

  // Autenticação REAL via POST /api/auth/login (cookie JWT httpOnly).
  const emails = users.map((u) => u.email!);
  tokenAdminA = await login(emails[0], SENHA);
  tokenAdminB = await login(emails[1], SENHA);
});

after(async () => {
  if (dbDisponivel) {
    for (const docId of docIds) {
      await db.delete(s.documentosGerados).where(eq(s.documentosGerados.documentoId, docId)).catch(() => {});
      await db.delete(s.chunks).where(eq(s.chunks.documentoId, docId)).catch(() => {});
      await db.delete(s.documentos).where(eq(s.documentos.id, docId)).catch(() => {});
    }
    await db.delete(s.auditLog).where(inArray(s.auditLog.actorId, userIds)).catch(() => null);
    await db.delete(s.logins).where(inArray(s.logins.usuarioId, userIds)).catch(() => {});
    await db.delete(s.tokenUsage).where(inArray(s.tokenUsage.usuarioId, userIds)).catch(() => {});
    for (const cId of clienteIds) await db.delete(s.clientes).where(eq(s.clientes.id, cId)).catch(() => {});
    for (const uid of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, uid)).catch(() => {});
    for (const escId of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, escId)).catch(() => {});
  }
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => embeddingsServer.close(() => r()));
  await client.end({ timeout: 5 });
});

// ===========================================================================
// CENÁRIOS OBRIGATÓRIOS (1–5)
// ===========================================================================

describe('Integração HTTP — Fase 8B (limite de storage 1GB)', { skip: !dbDisponivel }, () => {
  const area = 'Cível';
  // Tamanho do documento do teste 01 (persistido até o fim da suíte).
  let tamanhoDocTeste1 = 0;

  test('01. Upload dentro do limite → 201 + size_bytes persistido', async () => {
    const pdf = gerarPdf([
      'MARCADORSTORAGE documento pequeno dentro do limite de 1 GB por escritorio, com conteudo suficiente para indexacao vetorial.',
    ]);
    tamanhoDocTeste1 = pdf.length;
    const r = await uploadPdf(tokenAdminA, 'dentro-do-limite.pdf', pdf, { colecao: 'teste-storage', area });
    assert.equal(r.status, 201, r.text);
    assert.equal(Number(r.json.sizeBytes), pdf.length, 'size_bytes = tamanho real do arquivo');
    assert.equal(r.json.escritorioId, escA, 'escopo derivado do contexto autenticado');
    docIds.push(r.json.id);

    const [row] = await db.select({ sizeBytes: s.documentos.sizeBytes }).from(s.documentos)
      .where(eq(s.documentos.id, r.json.id)).limit(1);
    assert.equal(Number(row.sizeBytes), pdf.length, 'size_bytes confirmado no banco');

    // A soma do escritório reflete exatamente o arquivo enviado.
    assert.equal(await storageTotalEscritorio(escA), pdf.length, 'SUM(size_bytes) do escritório atualizado');
  });

  test('02. Upload que excede 1GB → 403 STORAGE_LIMIT_EXCEEDED + auditoria', async () => {
    // Simula o escritório já com 1 GB ocupado (registro direto no banco —
    // uploads reais são limitados a 15 MB pelo multer, impossível exceder em 1 req).
    const [gigante] = await db.insert(s.documentos).values({
      nome: 'cheio-1gb.pdf',
      colecao: 'teste-storage',
      tamanho: '1024 MB',
      chunks: 0,
      escritorioId: escA,
      sizeBytes: STORAGE_LIMIT_BYTES,
      indexedStatus: 'indexed',
      failedChunks: 0,
    }).returning({ id: s.documentos.id });
    docIds.push(gigante.id);

    const pdf = gerarPdf([
      'MARCADORSTORAGE tentativa de upload com storage ja no limite de 1 GB por escritorio, conteudo suficiente para indexar.',
    ]);
    const r = await uploadPdf(tokenAdminA, 'excede-1gb.pdf', pdf, { colecao: 'teste-storage', area });
    assert.equal(r.status, 403, r.text);
    assert.equal(r.json.code, 'STORAGE_LIMIT_EXCEEDED', 'código do bloqueio');
    assert.match(r.json.error, /Limite de storage de 1 GB/, 'mensagem do bloqueio');

    const rows = await db.select({ id: s.documentos.id }).from(s.documentos)
      .where(eq(s.documentos.nome, 'excede-1gb.pdf'));
    assert.equal(rows.length, 0, 'nenhum documento persistido no bloqueio');

    const bloqueios = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'UPLOAD_DOCUMENTO_BLOQUEADO'));
    assert.ok(
      bloqueios.some((b) => b.actorId === uAdminA && (b.detalhes as any)?.motivo === 'storage-limit-exceeded'),
      'auditoria UPLOAD_DOCUMENTO_BLOQUEADO com motivo storage-limit-exceeded'
    );
  });

  test('03. Deleção de documento libera espaço → upload seguinte funciona', async () => {
    // Confirma o bloqueio antes da deleção.
    const pdfBloqueado = gerarPdf([
      'MARCADORSTORAGE ainda bloqueado enquanto o documento de 1 GB existir, com texto de chunk valido.',
    ]);
    const bloqueado = await uploadPdf(tokenAdminA, 'ainda-bloqueado.pdf', pdfBloqueado, { colecao: 'teste-storage', area });
    assert.equal(bloqueado.status, 403, 'bloqueado enquanto storage cheio');
    assert.equal(bloqueado.json.code, 'STORAGE_LIMIT_EXCEEDED');

    // DELETE (admin) do documento que ocupava os 1 GB → espaço liberado.
    const [cheio] = await db.select({ id: s.documentos.id }).from(s.documentos)
      .where(eq(s.documentos.nome, 'cheio-1gb.pdf')).limit(1);
    assert.ok(cheio, 'documento de 1 GB existe');
    const del = await deletarDocumento(tokenAdminA, cheio.id);
    assert.equal(del.status, 204, del.text);

    // O documento de 1 GB foi removido; resta apenas o do teste 01.
    assert.equal(await storageTotalEscritorio(escA), tamanhoDocTeste1, 'storage voltou ao nível do teste 01');

    const pdf = gerarPdf([
      'MARCADORSTORAGE upload liberado apos a delecao do documento que ocupava o limite, com conteudo suficiente.',
    ]);
    const r = await uploadPdf(tokenAdminA, 'apos-delecao.pdf', pdf, { colecao: 'teste-storage', area });
    assert.equal(r.status, 201, r.text);
    assert.equal(Number(r.json.sizeBytes), pdf.length);
    docIds.push(r.json.id);
  });

  test('04. GET /api/documentos retorna storageUsado e storageLimite', async () => {
    const res = await fetch(`${baseUrl}/api/documentos`, {
      headers: { Cookie: `smartjuris_token=${tokenAdminA}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.documentos), 'campo documentos (array) presente');
    assert.equal(Number(body.storageLimite), STORAGE_LIMIT_BYTES, 'storageLimite = 1 GB');
    assert.equal(typeof body.storageUsado, 'number', 'storageUsado numérico');
    assert.equal(Number(body.storageUsado), await storageTotalEscritorio(escA), 'storageUsado = SUM(size_bytes) do escritório');
  });

  test('05. Upload com clienteId + storage check → ambos validados', async () => {
    // (a) Storage cheio + clienteId VÁLIDO → storage check dispara (403).
    const [gigante] = await db.insert(s.documentos).values({
      nome: 'cheio-2gb.pdf',
      colecao: 'teste-storage',
      tamanho: '1024 MB',
      chunks: 0,
      escritorioId: escA,
      sizeBytes: STORAGE_LIMIT_BYTES,
      indexedStatus: 'indexed',
      failedChunks: 0,
    }).returning({ id: s.documentos.id });
    docIds.push(gigante.id);

    const pdfFull = gerarPdf([
      'MARCADORSTORAGE upload com cliente valido mas storage cheio: o limite de 1 GB deve prevalecer.',
    ]);
    const cheio = await uploadPdf(tokenAdminA, 'cheio-com-cliente.pdf', pdfFull, { colecao: 'clientes', area, clienteId: clienteA });
    assert.equal(cheio.status, 403, cheio.text);
    assert.equal(cheio.json.code, 'STORAGE_LIMIT_EXCEEDED', 'storage check validado junto com clienteId');

    // (b) Libera espaço → upload com clienteId VÁLIDO → 201 + cliente_id persistido.
    const del = await deletarDocumento(tokenAdminA, gigante.id);
    assert.equal(del.status, 204, del.text);

    const pdfOk = gerarPdf([
      'MARCADORSTORAGE upload com cliente valido apos liberar espaco, persistindo o vinculo e o tamanho.',
    ]);
    const ok = await uploadPdf(tokenAdminA, 'com-cliente-ok.pdf', pdfOk, { colecao: 'clientes', area, clienteId: clienteA });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.clienteId, clienteA, 'cliente_id persistido no upload');
    assert.equal(Number(ok.json.sizeBytes), pdfOk.length, 'size_bytes persistido junto');
    docIds.push(ok.json.id);

    // (c) Upload com clienteId de OUTRO escritório → 403 cliente-de-outro-escritorio
    //     (validação de cliente continua intacta com o storage check presente).
    const pdfOutro = gerarPdf([
      'MARCADORSTORAGE upload vinculado a cliente de outro escritorio deve ser rejeitado pela validacao de tenancy.',
    ]);
    const outro = await uploadPdf(tokenAdminA, 'cliente-outro-esc.pdf', pdfOutro, { colecao: 'clientes', area, clienteId: clienteB });
    assert.equal(outro.status, 403, outro.text);
    assert.equal(outro.json.error, 'Cliente informado não pertence ao escritório do usuário.');
  });
});
