import { Router } from 'express';
import { db } from '../db/client.js';
import { clientes } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin } from '../middlewares/roleGuard.js';
import { canMutateTenant } from '../middlewares/ownership.js';
import { tenantScope, tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { encryptField, decryptField } from '../services/crypto.js';
import { parseBody, formatZodError, clienteSchema, clientePatchSchema, uuidSchema } from '../validation/schemas.js';

const router = Router();

// Listar todos os clientes
router.get('/', async (req, res) => {
  try {
    const list = await db.select().from(clientes)
      .where(tenantScope(req, clientes))
      .orderBy(desc(clientes.createdAt));
    res.json(list.map((c) => ({ ...c, cpfCnpj: decryptField(c.cpfCnpj) })));
  } catch (error) {
    console.error('Error fetching clientes:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes.' });
  }
});

// Criar novo cliente
router.post('/', async (req, res) => {
  try {
    const escritorioId = tenantScopeEscritorioId(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(clienteSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const [inserted] = await db.insert(clientes).values({
      tipo: data.tipo,
      nome: data.nome,
      cpfCnpj: encryptField(data.cpfCnpj),
      email: data.email,
      telefone: data.telefone,
      cep: data.cep ?? '',
      logradouro: data.logradouro ?? '',
      numero: data.numero ?? '',
      complemento: data.complemento ?? '',
      bairro: data.bairro ?? '',
      cidade: data.cidade ?? '',
      uf: data.uf ?? '',
      qualificacao: data.qualificacao ?? '',
      usuarioId: (req as any).user?.id ?? null,
      escritorioId,
    }).returning();

    await recordAudit(req, 'CREATE_CLIENTE', { alvoId: inserted.id, detalhes: parsed.data });
    res.status(201).json({ ...inserted, cpfCnpj: decryptField(inserted.cpfCnpj) });
  } catch (error) {
    console.error('Error creating cliente:', error);
    res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
  }
});

// Atualizar cliente
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const parsed = parseBody(clientePatchSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const updateData = { ...parsed.data };
    if (parsed.data.cpfCnpj !== undefined) {
      updateData.cpfCnpj = encryptField(parsed.data.cpfCnpj);
    }
    const [updated] = await db.update(clientes)
      .set(updateData)
      .where(eq(clientes.id, id))
      .returning();
    await recordAudit(req, 'UPDATE_CLIENTE', { alvoId: id, detalhes: parsed.data });
    res.json({ ...updated, cpfCnpj: decryptField(updated.cpfCnpj) });
  } catch (error) {
    console.error('Error updating cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

// Deletar cliente
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    await db.delete(clientes).where(eq(clientes.id, id));
    await recordAudit(req, 'DELETE_CLIENTE', { alvoId: id, detalhes: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting cliente:', error);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

export default router;
