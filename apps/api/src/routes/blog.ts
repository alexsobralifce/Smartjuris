import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { blogArtigos } from '../db/schema.js';
import { criarExecucao, jaRodouNaSemana, processarExecucao } from '../services/blog/curadoria.js';

// Público: lido pelo build do web (pré-renderização) e pelo robô agendado. Só artigos PUBLICADOS saem daqui.
const router = Router();

router.get('/artigos', async (_req, res) => {
  try {
    const rows = await db
      .select({
        slug: blogArtigos.slug, titulo: blogArtigos.titulo, descricao: blogArtigos.descricao, categoria: blogArtigos.categoria,
        autor: blogArtigos.autor, resumo: blogArtigos.resumo, secoes: blogArtigos.secoes, faq: blogArtigos.faq,
        fontes: blogArtigos.fontes, origem: blogArtigos.origem, imagemAlt: blogArtigos.imagemAlt, imagemCredito: blogArtigos.imagemCredito,
        imagemMime: blogArtigos.imagemMime, publicadoEm: blogArtigos.publicadoEm, atualizadoEm: blogArtigos.atualizadoEm,
      })
      .from(blogArtigos)
      .where(eq(blogArtigos.status, 'PUBLICADO'))
      .orderBy(desc(blogArtigos.publicadoEm));
    res.set('Cache-Control', 'public, max-age=300');
    res.json(rows.map((r) => ({ ...r, imagemUrl: r.imagemMime ? `/api/blog/imagens/${r.slug}` : null })));
  } catch (e) {
    console.error('[Blog] listar artigos:', e);
    res.status(500).json({ error: 'Erro ao listar artigos.' });
  }
});

router.get('/imagens/:slug', async (req, res) => {
  try {
    const [row] = await db
      .select({ imagem: blogArtigos.imagem, mime: blogArtigos.imagemMime })
      .from(blogArtigos)
      .where(and(eq(blogArtigos.slug, req.params.slug), eq(blogArtigos.status, 'PUBLICADO')))
      .limit(1);
    if (!row?.imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
    res.set('Content-Type', row.mime ?? 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(row.imagem);
  } catch (e) {
    console.error('[Blog] imagem:', e);
    res.status(500).json({ error: 'Erro ao carregar imagem.' });
  }
});

const tokenValido = (recebido: unknown): boolean => {
  const esperado = process.env.CURADORIA_TOKEN;
  if (!esperado || typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

const corpoAgendada = z.object({ quantidade: z.number().int().min(1).max(4).default(3) }).default({ quantidade: 3 });

// Disparo semanal (GitHub Actions). Sempre gera RASCUNHOS; o root aprova no painel.
router.post('/curadoria/agendada', async (req, res) => {
  if (!tokenValido(req.header('x-curadoria-token'))) return res.status(401).json({ error: 'Não autorizado.' });
  const parsed = corpoAgendada.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Parâmetros inválidos.' });
  try {
    if (await jaRodouNaSemana()) return res.json({ status: 'ignorada', motivo: 'A curadoria desta semana já foi atendida ou está em andamento.' });
    const { quantidade } = parsed.data;
    const id = await criarExecucao('AGENDADA', quantidade);
    if (!id) return res.json({ status: 'ignorada', motivo: 'Já existe uma execução em andamento.' });
    void processarExecucao(id, quantidade);
    res.status(202).json({ status: 'iniciada', execucaoId: id });
  } catch (e) {
    console.error('[Blog] curadoria agendada:', e);
    res.status(500).json({ error: 'Erro ao iniciar a curadoria.' });
  }
});

export default router;
