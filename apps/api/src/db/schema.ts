import { pgTable, text, timestamp, date, uuid, integer, jsonb, index, numeric, boolean, uniqueIndex, AnyPgColumn } from 'drizzle-orm/pg-core';
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
  numero: text('numero'),
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
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
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
  conteudoRico: jsonb('conteudo_rico'),
  // Fase 3D — idempotência durável da persistência (unicidade por escritório,
  // migration 0023): replay do POST com a mesma chave retorna a peça existente.
  idempotencyKey: text('idempotency_key'),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  updatedBy: uuid('updated_by').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
});

export const documentos = pgTable('documentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  colecao: text('colecao').notNull(),
  tamanho: text('tamanho').notNull(),
  indexado: timestamp('indexado', { withTimezone: true }).defaultNow(),
  chunks: integer('chunks').notNull(),
  // Fase 2A — isolamento multi-tenant e metadados mínimos:
  // `escritorio_id` é obrigatório para NOVOS documentos (derivado do contexto
  // autenticado); registros legados ficam NULL e entram em quarentena
  // (indexed_status='unscoped') até associação manual pelo root.
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
  processoId: uuid('processo_id').references((): AnyPgColumn => processos.id),
  totalPages: integer('total_pages'),
  indexedStatus: text('indexed_status').notNull().default('pending'), // pending|processing|indexed|failed|unscoped
  failedChunks: integer('failed_chunks').notNull().default(0),
  indexedAt: timestamp('indexed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentoId: uuid('documento_id').references(() => documentos.id),
  colecao: text('colecao').notNull(),
  texto: text('texto').notNull(),
  embedding: vector('embedding'),
  metadata: jsonb('metadata'),
  // Fase 2A — o chunk herda o escopo do documento de origem (nunca é enviado
  // pelo cliente) e só é recuperável dentro do mesmo escritório.
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
  processoId: uuid('processo_id').references((): AnyPgColumn => processos.id),
}, (table) => ({
  embeddingIndex: index('embedding_index').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').unique().notNull(),
  senha: text('senha').notNull(), // hashed
  role: text('role').notNull(), // 'admin' | 'user' | 'root'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  ativo: boolean('ativo').default(true),
  ultimoLogin: timestamp('ultimo_login', { withTimezone: true }),
  createdBy: uuid('created_by').references((): AnyPgColumn => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
  precisaTrocarSenha: boolean('precisa_trocar_senha').notNull().default(false),
  oab: text('oab'),
  oabUf: text('oab_uf'),
  creditosMes: integer('creditos_mes'),
  emailVerificado: boolean('email_verificado').notNull().default(false),
});

export const escritorios = pgTable('escritorios', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  plano: text('plano').notNull().default('basico'),
  limiteUsuarios: integer('limite_usuarios').notNull().default(2),
  limitePecasMes: integer('limite_pecas_mes').notNull().default(50),
  limiteProcessos: integer('limite_processos').notNull().default(100),
  isDemo: boolean('is_demo').notNull().default(false),
  limiteTokensMes: integer('limite_tokens_mes'),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  createdBy: uuid('created_by').references((): AnyPgColumn => usuarios.id),
  razaoSocial: text('razao_social'),
  cnpj: text('cnpj'),
  inscricaoOab: text('inscricao_oab'),
  endereco: text('endereco'),
  numero: text('numero'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  uf: text('uf'),
  cep: text('cep'),
  telefone: text('telefone'),
  email: text('email'),
  site: text('site'),
  logoUrl: text('logo_url'),
  // Camada de créditos: saldo do ciclo e reserva de custo (centavos inteiros).
  creditsAvailable: integer('credits_available').notNull().default(0),
  reserveCentsUsed: integer('reserve_cents_used').notNull().default(0),
  cycleMonth: text('cycle_month').notNull().default(sql`to_char(now(), 'YYYY-MM')`),
});

export const permissoesUsuario = pgTable('permissoes_usuario', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  modulo: text('modulo').notNull(),
  ativo: boolean('ativo').notNull().default(true),
}, (table) => ({
  uniqueUserModulo: uniqueIndex('permissoes_usuario_unique').on(table.usuarioId, table.modulo),
}));

export const andamentos = pgTable('andamentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  processoId: uuid('processo_id').references(() => processos.id),
  data: timestamp('data', { withTimezone: true }).defaultNow(),
  tipo: text('tipo').notNull(), // 'Intimação' | 'Despacho' | 'Sentença' | 'Audiência'
  descricao: text('descricao').notNull(),
  resumoIA: text('resumo_ia'),
  prazoFatal: text('prazo_fatal'),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
});

export const lancamentosFinanceiros = pgTable('lancamentos_financeiros', {
  id: uuid('id').defaultRandom().primaryKey(),
  processoId: uuid('processo_id').references(() => processos.id),
  cliente: text('cliente').notNull(),
  tipo: text('tipo').notNull(), // 'Honorário Fixo' | 'Êxito' | 'Despesa Processual'
  valor: text('valor').notNull(),
  vencimento: text('vencimento').notNull(),
  status: text('status').default('pendente'), // 'pago' | 'pendente' | 'atrasado'
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
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
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
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
  dataNascimento: date('data_nascimento'),   // nullable — só para tipo 'PF'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
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

export const eventos = pgTable('eventos', {
  id: uuid('id').defaultRandom().primaryKey(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao'),
  tipo: text('tipo').notNull(),             // 'audiencia' | 'reuniao' | 'prazo' | 'diligencia' | 'outro'
  inicio: timestamp('inicio', { withTimezone: true }).notNull(),
  fim: timestamp('fim', { withTimezone: true }),
  diaInteiro: boolean('dia_inteiro').notNull().default(false),
  processoId: uuid('processo_id').references(() => processos.id),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  cor: text('cor'),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  escritorioId: uuid('escritorio_id').references((): AnyPgColumn => escritorios.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  escritorioInicioIdx: index('eventos_escritorio_inicio_idx').on(table.escritorioId, table.inicio),
}));

export const codigosVerificacao = pgTable('codigos_verificacao', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  codigo: text('codigo').notNull(),
  tipo: text('tipo').notNull().default('registro'),
  tentativas: integer('tentativas').notNull().default(0),
  utilizado: boolean('utilizado').notNull().default(false),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index('codigos_verificacao_email_idx').on(table.email),
}));

// Log de aplicação (syslog) — eventos info/warn/error do runtime, consumidos
// pelo Painel Root com filtro por nível e cópia de erros.
export const appLogs = pgTable('app_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  stack: text('stack'),
  source: text('source'),
  method: text('method'),
  path: text('path'),
  status: integer('status'),
  ip: text('ip'),
  usuarioId: uuid('usuario_id'),
  escritorioId: uuid('escritorio_id'),
  context: jsonb('context'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  createdIdx: index('app_logs_created_idx').on(table.createdAt),
  levelIdx: index('app_logs_level_idx').on(table.level),
}));

// Operações de IA com reserva prévia — fonte auditável da execução de LLM.
export const aiOperations = pgTable('ai_operations', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Unicidade por (escritorio_id, idempotency_key) — migration 0020.
  idempotencyKey: text('idempotency_key').notNull(),
  idempotencyFingerprint: text('idempotency_fingerprint'),
  escritorioId: uuid('escritorio_id').notNull(),
  usuarioId: uuid('usuario_id'),
  operationType: text('operation_type').notNull(),
  status: text('status').notNull().default('reserved'),
  model: text('model'),
  modelUsed: text('model_used'),
  fallbackReason: text('fallback_reason'),
  // Fase 3A — token de posse (fencing) do lease de execução de análise
  // documental (migration 0022). Semântica própria: quem detém o lease.
  leaseToken: text('lease_token'),
  creditsReserved: integer('credits_reserved').notNull().default(0),
  creditsSettled: integer('credits_settled').notNull().default(0),
  costCentsReserved: integer('cost_cents_reserved').notNull().default(0),
  costCentsActual: integer('cost_cents_actual').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  maxInputTokens: integer('max_input_tokens'),
  maxOutputTokens: integer('max_output_tokens'),
  error: text('error'),
  // Fase 2E — metadados de classificação (nunca financeiros).
  classification: text('classification'),
  classificationReason: text('classification_reason'),
  warnings: jsonb('warnings'),
  promptVersion: text('prompt_version'),
  parentOperationId: uuid('parent_operation_id').references((): AnyPgColumn => aiOperations.id),
  subOperations: jsonb('sub_operations'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (table) => ({
  escIdx: index('ai_operations_esc_idx').on(table.escritorioId, table.createdAt),
  statusIdx: index('ai_operations_status_idx').on(table.status),
  parentIdx: index('ai_operations_parent_idx').on(table.parentOperationId),
  tenantKeyIdx: uniqueIndex('ai_operations_tenant_key_unique').on(table.escritorioId, table.idempotencyKey),
}));

// Ledger de créditos (append-only): reserva, liquidação, liberação, ajuste.
export const creditLedger = pgTable('credit_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  escritorioId: uuid('escritorio_id').notNull(),
  usuarioId: uuid('usuario_id'),
  operationId: uuid('operation_id'),
  operationType: text('operation_type'),
  kind: text('kind').notNull(),
  creditsDelta: integer('credits_delta').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  model: text('model'),
  idempotencyKey: text('idempotency_key'),
  status: text('status'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  escIdx: index('credit_ledger_esc_idx').on(table.escritorioId, table.createdAt),
  tenantKeyIdx: uniqueIndex('credit_ledger_tenant_key_unique').on(table.escritorioId, table.idempotencyKey),
}));



