import { pgTable, text, timestamp, date, uuid, integer, jsonb, index, numeric, boolean, AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

// Vector type for pgvector
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(1024)'; // BGE-M3 or Nomic dimensions. 1024 for BGE-M3. Adjust if needed.
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value as number[];
  },
});

export const processos = pgTable('processos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tipo: text('tipo').notNull(),
  cliente: text('cliente').notNull(),
  adverso: text('adverso').notNull(),
  vara: text('vara').notNull(),
  area: text('area').notNull(),
  status: text('status').notNull(), // 'ativo' | 'suspenso' | 'arquivado'
  valor: text('valor').notNull(),
  prazo: date('prazo').notNull(),
  advogado: text('advogado').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const pecas = pgTable('pecas', {
  id: uuid('id').defaultRandom().primaryKey(),
  processoId: uuid('processo_id').references(() => processos.id),
  tipo: text('tipo').notNull(),
  area: text('area').notNull(),
  cliente: text('cliente').notNull(),
  status: text('status').notNull(), // 'revisao' | 'aprovado' | 'protocolado' | 'reprovado'
  prazo: date('prazo').notNull(),
  geradoEm: timestamp('gerado_em', { withTimezone: true }).defaultNow(),
  modelo: text('modelo').notNull(),
  fontes: integer('fontes').notNull(),
  conteudo: text('conteudo').notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
});

export const documentos = pgTable('documentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  colecao: text('colecao').notNull(),
  tamanho: text('tamanho').notNull(),
  indexado: timestamp('indexado', { withTimezone: true }).defaultNow(),
  chunks: integer('chunks').notNull(),
});

export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentoId: uuid('documento_id').references(() => documentos.id),
  colecao: text('colecao').notNull(),
  texto: text('texto').notNull(),
  embedding: vector('embedding'),
  metadata: jsonb('metadata'),
}, (table) => ({
  embeddingIndex: index('embedding_index').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').unique().notNull(),
  senha: text('senha').notNull(), // hashed
  role: text('role').notNull(), // 'admin' | 'user'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  ativo: boolean('ativo').default(true),
  ultimoLogin: timestamp('ultimo_login', { withTimezone: true }),
  createdBy: uuid('created_by').references((): AnyPgColumn => usuarios.id),
});

export const andamentos = pgTable('andamentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  processoId: uuid('processo_id').references(() => processos.id),
  data: timestamp('data', { withTimezone: true }).defaultNow(),
  tipo: text('tipo').notNull(), // 'Intimação' | 'Despacho' | 'Sentença' | 'Audiência'
  descricao: text('descricao').notNull(),
  resumoIA: text('resumo_ia'),
  prazoFatal: text('prazo_fatal'),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
});

export const lancamentosFinanceiros = pgTable('lancamentos_financeiros', {
  id: uuid('id').defaultRandom().primaryKey(),
  processoId: uuid('processo_id').references(() => processos.id),
  cliente: text('cliente').notNull(),
  tipo: text('tipo').notNull(), // 'Honorário Fixo' | 'Êxito' | 'Despesa Processual'
  valor: text('valor').notNull(),
  vencimento: text('vencimento').notNull(),
  status: text('status').default('pendente'), // 'pago' | 'pendente' | 'atrasado'
});

export const timesheet = pgTable('timesheet', {
  id: uuid('id').defaultRandom().primaryKey(),
  processoId: uuid('processo_id').references(() => processos.id),
  advogado: text('advogado').notNull(),
  descricao: text('descricao').notNull(),
  minutos: integer('minutos').notNull(),
  valorHora: text('valor_hora').default('350,00'),
  faturado: text('faturado').default('nao'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const clientes = pgTable('clientes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tipo: text('tipo').notNull(), // 'PF' (Pessoa Física) | 'PJ' (Pessoa Jurídica)
  nome: text('nome').notNull(),
  cpfCnpj: text('cpf_cnpj').notNull(),
  email: text('email').notNull(),
  telefone: text('telefone').notNull(),
  cep: text('cep'),
  logradouro: text('logradouro'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  uf: text('uf'),
  qualificacao: text('qualificacao'), // ex: "brasileira, solteira, auxiliar administrativa"
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const logins = pgTable('logins', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  emailTentado: text('email_tentado').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  sucesso: boolean('sucesso').notNull(),
  motivoFalha: text('motivo_falha'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const tokenUsage = pgTable('token_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  modelo: text('modelo').notNull(),
  operacao: text('operacao').notNull(),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  custoUsd: numeric('custo_usd', { precision: 12, scale: 6 }).default('0'),
  custoBrl: numeric('custo_brl', { precision: 12, scale: 6 }).default('0'),
  horarioPico: boolean('horario_pico').default(false),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const documentosGerados = pgTable('documentos_gerados', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  documentoId: uuid('documento_id').references(() => documentos.id),
  pecaId: uuid('peca_id').references(() => pecas.id),
  tipo: text('tipo').notNull(),
  titulo: text('titulo'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => usuarios.id),
  acao: text('acao').notNull(),
  alvoId: uuid('alvo_id'),
  alvoEmail: text('alvo_email'),
  detalhes: jsonb('detalhes'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});


