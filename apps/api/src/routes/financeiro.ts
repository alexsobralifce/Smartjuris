import { Router } from 'express';
import { db } from '../db/client.js';
import { lancamentosFinanceiros, timesheet } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// Listar lançamentos financeiros
router.get('/lancamentos', async (req, res) => {
  try {
    const list = await db.select().from(lancamentosFinanceiros).orderBy(desc(lancamentosFinanceiros.vencimento));
    res.json(list);
  } catch (error) {
    console.error('Error fetching lancamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar lançamentos financeiros.' });
  }
});

// Criar lançamento financeiro
router.post('/lancamentos', async (req, res) => {
  try {
    const { processoId, cliente, tipo, valor, vencimento, status } = req.body;
    const [inserted] = await db.insert(lancamentosFinanceiros).values({
      processoId: processoId || null,
      cliente,
      tipo,
      valor,
      vencimento,
      status: status || 'pendente'
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error creating lancamento:', error);
    res.status(500).json({ error: 'Erro ao criar lançamento financeiro.' });
  }
});

// Atualizar status do lançamento (pago / pendente / atrasado)
router.patch('/lancamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const [updated] = await db.update(lancamentosFinanceiros)
      .set({ status })
      .where(eq(lancamentosFinanceiros.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error('Error updating lancamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar lançamento.' });
  }
});

// Listar horas gravadas no Timesheet
router.get('/timesheet', async (req, res) => {
  try {
    const list = await db.select().from(timesheet).orderBy(desc(timesheet.created_at));
    res.json(list);
  } catch (error) {
    console.error('Error fetching timesheet:', error);
    res.status(500).json({ error: 'Erro ao buscar registros de timesheet.' });
  }
});

// Registrar entrada de Timesheet
router.post('/timesheet', async (req, res) => {
  try {
    const { processoId, advogado, descricao, minutos, valorHora } = req.body;
    const [inserted] = await db.insert(timesheet).values({
      processoId: processoId || null,
      advogado: advogado || 'Dr. Advogado',
      descricao,
      minutos: Number(minutos) || 30,
      valorHora: valorHora || '350,00',
      faturado: 'nao'
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error creating timesheet entry:', error);
    res.status(500).json({ error: 'Erro ao registrar timesheet.' });
  }
});

export default router;
