import { Router } from 'express';
import { db } from '../db/client.js';
import { sql, eq, asc } from 'drizzle-orm';
import { escritorios, usuarios } from '../db/schema.js';
import { requireRoot } from '../middlewares/roleGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { parseBody, formatZodError, creditosAddSchema, uuidSchema } from '../validation/schemas.js';

const router = Router();

// Gestão de créditos: apenas root.
router.use(requireRoot);

const num = (v: unknown): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// GET /creditos — saldo e consumo de créditos de todos os escritórios.
// Escritórios demo incluem a lista de usuários com consumo individual.
// 1 crédito = 1 token; consumo é mensal (zera no início de cada mês).
// ---------------------------------------------------------------------------
router.get('/creditos', async (_req, res) => {
  try {
    const escRows = await db.select().from(escritorios).orderBy(asc(escritorios.nome));

    // Consumo mensal agregado por escritório (uma única query — sem N+1).
    const porEsc = (await db.execute(sql`
      SELECT u.escritorio_id, COALESCE(SUM(t.total_tokens), 0) AS total
      FROM token_usage t
      JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.created_at >= date_trunc('month', now())
      GROUP BY u.escritorio_id
    `)) as any[];
    const consumoEsc = new Map<string, number>(porEsc.map((r) => [r.escritorio_id, num(r.total)]));

    // Consumo mensal por usuário (uma única query).
    const porUser = (await db.execute(sql`
      SELECT usuario_id, COALESCE(SUM(total_tokens), 0) AS total
      FROM token_usage
      WHERE created_at >= date_trunc('month', now())
      GROUP BY usuario_id
    `)) as any[];
    const consumoUser = new Map<string, number>(porUser.map((r) => [r.usuario_id, num(r.total)]));

    const resultado = [];
    for (const esc of escRows) {
      const consumidos = consumoEsc.get(esc.id) ?? 0;
      const disponiveis = esc.limiteTokensMes != null ? Number(esc.limiteTokensMes) : null;
      const restantes = disponiveis != null ? Math.max(0, disponiveis - consumidos) : null;

      let usuariosList: any[] = [];
      if (esc.isDemo) {
        const users = await db
          .select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            creditosMes: usuarios.creditosMes,
          })
          .from(usuarios)
          .where(eq(usuarios.escritorioId, esc.id))
          .orderBy(asc(usuarios.nome));

        usuariosList = users.map((u) => {
          const consumido = consumoUser.get(u.id) ?? 0;
          const limiteU = u.creditosMes != null ? Number(u.creditosMes) : disponiveis;
          return {
            id: u.id,
            nome: u.nome,
            email: u.email,
            creditosDisponiveis: u.creditosMes != null ? Number(u.creditosMes) : null,
            consumidosMes: consumido,
            restantes: limiteU != null ? Math.max(0, limiteU - consumido) : null,
          };
        });
      }

      resultado.push({
        id: esc.id,
        nome: esc.nome,
        plano: esc.plano,
        isDemo: esc.isDemo,
        creditosDisponiveis: disponiveis,
        consumidosMes: consumidos,
        restantes,
        usuarios: usuariosList,
      });
    }

    res.json(resultado);
  } catch (error) {
    console.error('Error listing creditos:', error);
    res.status(500).json({ error: 'Erro ao listar créditos.' });
  }
});

// ---------------------------------------------------------------------------
// POST /escritorios/:id/creditos — adiciona créditos mensais ao escritório.
// Incremento atômico (COALESCE null → 0 + quantidade), com auditoria.
// ---------------------------------------------------------------------------
router.post('/escritorios/:id/creditos', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const parsed = parseBody(creditosAddSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { quantidade } = parsed.data;

    const [existente] = await db.select({ id: escritorios.id, nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    // Incremento atômico: evita corrida read-modify-write em recargas simultâneas.
    const rows = (await db.execute(sql`
      UPDATE escritorios
      SET limite_tokens_mes = COALESCE(limite_tokens_mes, 0) + ${quantidade}
      WHERE id = ${id}
      RETURNING limite_tokens_mes
    `)) as any[];

    const novoSaldo = num(rows[0]?.limite_tokens_mes);
    await recordAudit(req, 'ADD_CREDITOS_ESCRITORIO', {
      alvoId: id,
      detalhes: { quantidade, novoSaldo },
    });

    res.json({ ok: true, escritorioId: id, creditosDisponiveis: novoSaldo, adicionados: quantidade });
  } catch (error) {
    console.error('Error adding escritorio credits:', error);
    res.status(500).json({ error: 'Erro ao adicionar créditos ao escritório.' });
  }
});

// ---------------------------------------------------------------------------
// POST /usuarios/:id/creditos — adiciona créditos mensais a um usuário demo.
// Apenas usuários de escritórios demo têm saldo individual.
// ---------------------------------------------------------------------------
router.post('/usuarios/:id/creditos', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const parsed = parseBody(creditosAddSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { quantidade } = parsed.data;

    const [target] = await db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        escritorioId: usuarios.escritorioId,
        isDemo: escritorios.isDemo,
      })
      .from(usuarios)
      .innerJoin(escritorios, eq(escritorios.id, usuarios.escritorioId))
      .where(eq(usuarios.id, id))
      .limit(1);

    if (!target) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (!target.isDemo) {
      return res.status(403).json({ error: 'Créditos individuais são aplicáveis apenas a usuários de escritórios demo.' });
    }

    const rows = (await db.execute(sql`
      UPDATE usuarios
      SET creditos_mes = COALESCE(creditos_mes, 0) + ${quantidade}
      WHERE id = ${id}
      RETURNING creditos_mes
    `)) as any[];

    const novoSaldo = num(rows[0]?.creditos_mes);
    await recordAudit(req, 'ADD_CREDITOS_USUARIO', {
      alvoId: id,
      alvoEmail: target.email,
      detalhes: { quantidade, novoSaldo },
    });

    res.json({ ok: true, usuarioId: id, creditosDisponiveis: novoSaldo, adicionados: quantidade });
  } catch (error) {
    console.error('Error adding user credits:', error);
    res.status(500).json({ error: 'Erro ao adicionar créditos ao usuário.' });
  }
});

export default router;
