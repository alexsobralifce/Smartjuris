import { z } from 'zod';

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
});
export const processosPatchSchema = processosSchema.partial();

// --- Peças ---
export const pecasSchema = z.object({
  processoId: z.string().optional(),
  tipo: z.string().min(1),
  area: z.string().min(1),
  cliente: z.string().min(1),
  status: z.string().min(1),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD'),
  modelo: z.string().min(1),
  fontes: z.number().int(),
  conteudo: z.string().min(1),
});
export const pecasPatchSchema = pecasSchema.partial();

// --- Clientes ---
export const clienteSchema = z.object({
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
});
export const clientePatchSchema = clienteSchema.partial();

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

// --- Coleção de documentos (RAG) ---
export const colecaoSchema = z.object({
  colecao: z.string().default('Jurisprudência'),
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
