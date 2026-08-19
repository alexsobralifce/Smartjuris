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
  prazo: z.string().min(1),
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
  prazo: z.string().min(1),
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
  minutos: z.number(),
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
