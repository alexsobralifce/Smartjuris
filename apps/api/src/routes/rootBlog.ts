import { Router } from 'express';
import multer from 'multer';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { blogArtigos } from '../db/schema.js';
import { requireRoot } from '../middlewares/roleGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { criarExecucao, listarExecucoes, processarExecucao } from '../services/blog/curadoria.js';
import { CATEGORIAS } from '../services/blog/redator.js';
import { CREDITO_IMAGEM, gerarImagem, paraWebp } from '../services/blog/imagem.js';
import { agendadorRebuild, redeployDoSite, rebuildConfigurado } from '../services/blog/rebuild.js';

// Revisão do blog: apenas root. Montado em /api/root/blog.
const router = Router();
router.use(requireRoot);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const idSchema = z.string().uuid();

const colunasLista = {
  id: blogArtigos.id, slug: blogArtigos.slug, status: blogArtigos.status, titulo: blogArtigos.titulo, categoria: blogArtigos.categoria,
  descricao: blogArtigos.descricao, origem: blogArtigos.origem, publicadoEm: blogArtigos.publicadoEm, criadoEm: blogArtigos.criadoEm,
  temImagem: sql<boolean>`(${blogArtigos.imagem} IS NOT NULL)`,
};

router.get('/', async (_req, res) => {
  try {
    res.json(await db.select(colunasLista).from(blogArtigos).orderBy(desc(blogArtigos.criadoEm)).limit(200));
  } catch (e) {
    console.error('[RootBlog] listar:', e);
    res.status(500).json({ error: 'Erro ao listar artigos.' });
  }
});

router.get('/execucoes', async (_req, res) => {
  try {
    res.json(await listarExecucoes(10));
  } catch (e) {
    console.error('[RootBlog] execuções:', e);
    res.status(500).json({ error: 'Erro ao listar execuções.' });
  }
});

router.post('/curadoria', async (req, res) => {
  const parsed = z.object({ quantidade: z.number().int().min(1).max(4).default(3) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Parâmetros inválidos.' });
  try {
    const id = await criarExecucao('MANUAL', parsed.data.quantidade);
    if (!id) return res.status(409).json({ error: 'Já existe uma execução em andamento.' });
    void processarExecucao(id, parsed.data.quantidade);
    await recordAudit(req, 'BLOG_CURADORIA_MANUAL', { alvoId: id, detalhes: { quantidade: parsed.data.quantidade } });
    res.status(202).json({ status: 'iniciada', execucaoId: id });
  } catch (e) {
    console.error('[RootBlog] curadoria:', e);
    res.status(500).json({ error: 'Erro ao iniciar a curadoria.' });
  }
});

router.post('/republicar', async (req, res) => {
  if (!rebuildConfigurado()) return res.status(409).json({ error: 'Redeploy automático não configurado (RAILWAY_*).' });
  try {
    await redeployDoSite();
    await recordAudit(req, 'BLOG_REPUBLICAR_SITE');
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Falha ao pedir redeploy.' });
  }
});

router.get('/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  const [row] = await db
    .select({ ...colunasLista, resumo: blogArtigos.resumo, secoes: blogArtigos.secoes, faq: blogArtigos.faq, fontes: blogArtigos.fontes, imagemAlt: blogArtigos.imagemAlt, imagemCredito: blogArtigos.imagemCredito })
    .from(blogArtigos)
    .where(eq(blogArtigos.id, req.params.id))
    .limit(1);
  if (!row) return res.status(404).json({ error: 'Artigo não encontrado.' });
  res.json(row);
});

// Prévia da capa (inclusive de rascunhos) para o painel.
router.get('/:id/imagem', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  const [row] = await db.select({ imagem: blogArtigos.imagem, mime: blogArtigos.imagemMime }).from(blogArtigos).where(eq(blogArtigos.id, req.params.id)).limit(1);
  if (!row?.imagem) return res.status(404).json({ error: 'Sem imagem.' });
  res.set('Content-Type', row.mime ?? 'image/webp');
  res.set('Cache-Control', 'private, no-cache');
  res.send(row.imagem);
});

const edicao = z.object({
  titulo: z.string().trim().min(5).max(120).optional(),
  descricao: z.string().trim().min(20).max(200).optional(),
  resumo: z.string().trim().min(10).max(600).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  imagemAlt: z.string().trim().min(10).max(200).optional(),
  secoes: z.array(z.object({ titulo: z.string().trim().min(1), paragrafos: z.array(z.string()), lista: z.array(z.string()).optional() })).min(1).optional(),
  faq: z.array(z.object({ q: z.string().trim().min(1), a: z.string().trim().min(1) })).optional(),
});

router.patch('/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  const parsed = edicao.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', detalhes: parsed.error.flatten() });
  try {
    const [row] = await db.update(blogArtigos).set({ ...parsed.data, atualizadoEm: new Date() }).where(eq(blogArtigos.id, req.params.id)).returning({ id: blogArtigos.id, status: blogArtigos.status });
    if (!row) return res.status(404).json({ error: 'Artigo não encontrado.' });
    if (row.status === 'PUBLICADO') agendadorRebuild.agendar();
    await recordAudit(req, 'BLOG_EDITAR', { alvoId: row.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[RootBlog] editar:', e);
    res.status(500).json({ error: 'Erro ao editar artigo.' });
  }
});

router.post('/:id/status', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  const parsed = z.object({ status: z.enum(['PUBLICADO', 'DESPUBLICADO', 'RASCUNHO']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Status inválido.' });
  try {
    const [atual] = await db.select({ status: blogArtigos.status, publicadoEm: blogArtigos.publicadoEm, temImagem: sql<boolean>`(${blogArtigos.imagem} IS NOT NULL)` }).from(blogArtigos).where(eq(blogArtigos.id, req.params.id)).limit(1);
    if (!atual) return res.status(404).json({ error: 'Artigo não encontrado.' });
    if (parsed.data.status === 'PUBLICADO' && !atual.temImagem) {
      return res.status(409).json({ error: 'Gere ou envie a capa antes de publicar.' });
    }
    await db
      .update(blogArtigos)
      .set({
        status: parsed.data.status,
        publicadoEm: parsed.data.status === 'PUBLICADO' ? (atual.publicadoEm ?? new Date()) : atual.publicadoEm,
        atualizadoEm: new Date(),
      })
      .where(eq(blogArtigos.id, req.params.id));
    if (parsed.data.status === 'PUBLICADO' || atual.status === 'PUBLICADO') agendadorRebuild.agendar();
    await recordAudit(req, `BLOG_${parsed.data.status}`, { alvoId: req.params.id });
    res.json({ ok: true, redeployAgendado: rebuildConfigurado() });
  } catch (e) {
    console.error('[RootBlog] status:', e);
    res.status(500).json({ error: 'Erro ao alterar status.' });
  }
});

router.post('/:id/imagem/regenerar', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [row] = await db.select({ titulo: blogArtigos.titulo, alt: blogArtigos.imagemAlt }).from(blogArtigos).where(eq(blogArtigos.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: 'Artigo não encontrado.' });
    const img = await gerarImagem(row.alt ?? row.titulo, row.titulo);
    if (!img) return res.status(502).json({ error: 'Não foi possível gerar a imagem (verifique OPENAI_API_KEY).' });
    await db.update(blogArtigos).set({ imagem: img.buffer, imagemMime: img.mime, imagemCredito: CREDITO_IMAGEM, atualizadoEm: new Date() }).where(eq(blogArtigos.id, req.params.id));
    await recordAudit(req, 'BLOG_IMAGEM_REGENERAR', { alvoId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[RootBlog] regenerar imagem:', e);
    res.status(500).json({ error: 'Erro ao regenerar imagem.' });
  }
});

router.post('/:id/imagem', upload.single('imagem'), async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  const arquivo = req.file;
  if (!arquivo || !['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.mimetype)) {
    return res.status(400).json({ error: 'Envie uma imagem PNG, JPEG ou WEBP de até 5 MB.' });
  }
  try {
    const img = await paraWebp(arquivo.buffer);
    const credito = typeof req.body?.credito === 'string' && req.body.credito.trim() ? req.body.credito.trim().slice(0, 200) : 'Imagem enviada pela equipe SmartJuris';
    const [row] = await db.update(blogArtigos).set({ imagem: img.buffer, imagemMime: img.mime, imagemCredito: credito, atualizadoEm: new Date() }).where(eq(blogArtigos.id, req.params.id)).returning({ id: blogArtigos.id });
    if (!row) return res.status(404).json({ error: 'Artigo não encontrado.' });
    await recordAudit(req, 'BLOG_IMAGEM_UPLOAD', { alvoId: row.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[RootBlog] upload imagem:', e);
    res.status(500).json({ error: 'Erro ao salvar imagem.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [atual] = await db.select({ status: blogArtigos.status }).from(blogArtigos).where(eq(blogArtigos.id, req.params.id)).limit(1);
    if (!atual) return res.status(404).json({ error: 'Artigo não encontrado.' });
    if (atual.status === 'PUBLICADO') return res.status(409).json({ error: 'Despublique o artigo antes de excluir.' });
    await db.delete(blogArtigos).where(eq(blogArtigos.id, req.params.id));
    await recordAudit(req, 'BLOG_EXCLUIR', { alvoId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[RootBlog] excluir:', e);
    res.status(500).json({ error: 'Erro ao excluir artigo.' });
  }
});

export default router;
