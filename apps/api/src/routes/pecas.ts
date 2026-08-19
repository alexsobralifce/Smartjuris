import { Router } from 'express';
import { db } from '../db/client.js';
import { pecas, documentosGerados } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { canMutate } from '../middlewares/ownership.js';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, pecasSchema, pecasPatchSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await db.select().from(pecas).orderBy(pecas.geradoEm);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar peças' });
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = parseBody(pecasSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const [nova] = await db.insert(pecas).values({
      processoId: data.processoId ?? null,
      tipo: data.tipo,
      area: data.area,
      cliente: data.cliente,
      status: data.status,
      prazo: data.prazo,
      modelo: data.modelo,
      fontes: data.fontes,
      conteudo: data.conteudo,
      usuarioId: (req as any).user?.id ?? null,
    }).returning();
    if (nova) {
      await db.insert(documentosGerados).values({
        usuarioId: (req as any).user?.id ?? null,
        pecaId: nova.id,
        tipo: 'peca_gerada',
        titulo: nova.tipo,
      });
    }
    await recordAudit(req, 'CREATE_PECA', {
      alvoId: nova.id,
      detalhes: {
        tipo: data.tipo,
        area: data.area,
        cliente: data.cliente,
        status: data.status,
        prazo: data.prazo,
        modelo: data.modelo,
        fontes: data.fontes,
      },
    });
    res.status(201).json(nova);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar peça' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [existente] = await db.select().from(pecas).where(eq(pecas.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Peça não encontrada.' });
    }
    if (!canMutate(req, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const parsed = parseBody(pecasPatchSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    // Peças aprovadas/protocoladas são congeladas: conteúdo não pode ser alterado
    if ((existente.status === 'aprovado' || existente.status === 'protocolado') && parsed.data.conteudo !== undefined) {
      return res.status(403).json({ error: 'Peça aprovada ou protocolada não pode ter conteúdo alterado.' });
    }
    const atualizada = await db.update(pecas).set({
      ...parsed.data,
      updatedAt: new Date(),
      updatedBy: (req as any).user?.id ?? null,
    }).where(eq(pecas.id, id)).returning();
    const { conteudo: _conteudo, ...pecaAuditData } = parsed.data;
    await recordAudit(req, 'UPDATE_PECA', { alvoId: id, detalhes: pecaAuditData });
    res.json(atualizada[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar peça' });
  }
});

export default router;
