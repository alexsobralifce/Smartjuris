// ===========================================================================
// Testes de INTEGRAÇÃO HTTP — Fase 2A (isolamento multi-tenant de documentos)
// ===========================================================================
// Cobre os 16 cenários obrigatórios solicitados, com AUTENTICAÇÃO REAL (login
// via POST /api/auth/login + cookie JWT) e servidor Express real (mesmos
// middlewares/montagem de server.ts para as rotas em teste).
//
// Mocks utilizados (apenas serviços externos, como autorizado):
//   • Token Plan/embeddings → servidor HTTP falso (POST /embeddings),
//     com falha injetável por marcador de texto ("FALHAEMBEDDING") para o
//     cenário de falha parcial.
//   • DeepSeek → mutação da instância do cliente OpenAI (deepseekClient.chat)
//     para devolver um stream falso; a rota real /api/rag/generate continua
//     executando integralmente (SSE, contexto, fontes).
//
// NENHUM arquivo de produção é alterado por esta suíte.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { sql, and, eq, inArray } from 'drizzle-orm';
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
      let input = '';
      try { input = (JSON.parse(body) as { input?: string })?.input ?? ''; } catch { /* body inválido */ }
      if (input.includes('FALHAEMBEDDING')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'embedding falhou (fake)' }));
        return;
      }
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
const authRoutes = (await import('../routes/auth.js')).default;
const documentosRoutes = (await import('../routes/documentos.js')).default;
const ragRoutes = (await import('../routes/rag.js')).default;
const rootDocumentosRoutes = (await import('../routes/rootDocumentos.js')).default;
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { requireRoot } = await import('../middlewares/roleGuard.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { requireModule } = await import('../middlewares/moduleGuard.js');
const { globalApiLimiter } = await import('../middlewares/rateLimit.js');
const { deepseekClient } = await import('../services/ai.js');

// Mock do DeepSeek (stream falso; a rota real consome o stream via SSE).
async function* fakeDeepSeekStream(): AsyncGenerator<any> {
  yield { choices: [{ delta: { content: 'Peça fictícia gerada pelo modelo de teste. Termos em que, pede deferimento.' } }] };
  yield { choices: [{ delta: { content: '' } }], usage: { prompt_tokens: 120, completion_tokens: 40 } };
}
(deepseekClient as unknown as { chat: { completions: { create: unknown } } }).chat = {
  completions: {
    create: async () => fakeDeepSeekStream(),
  },
};

// ---------------------------------------------------------------------------
// 2. App Express — mesmos middlewares/montagem de server.ts (somente as rotas
//    sob teste). Sem initLogCapture/graceful-shutdown (específicos do processo
//    de produção).
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/root/documentos', authMiddleware, refreshSession, requireRoot, rootDocumentosRoutes);
app.use('/api/documentos', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, documentosRoutes);
app.use('/api/rag', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, requireModule('pecas'), ragRoutes);
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
// offsets de xref exatos. IMPORTANTE: pdf-parse embarca pdf.js 1.10.100, que
// corrompe buffers < ~5 KB no transporte fake-worker ("bad XRef entry"); por
// isso cada PDF recebe um objeto de preenchimento (~10 KB) para ficar acima do
// limite. Estrutura validada: pdf-parse retorna numpages e texto esperados.
function escPdf(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function gerarPdf(paragrafos: string[]): Buffer {
  const n = paragrafos.length;
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');                       // obj 1
  objects.push(`<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`); // obj 2
  for (let i = 0; i < n; i++) {
    const streamId = 4 + 2 * i;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${2 * n + 3} 0 R >> >> >>`);
    const stream = `BT /F1 12 Tf 72 720 Td (${escPdf(paragrafos[i])}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); // obj 2n+3
  objects.push(`<< /Pad (${'y'.repeat(10_000)}) >>`);                      // preenchimento > 5 KB

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
  try { json = text ? JSON.parse(text) : null; } catch { /* SSE/inválido */ }
  return { status: res.status, json, text };
}

function parseSse(text: string): any[] {
  return text
    .split('\n\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => {
      try { return JSON.parse(l.slice(6)); } catch { return null; }
    })
    .filter(Boolean);
}

async function ragGenerate(
  token: string,
  body: Record<string, unknown>
): Promise<{ status: number; eventos: any[]; text: string }> {
  const res = await fetch(`${baseUrl}/api/rag/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let eventos: any[] = [];
  try { eventos = parseSse(text); } catch { /* JSON normal */ }
  if (eventos.length === 0) {
    try { eventos = [JSON.parse(text)]; } catch { /* vazio */ }
  }
  return { status: res.status, eventos, text };
}

// ---------------------------------------------------------------------------
// 5. Fixtures (escritórios, usuários, processos) + autenticação real
// ---------------------------------------------------------------------------

const escIds: string[] = [];
const procIds: string[] = [];
const docIds: string[] = [];
const userIds: string[] = [];

let escA = '';
let escB = '';
let uAdminA = '';
let uAdminB = '';
let uRoot = '';
let uComum = '';
let procA = '';
let procB = '';
let tokenA = '';
let tokenB = '';
let tokenRoot = '';
let tokenComum = '';
let docB: any = null;

before(async () => {
  if (!dbDisponivel) return;

  const senhaHash = await bcrypt.hash(SENHA, 10);

  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `IT Escritório Alfa ${randomUUID().slice(0, 8)}`, plano: 'basico', limiteTokensMes: null, ativo: true },
    { nome: `IT Escritório Beta ${randomUUID().slice(0, 8)}`, plano: 'basico', limiteTokensMes: null, ativo: true },
  ]).returning({ id: s.escritorios.id });
  escA = ea.id; escB = eb.id;
  escIds.push(escA, escB);

  const users = await db.insert(s.usuarios).values([
    { nome: 'Admin Alfa IT', email: `it.admin.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: escA, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Admin Beta IT', email: `it.admin.b.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'admin', escritorioId: escB, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Root IT', email: `it.root.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'root', escritorioId: null, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Usuário Comum Alfa IT', email: `it.user.a.${randomUUID().slice(0, 8)}@teste.local`, senha: senhaHash, role: 'user', escritorioId: escA, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, email: s.usuarios.email });
  uAdminA = users[0].id; uAdminB = users[1].id; uRoot = users[2].id; uComum = users[3].id;
  userIds.push(uAdminA, uAdminB, uRoot, uComum);

  const procs = await db.insert(s.processos).values([
    { tipo: 'Ação Teste A', cliente: 'Cliente A', adverso: 'Réu A', vara: 'Vara A', area: 'Cível', status: 'ativo', valor: 'R$ 1.000,00', prazo: '2026-12-31', advogado: 'Admin Alfa', escritorioId: escA },
    { tipo: 'Ação Teste B', cliente: 'Cliente B', adverso: 'Réu B', vara: 'Vara B', area: 'Cível', status: 'ativo', valor: 'R$ 2.000,00', prazo: '2026-12-31', advogado: 'Admin Beta', escritorioId: escB },
  ]).returning({ id: s.processos.id });
  procA = procs[0].id; procB = procs[1].id;
  procIds.push(procA, procB);

  // Autenticação REAL via POST /api/auth/login (cookie JWT httpOnly).
  const emails = users.map((u) => u.email!);
  tokenA = await login(emails[0], SENHA);
  tokenB = await login(emails[1], SENHA);
  tokenRoot = await login(emails[2], SENHA);
  tokenComum = await login(emails[3], SENHA);
});

after(async () => {
  if (dbDisponivel) {
    const audit = await db.delete(s.auditLog).where(inArray(s.auditLog.actorId, userIds)).catch(() => null);
    void audit;
    await db.delete(s.logins).where(inArray(s.logins.usuarioId, userIds)).catch(() => {});
    await db.delete(s.tokenUsage).where(inArray(s.tokenUsage.usuarioId, userIds)).catch(() => {});
    await db.delete(s.documentosGerados).where(inArray(s.documentosGerados.usuarioId, userIds)).catch(() => {});
    for (const docId of docIds) await db.delete(s.chunks).where(eq(s.chunks.documentoId, docId)).catch(() => {});
    for (const docId of docIds) await db.delete(s.documentos).where(eq(s.documentos.id, docId)).catch(() => {});
    for (const procId of procIds) await db.delete(s.processos).where(eq(s.processos.id, procId)).catch(() => {});
    for (const uid of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, uid)).catch(() => {});
    for (const escId of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, escId)).catch(() => {});
  }
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => embeddingsServer.close(() => r()));
  await client.end({ timeout: 5 });
});

// ===========================================================================
// CENÁRIOS OBRIGATÓRIOS (1–16)
// ===========================================================================

describe('Integração HTTP — Fase 2A (segurança documental)', { skip: !dbDisponivel }, () => {
  const area = 'Cível';

  test('01. Usuário do escritório A faz upload → 201, documento escopado a A', async () => {
    const pdf = gerarPdf([
      'MARCADORA primeira página do contrato do escritório ALFA tratando de responsabilidade civil contratual, cláusulas de juros e penalidades aplicáveis em caso de inadimplemento.',
      'MARCADORA segunda página do mesmo contrato tratando da cláusula penal, rescisão antecipada e foro competente para dirimir os conflitos entre as partes.',
    ]);
    const r = await uploadPdf(tokenA, 'contrato-escA.pdf', pdf, { colecao: 'Jurisprudência', area });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.escritorioId, escA, 'escopo derivado do contexto autenticado');
    assert.equal(r.json.nome, 'contrato-escA.pdf');
    assert.equal(r.json.chunksIndexed, 2, 'dois chunks indexados (1 por página)');
    docIds.push(r.json.id);
  });

  test('02. Usuário A lista somente documentos de A', async () => {
    const res = await fetch(`${baseUrl}/api/documentos`, {
      headers: { Cookie: `smartjuris_token=${tokenA}` },
    });
    assert.equal(res.status, 200);
    const lista = await res.json();
    assert.ok(Array.isArray(lista));
    assert.ok(lista.some((d: any) => d.nome === 'contrato-escA.pdf'), 'documento de A presente');
    assert.ok(!lista.some((d: any) => d.nome === 'contrato-escB.pdf'), 'documento de B NÃO pode aparecer para A');
  });

  test('03. Usuário B não lista documentos de A (e lista os seus)', async () => {
    const pdfB = gerarPdf([
      'MARCADORB documento exclusivo do escritório BETA sobre cláusula de confidencialidade, multa rescisória e segredo de negócio entre as partes contratantes.',
    ]);
    const r = await uploadPdf(tokenB, 'contrato-escB.pdf', pdfB, { colecao: 'Jurisprudência', area });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.escritorioId, escB);
    docB = r.json;
    docIds.push(docB.id);

    const res = await fetch(`${baseUrl}/api/documentos`, {
      headers: { Cookie: `smartjuris_token=${tokenB}` },
    });
    assert.equal(res.status, 200);
    const lista = await res.json();
    assert.ok(lista.some((d: any) => d.nome === 'contrato-escB.pdf'), 'documento de B presente');
    assert.ok(!lista.some((d: any) => d.nome === 'contrato-escA.pdf'), 'documento de A NÃO pode aparecer para B');
  });

  test('04. Usuário A tenta anexar documento ao processo de B → 403 + auditoria', async () => {
    const pdf = gerarPdf([
      'MARCADORA tentativa de upload vinculada a processo alheio com texto longo o bastante para gerar um chunk indexável.',
    ]);
    const r = await uploadPdf(tokenA, 'fora-processo.pdf', pdf, { colecao: 'Jurisprudência', area, processoId: procB });
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'Processo informado não pertence ao escritório do usuário.');

    const rows = await db.select({ id: s.documentos.id }).from(s.documentos)
      .where(eq(s.documentos.nome, 'fora-processo.pdf'));
    assert.equal(rows.length, 0, 'nenhum documento persistido');
  });

  test('05. Usuário A envia escritorio_id de B no body → 403 + auditoria', async () => {
    const pdf = gerarPdf([
      'MARCADORA tentativa de forçar escopo alheio pelo body com texto longo o bastante para gerar um chunk.',
    ]);
    const r = await uploadPdf(tokenA, 'escopo-forcado.pdf', pdf, { colecao: 'Jurisprudência', area, escritorio_id: escB });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /escritorio_id é derivado do contexto autenticado/);

    const rows = await db.select({ id: s.documentos.id }).from(s.documentos)
      .where(eq(s.documentos.nome, 'escopo-forcado.pdf'));
    assert.equal(rows.length, 0, 'nenhum documento persistido');
  });

  test('06. Usuário A tenta RAG usando processo de B → 403 + auditoria', async () => {
    const r = await ragGenerate(tokenA, {
      tipo: 'Petição Inicial', area, dadosCaso: 'cliente MARCADORA reivindica indenização contratual',
      processoId: procB, isComplex: false,
    });
    assert.equal(r.status, 403, r.text);
    assert.equal(r.eventos[0]?.error, 'Processo informado não pertence ao escritório do usuário.');
  });

  test('07. RAG de A não recupera chunks de B (contexto/fontes só de A)', async () => {
    const r = await ragGenerate(tokenA, {
      tipo: 'Petição Inicial', area, dadosCaso: 'cliente MARCADORA reivindica indenização por cláusula contratual',
      processoId: procA, isComplex: false,
    });
    assert.equal(r.status, 200, r.text.slice(0, 300));
    const final = r.eventos.find((e: any) => e.done === true);
    assert.ok(final, 'evento final (done) presente no stream SSE');
    assert.ok(Array.isArray(final.fontes) && final.fontes.length >= 1, 'fontes recuperadas');
    assert.ok(
      final.fontes.every((f: any) => !f.trecho.includes('MARCADORB')),
      'nenhuma fonte pode conter texto do escritório B'
    );
    assert.ok(
      final.fontes.some((f: any) => f.trecho.includes('MARCADORA')),
      'fontes contêm o chunk do escritório A'
    );
    assert.ok(!(final.prompt ?? '').includes('MARCADORB'), 'prompt não contém contexto de B');
    assert.match(final.conteudo, /Peça fictícia/);
  });

  test('08. Documento sem escopo não aparece para A nem para B (quarentena)', async () => {
    const [legado] = await db.insert(s.documentos).values({
      nome: 'legado-quarentena.pdf',
      colecao: 'Jurisprudência',
      tamanho: '1 MB',
      chunks: 1,
      escritorioId: null,
      processoId: null,
      totalPages: 3,
      indexedStatus: 'unscoped',
      failedChunks: 0,
    }).returning({ id: s.documentos.id });
    docIds.push(legado.id);
    await db.insert(s.chunks).values({
      documentoId: legado.id,
      colecao: 'Jurisprudência',
      texto: 'MARCADORLEGADO texto de documento legado sem escritorio_id permanece em quarentena total.',
      embedding: Array(1024).fill(0.01),
      metadata: { area, fonte: 'legado-quarentena.pdf' },
      escritorioId: null,
      processoId: null,
    });

    for (const token of [tokenA, tokenB]) {
      const res = await fetch(`${baseUrl}/api/documentos`, {
        headers: { Cookie: `smartjuris_token=${token}` },
      });
      const lista = await res.json();
      assert.ok(!lista.some((d: any) => d.id === legado.id), 'documento sem escopo invisível para usuário');
    }
  });

  test('09. Root lista documentos sem escopo', async () => {
    const res = await fetch(`${baseUrl}/api/root/documentos/unscoped`, {
      headers: { Cookie: `smartjuris_token=${tokenRoot}` },
    });
    assert.equal(res.status, 200);
    const lista = await res.json();
    assert.ok(Array.isArray(lista));
    assert.ok(lista.some((d: any) => d.nome === 'legado-quarentena.pdf'), 'root vê a quarentena');
    assert.ok(lista.every((d: any) => d.escritorioId == null && d.indexedStatus === 'unscoped'), 'só documentos sem escopo');
  });

  test('10. Root associa documento sem escopo ao escritório A (propaga aos chunks)', async () => {
    const [legado] = await db.select().from(s.documentos).where(eq(s.documentos.nome, 'legado-quarentena.pdf')).limit(1);
    assert.ok(legado, 'documento legado existe');

    const res = await fetch(`${baseUrl}/api/root/documentos/${legado.id}/escritorio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenRoot}` },
      body: JSON.stringify({ escritorioId: escA }),
    });
    assert.equal(res.status, 200);
    const doc = await res.json();
    assert.equal(doc.escritorioId, escA, 'documento sai da quarentena e é escopado a A');
    assert.equal(doc.indexedStatus, 'indexed');

    const [chunkRow] = await db.select().from(s.chunks).where(eq(s.chunks.documentoId, legado.id)).limit(1);
    assert.equal(chunkRow.escritorioId, escA, 'chunk herdou o escritório na associação');

    // Agora A enxerga e B não.
    const listaA = await (await fetch(`${baseUrl}/api/documentos`, { headers: { Cookie: `smartjuris_token=${tokenA}` } })).json();
    assert.ok(listaA.some((d: any) => d.id === legado.id), 'A passa a enxergar após associação');
    const listaB = await (await fetch(`${baseUrl}/api/documentos`, { headers: { Cookie: `smartjuris_token=${tokenB}` } })).json();
    assert.ok(!listaB.some((d: any) => d.id === legado.id), 'B continua sem enxergar');

    // Extras: erros esperados da rota root.
    const duplicado = await fetch(`${baseUrl}/api/root/documentos/${legado.id}/escritorio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenRoot}` },
      body: JSON.stringify({ escritorioId: escB }),
    });
    assert.equal(duplicado.status, 400);
    assert.match((await duplicado.json()).error, /já possui escopo/);

    const inexistente = await fetch(`${baseUrl}/api/root/documentos/${randomUUID()}/escritorio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenRoot}` },
      body: JSON.stringify({ escritorioId: escA }),
    });
    assert.equal(inexistente.status, 400);
    assert.match((await inexistente.json()).error, /não encontrado/);
  });

  test('11. Usuário comum não acessa /api/root/documentos', async () => {
    const res = await fetch(`${baseUrl}/api/root/documentos/unscoped`, {
      headers: { Cookie: `smartjuris_token=${tokenComum}` },
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'Acesso negado.');

    const resPatch = await fetch(`${baseUrl}/api/root/documentos/${randomUUID()}/escritorio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenComum}` },
      body: JSON.stringify({ escritorioId: escA }),
    });
    assert.equal(resPatch.status, 403);
  });

  test('12. Upload registra total_pages (numpages real do PDF)', async () => {
    const [row] = await db.select({ totalPages: s.documentos.totalPages }).from(s.documentos)
      .where(eq(s.documentos.nome, 'contrato-escA.pdf')).limit(1);
    assert.equal(row.totalPages, 2, 'PDF gerado com 2 páginas → total_pages=2');
  });

  test('13. Upload registra indexed_status coerente com a indexação real', async () => {
    const [row] = await db.select({
      indexedStatus: s.documentos.indexedStatus,
      chunks: s.documentos.chunks,
      failedChunks: s.documentos.failedChunks,
    }).from(s.documentos).where(eq(s.documentos.nome, 'contrato-escA.pdf')).limit(1);
    assert.equal(row.indexedStatus, 'indexed');
    assert.equal(row.chunks, 2);
    assert.equal(row.failedChunks, 0);
  });

  test('14. Falha parcial registra failed_chunks (status failed, sem rollback total)', async () => {
    const pdf = gerarPdf([
      'MARCADORPARCIAL primeiro trecho do documento que será indexado com sucesso pelo serviço de embeddings.',
      'FALHAEMBEDDING segundo trecho cujo embedding deve falhar, marcando failed_chunks e o status do documento como failed.',
    ]);
    const r = await uploadPdf(tokenA, 'parcial.pdf', pdf, { colecao: 'Jurisprudência', area });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.chunksIndexed, 1);
    assert.equal(r.json.failedChunks, 1);
    assert.equal(r.json.indexedStatus, 'failed');
    docIds.push(r.json.id);

    const [row] = await db.select({
      indexedStatus: s.documentos.indexedStatus,
      chunks: s.documentos.chunks,
      failedChunks: s.documentos.failedChunks,
    }).from(s.documentos).where(eq(s.documentos.id, r.json.id)).limit(1);
    assert.equal(row.indexedStatus, 'failed');
    assert.equal(row.chunks, 1, 'apenas chunks bem-sucedidos persistidos');
    assert.equal(row.failedChunks, 1);
  });

  test('15. Rotas retornam status HTTP e mensagens adequadas', async () => {
    // 401 sem token.
    const semToken = await fetch(`${baseUrl}/api/documentos`);
    assert.equal(semToken.status, 401);
    assert.equal((await semToken.json()).error, 'Token não fornecido.');

    // 400 uuid inválido no PATCH root.
    const uuidInvalido = await fetch(`${baseUrl}/api/root/documentos/nao-e-uuid/escritorio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenRoot}` },
      body: JSON.stringify({ escritorioId: escA }),
    });
    assert.equal(uuidInvalido.status, 400);
    assert.equal((await uuidInvalido.json()).error, 'Identificador inválido.');

    // 400 body inválido no PATCH root (escritorioId ausente).
    const semBody = await fetch(`${baseUrl}/api/root/documentos/${randomUUID()}/escritorio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenRoot}` },
      body: JSON.stringify({}),
    });
    assert.equal(semBody.status, 400);

    // 400 upload com processoId malformado (zod).
    const pdf = gerarPdf(['MARCADORA upload com processo inválido no body para validar o schema de entrada.']);
    const r = await uploadPdf(tokenA, 'schema-invalido.pdf', pdf, { colecao: 'Jurisprudência', area, processoId: 'nao-e-uuid' });
    assert.equal(r.status, 400);

    // 404 rota inexistente.
    const notFound = await fetch(`${baseUrl}/api/nao-existe`, { headers: { Cookie: `smartjuris_token=${tokenA}` } });
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json()).error, 'Rota não encontrada.');
  });

  test('16. Auditoria criada em bloqueios de tenancy', async () => {
    const bloqueios = await db.select().from(s.auditLog)
      .where(and(
        inArray(s.auditLog.acao, ['UPLOAD_DOCUMENTO_BLOQUEADO', 'RAG_BLOQUEADO']),
        eq(s.auditLog.actorId, uAdminA),
      ));
    const motivos = bloqueios.map((b) => (b.detalhes as any)?.motivo);

    assert.ok(
      bloqueios.some((b) => b.acao === 'UPLOAD_DOCUMENTO_BLOQUEADO' && (b.detalhes as any)?.motivo === 'escritorio-id-informado-diferente'),
      `auditoria de escritorio_id divergente: ${JSON.stringify(motivos)}`
    );
    assert.ok(
      bloqueios.some((b) => b.acao === 'UPLOAD_DOCUMENTO_BLOQUEADO' && b.alvoId === procB && (b.detalhes as any)?.motivo === 'processo-de-outro-escritorio'),
      'auditoria de processo de outro escritório no upload'
    );
    assert.ok(
      bloqueios.some((b) => b.acao === 'RAG_BLOQUEADO' && b.alvoId === procB && (b.detalhes as any)?.motivo === 'processo-de-outro-escritorio'),
      'auditoria de processo de outro escritório no RAG'
    );

    const assoc = await db.select().from(s.auditLog).where(and(
      eq(s.auditLog.acao, 'ASSOCIAR_DOCUMENTO_ESCRITORIO'),
      eq(s.auditLog.actorId, uRoot),
    ));
    assert.ok(
      assoc.some((b) => (b.detalhes as any)?.escritorioId === escA && typeof (b.detalhes as any)?.chunksAtualizados === 'number'),
      'auditoria da associação manual root'
    );
  });

  test('17. Primeiro login: 1ª autenticação devolve primeiroLogin:true; a 2ª, primeiroLogin:false', async () => {
    const email = `it.pl.${randomUUID().slice(0, 8)}@teste.local`;
    const [u] = await db.insert(s.usuarios).values([
      { nome: 'Primeiro Login IT', email, senha: await bcrypt.hash(SENHA, 10), role: 'admin', escritorioId: escA, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(u.id); // cleanup do after() (logins + usuário)

    const loginComBody = async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: SENHA }),
      });
      assert.equal(res.status, 200, `login falhou para ${email}`);
      return res.json() as Promise<any>;
    };

    // 1ª autenticação: ultimoLogin era NULL → primeiroLogin:true.
    const body1 = await loginComBody();
    assert.equal(body1.user?.primeiroLogin, true, 'primeira autenticação reporta primeiroLogin:true');

    // 2ª autenticação: ultimoLogin já preenchido pelo 1º login → primeiroLogin:false.
    const body2 = await loginComBody();
    assert.equal(body2.user?.primeiroLogin, false, 'segunda autenticação reporta primeiroLogin:false');
  });
});
