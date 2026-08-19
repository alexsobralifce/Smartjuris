import { Router } from 'express';
import { db } from '../db/client';
import { processos } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await db.select().from(processos).orderBy(processos.createdAt);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar processos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const novo = await db.insert(processos).values(req.body).returning();
    res.status(201).json(novo[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar processo' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const atualizado = await db.update(processos).set(req.body).where(eq(processos.id, id)).returning();
    res.json(atualizado[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar processo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await db.delete(processos).where(eq(processos.id, id));
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar processo' });
  }
});

export default router;
