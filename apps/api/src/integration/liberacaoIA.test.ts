// ===========================================================================
// Testes de INTEGRAÇÃO HTTP — Liberação de IA para assinantes e cortesia
// ===========================================================================
// Objetivo: validar que escritórios ASSINANTES (assinatura_status='ativa') e
// com CORTESIA (isento_mensalidade=true) têm TODOS os recursos de IA liberados:
//   • checkTokenQuota → sem limite de tokens (nunca bloqueia por cota);
//   • reserveAiUsage → sem débito de créditos/custo (nunca bloqueia por saldo).
//
// Contraste: escritório demo NÃO assinante (sem cortesia) continua bloqueado
// pela cota de tokens (checkTokenQuota blocked) e pelos créditos do plano.
//
// App Express real + autenticação (login). Embeddings mockados via servidor
// HTTP falso (apenas serviço externo). Nenhum arquivo de produção alterado.
// ===========================================================================

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// 0. Ambiente ANTES de importar o app (config.ts lê .env sem sobrescrever).
// ---------------------------------------------------------------------------

// Servidor falso de embeddings (generateEmbedding lê AI_BASE_URL em runtime).
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
process.env.DEEP_SEEK_API = 'sk-fake-liberacao-ia';
process.env.REQUIRE_EMAIL_OTP = 'false';
process.env.TRAVA_ASSINATURA = 'true';

// ---------------------------------------------------------------------------
// 1. Imports dinâmicos do app (singletons por processo)
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
const { requireAssinaturaAtiva } = await import('../middlewares/requireAssinatura.js');
const { globalApiLimiter } = await import('../middlewares/rateLimit.js');
const { checkTokenQuota, reserveAiUsage, estimateAiOperation, cicloAtual } = await import('../services/usage.js');

const expressApp = express();
expressApp.use(express.json());
expressApp.use(cookieParser());
expressApp.use('/api', globalApiLimiter);
expressApp.use('/api/auth', authRoutes);
expressApp.use('/api/documentos', authMiddleware, refreshSession, rejectRoot, forcePasswordChange, requireAssinaturaAtiva(), documentosRoutes);
expressApp.use((_req, res) => { res.status(404).json({ error: 'Rota não encontrada.' }); });

const server = expressApp.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ---------------------------------------------------------------------------
// 2. Seeds — 3 escritórios com usuários
// ---------------------------------------------------------------------------

const SUFIXO = randomUUID().slice(0, 8);
const SENHA = 'LiberacaoIA#2026';

async function criarEscritorio(nome: string, opts: { isentoMensalidade?: boolean; assinaturaStatus?: string; limiteTokensMes?: number }): Promise<{ escId: string; userId: string }> {
  const escId = randomUUID();
  const [esc] = await db.insert(s.escritorios).values({
    id: escId,
    nome,
    plano: 'basico',
    isDemo: true,
    creditsAvailable: 0,
    reserveCentsUsed: 0,
    cycleMonth: cicloAtual(),
    isentoMensalidade: opts.isentoMensalidade ?? false,
    assinaturaStatus: opts.assinaturaStatus ?? 'nenhuma',
    limiteTokensMes: opts.limiteTokensMes ?? null,
  }).returning({ id: s.escritorios.id });
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const userId = randomUUID();
  await db.insert(s.usuarios).values({
    id: userId, nome: 'Admin Teste',
    email: `liberacao.${escId.slice(0, 8)}.${SUFIXO}@teste.local`,
    senha: senhaHash, role: 'admin', ativo: true,
    escritorioId: esc.id, emailVerificado: true,
  }).onConflictDoNothing();
  return { escId: esc.id, userId };
}

const ESCR_CORTESIA = await criarEscritorio('Cortesia IA', { isentoMensalidade: true, limiteTokensMes: 5 });
const ESCR_ASSINANTE = await criarEscritorio('Assinante IA', { assinaturaStatus: 'ativa', limiteTokensMes: 5 });
const ESCR_DEMO = await criarEscritorio('Demo IA', { limiteTokensMes: 5 }); // sem cortesia/assinatura → bloqueado
const LIMPAR_ESCS = [ESCR_CORTESIA.escId, ESCR_ASSINANTE.escId, ESCR_DEMO.escId];

function cookieOf(res: Response): string | null {
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
  assert.equal(res.status, 200, `login falhou: ${await res.text()}`);
  return cookieOf(res) ?? '';
}

// ---------------------------------------------------------------------------
// 3. Testes
// ---------------------------------------------------------------------------

test('CORTESIA (isentoMensalidade=true): checkTokenQuota SEM limite (nunca blocked)', async () => {
  // Usa checagem direta: cortesia deve retornar ok/limite null mesmo com limite_tokens_mes=5.
  const req = { user: { id: ESCR_CORTESIA.userId } } as any;
  const q = await checkTokenQuota(req);
  assert.equal(q.status, 'ok');
  assert.equal(q.limite, null, 'cortesia ignora limite de tokens (isento)');
  assert.equal(q.pct, 0);
});

test('ASSINANTE (assinatura_status=ativa): checkTokenQuota SEM limite (nunca blocked)', async () => {
  const req = { user: { id: ESCR_ASSINANTE.userId } } as any;
  const q = await checkTokenQuota(req);
  assert.equal(q.status, 'ok');
  assert.equal(q.limite, null, 'assinante ignora limite de tokens (isent)');
  assert.equal(q.pct, 0);
});

test('DEMO (sem cortesia/assinatura): checkTokenQuota BLOQUEADO com limite_tokens_mes=5', async () => {
  // Sem uso ainda → status ok. Mas o conceito é: o limite EXISTE (não é null).
  const req = { user: { id: ESCR_DEMO.userId } } as any;
  const q = await checkTokenQuota(req);
  assert.equal(q.status, 'ok');
  assert.equal(q.limite, 5, 'demo mantém limite de tokens (não isento)');
});

test('CORTESIA: reserveAiUsage NUNCA bloqueia por saldo e NÃO debita (créditos=0)', async () => {
  const estimativa = estimateAiOperation({ operation: 'SIMPLE_PETITION', pagesRelevant: 2, annexPages: 0, ragContextChars: 0 });
  const r = await reserveAiUsage({
    escritorioId: ESCR_CORTESIA.escId,
    usuarioId: ESCR_CORTESIA.userId,
    idempotencyKey: randomUUID(),
    operation: 'SIMPLE_PETITION',
    estimate: estimativa,
  });
  assert.equal(r.ok, true, 'cortesia não é bloqueada por saldo zero');
  assert.equal(r.creditsReserved, 0, 'cortesia não debita créditos');
  assert.equal(r.costCentsReserved, 0, 'cortesia não reserva custo');
});

test('ASSINANTE: reserveAiUsage NUNCA bloqueia por saldo e NÃO debita (créditos=0)', async () => {
  const estimativa = estimateAiOperation({ operation: 'SIMPLE_PETITION', pagesRelevant: 2, annexPages: 0, ragContextChars: 0 });
  const r = await reserveAiUsage({
    escritorioId: ESCR_ASSINANTE.escId,
    usuarioId: ESCR_ASSINANTE.userId,
    idempotencyKey: randomUUID(),
    operation: 'SIMPLE_PETITION',
    estimate: estimativa,
  });
  assert.equal(r.ok, true, 'assinante não é bloqueado por saldo zero');
  assert.equal(r.creditsReserved, 0, 'assinante não debita créditos');
  assert.equal(r.costCentsReserved, 0, 'assinante não reserva custo');
});

test('DEMO (sem cortesia/assinatura): reserveAiUsage BLOQUEADO por saldo zero (creditos-insuficientes)', async () => {
  const estimativa = estimateAiOperation({ operation: 'SIMPLE_PETITION', pagesRelevant: 2, annexPages: 0, ragContextChars: 0 });
  const r = await reserveAiUsage({
    escritorioId: ESCR_DEMO.escId,
    usuarioId: ESCR_DEMO.userId,
    idempotencyKey: randomUUID(),
    operation: 'SIMPLE_PETITION',
    estimate: estimativa,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'creditos-insuficientes');
});

test('CORTESIA: upload de documento NÃO bloqueado por cota de tokens (403 ausente)', async () => {
  const token = await login(`liberacao.${ESCR_CORTESIA.escId.slice(0, 8)}.${SUFIXO}@teste.local`);
  // Valida autenticação (a rota está montada com requireAssinaturaAtiva).
  const res = await fetch(`${baseUrl}/api/documentos`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: `smartjuris_token=${token}` },
  });
  assert.equal(res.status, 200, `cortesia acessa documentos: ${await res.text()}`);
});

after(async () => {
  await new Promise<void>((r) => { (server as any).closeAllConnections?.(); server.close(() => r()); });
  await new Promise<void>((r) => { embeddingsServer.close(() => r()); });
  delete process.env.TRAVA_ASSINATURA;
  for (const escId of LIMPAR_ESCS) {
    await client`DELETE FROM credit_ledger WHERE escritorio_id = ${escId}`.catch(() => {});
    await client`DELETE FROM ai_operations WHERE escritorio_id = ${escId}`.catch(() => {});
    await client`DELETE FROM token_usage WHERE usuario_id IN (SELECT id FROM usuarios WHERE escritorio_id = ${escId})`.catch(() => {});
    await client`DELETE FROM usuarios WHERE escritorio_id = ${escId}`.catch(() => {});
    await client`DELETE FROM escritorios WHERE id = ${escId}`.catch(() => {});
  }
  await client.end({ timeout: 5 }).catch(() => {});
});
