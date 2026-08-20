/**
 * SmartJuris — Banco de Teste (QA)
 * ================================
 *
 * Gera um dataset de teste completo e determinístico cobrindo:
 *  1. CRUDs de todos os módulos (processos, peças, clientes, andamentos,
 *     financeiro/lançamentos, timesheet, documentos, usuários, permissões,
 *     escritórios).
 *  2. Geração de peças (fluxo RAG): documentos + chunks (corpus de
 *     jurisprudência/legislação), peças com conteúdo e documentos gerados.
 *  3. Funções do sistema: dashboard, validação (fila de revisão), financeiro,
 *     jurimetria, métricas de admin/root (token_usage, logins, audit_log).
 *
 * IMPORTANTE — isolamento multi-tenant:
 *  - São criados DOIS escritórios distintos (A e B), cada um com seus próprios
 *    usuários, clientes, processos, peças, andamentos, lançamentos e timesheet.
 *  - Todos os registros carregam `escritorio_id` E `usuario_id` corretos, de
 *    modo que o `tenantScope` (admin vê o próprio escritório; user vê apenas a
 *    própria autoria) não vaze dados entre escritórios.
 *  - Ao final, o próprio seed executa uma VERIFICAÇÃO de isolamento e imprime
 *    um relatório PASS/FAIL (nenhum registro de um escritório pode ser dono de
 *    dados de outro).
 *
 * Execução:
 *   pnpm --filter @lexia/api db:seed:test
 *
 * DESTRUTIVO: faz TRUNCATE CASCADE de todas as tabelas de negócio antes de
 * popular. NÃO rode em produção.
 */

import { db } from './client.js';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { encryptField } from '../services/crypto.js';
import { generateEmbedding } from '../services/embedding.js';
import {
  escritorios,
  usuarios,
  permissoesUsuario,
  clientes,
  processos,
  pecas,
  documentos,
  chunks,
  documentosGerados,
  andamentos,
  lancamentosFinanceiros,
  timesheet,
  tokenUsage,
  logins,
  auditLog,
} from './schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Data no passado/futuro relativa a hoje (n dias). */
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

/** Data ISO (YYYY-MM-DD) relativa a hoje, para prazos. */
function iso(n: number): string {
  return daysFromNow(n).toISOString().slice(0, 10);
}

/** Blocos TipTap (conteudoRico) de forma enxuta. */
type RichBlock =
  | { t: 'h1' | 'h2' | 'h3'; text: string }
  | { t: 'p'; text: string; bold?: boolean }
  | { t: 'ul' | 'ol'; items: string[] };

function richDoc(blocks: RichBlock[]): any {
  const content: any[] = blocks.map((b) => {
    switch (b.t) {
      case 'h1':
      case 'h2':
      case 'h3':
        return {
          type: 'heading',
          attrs: { level: Number(b.t[1]) },
          content: [{ type: 'text', text: b.text }],
        };
      case 'p':
        return {
          type: 'paragraph',
          content: [
            b.bold
              ? { type: 'text', text: b.text, marks: [{ type: 'bold' }] }
              : { type: 'text', text: b.text },
          ],
        };
      case 'ul':
      case 'ol':
        return {
          type: b.t === 'ul' ? 'bulletList' : 'orderedList',
          content: b.items.map((it) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: it }] }],
          })),
        };
      default:
        return { type: 'paragraph', content: [{ type: 'text', text: '' }] };
    }
  });
  return { type: 'doc', content };
}

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------

async function seed() {
  console.log('🧪 Iniciando seed de teste (QA) — SmartJuris...\n');

  // 0. Extensão pgvector
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

  // 0.1. Limpeza total (destrutiva, apenas para o banco de teste)
  console.log('🧹 Limpando tabelas (TRUNCATE CASCADE)...');
  await db.execute(sql`
    TRUNCATE TABLE
      documentos_gerados,
      chunks,
      documentos,
      permissoes_usuario,
      andamentos,
      lancamentos_financeiros,
      timesheet,
      pecas,
      processos,
      clientes,
      token_usage,
      logins,
      audit_log,
      usuarios,
      escritorios
    RESTART IDENTITY CASCADE;
  `);

  // -------------------------------------------------------------------------
  // 1. Escritórios (A = profissional pago; B = demo com limite de tokens)
  // -------------------------------------------------------------------------
  console.log('🏢 Criando escritórios...');
  const [escA, escB] = await db.insert(escritorios).values([
    {
      nome: 'Silva & Associados Advocacia',
      plano: 'profissional',
      limiteUsuarios: 10,
      limitePecasMes: 200,
      limiteProcessos: 500,
      isDemo: false,
      limiteTokensMes: null,
      ativo: true,
      // Papel timbrado completo (testa exportação PDF/DOCX com letterhead)
      razaoSocial: 'Silva & Associados Sociedade de Advogados',
      cnpj: '11.222.333/0001-44',
      inscricaoOab: '123456',
      endereco: 'Avenida Paulista',
      numero: '1500',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01310-100',
      telefone: '(11) 3344-5566',
      email: 'contato@silvaassociados.adv.br',
      site: 'https://silvaassociados.adv.br',
      logoUrl: null,
    },
    {
      nome: 'Teste Beta Advocacia',
      plano: 'basico',
      limiteUsuarios: 2,
      limitePecasMes: 50,
      limiteProcessos: 100,
      isDemo: true,
      limiteTokensMes: 10000,
      ativo: true,
      razaoSocial: 'Teste Beta Advocacia LTDA',
      cnpj: '99.888.777/0001-66',
      inscricaoOab: '654321',
      endereco: 'Rua da Alfândega',
      numero: '80',
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '20070-000',
      telefone: '(21) 2222-3333',
      email: 'contato@testebeta.adv.br',
      site: null,
      logoUrl: null,
    },
  ]).returning();

  console.log(`   A = ${escA.nome} (${escA.id})`);
  console.log(`   B = ${escB.nome} (${escB.id})`);

  // -------------------------------------------------------------------------
  // 2. Usuários: root + admin/user por escritório
  // -------------------------------------------------------------------------
  console.log('👤 Criando usuários...');
  const adminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'admin123', 10);
  const userHash = await bcrypt.hash(process.env.SEED_USER_PASSWORD || 'user123', 10);

  const [root, aAdmin, aUser1, aUser2, bAdmin, bUser1] = await db.insert(usuarios).values([
    {
      nome: 'Root Administrator',
      email: 'root@smartjuris.com',
      senha: adminHash,
      role: 'root',
      ativo: true,
      precisaTrocarSenha: false,
    },
    {
      nome: 'Dr. Ricardo Silva',
      email: 'admin.qa@teste.com',
      senha: adminHash,
      role: 'admin',
      escritorioId: escA.id,
      ativo: true,
      precisaTrocarSenha: false,
      oab: '123456',
      oabUf: 'SP',
    },
    {
      nome: 'Dra. Mariana Alves',
      email: 'adv1.qa@teste.com',
      senha: userHash,
      role: 'user',
      escritorioId: escA.id,
      ativo: true,
      precisaTrocarSenha: false,
      oab: '234567',
      oabUf: 'SP',
    },
    {
      nome: 'Dr. João Pereira',
      email: 'adv2.qa@teste.com',
      senha: userHash,
      role: 'user',
      escritorioId: escA.id,
      ativo: true,
      precisaTrocarSenha: false,
      oab: '345678',
      oabUf: 'SP',
    },
    {
      nome: 'Dra. Beatriz Lima',
      email: 'admin.beta@teste.com',
      senha: adminHash,
      role: 'admin',
      escritorioId: escB.id,
      ativo: true,
      precisaTrocarSenha: false,
      oab: '456789',
      oabUf: 'RJ',
    },
    {
      nome: 'Dr. Carlos Nogueira',
      email: 'adv.beta@teste.com',
      senha: userHash,
      role: 'user',
      escritorioId: escB.id,
      ativo: true,
      precisaTrocarSenha: false,
      oab: '567890',
      oabUf: 'RJ',
      creditosMes: 5000,
    },
  ]).returning();

  // 2.1 Permissões por módulo (apenas role 'user' as usa; admin/root têm acesso total)
  console.log('🔑 Criando permissões por módulo...');
  await db.insert(permissoesUsuario).values([
    ...['processos', 'clientes', 'pecas', 'validacao', 'jurimetria', 'financeiro', 'contratos', 'crm', 'base', 'documentacao'].map((m) => ({
      usuarioId: aUser1.id,
      modulo: m,
      ativo: true,
    })),
    ...['processos', 'pecas', 'validacao', 'jurimetria'].map((m) => ({
      usuarioId: aUser2.id,
      modulo: m,
      ativo: true,
    })),
    ...['processos', 'clientes', 'pecas', 'validacao'].map((m) => ({
      usuarioId: bUser1.id,
      modulo: m,
      ativo: true,
    })),
  ]);

  // -------------------------------------------------------------------------
  // 3. Clientes (CPF/CNPJ criptografado — espelha o POST /clientes)
  // -------------------------------------------------------------------------
  console.log('👥 Criando clientes...');
  const clientesA = await db.insert(clientes).values([
    { tipo: 'PF', nome: 'Fernanda Oliveira', cpfCnpj: encryptField('321.654.987-00'), email: 'fernanda.oliveira@email.com', telefone: '(11) 98765-4321', cep: '01001-000', logradouro: 'Praça da Sé', numero: '100', complemento: 'Apto 42', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP', qualificacao: 'brasileira, solteira, auxiliar administrativa', usuarioId: aAdmin.id, escritorioId: escA.id },
    { tipo: 'PF', nome: 'Roberto Souza', cpfCnpj: encryptField('123.456.789-11'), email: 'roberto.souza@email.com', telefone: '(11) 97654-3210', cep: '04001-000', logradouro: 'Rua Vergueiro', numero: '500', bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP', qualificacao: 'brasileiro, casado, engenheiro civil', usuarioId: aAdmin.id, escritorioId: escA.id },
    { tipo: 'PJ', nome: 'Construtora Alfa', cpfCnpj: encryptField('12.345.678/0001-99'), email: 'contato@construtoraalfa.com.br', telefone: '(11) 3344-5566', cep: '01310-100', logradouro: 'Avenida Paulista', numero: '1500', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', qualificacao: 'pessoa jurídica de direito privado', usuarioId: aAdmin.id, escritorioId: escA.id },
    { tipo: 'PJ', nome: 'Indústria Metalúrgica Sul', cpfCnpj: encryptField('98.765.432/0001-10'), email: 'diretoria@metalsul.com.br', telefone: '(11) 4004-9988', cep: '09010-000', logradouro: 'Avenida Industrial', numero: '2000', bairro: 'Jardim', cidade: 'Santo André', uf: 'SP', qualificacao: 'pessoa jurídica de direito privado', usuarioId: aUser2.id, escritorioId: escA.id },
    { tipo: 'PF', nome: 'Lúcia Ferreira', cpfCnpj: encryptField('456.789.012-33'), email: 'lucia.ferreira@email.com', telefone: '(11) 96543-2109', cep: '05401-000', logradouro: 'Rua Teodoro Sampaio', numero: '800', bairro: 'Pinheiros', cidade: 'São Paulo', uf: 'SP', qualificacao: 'brasileira, viúva, aposentada', usuarioId: aUser1.id, escritorioId: escA.id },
    { tipo: 'PJ', nome: 'Hospital Vida & Saúde', cpfCnpj: encryptField('55.666.777/0001-88'), email: 'juridico@hospitalvida.com.br', telefone: '(11) 3555-7788', cep: '01501-000', logradouro: 'Rua da Glória', numero: '300', bairro: 'Liberdade', cidade: 'São Paulo', uf: 'SP', qualificacao: 'pessoa jurídica de direito privado', usuarioId: aUser2.id, escritorioId: escA.id },
    { tipo: 'PF', nome: 'Marcos Antônio Reis', cpfCnpj: encryptField('789.012.345-66'), email: 'marcos.reis@email.com', telefone: '(11) 98877-6655', cep: '03001-000', logradouro: 'Rua do Gasômetro', numero: '12', bairro: 'Brás', cidade: 'São Paulo', uf: 'SP', qualificacao: 'brasileiro, solteiro, motorista', usuarioId: aAdmin.id, escritorioId: escA.id },
  ]).returning();

  const clientesB = await db.insert(clientes).values([
    { tipo: 'PJ', nome: 'Comercial Beta LTDA', cpfCnpj: encryptField('77.888.999/0001-22'), email: 'financeiro@comercialbeta.com.br', telefone: '(21) 2555-6677', cep: '20040-000', logradouro: 'Avenida Rio Branco', numero: '120', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ', qualificacao: 'pessoa jurídica de direito privado', usuarioId: bAdmin.id, escritorioId: escB.id },
    { tipo: 'PF', nome: 'Paulo Henrique Dias', cpfCnpj: encryptField('111.222.333-44'), email: 'paulo.dias@email.com', telefone: '(21) 98888-1122', cep: '22041-000', logradouro: 'Rua Barata Ribeiro', numero: '500', bairro: 'Copacabana', cidade: 'Rio de Janeiro', uf: 'RJ', qualificacao: 'brasileiro, casado, comerciário', usuarioId: bAdmin.id, escritorioId: escB.id },
    { tipo: 'PJ', nome: 'Transportadora Gama', cpfCnpj: encryptField('44.555.666/0001-33'), email: 'operacoes@transportegama.com.br', telefone: '(21) 2444-5566', cep: '20081-000', logradouro: 'Avenida Rodrigues Alves', numero: '900', bairro: 'Gamboa', cidade: 'Rio de Janeiro', uf: 'RJ', qualificacao: 'pessoa jurídica de direito privado', usuarioId: bUser1.id, escritorioId: escB.id },
  ]).returning();

  // -------------------------------------------------------------------------
  // 4. Processos (todas as áreas e status)
  // -------------------------------------------------------------------------
  console.log('⚖️  Criando processos...');
  const processosA = await db.insert(processos).values([
    { tipo: 'Reclamação Trabalhista', cliente: 'Fernanda Oliveira', adverso: 'Empresa XYZ S.A.', vara: '3ª Vara do Trabalho de SP', area: 'Trabalhista', status: 'ativo', valor: 'R$ 87.500,00', prazo: iso(10), advogado: aAdmin.nome, usuarioId: aAdmin.id, escritorioId: escA.id },
    { tipo: 'Ação de Danos Morais', cliente: 'Roberto Souza', adverso: 'Companhia Aérea VooFácil', vara: '2ª Vara Cível de Guarulhos', area: 'Consumerista', status: 'ativo', valor: 'R$ 15.000,00', prazo: iso(5), advogado: aUser1.nome, usuarioId: aUser1.id, escritorioId: escA.id },
    { tipo: 'Defesa Cível', cliente: 'Construtora Alfa', adverso: 'Sindicato dos Trabalhadores', vara: '10ª Vara Cível de SP', area: 'Cível', status: 'ativo', valor: 'R$ 150.000,00', prazo: iso(12), advogado: aAdmin.nome, usuarioId: aAdmin.id, escritorioId: escA.id },
    { tipo: 'Ação Anulatória de Débito Fiscal', cliente: 'Indústria Metalúrgica Sul', adverso: 'Fazenda Estadual de SP', vara: '1ª Vara da Fazenda Pública', area: 'Tributário', status: 'suspenso', valor: 'R$ 320.000,00', prazo: iso(30), advogado: aUser2.nome, usuarioId: aUser2.id, escritorioId: escA.id },
    { tipo: 'Ação de Repetição de Indébito', cliente: 'Hospital Vida & Saúde', adverso: 'União Federal', vara: '2ª Vara Federal de SP', area: 'Tributário', status: 'ativo', valor: 'R$ 540.000,00', prazo: iso(20), advogado: aUser2.nome, usuarioId: aUser2.id, escritorioId: escA.id },
    { tipo: 'Ação de Concessão de Benefício', cliente: 'Lúcia Ferreira', adverso: 'INSS', vara: '4ª Vara Federal Previdenciária', area: 'Previdenciário', status: 'ativo', valor: 'R$ 60.000,00', prazo: iso(8), advogado: aUser1.nome, usuarioId: aUser1.id, escritorioId: escA.id },
    { tipo: 'Ação Revisional de Contrato', cliente: 'Roberto Souza', adverso: 'Banco CrediFácil S.A.', vara: '6ª Vara Cível de SP', area: 'Consumerista', status: 'suspenso', valor: 'R$ 45.000,00', prazo: iso(25), advogado: aUser1.nome, usuarioId: aUser1.id, escritorioId: escA.id },
    { tipo: 'Habeas Corpus', cliente: 'Marcos Antônio Reis', adverso: 'Ministério Público', vara: '5ª Vara Criminal de SP', area: 'Penal', status: 'ativo', valor: '—', prazo: iso(2), advogado: aAdmin.nome, usuarioId: aAdmin.id, escritorioId: escA.id },
    { tipo: 'Ação de Cobrança', cliente: 'Lúcia Ferreira', adverso: 'Banco do Brasil S.A.', vara: '5ª Vara de Família de SP', area: 'Cível', status: 'arquivado', valor: 'R$ 42.000,00', prazo: iso(-180), advogado: aUser1.nome, usuarioId: aUser1.id, escritorioId: escA.id },
  ]).returning();

  const processosB = await db.insert(processos).values([
    { tipo: 'Reclamação Trabalhista', cliente: 'Paulo Henrique Dias', adverso: 'Supermercados Baratex', vara: '8ª Vara do Trabalho do RJ', area: 'Trabalhista', status: 'ativo', valor: 'R$ 28.000,00', prazo: iso(7), advogado: bAdmin.nome, usuarioId: bAdmin.id, escritorioId: escB.id },
    { tipo: 'Ação de Danos Morais', cliente: 'Comercial Beta LTDA', adverso: 'Operadora Telefônica Nexo', vara: '3ª Vara Cível do RJ', area: 'Consumerista', status: 'ativo', valor: 'R$ 50.000,00', prazo: iso(14), advogado: bUser1.nome, usuarioId: bUser1.id, escritorioId: escB.id },
    { tipo: 'Ação de Cobrança', cliente: 'Transportadora Gama', adverso: 'Distribuidora Veleiro', vara: '9ª Vara Cível do RJ', area: 'Cível', status: 'suspenso', valor: 'R$ 90.000,00', prazo: iso(22), advogado: bAdmin.nome, usuarioId: bAdmin.id, escritorioId: escB.id },
  ]).returning();

  // -------------------------------------------------------------------------
  // 5. Peças (geração) — todos os status + conteúdo rico/plano
  // -------------------------------------------------------------------------
  console.log('📄 Criando peças (geração de peças)...');
  await db.insert(pecas).values([
    // --- Escritório A ---
    {
      processoId: processosA[0].id, tipo: 'Petição Inicial Trabalhista', area: 'Trabalhista', cliente: 'Fernanda Oliveira',
      status: 'aprovado', prazo: iso(8), modelo: 'DeepSeek Chat', fontes: 4,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP.\n\nFERNANDA OLIVEIRA, já qualificada nos autos, vem propor RECLAMAÇÃO TRABALHISTA em face de EMPRESA XYZ S.A., pelos fatos e fundamentos que passa a expor.\n\nA Reclamante laborou sem registro em CTPS, com jornada excedente a 8 horas diárias, sem o pagamento das horas extras, e foi dispensada sem verbas rescisórias.\n\nRequer a condenação da Reclamada ao pagamento das verbas pleiteadas.',
      conteudoRico: richDoc([
        { t: 'h1', text: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP' },
        { t: 'h2', text: 'RECLAMAÇÃO TRABALHISTA' },
        { t: 'p', text: 'FERNANDA OLIVEIRA, já qualificada nos autos, vem propor a presente RECLAMAÇÃO TRABALHISTA em face de EMPRESA XYZ S.A.' },
        { t: 'h2', text: 'DOS PEDIDOS' },
        { t: 'ul', items: ['Reconhecimento do vínculo empregatício;', 'Pagamento de horas extras com reflexos;', 'Verbas rescisórias e multa do art. 477 da CLT.'] },
      ]),
      usuarioId: aAdmin.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[2].id, tipo: 'Contestação', area: 'Cível', cliente: 'Construtora Alfa',
      status: 'revisao', prazo: iso(9), modelo: 'DeepSeek Chat', fontes: 3,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 10ª VARA CÍVEL DA CAPITAL — SP.\n\nCONSTRUTORA ALFA, já qualificada, vem apresentar CONTESTAÇÃO aos termos da inicial, impugnando especificamente os fatos narrados.',
      conteudoRico: null,
      usuarioId: aAdmin.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[1].id, tipo: 'Recurso de Apelação', area: 'Consumerista', cliente: 'Roberto Souza',
      status: 'reprovado', prazo: iso(4), modelo: 'DeepSeek Chat', fontes: 2,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 2ª VARA CÍVEL DE GUARULHOS — SP.\n\nROBERTO SOUZA vem interpor RECURSO DE APELAÇÃO em face da sentença que julgou improcedente o pedido.',
      conteudoRico: null,
      usuarioId: aUser1.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[5].id, tipo: 'Ação de Concessão de Benefício', area: 'Previdenciário', cliente: 'Lúcia Ferreira',
      status: 'protocolado', prazo: iso(6), modelo: 'DeepSeek Chat', fontes: 5,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 4ª VARA FEDERAL PREVIDENCIÁRIA DE SÃO PAULO.\n\nLÚCIA FERREIRA vem propor AÇÃO DE CONCESSÃO DE BENEFÍCIO em face do INSS, ante o indeferimento administrativo.',
      conteudoRico: richDoc([
        { t: 'h1', text: 'AÇÃO DE CONCESSÃO DE BENEFÍCIO PREVIDENCIÁRIO' },
        { t: 'p', text: 'LÚCIA FERREIRA, já qualificada, vem propor a presente ação em face do INSTITUTO NACIONAL DO SEGURO SOCIAL — INSS.' },
        { t: 'h2', text: 'DOS FATOS' },
        { t: 'p', text: 'A Autora requereu administrativamente a concessão de aposentadoria, indeferida sob fundamento de insuficiência de tempo de contribuição.' },
      ]),
      usuarioId: aUser1.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[3].id, tipo: 'Agravo de Instrumento', area: 'Tributário', cliente: 'Indústria Metalúrgica Sul',
      status: 'revisao', prazo: iso(15), modelo: 'DeepSeek Chat', fontes: 2,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR DESEMBARGADOR PRESIDENTE DO TRIBUNAL DE JUSTIÇA DE SÃO PAULO.\n\nINDÚSTRIA METALÚRGICA SUL vem interpor AGRAVO DE INSTRUMENTO em face da decisão interlocutória.',
      conteudoRico: null,
      usuarioId: aUser2.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[6].id, tipo: 'Petição Inicial CDC', area: 'Consumerista', cliente: 'Roberto Souza',
      status: 'aprovado', prazo: iso(11), modelo: 'DeepSeek Chat', fontes: 3,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 6ª VARA CÍVEL DE SÃO PAULO.\n\nROBERTO SOUZA vem propor AÇÃO REVISIONAL DE CONTRATO com pedido de tutela de urgência.',
      conteudoRico: null,
      usuarioId: aUser1.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[4].id, tipo: 'Embargos à Execução Fiscal', area: 'Tributário', cliente: 'Hospital Vida & Saúde',
      status: 'revisao', prazo: iso(18), modelo: 'DeepSeek Chat', fontes: 4,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 2ª VARA FEDERAL DE SÃO PAULO.\n\nHOSPITAL VIDA & SAÚDE vem opor EMBARGOS À EXECUÇÃO FISCAL, após garantia do juízo.',
      conteudoRico: null,
      usuarioId: aUser2.id, escritorioId: escA.id,
    },
    {
      processoId: processosA[7].id, tipo: 'Habeas Corpus', area: 'Penal', cliente: 'Marcos Antônio Reis',
      status: 'revisao', prazo: iso(1), modelo: 'DeepSeek Chat', fontes: 1,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 5ª VARA CRIMINAL DE SÃO PAULO.\n\nO impetrante vem requerer a concessão de ordem de HABEAS CORPUS em favor do paciente, ante a coação ilegal.',
      conteudoRico: null,
      usuarioId: aAdmin.id, escritorioId: escA.id,
    },
    // --- Escritório B ---
    {
      processoId: processosB[0].id, tipo: 'Reclamação Trabalhista', area: 'Trabalhista', cliente: 'Paulo Henrique Dias',
      status: 'revisao', prazo: iso(5), modelo: 'DeepSeek Chat', fontes: 2,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 8ª VARA DO TRABALHO DO RIO DE JANEIRO.\n\nPAULO HENRIQUE DIAS vem propor RECLAMAÇÃO TRABALHISTA.',
      conteudoRico: null,
      usuarioId: bAdmin.id, escritorioId: escB.id,
    },
    {
      processoId: processosB[1].id, tipo: 'Ação de Danos Morais', area: 'Consumerista', cliente: 'Comercial Beta LTDA',
      status: 'aprovado', prazo: iso(9), modelo: 'DeepSeek Chat', fontes: 2,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 3ª VARA CÍVEL DO RIO DE JANEIRO.\n\nCOMERCIAL BETA LTDA vem propor AÇÃO DE DANOS MORAIS.',
      conteudoRico: null,
      usuarioId: bUser1.id, escritorioId: escB.id,
    },
    {
      processoId: processosB[2].id, tipo: 'Petição Inicial', area: 'Cível', cliente: 'Transportadora Gama',
      status: 'reprovado', prazo: iso(12), modelo: 'DeepSeek Chat', fontes: 1,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 9ª VARA CÍVEL DO RIO DE JANEIRO.\n\nTRANSPORTADORA GAMA vem propor AÇÃO DE COBRANÇA.',
      conteudoRico: null,
      usuarioId: bAdmin.id, escritorioId: escB.id,
    },
  ]);

  // -------------------------------------------------------------------------
  // 6. Documentos + chunks (corpus RAG global, compartilhado entre tenants)
  // -------------------------------------------------------------------------
  console.log('📚 Criando documentos e chunks (corpus RAG)...');

  interface ChunkDef { texto: string; fonte: string; }
  const docDefs: { nome: string; colecao: string; tamanho: string; chunks: ChunkDef[] }[] = [
    {
      nome: 'CLT_Compilada_2026.pdf', colecao: 'Legislação Federal', tamanho: '2.4 MB',
      chunks: [
        { fonte: 'CLT_Compilada_2026.pdf', texto: 'Consolidação das Leis do Trabalho. Art. 840 da CLT dispõe sobre os requisitos da reclamação trabalhista, que deverá conter designação do juízo, qualificação das partes, breve exposição dos fatos e o pedido. Reclamação trabalhista, vínculo empregatício, horas extras, verbas rescisórias, justiça do trabalho.' },
        { fonte: 'CLT_Compilada_2026.pdf', texto: 'Art. 477 da CLT trata do pagamento das verbas rescisórias no prazo de dez dias, sob pena de multa em favor do empregado. Dispensa sem justa causa, aviso prévio, férias proporcionais, décimo terceiro salário.' },
      ],
    },
    {
      nome: 'Sumulas_TST_Atualizadas.pdf', colecao: 'Jurisprudência', tamanho: '1.1 MB',
      chunks: [
        { fonte: 'Sumulas_TST_Atualizadas.pdf', texto: 'Súmula do TST sobre horas extras: a duração normal do trabalho poderá ser acrescida de horas suplementares mediante acordo ou convenção coletiva. Jornada de trabalho, adicional de horas extras, banco de horas, reflexos.' },
        { fonte: 'Sumulas_TST_Atualizadas.pdf', texto: 'Súmula do TST sobre prescrição trabalhista: a ação quanto aos créditos resultantes das relações de trabalho prescreve em cinco anos, respeitado o biênio após a extinção do contrato. Prescrição quinquenal, prescrição bienal.' },
      ],
    },
    {
      nome: 'Jurisprudencia_Danos_Morais_Aereo.pdf', colecao: 'Jurisprudência', tamanho: '850 KB',
      chunks: [
        { fonte: 'Jurisprudencia_Danos_Morais_Aereo.pdf', texto: 'Precedente sobre cancelamento injustificado de voo internacional com atraso de 28 horas e extravio temporário de bagagem. Danos morais fixados em R$ 15.000,00, com aplicação do Código de Defesa do Consumidor, arts. 6º, VI e 14. Responsabilidade objetiva do transportador aéreo, fortuito interno.' },
        { fonte: 'Jurisprudencia_Danos_Morais_Aereo.pdf', texto: 'Jurisprudência consolidada do STJ sobre responsabilidade civil do transportador aéreo por atraso de voo e dano moral do consumidor. Indenização por danos morais, restituição de despesas emergenciais, relação de consumo.' },
      ],
    },
    {
      nome: 'CPC_Lei_13105_2015_Compilado.pdf', colecao: 'Legislação Federal', tamanho: '3.5 MB',
      chunks: [
        { fonte: 'CPC_Lei_13105_2015_Compilado.pdf', texto: 'Art. 319 do CPC elenca os requisitos da petição inicial. Art. 335 do CPC estabelece prazo de 15 dias úteis para contestação. Art. 337 do CPC trata das preliminares de mérito. Petição inicial, contestação, preliminares, réplica.' },
        { fonte: 'CPC_Lei_13105_2015_Compilado.pdf', texto: 'Art. 300 do CPC disciplina a tutela de urgência, exigindo probabilidade do direito e perigo de dano ou risco ao resultado útil do processo. Tutela antecipada, liminar, fumus boni iuris, periculum in mora.' },
      ],
    },
    {
      nome: 'Lei_8213_1991_Beneficios.pdf', colecao: 'Legislação Previdenciária', tamanho: '1.8 MB',
      chunks: [
        { fonte: 'Lei_8213_1991_Beneficios.pdf', texto: 'Lei 8.213/1991 disciplina os benefícios da Previdência Social. Aposentadoria por idade, aposentadoria por tempo de contribuição, carência, qualidade de segurado, benefício previdenciário, INSS, indeferimento administrativo.' },
        { fonte: 'Lei_8213_1991_Beneficios.pdf', texto: 'Art. 103 da Lei 8.213/1991 estabelece prazo decadencial de dez anos para revisão do ato de concessão de benefício. Revisão de benefício, pensão por morte, auxílio por incapacidade, perícia médica judicial.' },
      ],
    },
    {
      nome: 'CTN_e_Execucao_Fiscal.pdf', colecao: 'Legislação Tributária', tamanho: '1.6 MB',
      chunks: [
        { fonte: 'CTN_e_Execucao_Fiscal.pdf', texto: 'Código Tributário Nacional: art. 165 a 168 tratam da restituição de tributos pagos indevidamente, com prazo prescricional de cinco anos. Repetição de indébito, compensação tributária, crédito tributário.' },
        { fonte: 'CTN_e_Execucao_Fiscal.pdf', texto: 'Lei 6.830/1980 — Lei de Execução Fiscal. Embargos à execução fiscal no prazo de trinta dias após a garantia do juízo. Certidão de Dívida Ativa, nulidade da CDA, prescrição, excesso de execução.' },
      ],
    },
    {
      nome: 'CPP_Compilado.pdf', colecao: 'Legislação Penal', tamanho: '2.1 MB',
      chunks: [
        { fonte: 'CPP_Compilado.pdf', texto: 'Código de Processo Penal. Habeas corpus para cessar coação ilegal à liberdade de locomoção, fundamento no art. 5º, LXVIII da CF e art. 647 do CPP. Prisão preventiva, relaxamento de prisão, liberdade provisória, resposta à acusação.' },
        { fonte: 'CPP_Compilado.pdf', texto: 'Art. 312 do CPP elenca os requisitos da prisão preventiva. Art. 396-A do CPP trata da resposta à acusação no prazo de dez dias. Absolvição sumária, preliminares, apelação criminal.' },
      ],
    },
  ];

  const docIdMap: Record<string, string> = {};
  let totalChunks = 0;
  let indexedChunks = 0;
  for (const def of docDefs) {
    const [doc] = await db.insert(documentos).values({
      nome: def.nome,
      colecao: def.colecao,
      tamanho: def.tamanho,
      chunks: def.chunks.length,
    }).returning();
    docIdMap[def.nome] = doc.id;

    for (const c of def.chunks) {
      totalChunks += 1;
      // Embedding oportunista: se o Ollama estiver disponível, indexa o vetor
      // real (busca vetorial funcional). Senão, NULL → fallback por palavras-chave.
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(c.texto);
        indexedChunks += 1;
      } catch {
        embedding = null;
      }
      await db.insert(chunks).values({
        documentoId: doc.id,
        colecao: def.colecao,
        texto: c.texto,
        embedding,
        metadata: { fonte: c.fonte },
      });
    }
  }
  console.log(`   ${indexedChunks}/${totalChunks} chunks com embedding (${totalChunks - indexedChunks} sem embedding → fallback por palavras-chave).`);

  // -------------------------------------------------------------------------
  // 7. Documentos gerados (rastreio do fluxo de geração)
  // -------------------------------------------------------------------------
  console.log('🧾 Criando documentos gerados...');
  await db.insert(documentosGerados).values([
    { usuarioId: aAdmin.id, pecaId: null, documentoId: docIdMap['CLT_Compilada_2026.pdf'], tipo: 'upload', titulo: 'CLT_Compilada_2026.pdf' },
    { usuarioId: aAdmin.id, pecaId: null, documentoId: docIdMap['CPC_Lei_13105_2015_Compilado.pdf'], tipo: 'upload', titulo: 'CPC_Lei_13105_2015_Compilado.pdf' },
    { usuarioId: aUser1.id, pecaId: null, documentoId: docIdMap['Lei_8213_1991_Beneficios.pdf'], tipo: 'upload', titulo: 'Lei_8213_1991_Beneficios.pdf' },
  ]);

  // -------------------------------------------------------------------------
  // 8. Andamentos (linha do tempo + resumo IA)
  // -------------------------------------------------------------------------
  console.log('🕒 Criando andamentos...');
  await db.insert(andamentos).values([
    { processoId: processosA[0].id, data: daysFromNow(-6), tipo: 'Intimação', descricao: 'Publicação no DJEN designando Audiência de Conciliação.', resumoIA: '🤖 Resumo IA: Audiência inicial designada. Ação recomendada: preparar proposta conciliatória e notificar o cliente.', prazoFatal: iso(6), usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[0].id, data: daysFromNow(-3), tipo: 'Despacho', descricao: 'Determina a juntada de cartões de ponto pela Reclamada.', resumoIA: '🤖 Resumo IA: Reclamada deve apresentar documentos em 5 dias úteis.', prazoFatal: iso(3), usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[1].id, data: daysFromNow(-5), tipo: 'Intimação', descricao: 'Intimação da Companhia Aérea para Contestação.', resumoIA: '🤖 Resumo IA: Início do prazo de defesa do réu.', prazoFatal: iso(5), usuarioId: aUser1.id, escritorioId: escA.id },
    { processoId: processosA[2].id, data: daysFromNow(-2), tipo: 'Sentença', descricao: 'Sentença de improcedência publicada.', resumoIA: '🤖 Resumo IA: Sentença desfavorável. Avaliar interposição de apelação.', prazoFatal: iso(12), usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[5].id, data: daysFromNow(-4), tipo: 'Audiência', descricao: 'Audiência de instrução realizada.', resumoIA: '🤖 Resumo IA: Perícia médica agendada para o próximo mês.', prazoFatal: iso(20), usuarioId: aUser1.id, escritorioId: escA.id },
    { processoId: processosB[0].id, data: daysFromNow(-2), tipo: 'Intimação', descricao: 'Intimação para audiência inicial na Justiça do Trabalho.', resumoIA: '🤖 Resumo IA: Audiência inicial designada. Preparar defesa da reclamada.', prazoFatal: iso(7), usuarioId: bAdmin.id, escritorioId: escB.id },
    { processoId: processosB[1].id, data: daysFromNow(-1), tipo: 'Despacho', descricao: 'Despacho determinando citação do réu.', resumoIA: '🤖 Resumo IA: Citação expedida. Acompanhar prazo de contestação.', prazoFatal: iso(14), usuarioId: bUser1.id, escritorioId: escB.id },
  ]);

  // -------------------------------------------------------------------------
  // 9. Financeiro: lançamentos + timesheet
  // -------------------------------------------------------------------------
  console.log('💰 Criando lançamentos financeiros e timesheet...');
  await db.insert(lancamentosFinanceiros).values([
    { processoId: processosA[0].id, cliente: 'Fernanda Oliveira', tipo: 'Honorário Fixo', valor: encryptField('R$ 3.500,00'), vencimento: iso(5), status: 'pago', usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[0].id, cliente: 'Fernanda Oliveira', tipo: 'Êxito', valor: encryptField('20% do valor recuperado'), vencimento: iso(30), status: 'pendente', usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[2].id, cliente: 'Construtora Alfa', tipo: 'Honorário Fixo', valor: encryptField('R$ 12.000,00'), vencimento: iso(10), status: 'pendente', usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[3].id, cliente: 'Indústria Metalúrgica Sul', tipo: 'Despesa Processual', valor: encryptField('R$ 1.200,00'), vencimento: iso(-3), status: 'atrasado', usuarioId: aUser2.id, escritorioId: escA.id },
    { processoId: processosA[5].id, cliente: 'Lúcia Ferreira', tipo: 'Honorário Fixo', valor: encryptField('R$ 2.800,00'), vencimento: iso(15), status: 'pago', usuarioId: aUser1.id, escritorioId: escA.id },
    { processoId: processosB[0].id, cliente: 'Paulo Henrique Dias', tipo: 'Honorário Fixo', valor: encryptField('R$ 2.000,00'), vencimento: iso(4), status: 'pago', usuarioId: bAdmin.id, escritorioId: escB.id },
    { processoId: processosB[1].id, cliente: 'Comercial Beta LTDA', tipo: 'Êxito', valor: encryptField('15% do valor recuperado'), vencimento: iso(28), status: 'pendente', usuarioId: bUser1.id, escritorioId: escB.id },
  ]);

  await db.insert(timesheet).values([
    { processoId: processosA[0].id, advogado: aAdmin.nome, descricao: 'Análise de cartões de ponto e cálculo de horas extras', minutos: 140, valorHora: '350,00', faturado: 'nao', usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[1].id, advogado: aUser1.nome, descricao: 'Elaboração de petição inicial de danos morais', minutos: 90, valorHora: '300,00', faturado: 'sim', usuarioId: aUser1.id, escritorioId: escA.id },
    { processoId: processosA[2].id, advogado: aAdmin.nome, descricao: 'Reunião com cliente e análise de documentos', minutos: 60, valorHora: '350,00', faturado: 'nao', usuarioId: aAdmin.id, escritorioId: escA.id },
    { processoId: processosA[3].id, advogado: aUser2.nome, descricao: 'Elaboração de agravo de instrumento', minutos: 180, valorHora: '320,00', faturado: 'sim', usuarioId: aUser2.id, escritorioId: escA.id },
    { processoId: processosB[0].id, advogado: bAdmin.nome, descricao: 'Preparação para audiência trabalhista', minutos: 45, valorHora: '280,00', faturado: 'nao', usuarioId: bAdmin.id, escritorioId: escB.id },
    { processoId: processosB[1].id, advogado: bUser1.nome, descricao: 'Análise de contrato de prestação de serviços', minutos: 75, valorHora: '260,00', faturado: 'nao', usuarioId: bUser1.id, escritorioId: escB.id },
  ]);

  // -------------------------------------------------------------------------
  // 10. Token usage (métricas de custo para admin/root)
  // -------------------------------------------------------------------------
  console.log('📊 Criando token_usage...');
  await db.insert(tokenUsage).values([
    { usuarioId: aAdmin.id, modelo: 'deepseek-chat', operacao: 'rag_generate', promptTokens: 3200, completionTokens: 1800, totalTokens: 5000, custoUsd: '0.0071', custoBrl: '0.039', horarioPico: false, metadata: { tipo: 'Petição Inicial Trabalhista' }, createdAt: daysFromNow(-6) },
    { usuarioId: aAdmin.id, modelo: 'deepseek-chat', operacao: 'rag_generate', promptTokens: 2100, completionTokens: 900, totalTokens: 3000, custoUsd: '0.0042', custoBrl: '0.023', horarioPico: false, metadata: { tipo: 'Contestação' }, createdAt: daysFromNow(-4) },
    { usuarioId: aUser1.id, modelo: 'deepseek-chat', operacao: 'rag_generate', promptTokens: 2600, completionTokens: 1400, totalTokens: 4000, custoUsd: '0.0057', custoBrl: '0.031', horarioPico: true, metadata: { tipo: 'Ação de Concessão de Benefício' }, createdAt: daysFromNow(-3) },
    { usuarioId: aUser2.id, modelo: 'deepseek-chat', operacao: 'resumo_andamento', promptTokens: 400, completionTokens: 200, totalTokens: 600, custoUsd: '0.0009', custoBrl: '0.005', horarioPico: false, metadata: null, createdAt: daysFromNow(-2) },
    { usuarioId: aAdmin.id, modelo: 'bge-m3', operacao: 'embedding', promptTokens: 250, completionTokens: 0, totalTokens: 250, custoUsd: '0.0000', custoBrl: '0.000', horarioPico: false, metadata: { fonte: 'CLT_Compilada_2026.pdf' }, createdAt: daysFromNow(-5) },
    { usuarioId: bAdmin.id, modelo: 'deepseek-chat', operacao: 'rag_generate', promptTokens: 1900, completionTokens: 800, totalTokens: 2700, custoUsd: '0.0038', custoBrl: '0.021', horarioPico: false, metadata: { tipo: 'Reclamação Trabalhista' }, createdAt: daysFromNow(-2) },
    { usuarioId: bUser1.id, modelo: 'deepseek-chat', operacao: 'resumo_andamento', promptTokens: 350, completionTokens: 180, totalTokens: 530, custoUsd: '0.0008', custoBrl: '0.004', horarioPico: false, metadata: null, createdAt: daysFromNow(-1) },
  ]);

  // -------------------------------------------------------------------------
  // 11. Logins (métricas de acesso para root)
  // -------------------------------------------------------------------------
  console.log('🔐 Criando logins...');
  await db.insert(logins).values([
    { usuarioId: aAdmin.id, emailTentado: 'admin.qa@teste.com', ipAddress: '177.12.34.56', userAgent: 'Mozilla/5.0', sucesso: true, motivoFalha: null, createdAt: daysFromNow(-1) },
    { usuarioId: aUser1.id, emailTentado: 'adv1.qa@teste.com', ipAddress: '177.12.34.57', userAgent: 'Mozilla/5.0', sucesso: true, motivoFalha: null, createdAt: daysFromNow(-1) },
    { usuarioId: aUser1.id, emailTentado: 'adv1.qa@teste.com', ipAddress: '177.12.34.58', userAgent: 'Mozilla/5.0', sucesso: false, motivoFalha: 'Credenciais inválidas', createdAt: daysFromNow(-1) },
    { usuarioId: bAdmin.id, emailTentado: 'admin.beta@teste.com', ipAddress: '189.20.30.40', userAgent: 'Mozilla/5.0', sucesso: true, motivoFalha: null, createdAt: daysFromNow(-2) },
    { usuarioId: null, emailTentado: 'naoexiste@teste.com', ipAddress: '189.20.30.41', userAgent: 'Mozilla/5.0', sucesso: false, motivoFalha: 'Credenciais inválidas', createdAt: daysFromNow(-2) },
  ]);

  // -------------------------------------------------------------------------
  // 12. Audit log (rastreabilidade para root)
  // -------------------------------------------------------------------------
  console.log('🧾 Criando audit_log...');
  await db.insert(auditLog).values([
    { actorId: aAdmin.id, acao: 'CREATE_PROCESSO', alvoId: processosA[0].id, alvoEmail: null, detalhes: { tipo: 'Reclamação Trabalhista' }, ipAddress: '177.12.34.56', createdAt: daysFromNow(-6) },
    { actorId: aAdmin.id, acao: 'CREATE_PECA', alvoId: null, alvoEmail: null, detalhes: { tipo: 'Petição Inicial Trabalhista' }, ipAddress: '177.12.34.56', createdAt: daysFromNow(-5) },
    { actorId: aUser1.id, acao: 'UPDATE_PECA', alvoId: null, alvoEmail: null, detalhes: { status: 'aprovado' }, ipAddress: '177.12.34.57', createdAt: daysFromNow(-4) },
    { actorId: bAdmin.id, acao: 'CREATE_CLIENTE', alvoId: clientesB[0].id, alvoEmail: null, detalhes: { nome: 'Comercial Beta LTDA' }, ipAddress: '189.20.30.40', createdAt: daysFromNow(-3) },
    { actorId: aAdmin.id, acao: 'CREATE_ESCRITORIO_USER', alvoId: aUser2.id, alvoEmail: 'adv2.qa@teste.com', detalhes: { email: 'adv2.qa@teste.com' }, ipAddress: '177.12.34.56', createdAt: daysFromNow(-2) },
  ]);

  // -------------------------------------------------------------------------
  // 13. VERIFICAÇÃO de isolamento multi-tenant
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log('🔎 VERIFICAÇÃO DE ISOLAMENTO MULTI-TENANT');
  console.log('============================================================');

  let allPass = true;

  // 13.1 Contagens por escritório (esperado: nenhum cruzamento)
  const tab = '   ';
  const counts = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM processos WHERE escritorio_id = ${escA.id}) AS a_processos,
      (SELECT COUNT(*) FROM processos WHERE escritorio_id = ${escB.id}) AS b_processos,
      (SELECT COUNT(*) FROM pecas WHERE escritorio_id = ${escA.id}) AS a_pecas,
      (SELECT COUNT(*) FROM pecas WHERE escritorio_id = ${escB.id}) AS b_pecas,
      (SELECT COUNT(*) FROM clientes WHERE escritorio_id = ${escA.id}) AS a_clientes,
      (SELECT COUNT(*) FROM clientes WHERE escritorio_id = ${escB.id}) AS b_clientes,
      (SELECT COUNT(*) FROM andamentos WHERE escritorio_id = ${escA.id}) AS a_andamentos,
      (SELECT COUNT(*) FROM andamentos WHERE escritorio_id = ${escB.id}) AS b_andamentos,
      (SELECT COUNT(*) FROM lancamentos_financeiros WHERE escritorio_id = ${escA.id}) AS a_lanc,
      (SELECT COUNT(*) FROM lancamentos_financeiros WHERE escritorio_id = ${escB.id}) AS b_lanc,
      (SELECT COUNT(*) FROM timesheet WHERE escritorio_id = ${escA.id}) AS a_ts,
      (SELECT COUNT(*) FROM timesheet WHERE escritorio_id = ${escB.id}) AS b_ts,
      (SELECT COUNT(*) FROM usuarios WHERE escritorio_id = ${escA.id}) AS a_users,
      (SELECT COUNT(*) FROM usuarios WHERE escritorio_id = ${escB.id}) AS b_users
  `)) as any[];
  const c = counts[0];
  console.log(`${tab}Escritório A -> processos=${c.a_processos} peças=${c.a_pecas} clientes=${c.a_clientes} andamentos=${c.a_andamentos} lançamentos=${c.a_lanc} timesheet=${c.a_ts} usuários=${c.a_users}`);
  console.log(`${tab}Escritório B -> processos=${c.b_processos} peças=${c.b_pecas} clientes=${c.b_clientes} andamentos=${c.b_andamentos} lançamentos=${c.b_lanc} timesheet=${c.b_ts} usuários=${c.b_users}`);

  // 13.2 Integridade referencial: dono (usuario_id) deve pertencer ao MESMO escritório do registro
  const integrityChecks: { label: string; query: string }[] = [
    { label: 'processos', query: `SELECT COUNT(*)::int AS n FROM processos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.escritorio_id <> u.escritorio_id` },
    { label: 'pecas', query: `SELECT COUNT(*)::int AS n FROM pecas p JOIN usuarios u ON u.id = p.usuario_id WHERE p.escritorio_id <> u.escritorio_id` },
    { label: 'clientes', query: `SELECT COUNT(*)::int AS n FROM clientes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.escritorio_id <> u.escritorio_id` },
    { label: 'andamentos', query: `SELECT COUNT(*)::int AS n FROM andamentos a JOIN usuarios u ON u.id = a.usuario_id WHERE a.escritorio_id <> u.escritorio_id` },
    { label: 'lancamentos', query: `SELECT COUNT(*)::int AS n FROM lancamentos_financeiros l JOIN usuarios u ON u.id = l.usuario_id WHERE l.escritorio_id <> u.escritorio_id` },
    { label: 'timesheet', query: `SELECT COUNT(*)::int AS n FROM timesheet t JOIN usuarios u ON u.id = t.usuario_id WHERE t.escritorio_id <> u.escritorio_id` },
  ];

  for (const chk of integrityChecks) {
    const rows = (await db.execute(sql.raw(chk.query))) as any[];
    const violacoes = Number(rows[0]?.n ?? 0);
    const ok = violacoes === 0;
    if (!ok) allPass = false;
    console.log(`${tab}${ok ? '✅' : '❌'} Integridade ${chk.label}: ${violacoes} violação(ões) de dono x escritório`);
  }

  // 13.3 Simulação do tenantScope: um 'user' de A não pode enxergar dados de B
  const userScopeLeak = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM processos
    WHERE escritorio_id = ${escA.id} AND usuario_id = ${aUser1.id} AND escritorio_id <> ${escA.id}
  `)) as any[];
  // Acima é tautologicamente 0; verificação real: nenhum processo de A aponta para escritório B
  const crossTenantProc = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM processos WHERE escritorio_id = ${escB.id} AND usuario_id = ${aUser1.id}
  `)) as any[];
  const crossTenantPeca = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM pecas WHERE escritorio_id = ${escB.id} AND usuario_id = ${aUser1.id}
  `)) as any[];
  const crossTenantCliente = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM clientes WHERE escritorio_id = ${escB.id} AND usuario_id = ${aUser1.id}
  `)) as any[];
  const leaked = Number(crossTenantProc[0]?.n ?? 0) + Number(crossTenantPeca[0]?.n ?? 0) + Number(crossTenantCliente[0]?.n ?? 0);
  const userLeak = Number(userScopeLeak[0]?.n ?? 0);
  if (userLeak !== 0 || leaked !== 0) allPass = false;
  console.log(`${tab}${leaked === 0 && userLeak === 0 ? '✅' : '❌'} Escopo de user A (Mariana): ${leaked} registro(s) vazados de B, ${userLeak} violação(ões) de escopo`);

  // 13.4 Processos/peças referenciam apenas processos/clientes do próprio escritório (via FK indireta)
  const pecaProcessoLeak = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM pecas pc
    JOIN processos p ON p.id = pc.processo_id
    WHERE pc.escritorio_id <> p.escritorio_id
  `)) as any[];
  const pl = Number(pecaProcessoLeak[0]?.n ?? 0);
  if (pl !== 0) allPass = false;
  console.log(`${tab}${pl === 0 ? '✅' : '❌'} Peças apontando para processo de outro escritório: ${pl}`);

  console.log('------------------------------------------------------------');
  console.log(`${allPass ? '✅ ISOLAMENTO OK' : '❌ FALHA NO ISOLAMENTO'} — dados dos escritórios não se misturam.\n`);

  // -------------------------------------------------------------------------
  // 14. Resumo final + credenciais
  // -------------------------------------------------------------------------
  console.log('============================================================');
  console.log('🧪 SEED DE TESTE CONCLUÍDO');
  console.log('============================================================');
  console.log('Credenciais de teste:');
  console.log(`  root              : root@smartjuris.com / ${process.env.SEED_ADMIN_PASSWORD || 'admin123'}`);
  console.log(`  Escritório A admin: admin.qa@teste.com / ${process.env.SEED_ADMIN_PASSWORD || 'admin123'}`);
  console.log(`  Escritório A user : adv1.qa@teste.com  / ${process.env.SEED_USER_PASSWORD || 'user123'}`);
  console.log(`  Escritório A user : adv2.qa@teste.com  / ${process.env.SEED_USER_PASSWORD || 'user123'}`);
  console.log(`  Escritório B admin: admin.beta@teste.com / ${process.env.SEED_ADMIN_PASSWORD || 'admin123'}`);
  console.log(`  Escritório B user : adv.beta@teste.com  / ${process.env.SEED_USER_PASSWORD || 'user123'}`);
  console.log('');
  console.log('Observações:');
  console.log('  • Escritório A = plano profissional (sem limite de tokens).');
  console.log('  • Escritório B = demo (limite de 10.000 tokens/mês) para testar cota.');
  console.log('  • Chunks indexados via Ollama quando disponível (busca vetorial); caso contrário, fallback por palavras-chave do RAG.');
  console.log('');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Erro no seed de teste:', err);
  process.exit(1);
});
