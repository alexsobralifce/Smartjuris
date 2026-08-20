import { Router } from 'express';
import { db } from '../db/client.js';
import { processos, andamentos, pecas, lancamentosFinanceiros, clientes, eventos } from '../db/schema.js';
import { and, eq, gte, lt, isNull, sql } from 'drizzle-orm';
import { tenantScope, tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { canMutateTenant } from '../middlewares/ownership.js';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, eventoSchema, eventoPatchSchema, uuidSchema } from '../validation/schemas.js';

const router = Router();

type AgendaItem = {
  id: string;
  titulo: string;
  tipo: 'audiencia' | 'prazo_processo' | 'prazo_peca' | 'financeiro' | 'aniversario' | 'evento';
  inicio: string; // ISO: date-only 'YYYY-MM-DD' for all-day items; full ISO datetime otherwise
  fim?: string; // only manual events with an end time
  diaInteiro: boolean;
  cor: string; // semantic token key: 'primary' | 'warning' | 'peca' | 'success' | 'aniversario' | 'accent'
  processoId?: string;
  clienteId?: string;
  cliente?: string;
  origem: 'processo' | 'andamento' | 'peca' | 'financeiro' | 'cliente' | 'manual';
};

type EventoRow = typeof eventos.$inferSelect;

/**
 * Normaliza um evento manual em um AgendaItem (nunca expõe linhas cruas do banco).
 */
function toAgendaItem(row: EventoRow, clienteNome?: string): AgendaItem {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: 'evento',
    inicio: new Date(row.inicio).toISOString(),
    fim: row.fim ? new Date(row.fim).toISOString() : undefined,
    diaInteiro: row.diaInteiro,
    cor: 'accent',
    processoId: row.processoId ?? undefined,
    clienteId: row.clienteId ?? undefined,
    cliente: clienteNome,
    origem: 'manual',
  };
}

async function resolveClienteNome(clienteId: string | null | undefined): Promise<string | undefined> {
  if (!clienteId) return undefined;
  const [cli] = await db.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  return cli?.nome;
}

/**
 * Tenta extrair uma data no formato YYYY-MM-DD de textos de vencimento.
 * Suporta ISO (AAAA-MM-DD) e BR (DD/MM/AAAA). Retorna null se não reconhecer.
 */
function parseVencimento(text: string): string | null {
  const t = (text ?? '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

// Agregar a agenda do mês (facade sobre processos, andamentos, peças, financeiro, clientes e eventos manuais)
router.get('/', async (req, res) => {
  try {
    const mes = <string>req.query.mes || new Date().toISOString().slice(0, 7); // YYYY-MM em UTC
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'Parâmetro mes inválido. Use AAAA-MM.' });
    }
    const [ano, mesNum] = mes.split('-').map(Number);
    const startDateStr = `${mes}-01`;
    const nextDateStr = mesNum === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesNum + 1).padStart(2, '0')}-01`;
    const startTs = `${startDateStr}T00:00:00.000Z`;
    const endTs = `${nextDateStr}T00:00:00.000Z`;

    // Maps auxiliares para resolver nomes sem N+1
    const processosTenant = await db.select().from(processos).where(tenantScope(req, processos));
    const clientesTenant = await db.select().from(clientes).where(tenantScope(req, clientes));
    const processoCliente = new Map<string, string>();
    for (const p of processosTenant) processoCliente.set(p.id, p.cliente);
    const clienteNome = new Map<string, string>();
    for (const c of clientesTenant) clienteNome.set(c.id, c.nome);

    const items: AgendaItem[] = [];

    // 1. Prazos de processos (coluna prazo é date)
    const processosPrazo = await db.select().from(processos)
      .where(and(tenantScope(req, processos), gte(processos.prazo, startDateStr), lt(processos.prazo, nextDateStr)));
    for (const row of processosPrazo) {
      items.push({
        id: `processo:${row.id}`,
        titulo: row.tipo,
        tipo: 'prazo_processo',
        inicio: row.prazo,
        diaInteiro: true,
        cor: 'warning',
        processoId: row.id,
        cliente: row.cliente,
        origem: 'processo',
      });
    }

    // 2. Andamentos de tipo 'Audiência' (data é timestamptz)
    const andamentosAudi = await db.select().from(andamentos)
      .where(and(tenantScope(req, andamentos), eq(andamentos.tipo, 'Audiência'), gte(andamentos.data, new Date(startTs)), lt(andamentos.data, new Date(endTs))));
    for (const row of andamentosAudi) {
      items.push({
        id: `andamento:${row.id}`,
        titulo: 'Audiência',
        tipo: 'audiencia',
        inicio: new Date(row.data ?? new Date()).toISOString(),
        diaInteiro: false,
        cor: 'primary',
        processoId: row.processoId ?? undefined,
        cliente: row.processoId ? processoCliente.get(row.processoId) : undefined,
        origem: 'andamento',
      });
    }

    // 3. Prazos de peças (coluna prazo é date)
    const pecasPrazo = await db.select().from(pecas)
      .where(and(tenantScope(req, pecas), gte(pecas.prazo, startDateStr), lt(pecas.prazo, nextDateStr)));
    for (const row of pecasPrazo) {
      items.push({
        id: `peca:${row.id}`,
        titulo: row.tipo,
        tipo: 'prazo_peca',
        inicio: row.prazo,
        diaInteiro: true,
        cor: 'peca',
        processoId: row.processoId ?? undefined,
        cliente: row.cliente,
        origem: 'peca',
      });
    }

    // 4. Lançamentos financeiros (vencimento é texto livre; filtra em JS)
    const lancamentos = await db.select().from(lancamentosFinanceiros).where(tenantScope(req, lancamentosFinanceiros));
    for (const row of lancamentos) {
      const parsed = parseVencimento(row.vencimento);
      if (!parsed || parsed.slice(0, 7) !== mes) continue;
      items.push({
        id: `financeiro:${row.id}`,
        titulo: row.tipo,
        tipo: 'financeiro',
        inicio: parsed,
        diaInteiro: true,
        cor: 'success',
        processoId: row.processoId ?? undefined,
        cliente: row.cliente,
        origem: 'financeiro',
      });
    }

    // 5. Aniversários de clientes (mês do nascimento, independente do ano)
    const clientesAniversario = await db.select().from(clientes)
      .where(and(tenantScope(req, clientes), sql`extract(month from ${clientes.dataNascimento}) = ${mesNum}`));
    for (const row of clientesAniversario) {
      const dia = row.dataNascimento ? row.dataNascimento.slice(8, 10) : '01';
      items.push({
        id: `cliente:${row.id}`,
        titulo: 'Aniversário',
        tipo: 'aniversario',
        inicio: `${mes}-${dia}`,
        diaInteiro: true,
        cor: 'aniversario',
        clienteId: row.id,
        cliente: row.nome,
        origem: 'cliente',
      });
    }

    // 6. Eventos manuais (soft-delete excluído)
    const eventosMes = await db.select().from(eventos)
      .where(and(tenantScope(req, eventos), isNull(eventos.deletedAt), gte(eventos.inicio, new Date(startTs)), lt(eventos.inicio, new Date(endTs))));
    for (const row of eventosMes) {
      items.push(toAgendaItem(row, row.clienteId ? clienteNome.get(row.clienteId) : undefined));
    }

    items.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
    res.json(items);
  } catch (error) {
    console.error('Error fetching agenda:', error);
    res.status(500).json({ error: 'Erro ao buscar agenda.' });
  }
});

// Criar evento manual
router.post('/eventos', async (req, res) => {
  try {
    const escritorioId = tenantScopeEscritorioId(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(eventoSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const [inserted] = await db.insert(eventos).values({
      titulo: data.titulo,
      descricao: data.descricao ?? null,
      tipo: data.tipo,
      inicio: new Date(data.inicio),
      fim: data.fim ? new Date(data.fim) : null,
      diaInteiro: data.diaInteiro,
      processoId: data.processoId ?? null,
      clienteId: data.clienteId ?? null,
      cor: data.cor ?? null,
      usuarioId: (req as any).user?.id ?? null,
      escritorioId,
    }).returning();

    await recordAudit(req, 'CREATE_EVENTO', { alvoId: inserted.id, detalhes: parsed.data });
    res.status(201).json(toAgendaItem(inserted, await resolveClienteNome(inserted.clienteId)));
  } catch (error) {
    console.error('Error creating evento:', error);
    res.status(500).json({ error: 'Erro ao criar evento.' });
  }
});

// Atualizar evento manual (PUT completo)
router.put('/eventos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(eventos).where(eq(eventos.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const parsed = parseBody(eventoPatchSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const updateData: {
      titulo?: string;
      descricao?: string | null;
      tipo?: string;
      inicio?: Date;
      fim?: Date | null;
      diaInteiro?: boolean;
      processoId?: string | null;
      clienteId?: string | null;
      cor?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (data.titulo !== undefined) updateData.titulo = data.titulo;
    if (data.descricao !== undefined) updateData.descricao = data.descricao;
    if (data.tipo !== undefined) updateData.tipo = data.tipo;
    if (data.inicio !== undefined) updateData.inicio = new Date(data.inicio);
    if (data.fim !== undefined) updateData.fim = data.fim ? new Date(data.fim) : null;
    if (data.diaInteiro !== undefined) updateData.diaInteiro = data.diaInteiro;
    if (data.processoId !== undefined) updateData.processoId = data.processoId ?? null;
    if (data.clienteId !== undefined) updateData.clienteId = data.clienteId ?? null;
    if (data.cor !== undefined) updateData.cor = data.cor ?? null;

    const [updated] = await db.update(eventos).set(updateData).where(eq(eventos.id, id)).returning();
    await recordAudit(req, 'UPDATE_EVENTO', { alvoId: id, detalhes: parsed.data });
    res.json(toAgendaItem(updated, await resolveClienteNome(updated.clienteId)));
  } catch (error) {
    console.error('Error updating evento:', error);
    res.status(500).json({ error: 'Erro ao atualizar evento.' });
  }
});

// Soft delete de evento manual
router.delete('/eventos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(eventos).where(eq(eventos.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    await db.update(eventos)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(eventos.id, id));
    await recordAudit(req, 'DELETE_EVENTO', { alvoId: id, detalhes: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting evento:', error);
    res.status(500).json({ error: 'Erro ao excluir evento.' });
  }
});

export default router;
