export type StatusProcesso = 'ativo' | 'suspenso' | 'arquivado'
export type StatusPeca = 'revisao' | 'aprovado' | 'protocolado' | 'reprovado'

export interface Processo {
  id: string
  numero?: string | null
  tipo: string
  cliente: string
  adverso: string
  vara: string
  area: string
  status: StatusProcesso
  valor: string
  prazo: string
  advogado: string
}

export interface Peca {
  id: string
  processoId: string
  tipo: string
  area: string
  cliente: string
  status: StatusPeca
  prazo: string
  geradoEm: string
  modelo: string
  fontes: number
  conteudo: string
}

export interface Documento {
  id: string
  nome: string
  colecao: string
  tamanho: string
  indexado: string
  chunks: number
}

export interface DB {
  processos: Processo[]
  pecas: Peca[]
  documentos: Documento[]
}

// --- Fonte única de planos e operações de IA (Fase 2B) ---
export * from './catalog.js'
