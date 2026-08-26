import { z } from 'zod';

function isFutureDate(iso: string): boolean {
  return Date.parse(iso + 'T00:00:00Z') > Date.now();
}

// --- Processos ---
export const processosSchema = z.object({
  tipo: z.string().min(1),
  cliente: z.string().min(1),
  adverso: z.string().min(1),
  vara: z.string().min(1),
  area: z.string().min(1),
  status: z.string().min(1),
  valor: z.string().min(1),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD'),
  advogado: z.string().optional(),
  numero: z.string().optional(),
});
export const processosPatchSchema = processosSchema.partial();

// --- Peças ---
export const pecasSchema = z.object({
  processoId: z.string().optional().nullable(),
  tipo: z.string().min(1),
  area: z.string().min(1),
  cliente: z.string().min(1),
  status: z.string().min(1),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD'),
  modelo: z.string().min(1),
  fontes: z.number().int(),
  conteudo: z.string().min(1),
  conteudoRico: z.any().optional(),
  // Fase 3D — idempotência durável: replay da MESMA chave (mesmo escritório)
  // retorna a peça existente em vez de criar duplicata.
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});
// A chave de idempotência é imutável: PATCH não pode alterá-la (evita "mover"
// uma chave já persistida e quebrar replays futuros).
export const pecasPatchSchema = pecasSchema.omit({ idempotencyKey: true }).partial();

// --- Clientes ---
const dataNascimentoNaoFutura = (d: { dataNascimento?: string | null }) =>
  !d.dataNascimento || !isFutureDate(d.dataNascimento);

const clienteBaseSchema = z.object({
  tipo: z.string().min(1),
  nome: z.string().min(1),
  cpfCnpj: z.string().min(1),
  email: z.string().optional().default(''),
  telefone: z.string().optional().default(''),
  cep: z.string().optional().default(''),
  logradouro: z.string().optional().default(''),
  numero: z.string().optional().default(''),
  complemento: z.string().optional().default(''),
  bairro: z.string().optional().default(''),
  cidade: z.string().optional().default(''),
  uf: z.string().optional().default(''),
  qualificacao: z.string().optional().default(''),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD').optional().nullable(),
});
export const clienteSchema = clienteBaseSchema.refine(dataNascimentoNaoFutura, { message: 'data de nascimento não pode ser futura', path: ['dataNascimento'] });
export const clientePatchSchema = clienteBaseSchema.partial().refine(dataNascimentoNaoFutura, { message: 'data de nascimento não pode ser futura', path: ['dataNascimento'] });

// --- Lançamentos financeiros ---
export const lancamentoSchema = z.object({
  processoId: z.string().optional(),
  cliente: z.string().min(1),
  tipo: z.string().min(1),
  valor: z.string().min(1),
  vencimento: z.string().min(1),
  status: z.string().optional(),
});
export const lancamentoPatchSchema = lancamentoSchema.partial();

// --- Timesheet ---
export const timesheetSchema = z.object({
  processoId: z.string().optional(),
  advogado: z.string().optional(),
  descricao: z.string().min(1),
  minutos: z.number().int().min(0).max(1440),
  valorHora: z.string().optional(),
});

// --- Andamentos ---
export const andamentoSchema = z.object({
  processoId: z.string().min(1),
  tipo: z.string().min(1),
  descricao: z.string().min(1),
  prazoFatal: z.string().nullable().optional(),
});

// --- Agenda / Eventos manuais ---
const eventoBaseSchema = z.object({
  titulo: z.string().min(1, 'obrigatório').max(200, 'máximo 200 caracteres'),
  descricao: z.string().optional(),
  tipo: z.enum(['audiencia', 'reuniao', 'prazo', 'diligencia', 'outro']),
  inicio: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'data de início inválida'),
  fim: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'data de fim inválida').optional(),
  diaInteiro: z.boolean().optional().default(false),
  processoId: z.string().uuid().optional().nullable(),
  clienteId: z.string().uuid().optional().nullable(),
  cor: z.string().optional().nullable(),
});
export const eventoSchema = eventoBaseSchema.refine(
  (d) => !d.fim || Date.parse(d.fim) >= Date.parse(d.inicio),
  { message: 'data de fim deve ser posterior ou igual à data de início', path: ['fim'] },
);
export const eventoPatchSchema = eventoBaseSchema.partial().refine(
  (d) => !d.fim || !d.inicio || Date.parse(d.fim) >= Date.parse(d.inicio),
  { message: 'data de fim deve ser posterior ou igual à data de início', path: ['fim'] },
);

// --- Coleção de documentos (RAG) ---
export const colecaoSchema = z.object({
  colecao: z.string().default('Jurisprudência'),
  // Área do direito da fonte — usada para filtrar a recuperação no RAG.
  area: z.string().optional(),
  // Vínculo opcional a um processo do MESMO escritório (validado na rota).
  processoId: z.string().uuid().optional().nullable(),
  // Fase 8A — vínculo opcional a um cliente do MESMO escritório (validado na rota).
  clienteId: z.string().uuid().optional().nullable(),
});

// --- Root: associação manual de documento sem escopo (quarentena) a um escritório ---
export const documentoEscritorioSchema = z.object({
  escritorioId: z.string().uuid(),
});

export function parseBody<T extends z.ZodType>(schema: T, body: unknown) {
  return schema.safeParse(body);
}

export function formatZodError(err: z.ZodError): string {
  const issues = (err.issues ?? []).map((i) => {
    const path = (i.path?.length ? i.path.join('.') : 'campo');
    // Tradução simples de mensagens comuns do Zod (inglês -> português) quando possível
    const msg = translateZodMessage(i.message);
    return `${path}: ${msg}`;
  });
  return issues.length ? issues.join('; ') : 'Dados inválidos.';
}

function translateZodMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('required')) return 'obrigatório';
  if (m.includes('invalid_type')) return 'tipo inválido';
  if (m.includes('too_small') && /string/.test(m)) return 'muito curto';
  if (m.includes('too_big') && /string/.test(m)) return 'muito longo';
  if (m.includes('too_small') && /number/.test(m)) return 'valor mínimo não atingido';
  if (m.includes('invalid_string') && /uuid/.test(m)) return 'identificador inválido';
  if (m.includes('invalid_string')) return 'formato inválido';
  return msg; // mantém a mensagem original quando não reconhece
}

// --- Geração RAG ---
export const ragGenerateSchema = z.object({
  tipo: z.string().min(1),
  area: z.string().min(1),
  dadosCaso: z.string().min(1),
  // Peça complexa => roteia para o modelo Pro (DeepSeek V4-Pro) em vez do Flash.
  isComplex: z.boolean().optional().default(false),
  // Vínculo com o processo para enriquecer a peça com dados reais das partes.
  processoId: z.string().uuid().optional().nullable(),
});

export const uuidSchema = z.string().uuid();

// --- Multi-tenant: Escritórios (gestão root) ---
export const escritorioCreateSchema = z.object({
  nome: z.string().min(1),
  plano: z.string().min(1).default('basico'),
  limiteUsuarios: z.number().int().min(1).optional(),
  limitePecasMes: z.number().int().min(0).optional(),
  limiteProcessos: z.number().int().min(0).optional(),
  isDemo: z.boolean().optional(),
  limiteTokensMes: z.number().int().min(0).nullable().optional(),
  adminEmail: z.string().email(),
  adminNome: z.string().min(1),
});

export const escritorioPatchSchema = z.object({
  nome: z.string().min(1).optional(),
  plano: z.string().min(1).optional(),
  limiteUsuarios: z.number().int().min(1).optional(),
  limitePecasMes: z.number().int().min(0).optional(),
  limiteProcessos: z.number().int().min(0).optional(),
  isDemo: z.boolean().optional(),
  limiteTokensMes: z.number().int().min(0).nullable().optional(),
  ativo: z.boolean().optional(),
});

// --- Multi-tenant: Usuários do escritório (gestão admin do escritório) ---
export const escritorioUserCreateSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  modulos: z.array(z.string()).default([]),
});

export const escritorioUserPatchSchema = z.object({
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
  ativo: z.boolean().optional(),
  oab: z.string().optional(),
  oabUf: z.string().optional(),
});

export const rootUserCreateSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user'),
});

export const rootUserPatchSchema = z.object({
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
  ativo: z.boolean().optional(),
});

// --- Multi-tenant: Permissões por módulo ---
export const permissoesUpdateSchema = z.object({
  permissoes: z.array(z.object({
    modulo: z.string().min(1),
    ativo: z.boolean(),
  })),
});

// --- Papel timbrado: identidade do escritório (exportação de documentos) ---
export const escritorioIdentitySchema = z.object({
  razaoSocial: z.string().optional(),
  cnpj: z.string().optional(),
  inscricaoOab: z.string().optional(),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  cep: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  site: z.string().optional(),
  logoUrl: z.string().optional(),
});

// --- Cadastro self-service (advogado + escritório) ---
export const registroSchema = z.object({
  nome: z.string().trim().min(2, 'mínimo 2 caracteres').max(120),
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
  senha: z.string().min(8, 'mínimo 8 caracteres').max(72),
  oab: z.string().trim().min(4, 'OAB obrigatória').max(20),
  oabUf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida'),
  escritorioNome: z.string().trim().min(2, 'nome do escritório obrigatório').max(120),
  cnpj: z.string().trim().optional(),
  telefone: z.string().trim().optional(),
});

// --- Código de Verificação OTP de E-mail ---
export const verificarCodigoSchema = z.object({
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
  codigo: z.string().trim().regex(/^\d{6}$/, 'código de 6 dígitos numéricos'),
});

export const reenviarCodigoSchema = z.object({
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
});

// --- Recuperação de senha (esqueci minha senha) ---
export const solicitarResetSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
});

export const redefinirSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
  codigo: z.string().trim().regex(/^\d{6}$/, 'código de 6 dígitos numéricos'),
  novaSenha: z.string().min(8, 'mínimo 8 caracteres').max(72),
  novoEmail: z.string().trim().toLowerCase().email('e-mail inválido').optional(),
});

// --- Créditos (root): adicionar saldo a escritório ou usuário ---
export const creditosAddSchema = z.object({
  quantidade: z.number().int().positive().max(1_000_000_000),
});

// --- Billing (Mercado Pago): escolha do plano de assinatura ---
// Allowlist server-side: preço/produto são resolvidos EXCLUSIVAMENTE no
// backend (services/billing.ts → BILLING_PLANS); o cliente nunca envia
// valores monetários. Aliases aceitos: basico | intermediario | profissional |
// avancado | office | enterprise.
export const checkoutSchema = z.object({
  plano: z.enum([
    'basico',
    'intermediario',
    'profissional',
    'avancado',
    'office',
    'enterprise',
  ]),
});

