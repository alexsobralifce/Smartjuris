import { db } from './client.js';
import { processos, pecas, documentos, usuarios, andamentos, lancamentosFinanceiros, timesheet, clientes } from './schema.js';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');
  
  // Enable pgvector extension
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Clear existing data
  await db.delete(pecas);
  await db.delete(andamentos);
  await db.delete(lancamentosFinanceiros);
  await db.delete(timesheet);
  await db.delete(processos);
  await db.delete(clientes);
  await db.delete(documentos);
  await db.delete(usuarios);

  // Hashing passwords (dev/test credentials; production seed is skipped in startup.ts)
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const userPassword = process.env.SEED_USER_PASSWORD || 'user123';
  console.log(`🔑 Seed passwords -> admin@smartjuris.com: ${adminPassword} | aline@smartjuris.com / carlos@smartjuris.com: ${userPassword}`);
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
  const hashedUserPassword = await bcrypt.hash(userPassword, 10);

  // Insert Users (before clientes/processos/pecas so they can be owned by the admin user)
  console.log('Inserting usuarios...');
  const [adminUser, normalUser1, normalUser2] = await db.insert(usuarios).values([
    {
      nome: 'Dr. Marcos Costa',
      email: 'admin@smartjuris.com',
      senha: hashedAdminPassword,
      role: 'admin',
    },
    {
      nome: 'Dra. Aline Mendes',
      email: 'aline@smartjuris.com',
      senha: hashedUserPassword,
      role: 'user',
    },
    {
      nome: 'Dr. Carlos Eduardo',
      email: 'carlos@smartjuris.com',
      senha: hashedUserPassword,
      role: 'user',
    }
  ]).returning({ id: usuarios.id, nome: usuarios.nome });

  // Insert Clientes
  console.log('Inserting clientes...');
  await db.insert(clientes).values([
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
      qualificacao: 'brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 321.654.987-00, residente e domiciliada na Praça da Sé, nº 100, Sé, São Paulo/SP, CEP 01001-000',
      usuarioId: adminUser.id,
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
      qualificacao: 'brasileiro, casado, engenheiro civil, inscrito no CPF sob o nº 123.456.789-11, residente e domiciliado na Rua Vergueiro, nº 500, Vila Mariana, São Paulo/SP, CEP 04001-000',
      usuarioId: adminUser.id,
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
      qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-99, com sede na Avenida Paulista, nº 1500, Conj 81, Bela Vista, São Paulo/SP, CEP 01310-100',
      usuarioId: adminUser.id,
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
      qualificacao: 'brasileira, viúva, aposentada, inscrita no CPF sob o nº 456.789.012-33, residente e domiciliada na Rua Teodoro Sampaio, nº 800, Pinheiros, São Paulo/SP, CEP 05401-000',
      usuarioId: adminUser.id,
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
      qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 98.765.432/0001-10, com sede na Avenida Industrial, nº 2000, Santo André/SP, CEP 09010-000',
      usuarioId: adminUser.id,
    }
  ]);

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
      prazo: '2026-09-15',
      advogado: adminUser.nome,
      usuarioId: adminUser.id,
    },
    {
      tipo: 'Ação de Danos Morais',
      cliente: 'Roberto Souza',
      adverso: 'Companhia Aérea VooFácil',
      vara: '2ª Vara Cível de Guarulhos',
      area: 'Consumerista',
      status: 'ativo',
      valor: 'R$ 15.000,00',
      prazo: '2026-08-25',
      advogado: normalUser1.nome,
      usuarioId: adminUser.id,
    },
    {
      tipo: 'Defesa Cível',
      cliente: 'Construtora Alfa',
      adverso: 'Sindicato dos Trabalhadores',
      vara: '10ª Vara Cível de SP',
      area: 'Cível',
      status: 'ativo',
      valor: 'R$ 150.000,00',
      prazo: '2026-09-01',
      advogado: adminUser.nome,
      usuarioId: adminUser.id,
    },
    {
      tipo: 'Ação Ordinária de Cobrança',
      cliente: 'Lúcia Ferreira',
      adverso: 'Banco do Brasil S.A.',
      vara: '5ª Vara de Família de SP',
      area: 'Cível',
      status: 'arquivado',
      valor: 'R$ 42.000,00',
      prazo: '2025-11-20',
      advogado: normalUser2.nome,
      usuarioId: adminUser.id,
    }
  ]).returning({ id: processos.id });

  console.log('Inserting pecas...');
  // Insert Pecas
  await db.insert(pecas).values([
    {
      processoId: insertProcessos[0].id,
      tipo: 'Petição Inicial Trabalhista',
      usuarioId: adminUser.id,
      area: 'Trabalhista',
      cliente: 'Fernanda Oliveira',
      status: 'revisao',
      prazo: '2026-09-10',
      modelo: 'DeepSeek Chat',
      fontes: 4,
      conteudo: `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP

Processo nº 0001234-56.2026.5.02.0001

FERNANDA OLIVEIRA, brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 000.000.000-00, resident e domiciliada na Rua das Flores, nº 123, São Paulo/SP, por seu advogado infra-assinado, vem, mui respeitosamente, perante Vossa Excelência, propor a presente:

RECLAMAÇÃO TRABALHISTA

em face de Empresa XYZ S.A., pessoa jurídica de direito privado, pelos fatos e fundamentos a seguir expostos...`
    },
    {
      processoId: insertProcessos[1].id,
      tipo: 'Petição Inicial de Danos Morais',
      usuarioId: adminUser.id,
      area: 'Consumerista',
      cliente: 'Roberto Souza',
      status: 'aprovado',
      prazo: '2026-08-23',
      modelo: 'DeepSeek Chat',
      fontes: 2,
      conteudo: 'EXCELENTÍSSIMO JUIZ DA 2ª VARA CÍVEL DA COMARCA DE GUARULHOS - SP...'
    },
    {
      processoId: insertProcessos[2].id,
      tipo: 'Contestação Cível',
      usuarioId: adminUser.id,
      area: 'Cível',
      cliente: 'Construtora Alfa',
      status: 'revisao',
      prazo: '2026-08-30',
      modelo: 'DeepSeek Chat',
      fontes: 3,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 10ª VARA CÍVEL DA CAPITAL...'
    }
  ]);

  console.log('Inserting documentos...');
  // Insert Documentos
  await db.insert(documentos).values([
    {
      nome: 'Lei_8213_1991_Beneficios_Previdenciarios.pdf',
      colecao: 'Legislação Previdenciária',
      tamanho: '1.8 MB',
      chunks: 920
    },
    {
      nome: 'Lei_8212_1991_Custeio_Seguridade_Social.pdf',
      colecao: 'Legislação Previdenciária',
      tamanho: '1.4 MB',
      chunks: 640
    },
    {
      nome: 'Decreto_3048_1999_Regulamento_Previdencia_RPS.pdf',
      colecao: 'Legislação Previdenciária',
      tamanho: '3.2 MB',
      chunks: 1480
    },
    {
      nome: 'IN_128_2022_INSS_Processo_Administrativo.pdf',
      colecao: 'Legislação Previdenciária',
      tamanho: '4.1 MB',
      chunks: 2100
    },
    {
      nome: 'Sumulas_TNU_e_CRPS_Previdenciario.pdf',
      colecao: 'Jurisprudência Previdenciária',
      tamanho: '1.2 MB',
      chunks: 530
    },
    {
      nome: 'CPC_Lei_13105_2015_Compilado.pdf',
      colecao: 'Legislação Federal',
      tamanho: '3.5 MB',
      chunks: 1420
    },
    {
      nome: 'CLT_Compilada_Atualizada_2026.pdf',
      colecao: 'Legislação Federal',
      tamanho: '2.4 MB',
      chunks: 1150
    },
    {
      nome: 'Súmulas_TST_STF_STJ_Atualizadas.pdf',
      colecao: 'Jurisprudência',
      tamanho: '1.1 MB',
      chunks: 680
    }
  ]);

  console.log('Inserting andamentos...');
  await db.insert(andamentos).values([
    {
      processoId: insertProcessos[0].id,
      tipo: 'Intimação',
      descricao: 'Publicação no Diário Eletrônico da Justiça do Trabalho (DJEN) designando Audiência de Conciliação.',
      resumoIA: '🤖 Resumo IA: Intimação para Audiência Inicial em 15/09/2026. Ação Recomendada: Elaborar minuta de proposta e notificar a Reclamante.',
      prazoFatal: '2026-09-10'
    },
    {
      processoId: insertProcessos[0].id,
      tipo: 'Despacho',
      descricao: 'Determina a juntada dos cartões de ponto e demonstrativos de pagamento pela Reclamada.',
      resumoIA: '🤖 Resumo IA: Juiz concedeu 5 dias úteis para a Reclamada apresentar documentos cadastrais.',
      prazoFatal: '2026-08-28'
    },
    {
      processoId: insertProcessos[1].id,
      tipo: 'Intimação',
      descricao: 'Intimação da Companhia Aérea para apresentação de Contestação no prazo de 15 dias.',
      resumoIA: '🤖 Resumo IA: Início do prazo de defesa do Réu. Prazo fatal: 25/08/2026.',
      prazoFatal: '2026-08-25'
    }
  ]);

  console.log('Inserting lancamentosFinanceiros...');
  await db.insert(lancamentosFinanceiros).values([
    {
      processoId: insertProcessos[0].id,
      cliente: 'Fernanda Oliveira',
      tipo: 'Honorário Fixo',
      valor: 'R$ 3.500,00',
      vencimento: '2026-09-05',
      status: 'pago'
    },
    {
      processoId: insertProcessos[0].id,
      cliente: 'Fernanda Oliveira',
      tipo: 'Êxito',
      valor: '20% do valor recuperado',
      vencimento: '2026-10-01',
      status: 'pendente'
    },
    {
      processoId: insertProcessos[2].id,
      cliente: 'Construtora Alfa',
      tipo: 'Honorário Fixo',
      valor: 'R$ 12.000,00',
      vencimento: '2026-08-30',
      status: 'pendente'
    }
  ]);

  console.log('Inserting timesheet...');
  await db.insert(timesheet).values([
    {
      processoId: insertProcessos[0].id,
      advogado: adminUser.nome,
      descricao: 'Análise de cartões de ponto e cálculo preliminar de horas extras',
      minutos: 140,
      valorHora: 'R$ 350,00',
      faturado: 'nao'
    },
    {
      processoId: insertProcessos[1].id,
      advogado: normalUser1.nome,
      descricao: 'Elaboração da petição inicial de Danos Morais e verificação de vouchers de viagem',
      minutos: 90,
      valorHora: 'R$ 300,00',
      faturado: 'sim'
    }
  ]);

  console.log('Seed completed successfully!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
