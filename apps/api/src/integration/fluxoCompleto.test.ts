// ===========================================================================
// Fase 4A — Testes END-TO-END do fluxo completo de operação de IA.
//
// Stack REAL (Express + Postgres local + orquestrador 2F + classificador
// 2B/2C + SSE 3C + idempotência 3D), mockando APENAS:
//   • DeepSeek (deepseekClient.chat) → stream SSE fake com usage REAL;
//   • Ollama (embeddings) → servidor HTTP falso em OLLAMA_URL.
//
// Cenários:
//   1. Feliz encadeado: login → upload/indexação → processo → classificação →
//      reserva → geração SSE → persistência idempotente → validação →
//      exportação → débito real (tokens/ledger/saldo).
//   2. Replay idempotente da MESMA chave (gerar-sse) → reemite operacao+texto,
//      sem nova operação nem nova cobrança.
//   3. Falha AMBÍGUA do provedor → evento erro com reconciliacao, reserva
//      retida, NENHUMA peça criada (fail-closed).
//   4. Isolamento multi-tenant: escritório B não vê/exporta dados de A e a
//      mesma chave em B cria operação INDEPENDENTE.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { sql, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import express from 'express';
import cookieParser from 'cookie-parser';

// 0. Ambiente determinístico (login sem OTP).
process.env.REQUIRE_EMAIL_OTP = 'false';

// 1. Fake Ollama (embeddings) ANTES de qualquer import que use embedding.
const ollamaServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/embeddings') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ embedding: Array(1024).fill(0.01) }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise<void>((r) => ollamaServer.listen(0, '127.0.0.1', r));
const ollamaPort = (ollamaServer.address() as AddressInfo).port;
process.env.OLLAMA_URL = `http://127.0.0.1:${ollamaPort}`;

// 2. JWT_SECRET do .env raiz (mesmo padrão da suíte 3C).
import { readFileSync } from 'node:fs';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  try {
    const env = readFileSync(new URL('../../../../.env', import.meta.url), 'utf8');
    const m = env.match(/^JWT_SECRET=(.+)$/m);
    if (m) process.env.JWT_SECRET = m[1].trim();
  } catch { /* config.ts cuida */ }
}
await import('../config.js');

// 2.1 REDIRECIONA o app inteiro para o banco de testes ISOLADO ANTES de
//     importar o db client: E2E_DATABASE_URL obrigatória (já carregada do
//     .env), sem fallback — ausente/inválida falha antes de iniciar a app.
const { obterE2EDatabaseUrl } = await import('./e2eInfra.js');
process.env.DATABASE_URL = obterE2EDatabaseUrl();

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { runMigrations } = await import('../db/migrate.js');
const { deepseekClient } = await import('../services/ai.js');
const { default: authRoutes } = await import('../routes/auth.js');
const { default: processosRoutes } = await import('../routes/processos.js');
const { default: documentosRoutes } = await import('../routes/documentos.js');
const { default: pecasRoutes } = await import('../routes/pecas.js');
const { authMiddleware } = await import('../middlewares/auth.js');
const { refreshSession } = await import('../middlewares/refreshSession.js');
const { rejectRoot } = await import('../middlewares/rejectRoot.js');
const { forcePasswordChange } = await import('../middlewares/forcePasswordChange.js');
const { globalApiLimiter } = await import('../middlewares/rateLimit.js');
const { verificarPostgresE2E } = await import('./e2eInfra.js');

// Schema completo no banco de testes isolado (migrations oficiais) + guard.
await runMigrations();
await verificarPostgresE2E();

// App Express real (mesma cadeia da montagem de produção).
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/processos', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, processosRoutes);
app.use('/api/documentos', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, documentosRoutes);
app.use('/api/pecas', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, pecasRoutes);
app.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ---------------------------------------------------------------------------
// Mock do DeepSeek: stream SSE fake com usage REAL; modos de erro injetáveis.
//   'ok'            → stream normal (FLASH e PRO);
//   'ambiguo'       → falha de rede (sem resposta) em qualquer modelo;
//   'fallback-flash'→ 429 ESTRUTURADO no FLASH (confirmação de não
//                     processamento) e stream normal no PRO.
// ---------------------------------------------------------------------------
let modoProvedor: 'ok' | 'ambiguo' | 'fallback-flash' = 'ok';
function mockStreamDeepSeek() {
  (deepseekClient as any).chat = {
    completions: {
      create: async (params: any) => {
        const modelo = String(params?.model ?? '');
        if (modoProvedor === 'fallback-flash' && !modelo.includes('pro')) {
          // 4xx client (429) → CONFIRMAÇÃO estruturada de não processamento:
          // o orquestrador autoriza o fallback Flash→Pro (política 3B).
          throw Object.assign(new Error('rate limit do provedor (HTTP 429)'), { status: 429 });
        }
        if (modoProvedor === 'ambiguo') {
          // Falha de rede (sem resposta) → ambígua (5xx/timeout/rede).
          throw new TypeError('fetch failed: socket hang up');
        }
        return (async function* () {
          yield { choices: [{ delta: { content: 'Texto gerado da peça.' } }] };
          yield { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } };
        })();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers: login, PDF mínimo (mesmo padrão 2A), upload, SSE.
// ---------------------------------------------------------------------------
const SENHA = 'TesteSenha#2026';

function cookieDoLogin(res: Response): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [String(h.get('set-cookie') ?? '')];
  const c = list.find((x) => x.startsWith('smartjuris_token='));
  return c ? c.split(';')[0].slice('smartjuris_token='.length) : null;
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  });
  assert.equal(res.status, 200, `login falhou para ${email}: ${await res.text()}`);
  const token = cookieDoLogin(res);
  assert.ok(token, `cookie de sessão não emitido para ${email}`);
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

/** Consome o body SSE e devolve os eventos tipados. */
async function lerEventosSSE(res: Response): Promise<any[]> {
  const body = await res.text();
  return body
    .split('\n\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.replace(/^data: /, '')));
}

async function gerarSSE(token: string, body: Record<string, unknown>): Promise<{ status: number; eventos: any[] }> {
  const res = await fetch(`${baseUrl}/api/pecas/gerar-sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, eventos: res.status === 200 ? await lerEventosSSE(res) : [] };
}

// ---------------------------------------------------------------------------
// Setup: escritórios A (office, 100 créditos) e B; usuários; login.
// ---------------------------------------------------------------------------
const suffix = randomUUID().slice(0, 8);
const escIds: string[] = [];
const userIds: string[] = [];
let escA = '';
let escB = '';
let tokenA = '';
let tokenB = '';
let processoAId = '';
let pecaIdE2e = '';
let chaveE2e = '';

before(async () => {
  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `E2E A ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    { nome: `E2E B ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escA = ea.id;
  escB = eb.id;
  escIds.push(ea.id, eb.id);

  const hash = await bcrypt.hash(SENHA, 10);
  const users = await db.insert(s.usuarios).values([
    { nome: 'E2E Admin A', email: `e2e.a.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'E2E Admin B', email: `e2e.b.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id });
  userIds.push(users[0].id, users[1].id);

  tokenA = await login(`e2e.a.${suffix}@teste.local`);
  tokenB = await login(`e2e.b.${suffix}@teste.local`);
  mockStreamDeepSeek();
});

after(async () => {
  ollamaServer.close();
  let falhaCleanup: unknown = null;
  try {
    // Cleanup COMPLETO em ordem filha→pai, SEM engolir erros: qualquer falha
    // de limpeza falha a suíte (o revisor exige remoção integral dos dados E2E).
    await db.delete(s.creditLedger).where(inArray(s.creditLedger.escritorioId, escIds));
    await db.delete(s.aiOperations).where(inArray(s.aiOperations.escritorioId, escIds));
    await db.delete(s.documentosGerados).where(inArray(s.documentosGerados.usuarioId, userIds));
    await db.delete(s.chunks).where(inArray(s.chunks.escritorioId, escIds));
    await db.delete(s.documentos).where(inArray(s.documentos.escritorioId, escIds));
    await db.delete(s.pecas).where(inArray(s.pecas.escritorioId, escIds));
    await db.delete(s.processos).where(inArray(s.processos.escritorioId, escIds));
    await db.delete(s.auditLog).where(inArray(s.auditLog.actorId, userIds));
    await db.delete(s.logins).where(inArray(s.logins.usuarioId, userIds));
    await db.delete(s.tokenUsage).where(inArray(s.tokenUsage.usuarioId, userIds));
    await db.delete(s.usuarios).where(inArray(s.usuarios.id, userIds));
    await db.delete(s.escritorios).where(inArray(s.escritorios.id, escIds));

    // Verificação pós-cleanup: NENHUM resíduo da execução (sufixo do run).
    const contar = async (tabela: any, coluna: any) => {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(tabela).where(inArray(coluna, escIds));
      return r?.n ?? 0;
    };
    assert.equal(await contar(s.creditLedger, s.creditLedger.escritorioId), 0, 'credit_ledger limpo');
    assert.equal(await contar(s.aiOperations, s.aiOperations.escritorioId), 0, 'ai_operations limpo');
    assert.equal(await contar(s.chunks, s.chunks.escritorioId), 0, 'chunks limpos');
    assert.equal(await contar(s.documentos, s.documentos.escritorioId), 0, 'documentos limpos');
    assert.equal(await contar(s.pecas, s.pecas.escritorioId), 0, 'peças limpas');
    assert.equal(await contar(s.processos, s.processos.escritorioId), 0, 'processos limpos');
    assert.equal(await contar(s.usuarios, s.usuarios.id), 0, 'usuários limpos');
    assert.equal(await contar(s.escritorios, s.escritorios.id), 0, 'escritórios limpos');
    const [dg] = await db.select({ n: sql<number>`count(*)::int` }).from(s.documentosGerados).where(inArray(s.documentosGerados.usuarioId, userIds));
    assert.equal(dg?.n ?? 0, 0, 'documentos_gerados limpos');
    const [aud] = await db.select({ n: sql<number>`count(*)::int` }).from(s.auditLog).where(inArray(s.auditLog.actorId, userIds));
    assert.equal(aud?.n ?? 0, 0, 'audit_log limpo');
    const [logs] = await db.select({ n: sql<number>`count(*)::int` }).from(s.logins).where(inArray(s.logins.usuarioId, userIds));
    assert.equal(logs?.n ?? 0, 0, 'logins limpos');
    const [tu] = await db.select({ n: sql<number>`count(*)::int` }).from(s.tokenUsage).where(inArray(s.tokenUsage.usuarioId, userIds));
    assert.equal(tu?.n ?? 0, 0, 'token_usage limpo');
  } catch (err) {
    falhaCleanup = err;
  } finally {
    // SEMPRE encerra servidor/cliente (evita hang do runner com handles abertos).
    server.close();
    await client.end({ timeout: 5 });
  }
  if (falhaCleanup) throw falhaCleanup;
});

describe('4A — fluxo end-to-end (stack real, provedores mockados)', () => {
  test('CENÁRIO ENCADEADO: login→upload→processo→geração SSE→persistência→validação→exportação→débito real', async () => {
    // 1. Upload + indexação (fake Ollama).
    const up = await uploadPdf(tokenA, `peticao-${suffix}.pdf`, gerarPdf(['Contrato de prestação de serviços de consultoria jurídica firmado em 2026.']), {
      colecao: 'teste-e2e',
      area: 'Cível',
    });
    assert.equal(up.status, 201, `upload falhou: ${JSON.stringify(up.json)}`);
    assert.ok(up.json?.chunksIndexed >= 1, 'documento indexado em chunks');

    // 2. Processo do escritório A.
    const procRes = await fetch(`${baseUrl}/api/processos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenA}` },
      body: JSON.stringify({
        tipo: 'Contestação',
        cliente: 'Cliente E2E',
        adverso: 'Parte Adversa',
        vara: '1ª Vara Cível',
        area: 'Cível',
        status: 'ativo',
        valor: '10000',
        prazo: '2026-12-31',
      }),
    });
    const procBody = await procRes.text();
    assert.equal(procRes.status, 201, `processo falhou: ${procBody}`);
    processoAId = JSON.parse(procBody).id;
    assert.ok(processoAId, 'id do processo');

    // 3. Geração SSE (sem RAG → determinístico; idempotencyKey própria).
    chaveE2e = `e2e-${suffix}`;
    const gen = await gerarSSE(tokenA, {
      pieceType: 'Contestação',
      area: 'Cível',
      dadosCaso: `Caso E2E ${suffix} — cobrança indevida.`,
      processoId: processoAId,
      outputSize: 'STANDARD',
      includeJurisprudence: false,
      idempotencyKey: chaveE2e,
    });
    assert.equal(gen.status, 200, 'SSE 200');
    const tipos = gen.eventos.map((e) => e.type);
    for (const t of ['operacao', 'progresso', 'texto', 'concluido']) {
      assert.ok(tipos.includes(t), `evento ${t} presente`);
    }
    const concluido = gen.eventos.find((e) => e.type === 'concluido');
    assert.ok(concluido.operationId, 'operationId no concluido');
    assert.equal(concluido.tokens.in, 120, 'tokens de entrada REAIS');
    assert.equal(concluido.tokens.out, 30, 'tokens de saída REAIS');
    assert.ok(concluido.saldo.credits < 100, 'créditos debitados no saldo');

    // 4. Débito real: operação succeeded com usage real + ledger RESERVE/SETTLE.
    const [op] = await db.select().from(s.aiOperations).where(eq(s.aiOperations.idempotencyKey, chaveE2e)).limit(1);
    assert.ok(op, 'operação persistida');
    assert.equal(op.status, 'succeeded', 'operação liquidada');
    // CLASSIFICAÇÃO/ORQUESTRAÇÃO: a decisão de rota ficou persistida (2C/2F):
    // operation_type (catálogo 2B), modelo e limites derivados do classificador.
    assert.ok(op.operationType, 'operation_type persistido (catálogo 2B)');
    assert.ok(String(op.model).toLowerCase().includes('flash'), `modelo FLASH classificado (${op.model})`);
    assert.ok(Number(op.creditsReserved) > 0, 'créditos reservados > 0 (estimativa 2C)');
    assert.ok(Number(op.maxInputTokens) > 0, 'maxInputTokens derivado da classificação');
    assert.ok(Number(op.maxOutputTokens) > 0, 'maxOutputTokens derivado da classificação');
    assert.equal(Number(op.tokensIn), 120, 'tokens de entrada reais persistidos');
    assert.equal(Number(op.tokensOut), 30, 'tokens de saída reais persistidos');
    const ledger = await db.select().from(s.creditLedger).where(eq(s.creditLedger.operationId, op.id));
    const kinds = ledger.map((l) => l.kind).sort();
    assert.ok(kinds.includes('RESERVE') && kinds.includes('SETTLE'), `ledger com RESERVE+SETTLE (${kinds.join(',')})`);
    assert.ok(ledger.some((l) => l.kind === 'RESERVE' && Number(l.creditsDelta) < 0), 'RESERVE debita créditos');

    // 5. Persistência idempotente da peça (migration 0023): replay do POST
    //    com a MESMA chave devolve a MESMA peça.
    const corpoPeca = {
      tipo: 'Contestação',
      area: 'Cível',
      cliente: 'Cliente E2E',
      status: 'revisao',
      prazo: '2026-12-31',
      modelo: 'DeepSeek (classificação de servidor + fallback Flash/Pro)',
      fontes: 0,
      conteudo: 'Texto gerado da peça.',
      idempotencyKey: chaveE2e,
    };
    const p1 = await fetch(`${baseUrl}/api/pecas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenA}` },
      body: JSON.stringify(corpoPeca),
    });
    assert.equal(p1.status, 201, 'peça criada');
    pecaIdE2e = (await p1.json()).id;
    const p2 = await fetch(`${baseUrl}/api/pecas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenA}` },
      body: JSON.stringify(corpoPeca),
    });
    assert.equal(p2.status, 200, 'replay devolve a peça existente');
    assert.equal((await p2.json()).id, pecaIdE2e, 'mesma peça — sem duplicata');

    // 6. Validação humana → aprovação.
    const patch = await fetch(`${baseUrl}/api/pecas/${pecaIdE2e}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${tokenA}` },
      body: JSON.stringify({ status: 'aprovado' }),
    });
    assert.equal(patch.status, 200, 'PATCH aprovado');

    // 7. Exportação (só aprovado/protocolado; backend valida).
    const exp = await fetch(`${baseUrl}/api/pecas/${pecaIdE2e}/export`, {
      headers: { Cookie: `smartjuris_token=${tokenA}` },
    });
    assert.equal(exp.status, 200, 'exportação PDF 200');
    assert.ok((exp.headers.get('content-type') ?? '').includes('application/pdf'), 'content-type PDF');
  });

  test('REPLAY idempotente do gerar-sse: mesma chave reemite operacao+texto SEM nova operação E SEM nova cobrança', async () => {
    // Estado financeiro ANTES do replay (saldo, reserva usada, ledger).
    const [escAntes] = await db.select().from(s.escritorios).where(eq(s.escritorios.id, escA)).limit(1);
    const ledgerAntes = await db.select().from(s.creditLedger).where(eq(s.creditLedger.operationId, (await db.select({ id: s.aiOperations.id }).from(s.aiOperations).where(eq(s.aiOperations.idempotencyKey, chaveE2e)).limit(1))[0].id));
    const cardinalidadeAntes = ledgerAntes.length;
    const deltasAntes = ledgerAntes.map((l) => `${l.kind}:${Number(l.creditsDelta)}:${Number(l.costCents)}`).sort();

    const replay = await gerarSSE(tokenA, {
      pieceType: 'Contestação',
      area: 'Cível',
      dadosCaso: `Caso E2E ${suffix} — cobrança indevida.`,
      processoId: processoAId,
      outputSize: 'STANDARD',
      includeJurisprudence: false,
      idempotencyKey: chaveE2e,
    });
    assert.equal(replay.status, 200, 'replay 200');
    const tipos = replay.eventos.map((e) => e.type);
    assert.ok(tipos.includes('operacao'), 'replay reemite operacao');
    assert.ok(tipos.includes('texto'), 'replay reemite texto persistido');
    assert.ok(tipos.includes('concluido'), 'replay conclui');
    const ops = await db.select().from(s.aiOperations).where(eq(s.aiOperations.idempotencyKey, chaveE2e));
    assert.equal(ops.length, 1, 'NENHUMA nova operação no replay');

    // SEM NOVA COBRANÇA: saldo, reserveCentsUsed e ledger idênticos ao pré-replay.
    const [escDepois] = await db.select().from(s.escritorios).where(eq(s.escritorios.id, escA)).limit(1);
    assert.equal(Number(escDepois.creditsAvailable), Number(escAntes.creditsAvailable), 'saldo inalterado no replay');
    assert.equal(Number(escDepois.reserveCentsUsed), Number(escAntes.reserveCentsUsed), 'reserveCentsUsed inalterado no replay');
    const ledgerDepois = await db.select().from(s.creditLedger).where(eq(s.creditLedger.operationId, ops[0].id));
    assert.equal(ledgerDepois.length, cardinalidadeAntes, 'cardinalidade do ledger inalterada');
    const deltasDepois = ledgerDepois.map((l) => `${l.kind}:${Number(l.creditsDelta)}:${Number(l.costCents)}`).sort();
    assert.deepEqual(deltasDepois, deltasAntes, 'conjunto RESERVE/SETTLE e deltas financeiros inalterados');
  });

  test('FALHA AMBÍGUA do provedor → erro com reconciliacao, reserva retida, NENHUMA peça', async () => {
    modoProvedor = 'ambiguo';
    try {
      const chaveAmb = `e2e-amb-${suffix}`;
      const gen = await gerarSSE(tokenA, {
        pieceType: 'Petição Inicial',
        area: 'Cível',
        dadosCaso: `Caso ambíguo ${suffix}.`,
        includeJurisprudence: false,
        idempotencyKey: chaveAmb,
      });
      assert.equal(gen.status, 200, 'headers SSE emitidos antes do erro');
      const erro = gen.eventos.find((e) => e.type === 'erro');
      assert.ok(erro, 'evento erro emitido');
      assert.equal(erro.code, 'falha-ambigua-reconciliacao-pendente', 'código de reconciliação');
      assert.equal(erro.reconciliacao, true, 'sinaliza reconciliação (fail-closed)');
      assert.ok(!gen.eventos.some((e) => e.type === 'concluido'), 'SEM evento concluido');
      // Reserva retida: operação NÃO liquidada (status reservado/running).
      const [op] = await db.select().from(s.aiOperations).where(eq(s.aiOperations.idempotencyKey, chaveAmb)).limit(1);
      assert.ok(op, 'operação registrada');
      assert.notEqual(op.status, 'succeeded', 'operação NÃO liquidada em falha ambígua');
      const ledger = await db.select().from(s.creditLedger).where(eq(s.creditLedger.idempotencyKey, chaveAmb));
      assert.ok(ledger.some((l) => l.kind === 'RESERVE'), 'reserva feita');
      assert.ok(!ledger.some((l) => l.kind === 'SETTLE'), 'SEM settle em falha ambígua');
      // Nenhuma peça criada para esta geração.
      const pecas = await db.select().from(s.pecas).where(eq(s.pecas.idempotencyKey, chaveAmb));
      assert.equal(pecas.length, 0, 'nenhuma peça persistida');
    } finally {
      modoProvedor = 'ok';
    }
  });

  test('FALLBACK Flash→Pro: 429 ESTRUTURADO no FLASH aciona o PRO e liquida com o modelo Pro', async () => {
    modoProvedor = 'fallback-flash';
    try {
      const chaveFb = `e2e-fb-${suffix}`;
      const gen = await gerarSSE(tokenA, {
        pieceType: 'Contestação',
        area: 'Cível',
        dadosCaso: `Caso fallback ${suffix}.`,
        includeJurisprudence: false,
        idempotencyKey: chaveFb,
      });
      assert.equal(gen.status, 200, 'SSE 200');
      const tipos = gen.eventos.map((e) => e.type);
      assert.ok(tipos.includes('concluido'), 'fallback bem-sucedido emite concluido');
      assert.ok(!gen.eventos.some((e) => e.type === 'erro'), 'sem evento erro no fallback de sucesso');

      // Operação FLASH: registrada e NÃO liquidada (falhou → reserva liberada).
      const [opFlash] = await db.select().from(s.aiOperations).where(eq(s.aiOperations.idempotencyKey, chaveFb)).limit(1);
      assert.ok(opFlash, 'operação FLASH registrada');
      assert.notEqual(opFlash.status, 'succeeded', 'FLASH não liquidada (falhou com 429)');

      // Operação PRO do fallback: chave reservada `smartjuris:fallback:<chave>:pro`,
      // vinculada à FLASH (parent_operation_id) e LIQUIDADA com uso real.
      const chavePro = `smartjuris:fallback:${chaveFb}:pro`;
      const [opPro] = await db.select().from(s.aiOperations).where(eq(s.aiOperations.idempotencyKey, chavePro)).limit(1);
      assert.ok(opPro, 'operação PRO de fallback criada');
      assert.equal(opPro.parentOperationId, opFlash.id, 'PRO vinculada à FLASH via parent_operation_id');
      assert.equal(opPro.status, 'succeeded', 'PRO liquidada');
      assert.ok(String(opPro.modelUsed).toLowerCase().includes('pro'), `modelo Pro usado (${opPro.modelUsed})`);
      assert.equal(Number(opPro.tokensIn), 120, 'uso real do PRO persistido (tokens_in)');
      assert.equal(Number(opPro.tokensOut), 30, 'uso real do PRO persistido (tokens_out)');
      const ledgerPro = await db.select().from(s.creditLedger).where(eq(s.creditLedger.operationId, opPro.id));
      assert.ok(ledgerPro.some((l) => l.kind === 'SETTLE'), 'SETTLE do PRO registrado no ledger');
      assert.ok(ledgerPro.some((l) => l.kind === 'RESERVE'), 'RESERVE do PRO registrado no ledger');
      // SEM LIQUIDAÇÃO ÓRFÃ: o vínculo é gravado ATÔNOMO na criação da reserva
      // (mesmo insert) — toda operação liquidada deste fallback carrega o par
      // parent→flash; nenhuma SETTLE pode existir sem rastreabilidade.
      const opsFb = await db.select().from(s.aiOperations).where(inArray(s.aiOperations.id, [opFlash.id, opPro.id]));
      const liquidadaSemVinculo = opsFb.filter((o) => o.status === 'succeeded' && (!o.parentOperationId || o.id !== opPro.id));
      assert.equal(liquidadaSemVinculo.length, 0, 'nenhuma operação liquidada sem vínculo de fallback');
    } finally {
      modoProvedor = 'ok';
    }
  });

  test('ISOLAMENTO multi-tenant: B não vê peças de A; mesma chave em B cria operação INDEPENDENTE', async () => {
    // B não lista as peças de A.
    const lista = await fetch(`${baseUrl}/api/pecas`, {
      headers: { Cookie: `smartjuris_token=${tokenB}` },
    });
    assert.equal(lista.status, 200);
    const pecasB = await lista.json();
    assert.ok(!pecasB.some((p: any) => p.id === pecaIdE2e), 'B não enxerga peça de A');

    // B não exporta peça de A (404/403 — peça fora do escopo).
    const expB = await fetch(`${baseUrl}/api/pecas/${pecaIdE2e}/export`, {
      headers: { Cookie: `smartjuris_token=${tokenB}` },
    });
    assert.ok([403, 404].includes(expB.status), `B bloqueado na exportação da peça de A (${expB.status})`);

    // MESMA idempotencyKey em B → operação NOVA (chave é por escritório).
    const genB = await gerarSSE(tokenB, {
      pieceType: 'Contestação',
      area: 'Cível',
      dadosCaso: `Caso B ${suffix}.`,
      includeJurisprudence: false,
      idempotencyKey: chaveE2e,
    });
    assert.equal(genB.status, 200, 'B gera com a mesma chave');
    const opB = await db.select().from(s.aiOperations)
      .innerJoin(s.escritorios, eq(s.aiOperations.escritorioId, s.escritorios.id))
      .where(eq(s.aiOperations.idempotencyKey, chaveE2e));
    assert.equal(opB.length, 2, 'duas operações (A e B) com a MESMA chave — isoladas por escritório');
    const escritoriosEnvolvidos = new Set(opB.map((r: any) => r.ai_operations?.escritorioId ?? r.ai_operations?.escritorio_id));
    assert.equal(escritoriosEnvolvidos.size, 2, 'operações em escritórios distintos');
  });
});
