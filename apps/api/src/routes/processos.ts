import { Router } from 'express';
import { db } from '../db/client.js';
import { processos } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../middlewares/roleGuard.js';
import { canMutateTenant } from '../middlewares/ownership.js';
import { tenantScope, tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, processosSchema, processosPatchSchema, uuidSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await db.select().from(processos)
      .where(tenantScope(req, processos))
      .orderBy(processos.createdAt);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar processos.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const escritorioId = tenantScopeEscritorioId(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(processosSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const novo = await db.insert(processos).values({
      numero: data.numero ?? null,
      tipo: data.tipo,
      cliente: data.cliente,
      adverso: data.adverso,
      vara: data.vara,
      area: data.area,
      status: data.status,
      valor: data.valor,
      prazo: data.prazo,
      advogado: data.advogado ?? '',
      usuarioId: (req as any).user?.id ?? null,
      escritorioId,
    }).returning();
    await recordAudit(req, 'CREATE_PROCESSO', { alvoId: novo[0].id, detalhes: parsed.data });
    res.status(201).json(novo[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar processo' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(processos).where(eq(processos.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const parsed = parseBody(processosPatchSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const atualizado = await db.update(processos).set(parsed.data).where(eq(processos.id, id)).returning();
    await recordAudit(req, 'UPDATE_PROCESSO', { alvoId: id, detalhes: parsed.data });
    res.json(atualizado[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar processo' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(processos).where(eq(processos.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    await db.delete(processos).where(eq(processos.id, id));
    await recordAudit(req, 'DELETE_PROCESSO', { alvoId: id, detalhes: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar processo' });
  }
});

export default router;
