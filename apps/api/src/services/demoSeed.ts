// ===========================================================================
// Seed de demonstração — dataset demo (clientes, processos, peças, documentos).
//
// Fase 2A (correção isolada): documentos e chunks demonstrativos nascem com o
// `escritorio_id` do escritório demo e, quando aplicável, com o `processo_id`
// correto. Regras:
//   - NUNCA associa documentos de produção nem altera documentos legados
//     automaticamente;
//   - se um documento demo JÁ existir, não duplica; corrige o escopo SOMENTE
//     quando identificado inequivocamente como dado demo (nome exato do seed +
//     sem escopo), nunca documentos de usuário;
//   - `indexed_status='indexed'` reflete a persistência real dos chunks
//     (chunks de seed não passam pelo pipeline de embeddings: `embedding` fica
//     NULL e a busca RAG keyword continua funcionando).
// ===========================================================================

import { db } from '../db/client.js';
import { clientes, processos, pecas, documentos, chunks } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

interface DocumentoDemo {
  nome: string;
  colecao: string;
  tamanho: string;
  area: string;
  processoId: string | null;
  trechos: string[];
}

// Documentos de referência do escritório demo. `processoId` é vinculado apenas
// quando semanticamente aplicável (jurisprudência do caso de danos morais).
const DOCUMENTOS_DEMO: Omit<DocumentoDemo, 'processoId'>[] = [
  {
    nome: 'CLT_Compilada_2024.pdf',
    colecao: 'Legislação Federal',
    tamanho: '2.4 MB',
    area: 'Trabalhista',
    trechos: [
      'Art. 59 da CLT — A duração normal do trabalho não excederá de 8 horas diárias e 44 semanais, facultada a compensação de horários.',
      'Art. 71 da CLT — Em qualquer trabalho contínuo, cuja duração exceda 6 horas, será obrigatória a concessão de um intervalo para repouso ou alimentação.',
    ],
  },
  {
    nome: 'Súmulas_TST_Atualizadas.pdf',
    colecao: 'Jurisprudência',
    tamanho: '1.1 MB',
    area: 'Trabalhista',
    trechos: [
      'Súmula 291 do TST — A supressão das horas suplementares pagas com habitualidade gera direito ao pagamento das horas suprimidas.',
      'Súmula 368 do TST — A remuneração do serviço suplementar é composta do valor da hora normal, integrado por parcelas de natureza salarial.',
    ],
  },
  {
    nome: 'Jurisprudencia_Danos_Morais_Aereo.pdf',
    colecao: 'Jurisprudência',
    tamanho: '850 KB',
    area: 'Consumerista',
    trechos: [
      'Súmula 636 do STJ — O dano moral decorrente de atraso de voo independe de prova do prejuízo (in re ipsa).',
      'Convenção de Montreal — A responsabilidade do transportador aéreo por atraso alcança o dano moral sofrido pelo passageiro.',
    ],
  },
];

/**
 * Garante o dataset demo completo dentro do escritório `demoId`.
 * Idempotente para DOCUMENTOS (não duplica; corrige apenas legados demo).
 */
export async function ensureDemoDataset(demoId: string, adminUserId: string | null): Promise<void> {
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
      usuarioId: adminUserId,
      escritorioId: demoId,
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
      usuarioId: adminUserId,
      escritorioId: demoId,
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
      usuarioId: adminUserId,
      escritorioId: demoId,
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
      usuarioId: adminUserId,
      escritorioId: demoId,
    },
  ]);

  const novosProcessos = await db.insert(processos).values([
    {
      tipo: 'Reclamação Trabalhista',
      cliente: 'Fernanda Oliveira',
      adverso: 'Empresa XYZ S.A.',
      vara: '3ª Vara do Trabalho de SP',
      area: 'Trabalhista',
      status: 'ativo',
      valor: 'R$ 87.500,00',
      prazo: '2026-09-15',
      advogado: 'Administrador Demo',
      usuarioId: adminUserId,
      escritorioId: demoId,
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
      advogado: 'Administrador Demo',
      usuarioId: adminUserId,
      escritorioId: demoId,
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
      advogado: 'Administrador Demo',
      usuarioId: adminUserId,
      escritorioId: demoId,
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
      advogado: 'Administrador Demo',
      usuarioId: adminUserId,
      escritorioId: demoId,
    },
  ]).returning({ id: processos.id });

  await db.insert(pecas).values([
    {
      processoId: novosProcessos[0].id,
      tipo: 'Petição Inicial Trabalhista',
      area: 'Trabalhista',
      cliente: 'Fernanda Oliveira',
      status: 'revisao',
      prazo: '2026-09-10',
      modelo: 'DeepSeek Chat',
      fontes: 4,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP. Petição inicial demonstrativa.',
      usuarioId: adminUserId,
      escritorioId: demoId,
    },
    {
      processoId: novosProcessos[1].id,
      tipo: 'Petição Inicial de Danos Morais',
      area: 'Consumerista',
      cliente: 'Roberto Souza',
      status: 'aprovado',
      prazo: '2026-08-23',
      modelo: 'DeepSeek Chat',
      fontes: 2,
      conteudo: 'EXCELENTÍSSIMO JUIZ DA 2ª VARA CÍVEL DA COMARCA DE GUARULHOS - SP. Petição inicial demonstrativa.',
      usuarioId: adminUserId,
      escritorioId: demoId,
    },
    {
      processoId: novosProcessos[2].id,
      tipo: 'Contestação Cível',
      area: 'Cível',
      cliente: 'Construtora Alfa',
      status: 'revisao',
      prazo: '2026-08-30',
      modelo: 'DeepSeek Chat',
      fontes: 3,
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 10ª VARA CÍVEL DA CAPITAL. Contestação demonstrativa.',
      usuarioId: adminUserId,
      escritorioId: demoId,
    },
  ]);

  // Documentos demo + chunks: escopo correto, idempotente, sem tocar em dados
  // de usuário (mesmo nome) e sem duplicar.
  const documentosDemo: DocumentoDemo[] = DOCUMENTOS_DEMO.map((doc, i) => ({
    ...doc,
    processoId: i === 2 ? (novosProcessos[1]?.id ?? null) : null,
  }));

  for (const demo of documentosDemo) {
    await garantirDocumentoDemo(demoId, demo);
  }
}

/**
 * Garante UM documento demo escopado ao escritório demo.
 * - Se já existe com escopo demo: não duplica (apenas garante escopo dos chunks).
 * - Se existe sem escopo (legado do seed antigo, identificado pelo nome exato):
 *   corrige o escopo — é dado demo inequívoco.
 * - Se existe com escopo de OUTRO escritório: documento de usuário — não toca.
 */
async function garantirDocumentoDemo(demoId: string, demo: DocumentoDemo): Promise<void> {
  // Candidato demo determinístico: primeiro o legado SEM escopo (nome exato do
  // seed = dado demo inequívoco), depois o já escopado ao demo.
  const existentes = await db.select().from(documentos).where(eq(documentos.nome, demo.nome)).limit(5);
  const candidato =
    existentes.find((d) => d.escritorioId == null) ??
    existentes.find((d) => d.escritorioId === demoId) ??
    null;

  if (candidato) {
    // Já existe: não duplica; corrige escopo apenas do candidato demo.
    const precisaCorrigir =
      candidato.escritorioId == null || candidato.processoId !== demo.processoId;
    if (precisaCorrigir) {
      await db.update(documentos).set({
        escritorioId: demoId,
        processoId: demo.processoId,
        indexedStatus: 'indexed',
        failedChunks: 0,
        updatedAt: new Date(),
      }).where(eq(documentos.id, candidato.id));
    }
    // Garante escopo dos chunks herdados (sem duplicar chunks).
    await db.update(chunks).set({ escritorioId: demoId, processoId: demo.processoId })
      .where(and(eq(chunks.documentoId, candidato.id), isNull(chunks.escritorioId)));
    return;
  }

  // Existe documento com o nome, mas pertence a OUTRO escritório (usuário):
  // nunca alterar nem duplicar.
  if (existentes.length > 0) return;

  // Nenhum documento com esse nome — cria novo, escopado, com chunks herdando
  // escritório/processo.
  const [doc] = await db.insert(documentos).values({
    nome: demo.nome,
    colecao: demo.colecao,
    tamanho: demo.tamanho,
    chunks: 0,
    escritorioId: demoId,
    processoId: demo.processoId,
    totalPages: null,
    sizeBytes: 0,
    indexedStatus: 'indexed',
    failedChunks: 0,
    updatedAt: new Date(),
  }).returning();

  for (const trecho of demo.trechos) {
    await db.insert(chunks).values({
      documentoId: doc.id,
      colecao: demo.colecao,
      texto: trecho,
      // Seed não passa pelo pipeline de embeddings (Ollama): embedding NULL e
      // busca RAG por keywords continua funcionando para o demo.
      metadata: { fonte: demo.nome, area: demo.area },
      escritorioId: demoId,
      processoId: demo.processoId,
    });
  }
  await db.update(documentos).set({ chunks: demo.trechos.length }).where(eq(documentos.id, doc.id));
}
