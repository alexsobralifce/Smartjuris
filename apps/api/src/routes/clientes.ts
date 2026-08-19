import { Router } from 'express';
import { db } from '../db/client.js';
import { clientes } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// Listar todos os clientes
router.get('/', async (req, res) => {
  try {
    const list = await db.select().from(clientes).orderBy(desc(clientes.createdAt));
    res.json(list);
  } catch (error) {
    console.error('Error fetching clientes:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes.' });
  }
});

// Criar novo cliente
router.post('/', async (req, res) => {
  try {
    const { tipo, nome, cpfCnpj, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, qualificacao } = req.body;

    const [inserted] = await db.insert(clientes).values({
      tipo: tipo || 'PF',
      nome,
      cpfCnpj: cpfCnpj || '000.000.000-00',
      email: email || '',
      telefone: telefone || '',
      cep: cep || '',
      logradouro: logradouro || '',
      numero: numero || '',
      complemento: complemento || '',
      bairro: bairro || '',
      cidade: cidade || '',
      uf: uf || '',
      qualificacao: qualificacao || ''
    }).returning();

    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error creating cliente:', error);
    res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
  }
});

// Atualizar cliente
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body;
    const [updated] = await db.update(clientes)
      .set(patch)
      .where(eq(clientes.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error('Error updating cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

// Deletar cliente
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(clientes).where(eq(clientes.id, id));
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting cliente:', error);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

export default router;
