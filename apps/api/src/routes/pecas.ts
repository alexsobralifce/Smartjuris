import { Router } from 'express';
import { db } from '../db/client';
import { pecas } from '../db/schema';
import { eq } from 'drizzle-orm';

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
    const nova = await db.insert(pecas).values(req.body).returning();
    res.status(201).json(nova[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar peça' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const atualizada = await db.update(pecas).set(req.body).where(eq(pecas.id, id)).returning();
    res.json(atualizada[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar peça' });
  }
});

export default router;
