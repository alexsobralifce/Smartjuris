import type { DB } from './types'

export const seed: DB = {
  processos: [
    { id: '0001234-56.2024.5.02.0001', tipo: 'Reclamação Trabalhista', cliente: 'Fernanda Oliveira', adverso: 'Empresa XYZ S.A.', vara: '3ª Vara do Trabalho de SP', area: 'Trabalhista', status: 'ativo', valor: 'R$ 87.500', prazo: '18/08/2026', advogado: 'Dr. Marcos Costa' },
    { id: '0009876-12.2024.8.26.0100', tipo: 'Ação de Cobrança', cliente: 'Construtora Alfa Ltda.', adverso: 'Município de SP', vara: '7ª Vara Cível de SP', area: 'Cível', status: 'ativo', valor: 'R$ 420.000', prazo: '20/08/2026', advogado: 'Dra. Ana Silva' },
    { id: '0005432-78.2024.4.03.6100', tipo: 'Mandado de Segurança', cliente: 'Importadora Beta S.A.', adverso: 'União Federal', vara: '14ª Vara Federal de SP', area: 'Tributário', status: 'ativo', valor: 'R$ 1.250.000', prazo: '22/08/2026', advogado: 'Dr. Marcos Costa' },
    { id: '0003210-44.2024.8.26.0302', tipo: 'Ação de Indenização', cliente: 'Roberto Nascimento', adverso: 'Seguradora Saúde Plus', vara: '2ª Vara Cível de Campinas', area: 'Cível', status: 'suspenso', valor: 'R$ 35.000', prazo: '—', advogado: 'Dra. Ana Silva' },
    { id: '0007654-32.2024.5.15.0001', tipo: 'Ação de Rescisão Indireta', cliente: 'Paulo Fernandes', adverso: 'LogTech Transportes', vara: '1ª Vara do Trabalho de Manaus', area: 'Trabalhista', status: 'ativo', valor: 'R$ 124.000', prazo: '25/08/2026', advogado: 'Dr. Ricardo Lima' },
    { id: '0002345-89.2024.8.26.0053', tipo: 'Ação Monitória', cliente: 'Tech Solutions Ltda.', adverso: 'Cliente Inadimplente S.A.', vara: '5ª Vara Cível de SP', area: 'Cível', status: 'arquivado', valor: 'R$ 67.800', prazo: '—', advogado: 'Dr. Marcos Costa' },
    { id: '0008765-21.2024.4.03.6105', tipo: 'Execução Fiscal', cliente: 'Indústria Gama Ltda.', adverso: 'Estado de São Paulo', vara: '3ª Vara Federal Cível', area: 'Tributário', status: 'ativo', valor: 'R$ 890.000', prazo: '30/08/2026', advogado: 'Dra. Ana Silva' },
  ],
  pecas: [
    { id: 'PE-2024-0891', processoId: '0001234-56.2024.5.02.0001', tipo: 'Petição Inicial', area: 'Trabalhista', cliente: 'Fernanda Oliveira', status: 'revisao', prazo: '18/08/2026', geradoEm: '17/08/2026 14:32', modelo: 'Claude 3.5 Sonnet', fontes: 4, conteudo: '' },
    { id: 'PE-2024-0890', processoId: '0009876-12.2024.8.26.0100', tipo: 'Contestação', area: 'Cível', cliente: 'Construtora Alfa Ltda.', status: 'aprovado', prazo: '20/08/2026', geradoEm: '16/08/2026 10:00', modelo: 'Claude 3.5 Sonnet', fontes: 3, conteudo: '' },
    { id: 'PE-2024-0889', processoId: '0005432-78.2024.4.03.6100', tipo: 'Recurso de Apelação', area: 'Tributário', cliente: 'Importadora Beta S.A.', status: 'revisao', prazo: '17/08/2026', geradoEm: '17/08/2026 11:10', modelo: 'Claude 3.5 Sonnet', fontes: 6, conteudo: '' },
    { id: 'PE-2024-0888', processoId: '0003210-44.2024.8.26.0302', tipo: 'Agravo de Instrumento', area: 'Cível', cliente: 'Roberto Nascimento', status: 'protocolado', prazo: '15/08/2026', geradoEm: '14/08/2026 09:00', modelo: 'Claude 3.5 Sonnet', fontes: 2, conteudo: '' },
    { id: 'PE-2024-0887', processoId: '0002345-89.2024.8.26.0053', tipo: 'Embargos de Declaração', area: 'Cível', cliente: 'Tech Solutions Ltda.', status: 'aprovado', prazo: '19/08/2026', geradoEm: '15/08/2026 16:00', modelo: 'Claude 3.5 Sonnet', fontes: 2, conteudo: '' },
  ],
  documentos: [
    { id: 'doc-001', nome: 'Reclamação Trabalhista - Fernanda Oliveira.pdf', colecao: 'Peças do Escritório', tamanho: '48 KB', indexado: '17/08/2026 14:35', chunks: 12 },
    { id: 'doc-002', nome: 'Súmula 291 TST - atualizada 2024.pdf', colecao: 'Jurisprudência', tamanho: '12 KB', indexado: '17/08/2026 06:01', chunks: 3 },
    { id: 'doc-003', nome: 'CLT - Decreto-Lei 5.452 - consolidado 2024.pdf', colecao: 'Legislação Federal', tamanho: '2,1 MB', indexado: '15/08/2026 12:04', chunks: 847 },
    { id: 'doc-004', nome: 'Acórdão TRT-2 · Proc. 2023-045678.pdf', colecao: 'Jurisprudência', tamanho: '87 KB', indexado: '14/08/2026 09:22', chunks: 18 },
  ],
}
