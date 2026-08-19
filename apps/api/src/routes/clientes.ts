import { Router } from 'express';
import { db } from '../db/client.js';
import { clientes } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

const defaultClientes = [
  {
    tipo: 'PF',
    nome: 'Fernanda Oliveira',
    cpfCnpj: '321.654.987-00',
    email: 'fernanda.oliveira@email.com',
    telefone: '(11) 98765-4321',
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    numero: '100',
    complemento: 'Apto 42',
    bairro: 'Sé',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 321.654.987-00, residente e domiciliada na Praça da Sé, nº 100, Sé, São Paulo/SP, CEP 01001-000'
  },
  {
    tipo: 'PF',
    nome: 'Roberto Souza',
    cpfCnpj: '123.456.789-11',
    email: 'roberto.souza@email.com',
    telefone: '(11) 97654-3210',
    cep: '04001-000',
    logradouro: 'Rua Vergueiro',
    numero: '500',
    complemento: 'Bloco B',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileiro, casado, engenheiro civil, inscrito no CPF sob o nº 123.456.789-11, residente e domiciliado na Rua Vergueiro, nº 500, Vila Mariana, São Paulo/SP, CEP 04001-000'
  },
  {
    tipo: 'PJ',
    nome: 'Construtora Alfa',
    cpfCnpj: '12.345.678/0001-99',
    email: 'contato@construtoraalfa.com.br',
    telefone: '(11) 3344-5566',
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    numero: '1500',
    complemento: 'Conj 81',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-99, com sede na Avenida Paulista, nº 1500, Conj 81, Bela Vista, São Paulo/SP, CEP 01310-100'
  },
  {
    tipo: 'PF',
    nome: 'Lúcia Ferreira',
    cpfCnpj: '456.789.012-33',
    email: 'lucia.ferreira@email.com',
    telefone: '(11) 96543-2109',
    cep: '05401-000',
    logradouro: 'Rua Teodoro Sampaio',
    numero: '800',
    complemento: 'Apto 12',
    bairro: 'Pinheiros',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileira, viúva, aposentada, inscrita no CPF sob o nº 456.789.012-33, residente e domiciliada na Rua Teodoro Sampaio, nº 800, Pinheiros, São Paulo/SP, CEP 05401-000'
  },
  {
    tipo: 'PJ',
    nome: 'Indústria Metalúrgica Sul',
    cpfCnpj: '98.765.432/0001-10',
    email: 'diretoria@metalsul.com.br',
    telefone: '(11) 4004-9988',
    cep: '09010-000',
    logradouro: 'Avenida Industrial',
    numero: '2000',
    complemento: 'Galpão 4',
    bairro: 'Jardim',
    cidade: 'Santo André',
    uf: 'SP',
    qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 98.765.432/0001-10, com sede na Avenida Industrial, nº 2000, Santo André/SP, CEP 09010-000'
  }
];

// Listar todos os clientes
router.get('/', async (req, res) => {
  try {
    let list = await db.select().from(clientes).orderBy(desc(clientes.createdAt));
    
    // Se a tabela estiver vazia no banco, faz o seed automático dos clientes padrão
    if (list.length === 0) {
      await db.insert(clientes).values(defaultClientes);
      list = await db.select().from(clientes).orderBy(desc(clientes.createdAt));
    }

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
