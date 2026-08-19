import { db } from './client';
import { processos, pecas, documentos } from './schema';
import { sql } from 'drizzle-orm';

async function seed() {
  console.log('Seeding database...');
  
  // Enable pgvector extension
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Clear existing data
  await db.delete(pecas);
  await db.delete(processos);
  await db.delete(documentos);

  // Insert Processos
  console.log('Inserting processos...');
  const insertProcessos = await db.insert(processos).values([
    {
      tipo: 'Reclamação Trabalhista',
      cliente: 'Fernanda Oliveira',
      adverso: 'Empresa XYZ S.A.',
      vara: '3ª Vara do Trabalho de SP',
      area: 'Trabalhista',
      status: 'ativo',
      valor: 'R$ 87.500,00',
      prazo: '2024-05-15',
      advogado: 'Dr. Marcos Costa',
    },
    {
      tipo: 'Ação de Danos Morais',
      cliente: 'Roberto Souza',
      adverso: 'Companhia Aérea VooFácil',
      vara: '2ª Vara Cível de Guarulhos',
      area: 'Consumerista',
      status: 'ativo',
      valor: 'R$ 15.000,00',
      prazo: '2024-04-30',
      advogado: 'Dra. Aline Mendes',
    },
    {
      tipo: 'Contestação',
      cliente: 'Construtora Alfa',
      adverso: 'Sindicato dos Trabalhadores',
      vara: '10ª Vara do Trabalho de SP',
      area: 'Trabalhista',
      status: 'arquivado',
      valor: 'R$ 150.000,00',
      prazo: '2023-11-20',
      advogado: 'Dr. Marcos Costa',
    }
  ]).returning({ id: processos.id });

  console.log('Inserting pecas...');
  // Insert Pecas
  await db.insert(pecas).values([
    {
      processoId: insertProcessos[0].id,
      tipo: 'Reclamação Trabalhista',
      area: 'Trabalhista',
      cliente: 'Fernanda Oliveira',
      status: 'revisao',
      prazo: '2024-05-10',
      modelo: 'Claude 3.5 Sonnet',
      fontes: 4,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP\n\nProcesso nº 0001234-56.2024.5.02.0001\n\nFERNANDA OLIVEIRA, brasileira, solteira... [Gerado via IA]'
    },
    {
      processoId: insertProcessos[1].id,
      tipo: 'Petição Inicial CDC',
      area: 'Consumerista',
      cliente: 'Roberto Souza',
      status: 'aprovado',
      prazo: '2024-04-28',
      modelo: 'GPT-4o',
      fontes: 2,
      conteudo: 'EXCELENTÍSSIMO JUIZ DA 2ª VARA CÍVEL DA COMARCA DE GUARULHOS - SP...'
    }
  ]);

  console.log('Inserting documentos...');
  // Insert Documentos
  await db.insert(documentos).values([
    {
      nome: 'CLT_Compilada_2024.pdf',
      colecao: 'Legislação Federal',
      tamanho: '2.4 MB',
      chunks: 845
    },
    {
      nome: 'Súmulas_TST_Atualizadas.pdf',
      colecao: 'Jurisprudência',
      tamanho: '1.1 MB',
      chunks: 312
    }
  ]);

  console.log('Seed completed successfully!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
