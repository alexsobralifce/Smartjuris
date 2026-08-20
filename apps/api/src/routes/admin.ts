import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  usuarios,
  tokenUsage,
  pecas,
  documentosGerados,
  andamentos,
  logins,
  auditLog,
} from '../db/schema.js';
import { eq, and, ne, gte, lte, desc, asc, count, sum } from 'drizzle-orm';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { parseBody, formatZodError } from '../validation/schemas.js';

const router = Router();

// --- Schemas de validação de usuários ---
const createUserSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(8),
  role: z.enum(['admin', 'user', 'root']),
});

const updateUserSchema = z.object({
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user', 'root']).optional(),
  senha: z.string().min(8).optional(),
  ativo: z.boolean().optional(),
});

const dateFilter = (col: any, from?: string, to?: string) => {
  const conds: any[] = [];
  if (from) {
    const fromTime = new Date(from).getTime();
    if (Number.isNaN(fromTime)) return undefined; // data inválida: ignora o filtro
    conds.push(gte(col, new Date(fromTime)));
  }
  if (to) {
    const toTime = new Date(to).getTime();
    if (Number.isNaN(toTime)) return undefined; // data inválida: ignora o filtro
    conds.push(lte(col, new Date(toTime)));
  }
  return conds.length ? and(...conds) : undefined;
};

const toDayKey = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysInPeriod = (from?: string, to?: string): number => {
  if (!from || !to) return 30;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 30;
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
};

const selectInPeriod = (table: any, dateCol: any, from?: string, to?: string) => {
  const df = dateFilter(dateCol, from, to);
  return df ? db.select().from(table).where(df) : db.select().from(table);
};

const userDateWhere = (userCol: any, dateCol: any, userId: string, from?: string, to?: string) => {
  const conds: any[] = [eq(userCol, userId)];
  const df = dateFilter(dateCol, from, to);
  if (df) conds.push(df);
  return and(...conds);
};

const sanitizeUser = (u: any) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  role: u.role,
  ativo: u.ativo,
  createdAt: u.createdAt,
  ultimoLogin: u.ultimoLogin,
});

const emptyAgg = {
  totalTokens: 0,
  custoBrl: 0,
  custoUsd: 0,
  pecasCount: 0,
  documentosCount: 0,
  loginsCount: 0,
};

const buildAggregateMap = async () => {
  const [tokenRows, pecasRows, docsRows, loginRows] = await Promise.all([
    db.select().from(tokenUsage),
    db.select({ usuarioId: pecas.usuarioId }).from(pecas),
    db.select({ usuarioId: documentosGerados.usuarioId }).from(documentosGerados),
    db.select({ usuarioId: logins.usuarioId }).from(logins),
  ]);

  const map = new Map<string, typeof emptyAgg>();
  const ensure = (id: string | null | undefined) => {
    if (!id) return null;
    if (!map.has(id)) map.set(id, { ...emptyAgg });
    return map.get(id)!;
  };

  for (const r of tokenRows) {
    const agg = ensure(r.usuarioId);
    if (!agg) continue;
    agg.totalTokens += r.totalTokens ?? 0;
    agg.custoBrl += Number(r.custoBrl ?? 0);
    agg.custoUsd += Number(r.custoUsd ?? 0);
  }
  for (const r of pecasRows) { const agg = ensure(r.usuarioId); if (agg) agg.pecasCount += 1; }
  for (const r of docsRows) { const agg = ensure(r.usuarioId); if (agg) agg.documentosCount += 1; }
  for (const r of loginRows) { const agg = ensure(r.usuarioId); if (agg) agg.loginsCount += 1; }

  return map;
};

const withAgg = (u: any, agg: any) => ({
  ...sanitizeUser(u),
  totalTokens: agg?.totalTokens ?? 0,
  custoBrl: agg?.custoBrl ?? 0,
  custoUsd: agg?.custoUsd ?? 0,
  pecasCount: agg?.pecasCount ?? 0,
  documentosCount: agg?.documentosCount ?? 0,
  loginsCount: agg?.loginsCount ?? 0,
});

// ---------------------------------------------------------------------------
// Endpoint 1: GET /users — lista todos os usuários com estatísticas agregadas
// ---------------------------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const [users, aggMap] = await Promise.all([
      db.select().from(usuarios).orderBy(asc(usuarios.createdAt)),
      buildAggregateMap(),
    ]);
    res.json(users.map((u) => withAgg(u, aggMap.get(u.id))));
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 2: GET /users/:id — detalhe de um usuário com estatísticas
// ---------------------------------------------------------------------------
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [user] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const aggMap = await buildAggregateMap();
    res.json(withAgg(user, aggMap.get(user.id)));
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 3: POST /users — cria um novo usuário
// ---------------------------------------------------------------------------
router.post('/users', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = parseBody(createUserSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { nome, email, senha, role } = parsed.data;

    const [existing] = await db.select({ id: usuarios.id }).from(usuarios)
      .where(eq(usuarios.email, email)).limit(1);
    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const [created] = await db.insert(usuarios).values({
      nome,
      email,
      senha: senhaHash,
      role,
      ativo: true,
      createdBy: req.user?.id ?? null,
    }).returning();

    await db.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      acao: 'CREATE_USER',
      alvoId: created.id,
      alvoEmail: email,
      ipAddress: req.ip || null,
    });

    res.status(201).json(sanitizeUser(created));
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 4: PATCH /users/:id — atualiza campos do usuário
// ---------------------------------------------------------------------------
router.patch('/users/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const [target] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const parsed = parseBody(updateUserSchema, body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { nome, email, role, ativo } = parsed.data;

    // Guard: não é permitido rebaixar/desativar a própria conta root
    if (id === req.user?.id && ((role && role !== 'root') || ativo === false)) {
      return res.status(403).json({ error: 'Não é permitido rebaixar/desativar a própria conta root.' });
    }

    // Guard: último root ativo não pode ser rebaixado
    if (target.role === 'root' && role && role !== 'root') {
      const [roots] = await db.select({ total: count() }).from(usuarios)
        .where(and(eq(usuarios.role, 'root'), eq(usuarios.ativo, true)));
      if (Number(roots?.total ?? 0) <= 1) {
        return res.status(403).json({ error: 'Não é permitido remover o último root ativo.' });
      }
    }

    // Email duplicado em outro usuário
    if (email !== undefined) {
      const [duplicate] = await db.select({ id: usuarios.id }).from(usuarios)
        .where(and(eq(usuarios.email, email), ne(usuarios.id, id))).limit(1);
      if (duplicate) {
        return res.status(409).json({ error: 'Email já cadastrado para outro usuário.' });
      }
    }

    const updates: Record<string, any> = {};
    if (nome !== undefined) updates.nome = nome;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (ativo !== undefined) updates.ativo = ativo; // boolean real (nunca "false" como string)

    let updated = target;
    if (Object.keys(updates).length > 0) {
      const [row] = await db.update(usuarios).set(updates).where(eq(usuarios.id, id)).returning();
      updated = row;
    }

    await db.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      acao: 'UPDATE_USER',
      alvoId: id,
      alvoEmail: target.email,
      detalhes: body,
      ipAddress: req.ip || null,
    });

    res.json(sanitizeUser(updated));
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 5: DELETE /users/:id — soft delete (desativa)
// ---------------------------------------------------------------------------
router.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const [target] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (id === req.user?.id) {
      return res.status(403).json({ error: 'Não é permitido rebaixar/desativar a própria conta root.' });
    }

    if (target.role === 'root' && target.ativo) {
      const [roots] = await db.select({ total: count() }).from(usuarios)
        .where(and(eq(usuarios.role, 'root'), eq(usuarios.ativo, true)));
      if (Number(roots?.total ?? 0) <= 1) {
        return res.status(403).json({ error: 'Não é permitido remover o último root ativo.' });
      }
    }

    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, id));
    await db.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      acao: 'DELETE_USER',
      alvoId: id,
      alvoEmail: target.email,
      ipAddress: req.ip || null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 6: POST /users/:id/reset-password — redefine a senha do usuário
// ---------------------------------------------------------------------------
router.post('/users/:id/reset-password', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { senha } = req.body || {};
    if (!senha || String(senha).length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
    }

    const [target] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const senhaHash = await bcrypt.hash(String(senha), 10);
    await db.update(usuarios).set({ senha: senhaHash }).where(eq(usuarios.id, id));
    await db.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      acao: 'RESET_PASSWORD',
      alvoId: id,
      alvoEmail: target.email,
      ipAddress: req.ip || null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 7: GET /users/:id/stats?from=&to= — estatísticas de um usuário
// ---------------------------------------------------------------------------
router.get('/users/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query as { from?: string; to?: string };

    const [user] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const [tokensAgg, pecasAgg, docsAgg, andamentosAgg, loginsAgg, tokenRows, loginRows, docRows] =
      await Promise.all([
        db.select({
          total: sum(tokenUsage.totalTokens),
          usd: sum(tokenUsage.custoUsd),
          brl: sum(tokenUsage.custoBrl),
        }).from(tokenUsage).where(userDateWhere(tokenUsage.usuarioId, tokenUsage.createdAt, id, from, to)),
        db.select({ total: count() }).from(pecas)
          .where(userDateWhere(pecas.usuarioId, pecas.geradoEm, id, from, to)),
        db.select({ total: count() }).from(documentosGerados)
          .where(userDateWhere(documentosGerados.usuarioId, documentosGerados.createdAt, id, from, to)),
        db.select({ total: count() }).from(andamentos)
          .where(userDateWhere(andamentos.usuarioId, andamentos.data, id, from, to)),
        db.select({ total: count() }).from(logins)
          .where(userDateWhere(logins.usuarioId, logins.createdAt, id, from, to)),
        db.select({ createdAt: tokenUsage.createdAt }).from(tokenUsage)
          .where(userDateWhere(tokenUsage.usuarioId, tokenUsage.createdAt, id, from, to)),
        db.select({ createdAt: logins.createdAt }).from(logins)
          .where(userDateWhere(logins.usuarioId, logins.createdAt, id, from, to)),
        db.select({ createdAt: documentosGerados.createdAt }).from(documentosGerados)
          .where(userDateWhere(documentosGerados.usuarioId, documentosGerados.createdAt, id, from, to)),
      ]);

    const days = new Set<string>();
    for (const r of [...tokenRows, ...loginRows, ...docRows]) {
      const key = toDayKey(r.createdAt);
      if (key) days.add(key);
    }

    res.json({
      totalTokens: Number(tokensAgg[0]?.total ?? 0),
      custoUsd: Number(tokensAgg[0]?.usd ?? 0),
      custoBrl: Number(tokensAgg[0]?.brl ?? 0),
      pecasCount: Number(pecasAgg[0]?.total ?? 0),
      documentosCount: Number(docsAgg[0]?.total ?? 0),
      andamentosCount: Number(andamentosAgg[0]?.total ?? 0),
      loginsCount: Number(loginsAgg[0]?.total ?? 0),
      diasAtivos: days.size,
      ultimoLogin: user.ultimoLogin,
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas do usuário.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 8: GET /stats/global?from=&to= — KPIs globais
// ---------------------------------------------------------------------------
router.get('/stats/global', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    const [users, tokenRows, pecasRows, docsRows, loginRows] = await Promise.all([
      db.select().from(usuarios),
      selectInPeriod(tokenUsage, tokenUsage.createdAt, from, to),
      selectInPeriod(pecas, pecas.geradoEm, from, to),
      selectInPeriod(documentosGerados, documentosGerados.createdAt, from, to),
      selectInPeriod(logins, logins.createdAt, from, to),
    ]);

    let tokensPeriodo = 0;
    let custoUsdPeriodo = 0;
    let custoBrlPeriodo = 0;
    const tokensPorDiaMap = new Map<string, { dia: string; tokens: number; custoBrl: number }>();
    const byUserMap = new Map<string, { tokens: number; custoBrl: number }>();

    for (const r of tokenRows) {
      const tokens = r.totalTokens ?? 0;
      const brl = Number(r.custoBrl ?? 0);
      const usd = Number(r.custoUsd ?? 0);
      tokensPeriodo += tokens;
      custoUsdPeriodo += usd;
      custoBrlPeriodo += brl;

      const key = toDayKey(r.createdAt);
      if (key) {
        const e = tokensPorDiaMap.get(key) ?? { dia: key, tokens: 0, custoBrl: 0 };
        e.tokens += tokens;
        e.custoBrl += brl;
        tokensPorDiaMap.set(key, e);
      }

      if (r.usuarioId) {
        const e = byUserMap.get(r.usuarioId) ?? { tokens: 0, custoBrl: 0 };
        e.tokens += tokens;
        e.custoBrl += brl;
        byUserMap.set(r.usuarioId, e);
      }
    }

    const tokensPorDia = [...tokensPorDiaMap.values()].sort((a, b) => a.dia.localeCompare(b.dia));

    const userById = new Map(users.map((u) => [u.id, u]));
    const topUsuarios = [...byUserMap.entries()]
      .map(([uid, agg]) => {
        const u = userById.get(uid);
        return {
          nome: u?.nome ?? 'Usuário removido',
          email: u?.email ?? uid,
          tokens: agg.tokens,
          custoBrl: agg.custoBrl,
        };
      })
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    const roleMap = new Map<string, number>();
    for (const u of users) roleMap.set(u.role, (roleMap.get(u.role) ?? 0) + 1);
    const distribuicaoRole = [...roleMap.entries()].map(([role, total]) => ({ role, total }));

    res.json({
      usuariosTotal: users.length,
      usuariosAtivos: users.filter((u) => u.ativo).length,
      usuariosAdmin: users.filter((u) => u.role === 'admin').length,
      usuariosRoot: users.filter((u) => u.role === 'root').length,
      usuariosComuns: users.filter((u) => u.role === 'user').length,
      tokensPeriodo,
      custoUsdPeriodo,
      custoBrlPeriodo,
      pecasPeriodo: pecasRows.length,
      documentosPeriodo: docsRows.length,
      loginsPeriodo: loginRows.length,
      loginsSucesso: loginRows.filter((l) => l.sucesso).length,
      loginsFalha: loginRows.filter((l) => !l.sucesso).length,
      tokensPorDia,
      topUsuarios,
      distribuicaoRole,
    });
  } catch (error) {
    console.error('Error fetching global stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas globais.' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 9: GET /stats/financial?from=&to= — estatísticas financeiras
// ---------------------------------------------------------------------------
router.get('/stats/financial', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const days = daysInPeriod(from, to);

    const [tokenRows, pecasRows, users] = await Promise.all([
      selectInPeriod(tokenUsage, tokenUsage.createdAt, from, to),
      selectInPeriod(pecas, pecas.geradoEm, from, to),
      db.select().from(usuarios),
    ]);

    let custoTotalUsd = 0;
    let custoTotalBrl = 0;
    const custoPorDiaMap = new Map<string, { dia: string; usd: number; brl: number }>();
    const custoPorOperacaoMap = new Map<string, { operacao: string; usd: number; brl: number; tokens: number }>();
    const rankingMap = new Map<string, { usd: number; brl: number; tokens: number }>();

    for (const r of tokenRows) {
      const usd = Number(r.custoUsd ?? 0);
      const brl = Number(r.custoBrl ?? 0);
      const tokens = r.totalTokens ?? 0;
      custoTotalUsd += usd;
      custoTotalBrl += brl;

      const key = toDayKey(r.createdAt);
      if (key) {
        const e = custoPorDiaMap.get(key) ?? { dia: key, usd: 0, brl: 0 };
        e.usd += usd;
        e.brl += brl;
        custoPorDiaMap.set(key, e);
      }

      const op = r.operacao ?? 'outros';
      const oe = custoPorOperacaoMap.get(op) ?? { operacao: op, usd: 0, brl: 0, tokens: 0 };
      oe.usd += usd;
      oe.brl += brl;
      oe.tokens += tokens;
      custoPorOperacaoMap.set(op, oe);

      if (r.usuarioId) {
        const re = rankingMap.get(r.usuarioId) ?? { usd: 0, brl: 0, tokens: 0 };
        re.usd += usd;
        re.brl += brl;
        re.tokens += tokens;
        rankingMap.set(r.usuarioId, re);
      }
    }

    const custoPorDia = [...custoPorDiaMap.values()].sort((a, b) => a.dia.localeCompare(b.dia));
    const custoPorOperacao = [...custoPorOperacaoMap.values()].sort((a, b) => b.brl - a.brl);

    const usuariosAtivos = users.filter((u) => u.ativo).length;
    const pecasPeriodo = pecasRows.length;

    const rankingUsuarios = users
      .map((u) => {
        const agg = rankingMap.get(u.id);
        return {
          nome: u.nome,
          email: u.email,
          usd: agg?.usd ?? 0,
          brl: agg?.brl ?? 0,
          tokens: agg?.tokens ?? 0,
        };
      })
      .sort((a, b) => b.brl - a.brl);

    res.json({
      custoTotalUsd,
      custoTotalBrl,
      projecaoMensalBrl: (custoTotalBrl / days) * 30,
      projecaoMensalUsd: (custoTotalUsd / days) * 30,
      custoMedioPorPeca: pecasPeriodo > 0 ? custoTotalBrl / pecasPeriodo : 0,
      custoMedioPorUsuario: usuariosAtivos > 0 ? custoTotalBrl / usuariosAtivos : 0,
      custoPorDia,
      custoPorOperacao,
      rankingUsuarios,
    });
  } catch (error) {
    console.error('Error fetching financial stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas financeiras.' });
  }
});

// ---------------------------------------------------------------------------
// Os endpoints de logs (/logs/logins, /logs/tokens, /logs/audit) foram migrados
// para routes/rootStats.ts com escopo agregado por escritório (Fase 3).
// ---------------------------------------------------------------------------

export default router;
