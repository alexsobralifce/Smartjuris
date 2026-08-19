import { Router } from 'express';
import { db } from '../db/client.js';
import { lancamentosFinanceiros, timesheet } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { canMutate } from '../middlewares/ownership.js';
import { recordAudit } from '../middlewares/audit.js';
import { encryptField, decryptField } from '../services/crypto.js';
import { parseBody, formatZodError, lancamentoSchema, lancamentoPatchSchema, timesheetSchema } from '../validation/schemas.js';

const router = Router();

// Listar lançamentos financeiros
router.get('/lancamentos', async (req, res) => {
  try {
    const list = await db.select().from(lancamentosFinanceiros).orderBy(desc(lancamentosFinanceiros.vencimento));
    res.json(list.map((l) => ({ ...l, valor: decryptField(l.valor) })));
  } catch (error) {
    console.error('Error fetching lancamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar lançamentos financeiros.' });
  }
});

// Criar lançamento financeiro
router.post('/lancamentos', async (req, res) => {
  try {
    const parsed = parseBody(lancamentoSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const [inserted] = await db.insert(lancamentosFinanceiros).values({
      processoId: data.processoId ?? null,
      cliente: data.cliente,
      tipo: data.tipo,
      valor: encryptField(data.valor),
      vencimento: data.vencimento,
      status: data.status ?? 'pendente',
      usuarioId: (req as any).user?.id ?? null,
    }).returning();
    await recordAudit(req, 'CREATE_LANCAMENTO', { alvoId: inserted.id, detalhes: parsed.data });
    res.status(201).json({ ...inserted, valor: decryptField(inserted.valor) });
  } catch (error) {
    console.error('Error creating lancamento:', error);
    res.status(500).json({ error: 'Erro ao criar lançamento financeiro.' });
  }
});

// Atualizar status do lançamento (pago / pendente / atrasado)
router.patch('/lancamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existente] = await db.select().from(lancamentosFinanceiros).where(eq(lancamentosFinanceiros.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }
    if (!canMutate(req, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const parsed = parseBody(lancamentoPatchSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const patch: { status?: string } = {};
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    const [updated] = await db.update(lancamentosFinanceiros)
      .set(patch)
      .where(eq(lancamentosFinanceiros.id, id))
      .returning();
    await recordAudit(req, 'UPDATE_LANCAMENTO', { alvoId: id, detalhes: parsed.data });
    res.json({ ...updated, valor: decryptField(updated.valor) });
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
    const parsed = parseBody(timesheetSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const [inserted] = await db.insert(timesheet).values({
      processoId: data.processoId ?? null,
      advogado: data.advogado ?? 'Dr. Advogado',
      descricao: data.descricao,
      minutos: data.minutos,
      valorHora: data.valorHora ?? '350,00',
      faturado: 'nao',
      usuarioId: (req as any).user?.id ?? null,
    }).returning();
    await recordAudit(req, 'CREATE_TIMESHEET', { alvoId: inserted.id, detalhes: parsed.data });
    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error creating timesheet entry:', error);
    res.status(500).json({ error: 'Erro ao registrar timesheet.' });
  }
});

export default router;
