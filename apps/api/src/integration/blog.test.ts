// Blog automático: rotas públicas/token, acesso root, publicação (capa obrigatória) e curadoria ponta a ponta
// com feeds, IA e imagem simulados contra o banco real.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { blogArtigos, blogCuradoriaExecucoes } from '../db/schema.js';
import { requireRoot } from '../middlewares/roleGuard.js';
import type { ClienteIA } from '../services/blog/redator.js';

process.env.CURADORIA_TOKEN = 'token-de-teste-123';
// ai.ts cria os clientes OpenAI na importação e exige chave: importar depois de definir as variáveis.
process.env.DEEP_SEEK_API = 'sk-fake-token-plan';
process.env.OPENCODE_API_KEY = 'sk-fake-opencode';
const { default: blogRoutes } = await import('../routes/blog.js');
const { default: rootBlogRoutes } = await import('../routes/rootBlog.js');
const { criarExecucao, processarExecucao } = await import('../services/blog/curadoria.js');
const TAG = `t${randomUUID().slice(0, 8)}`;

const app = express();
app.use(express.json());
app.use('/api/blog', blogRoutes);
// Autenticação simulada: o cabeçalho x-role define o papel (a auth real é testada em outros arquivos).
app.use('/api/root/blog', (req, _res, next) => { (req as any).user = { id: null, role: String(req.header('x-role') ?? 'user') }; next(); }, requireRoot, rootBlogRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const slugPub = `${TAG}-publicado`;
const slugRasc = `${TAG}-rascunho`;
let idRasc = '';

const base_ = { tipo: 'CURADORIA', titulo: 'T', descricao: 'D', categoria: 'Prazos e processos', resumo: 'R', secoes: [], fontes: [] };

before(async () => {
  await db.insert(blogArtigos).values({ ...base_, slug: slugPub, status: 'PUBLICADO', publicadoEm: new Date(), imagem: png1x1, imagemMime: 'image/png' });
  const [r] = await db.insert(blogArtigos).values({ ...base_, slug: slugRasc, status: 'RASCUNHO' }).returning({ id: blogArtigos.id });
  idRasc = r.id;
});

after(async () => {
  await db.delete(blogArtigos).where(like(blogArtigos.slug, `${TAG}%`));
  await db.delete(blogCuradoriaExecucoes).where(eq(blogCuradoriaExecucoes.origem, 'MANUAL'));
  server.close();
  await client.end();
});

describe('rotas públicas', () => {
  test('lista só PUBLICADOS e nunca expõe bytes da imagem', async () => {
    const lista = (await (await fetch(`${base}/api/blog/artigos`)).json()) as any[];
    const meus = lista.filter((a) => String(a.slug).startsWith(TAG));
    assert.deepEqual(meus.map((a) => a.slug), [slugPub]);
    assert.equal(meus[0].imagemUrl, `/api/blog/imagens/${slugPub}`);
    assert.equal('imagem' in meus[0], false);
  });
  test('imagem: publicado serve; rascunho dá 404', async () => {
    const ok = await fetch(`${base}/api/blog/imagens/${slugPub}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/api/blog/imagens/${slugRasc}`)).status, 404);
  });
  test('disparo agendado exige token válido', async () => {
    const sem = await fetch(`${base}/api/blog/curadoria/agendada`, { method: 'POST' });
    assert.equal(sem.status, 401);
    const errado = await fetch(`${base}/api/blog/curadoria/agendada`, { method: 'POST', headers: { 'x-curadoria-token': 'token-de-teste-124' } });
    assert.equal(errado.status, 401);
  });
});

describe('rotas root', () => {
  test('user e admin recebem 403', async () => {
    for (const role of ['user', 'admin']) {
      assert.equal((await fetch(`${base}/api/root/blog`, { headers: { 'x-role': role } })).status, 403);
    }
  });
  test('root lista rascunhos; não publica sem capa; exclui rascunho', async () => {
    const h = { 'x-role': 'root', 'Content-Type': 'application/json' };
    const lista = (await (await fetch(`${base}/api/root/blog`, { headers: h })).json()) as any[];
    assert.ok(lista.some((a) => a.slug === slugRasc && a.temImagem === false));
    const pub = await fetch(`${base}/api/root/blog/${idRasc}/status`, { method: 'POST', headers: h, body: JSON.stringify({ status: 'PUBLICADO' }) });
    assert.equal(pub.status, 409);
    const del = await fetch(`${base}/api/root/blog/${idRasc}`, { method: 'DELETE', headers: h });
    assert.equal(del.status, 200);
  });
  test('não exclui artigo publicado', async () => {
    const [p] = await db.select({ id: blogArtigos.id }).from(blogArtigos).where(eq(blogArtigos.slug, slugPub));
    const del = await fetch(`${base}/api/root/blog/${p.id}`, { method: 'DELETE', headers: { 'x-role': 'root' } });
    assert.equal(del.status, 409);
  });
  test('ID inválido → 400', async () => {
    assert.equal((await fetch(`${base}/api/root/blog/nao-e-uuid`, { headers: { 'x-role': 'root' } })).status, 400);
  });
});

describe('curadoria ponta a ponta (simulada)', () => {
  const agora = new Date().toUTCString();
  const rss = (titulo: string, url: string) => `<rss><channel><item><title>${titulo}</title><link>${url}</link><pubDate>${agora}</pubDate><description>Novo prazo para recurso no CPC altera a rotina dos advogados no processo eletrônico.</description></item></channel></rss>`;
  const fetchFalso = (async (url: string) => {
    if (String(url).includes('conjur.com.br/feed')) return new Response(rss('Novo prazo para recurso no CPC muda rotina de advogados', `https://exemplo.test/${TAG}/a`));
    return new Response('erro', { status: 500 });
  }) as unknown as typeof fetch;

  const palavras = (n: number, b: string) => Array.from({ length: n }, (_, i) => `${b}${i}`).join(' ');
  const artigo = {
    relevante: true, utilidade: 4, motivo: 'ok', titulo: `Prazo recursal em dias úteis exige ajuste ${TAG}`.slice(0, 60),
    descricao: 'Entenda o que muda na contagem do prazo para recurso e como ajustar a agenda do escritório com segurança, passo a passo.',
    alt_imagem: 'Advogado confere prazos em um notebook sobre a mesa de um escritório de advocacia iluminado',
    prompt_imagem: 'A lawyer reviewing deadlines on a laptop in a bright Brazilian law office', categoria: 'Prazos e processos',
    resumo: 'A contagem passa a ser em dias úteis. Revise a agenda.',
    secoes: [
      { titulo: 'O que aconteceu', paragrafos: [palavras(130, 'fato')], lista: [] },
      { titulo: 'Impacto para o escritório', paragrafos: [palavras(130, 'impacto')], lista: ['a'] },
      { titulo: 'Checklist prático', paragrafos: [palavras(130, 'passo')], lista: ['b'] },
    ],
    faq: [],
  };
  const cliente: ClienteIA = {
    gerar: async ({ sistema }) => ({
      texto: sistema.includes('Search Quality Rater')
        ? JSON.stringify({ aprovado: true, experiencia: 5, confianca: 5, intencao: 5, correcoes: [] })
        : JSON.stringify(artigo),
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  };

  test('gera RASCUNHO com fonte, capa e relatório; feed com erro não derruba a rodada', async () => {
    const id = await criarExecucao('MANUAL', 1);
    assert.ok(id);
    assert.equal(await criarExecucao('MANUAL', 1), null, 'segunda execução simultânea é recusada');
    await processarExecucao(id!, 1, { fetchImpl: fetchFalso, cliente, gerarImagem: async () => ({ buffer: png1x1, mime: 'image/png' }) });
    const [exec] = await db.select().from(blogCuradoriaExecucoes).where(eq(blogCuradoriaExecucoes.id, id!));
    assert.equal(exec.status, 'OK');
    assert.equal(exec.geradas, 1);
    const [a] = await db.select().from(blogArtigos).where(eq(blogArtigos.titulo, artigo.titulo));
    assert.ok(a, 'artigo criado');
    assert.equal(a.status, 'RASCUNHO');
    assert.equal(a.origem?.url, `https://exemplo.test/${TAG}/a`);
    assert.equal(a.imagemCredito, 'Imagem ilustrativa gerada por IA');
    assert.ok(a.imagem && a.imagem.length > 0);
    // dedup: a mesma notícia não é curada de novo
    const id2 = await criarExecucao('MANUAL', 1);
    await processarExecucao(id2!, 1, { fetchImpl: fetchFalso, cliente, gerarImagem: async () => null });
    const [exec2] = await db.select().from(blogCuradoriaExecucoes).where(eq(blogCuradoriaExecucoes.id, id2!));
    assert.equal(exec2.geradas, 0);
    await db.delete(blogArtigos).where(eq(blogArtigos.id, a.id));
  });
});
