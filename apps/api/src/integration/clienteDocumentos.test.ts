// ===========================================================================
// Testes de INTEGRAÇÃO HTTP — Fase 8A (Documentos do Cliente)
// ===========================================================================
// Cobre os 9 cenários obrigatórios com AUTENTICAÇÃO REAL (login via
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
process.env.EMBEDDING_BASE_URL = process.env.AI_BASE_URL;
process.env.EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || 'test-key';
process.env.DEEP_SEEK_API = 'sk-fake-embeddings-token-plan';
process.env.REQUIRE_EMAIL_OTP = 'false';

// ---------------------------------------------------------------------------
// 1. Imports dinâmicos do app (módulos reais, singletons por processo)
// ---------------------------------------------------------------------------

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
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

async function listarDocumentos(token: string, query = ''): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${baseUrl}/api/documentos${query}`, {
    headers: { Cookie: `smartjuris_token=${token}` },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* inválido */ }
  // Fase 8B — GET / retorna { documentos, storageUsado, storageLimite }; o
  // unwrap preserva os cenários (array) já existentes.
  if (json && !Array.isArray(json) && Array.isArray(json.documentos)) json = json.documentos;
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
let uAdminB = '';
let uUserA = '';
let clienteA = '';
let clienteB = '';
let tokenAdminA = '';
let tokenAdminB = '';
let tokenUserA = '';

before(async () => {
  if (!dbDisponivel) return;

  const senhaHash = await bcrypt.hash(SENHA, 10);

  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `IT Escritório ClienteAlfa ${randomUUID().slice(0, 8)}`, plano: 'basico', limiteTokensMes: null, ativo: true },
    { nome: `IT Escritório ClienteBeta ${randomUUID().slice(0, 8)}`, plano: 'basico', limiteTokensMes: null, ativo: true },
  ]).returning({ id: s.escritorios.id });
  escA = ea.id; escB = eb.id;
  escIds.push(escA, escB);

  const users = await db.insert(s.usuarios).values([
    { nome: 'Admin ClienteAlfa IT', email: `it.cli.admin.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: escA, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Admin ClienteBeta IT', email: `it.cli.admin.b.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: escB, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Usuário ClienteAlfa IT', email: `it.cli.user.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'user', escritorioId: escA, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, email: s.usuarios.email });
  uAdminA = users[0].id; uAdminB = users[1].id; uUserA = users[2].id;
  userIds.push(uAdminA, uAdminB, uUserA);

  const clientes = await db.insert(s.clientes).values([
    { tipo: 'PF', nome: 'Cliente Prontuário Alfa', cpfCnpj: '111.111.111-11', email: 'cliente.alfa@teste.local', telefone: '(11) 99999-1111', escritorioId: escA, usuarioId: uAdminA },
    { tipo: 'PJ', nome: 'Cliente Prontuário Beta', cpfCnpj: '22.222.222/0001-22', email: 'cliente.beta@teste.local', telefone: '(11) 99999-2222', escritorioId: escB, usuarioId: uAdminB },
  ]).returning({ id: s.clientes.id });
  clienteA = clientes[0].id; clienteB = clientes[1].id;
  clienteIds.push(clienteA, clienteB);

  // Autenticação REAL via POST /api/auth/login (cookie JWT httpOnly).
  const emails = users.map((u) => u.email!);
  tokenAdminA = await login(emails[0], SENHA);
  tokenAdminB = await login(emails[1], SENHA);
  tokenUserA = await login(emails[2], SENHA);
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
// CENÁRIOS OBRIGATÓRIOS (1–9)
// ===========================================================================

describe('Integração HTTP — Fase 8A (documentos do cliente)', { skip: !dbDisponivel }, () => {
  const area = 'Cível';

  test('01. Upload com clienteId válido → 201 + cliente_id persistido', async () => {
    const pdf = gerarPdf([
      'MARCADORCLIENTE doc do cliente alfa: procuração e contrato de honorários tratando de cláusulas, prazo e foro competente.',
    ]);
    const r = await uploadPdf(tokenAdminA, 'proc-cliente-alfa.pdf', pdf, { colecao: 'clientes', area, clienteId: clienteA });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.clienteId, clienteA, 'cliente_id persistido no documento');
    assert.equal(r.json.colecao, 'clientes');
    assert.equal(r.json.escritorioId, escA, 'escopo derivado do contexto autenticado');
    assert.equal(r.json.chunksIndexed, 1);
    docIds.push(r.json.id);

    const [row] = await db.select({ clienteId: s.documentos.clienteId }).from(s.documentos)
      .where(eq(s.documentos.id, r.json.id)).limit(1);
    assert.equal(row.clienteId, clienteA, 'cliente_id confirmado no banco');
  });

  test('02. Upload com clienteId de outro escritório → 403 + auditoria', async () => {
    const pdf = gerarPdf([
      'MARCADORCLIENTE tentativa de anexar documento a cliente de outro escritório com texto de chunk indexável.',
    ]);
    const r = await uploadPdf(tokenAdminA, 'fora-cliente.pdf', pdf, { colecao: 'clientes', area, clienteId: clienteB });
    assert.equal(r.status, 403, r.text);
    assert.equal(r.json.error, 'Cliente informado não pertence ao escritório do usuário.');

    const rows = await db.select({ id: s.documentos.id }).from(s.documentos)
      .where(eq(s.documentos.nome, 'fora-cliente.pdf'));
    assert.equal(rows.length, 0, 'nenhum documento persistido');

    const bloqueio = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'UPLOAD_DOCUMENTO_BLOQUEADO'));
    assert.ok(
      bloqueio.some((b) => b.alvoId === clienteB && (b.detalhes as any)?.motivo === 'cliente-de-outro-escritorio'),
      'auditoria de cliente de outro escritório no upload'
    );
  });

  test('03. Upload sem clienteId → compatibilidade regressiva', async () => {
    const pdf = gerarPdf([
      'MARCADORCLIENTE upload sem vinculo de cliente continua funcionando como antes, com escopo do escritório.',
    ]);
    const r = await uploadPdf(tokenAdminA, 'sem-cliente.pdf', pdf, { colecao: 'Jurisprudência', area });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.clienteId, null, 'cliente_id nulo quando não informado');
    assert.equal(r.json.escritorioId, escA, 'escopo continua derivado do contexto autenticado');
    docIds.push(r.json.id);
  });

  test('04. Listagem sem filtro → todos do escritório (com e sem cliente)', async () => {
    const res = await listarDocumentos(tokenAdminA);
    assert.equal(res.status, 200);
    const lista = res.json;
    assert.ok(Array.isArray(lista));
    assert.ok(lista.some((d: any) => d.nome === 'proc-cliente-alfa.pdf'), 'documento com cliente presente');
    assert.ok(lista.some((d: any) => d.nome === 'sem-cliente.pdf'), 'documento sem cliente presente');
    assert.ok(!lista.some((d: any) => d.clienteId === clienteB), 'nunca lista documentos de cliente de outro escritório');
  });

  test('05. Listagem com clienteId → apenas documentos do cliente', async () => {
    const res = await listarDocumentos(tokenAdminA, `?clienteId=${clienteA}`);
    assert.equal(res.status, 200);
    const lista = res.json;
    assert.ok(Array.isArray(lista));
    assert.ok(lista.some((d: any) => d.nome === 'proc-cliente-alfa.pdf'), 'documento do cliente presente');
    assert.ok(lista.every((d: any) => d.clienteId === clienteA), 'todos os documentos pertencem ao cliente filtrado');
    assert.ok(!lista.some((d: any) => d.nome === 'sem-cliente.pdf'), 'documentos sem cliente não aparecem no filtro');
  });

  test('06. Listagem com clienteId de outro escritório → 403', async () => {
    const res = await listarDocumentos(tokenAdminA, `?clienteId=${clienteB}`);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'Cliente informado não pertence ao escritório do usuário.');
  });

  test('07. DELETE por admin → 204 + chunks removidos + auditoria', async () => {
    const pdf = gerarPdf([
      'MARCADORCLIENTE documento a ser excluido pelo admin, com chunk indexado no banco para validar limpeza.',
      'MARCADORCLIENTE segundo chunk do documento que será excluido, garantindo a remoção completa dos embeddings.',
    ]);
    const up = await uploadPdf(tokenAdminA, 'para-excluir.pdf', pdf, { colecao: 'clientes', area, clienteId: clienteA });
    assert.equal(up.status, 201, up.text);
    const docId = up.json.id;
    docIds.push(docId);

    const chunksAntes = await db.select({ id: s.chunks.id }).from(s.chunks).where(eq(s.chunks.documentoId, docId));
    assert.equal(chunksAntes.length, 2, 'chunks existem antes da exclusão');

    const del = await deletarDocumento(tokenAdminA, docId);
    assert.equal(del.status, 204, del.text);

    const chunksDepois = await db.select({ id: s.chunks.id }).from(s.chunks).where(eq(s.chunks.documentoId, docId));
    assert.equal(chunksDepois.length, 0, 'chunks removidos junto com o documento');

    const [doc] = await db.select({ id: s.documentos.id }).from(s.documentos).where(eq(s.documentos.id, docId));
    assert.equal(doc, undefined, 'documento removido do banco');

    const gerados = await db.select({ id: s.documentosGerados.id }).from(s.documentosGerados)
      .where(eq(s.documentosGerados.documentoId, docId));
    assert.equal(gerados.length, 0, 'referência em documentos_gerados removida');

    const auditoria = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'DELETE_DOCUMENTO'));
    assert.ok(
      auditoria.some((b) => b.alvoId === docId && b.actorId === uAdminA),
      'auditoria DELETE_DOCUMENTO registrada'
    );

    // O documento não aparece mais na listagem do escritório.
    const res = await listarDocumentos(tokenAdminA);
    assert.ok(!res.json.some((d: any) => d.id === docId), 'documento excluído não aparece na listagem');
  });

  test('08. DELETE por user → 403', async () => {
    const pdf = gerarPdf([
      'MARCADORCLIENTE documento que o usuario comum tentara excluir sem permissao de admin.',
    ]);
    const up = await uploadPdf(tokenAdminA, 'usuario-tenta-excluir.pdf', pdf, { colecao: 'clientes', area, clienteId: clienteA });
    assert.equal(up.status, 201, up.text);
    const docId = up.json.id;
    docIds.push(docId);

    const del = await deletarDocumento(tokenUserA, docId);
    assert.equal(del.status, 403, del.text);
    assert.equal(del.json.error, 'Acesso negado.');

    const [doc] = await db.select({ id: s.documentos.id }).from(s.documentos).where(eq(s.documentos.id, docId));
    assert.ok(doc, 'documento permanece após tentativa de exclusão por user');
  });

  test('09. DELETE de documento de outro escritório → 403', async () => {
    const pdf = gerarPdf([
      'MARCADORCLIENTE documento do escritório beta que o admin alfa tentara excluir indevidamente.',
    ]);
    const up = await uploadPdf(tokenAdminB, 'do-escritorio-beta.pdf', pdf, { colecao: 'clientes', area, clienteId: clienteB });
    assert.equal(up.status, 201, up.text);
    const docId = up.json.id;
    docIds.push(docId);

    const del = await deletarDocumento(tokenAdminA, docId);
    assert.equal(del.status, 403, del.text);
    assert.equal(del.json.error, 'Acesso negado.');

    const [doc] = await db.select({ id: s.documentos.id }).from(s.documentos).where(eq(s.documentos.id, docId));
    assert.ok(doc, 'documento de outro escritório permanece intacto');
  });
});
