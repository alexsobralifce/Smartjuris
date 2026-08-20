import { Router } from 'express';
import { sql, SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireRoot } from '../middlewares/roleGuard.js';

const router = Router();

// Métricas de plataforma: apenas root. Dados agregados POR ESCRITÓRIO (nunca listar negócio).
router.use(requireRoot);

const buildWhere = (conds: SQL[]): SQL =>
  conds.length ? sql` WHERE ${sql.join(conds, sql` AND `)}` : sql``;

const validateDateRange = (from?: string, to?: string): string | null => {
  if (from && Number.isNaN(new Date(from).getTime())) return 'Parâmetro "from" com data inválida.';
  if (to && Number.isNaN(new Date(to).getTime())) return 'Parâmetro "to" com data inválida.';
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) return 'Intervalo de datas inválido.';
  return null;
};

const num = (v: any): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// GET /stats/global — KPIs agregados por escritório
// ---------------------------------------------------------------------------
router.get('/stats/global', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const invalid = validateDateRange(from, to);
    if (invalid) return res.status(400).json({ error: invalid });

    const [escRows, tokenRows] = await Promise.all([
      db.execute(sql`
        SELECT e.id, e.nome, e.plano, e.limite_usuarios,
          COUNT(DISTINCT u.id) AS usuarios_ativos,
          COUNT(DISTINCT p.id) AS processos_count
        FROM escritorios e
        LEFT JOIN usuarios u ON u.escritorio_id = e.id AND u.ativo = true
        LEFT JOIN processos p ON p.escritorio_id = e.id
        GROUP BY e.id, e.nome, e.plano, e.limite_usuarios
        ORDER BY e.created_at DESC
      `),
      db.execute(sql`
        SELECT u.escritorio_id,
          COUNT(*) AS registros,
          COALESCE(SUM(t.total_tokens), 0) AS tokens_total,
          COALESCE(SUM(t.custo_brl::numeric), 0) AS custo_brl,
          COALESCE(SUM(t.custo_usd::numeric), 0) AS custo_usd
        FROM token_usage t
        JOIN usuarios u ON u.id = t.usuario_id
        ${buildWhere([
          ...(from ? [sql`t.created_at >= ${new Date(from)}`] : []),
          ...(to ? [sql`t.created_at <= ${new Date(to)}`] : []),
        ])}
        GROUP BY u.escritorio_id
      `),
    ]);

    const tokenMap = new Map<string, any>();
    for (const r of tokenRows as any[]) {
      tokenMap.set(r.escritorio_id, {
        registros: num(r.registros),
        tokensTotal: num(r.tokens_total),
        custoBrl: num(r.custo_brl),
        custoUsd: num(r.custo_usd),
      });
    }

    const escritorios = (escRows as any[]).map((r) => {
      const tk = tokenMap.get(r.id);
      return {
        id: r.id,
        nome: r.nome,
        plano: r.plano,
        limiteUsuarios: num(r.limite_usuarios),
        usuariosAtivos: num(r.usuarios_ativos),
        processosCount: num(r.processos_count),
        tokens: tk ?? { registros: 0, tokensTotal: 0, custoBrl: 0, custoUsd: 0 },
      };
    });

    res.json({
      period: { from: from ?? null, to: to ?? null },
      totalEscritorios: escritorios.length,
      totalUsuariosAtivos: escritorios.reduce((s, e) => s + e.usuariosAtivos, 0),
      totalProcessos: escritorios.reduce((s, e) => s + e.processosCount, 0),
      totalTokens: escritorios.reduce((s, e) => s + e.tokens.tokensTotal, 0),
      totalCustoBrl: escritorios.reduce((s, e) => s + e.tokens.custoBrl, 0),
      totalCustoUsd: escritorios.reduce((s, e) => s + e.tokens.custoUsd, 0),
      escritorios,
    });
  } catch (error) {
    console.error('Error fetching per-escritorio stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
  }
});

// ---------------------------------------------------------------------------
// GET /stats/financial — tokens/custos agrupados por escritório
// ---------------------------------------------------------------------------
router.get('/stats/financial', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const invalid = validateDateRange(from, to);
    if (invalid) return res.status(400).json({ error: invalid });

    const rows = (await db.execute(sql`
      SELECT u.escritorio_id, e.nome AS escritorio_nome,
        COUNT(*) AS registros,
        COALESCE(SUM(t.prompt_tokens), 0) AS prompt_tokens,
        COALESCE(SUM(t.completion_tokens), 0) AS completion_tokens,
        COALESCE(SUM(t.total_tokens), 0) AS tokens_total,
        COALESCE(SUM(t.custo_brl::numeric), 0) AS custo_brl,
        COALESCE(SUM(t.custo_usd::numeric), 0) AS custo_usd
      FROM token_usage t
      JOIN usuarios u ON u.id = t.usuario_id
      LEFT JOIN escritorios e ON e.id = u.escritorio_id
      ${buildWhere([
        ...(from ? [sql`t.created_at >= ${new Date(from)}`] : []),
        ...(to ? [sql`t.created_at <= ${new Date(to)}`] : []),
      ])}
      GROUP BY u.escritorio_id, e.nome
      ORDER BY custo_brl DESC
    `)) as any[];

    const escritorios = rows.map((r) => ({
      escritorioId: r.escritorio_id,
      escritorioNome: r.escritorio_nome ?? 'Sem escritório',
      registros: num(r.registros),
      promptTokens: num(r.prompt_tokens),
      completionTokens: num(r.completion_tokens),
      tokensTotal: num(r.tokens_total),
      custoBrl: num(r.custo_brl),
      custoUsd: num(r.custo_usd),
    }));

    res.json({
      period: { from: from ?? null, to: to ?? null },
      totalTokens: escritorios.reduce((s, e) => s + e.tokensTotal, 0),
      totalCustoBrl: escritorios.reduce((s, e) => s + e.custoBrl, 0),
      totalCustoUsd: escritorios.reduce((s, e) => s + e.custoUsd, 0),
      escritorios,
    });
  } catch (error) {
    console.error('Error fetching per-escritorio financial stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas financeiras.' });
  }
});

// ---------------------------------------------------------------------------
// GET /logs/logins — logins agregados por usuário/escritório
// ---------------------------------------------------------------------------
router.get('/logs/logins', async (req, res) => {
  try {
    const { from, to, sucesso } = req.query as { from?: string; to?: string; sucesso?: string };
    const invalid = validateDateRange(from, to);
    if (invalid) return res.status(400).json({ error: invalid });

    const rows = (await db.execute(sql`
      SELECT u.escritorio_id, e.nome AS escritorio_nome,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE l.sucesso = true) AS sucesso,
        COUNT(*) FILTER (WHERE l.sucesso = false) AS falha
      FROM logins l
      LEFT JOIN usuarios u ON u.id = l.usuario_id
      LEFT JOIN escritorios e ON e.id = u.escritorio_id
      ${buildWhere([
        ...(from ? [sql`l.created_at >= ${new Date(from)}`] : []),
        ...(to ? [sql`l.created_at <= ${new Date(to)}`] : []),
        ...(sucesso === 'true' ? [sql`l.sucesso = true`] : []),
        ...(sucesso === 'false' ? [sql`l.sucesso = false`] : []),
      ])}
      GROUP BY u.escritorio_id, e.nome
      ORDER BY total DESC
    `)) as any[];

    const escritorios = rows.map((r) => ({
      escritorioId: r.escritorio_id,
      escritorioNome: r.escritorio_nome ?? 'Sem escritório',
      total: num(r.total),
      sucesso: num(r.sucesso),
      falha: num(r.falha),
    }));

    res.json({
      period: { from: from ?? null, to: to ?? null },
      total: escritorios.reduce((s, e) => s + e.total, 0),
      escritorios,
    });
  } catch (error) {
    console.error('Error fetching per-escritorio login logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs de login.' });
  }
});

// ---------------------------------------------------------------------------
// GET /logs/tokens — token_usage agregado por escritório
// ---------------------------------------------------------------------------
router.get('/logs/tokens', async (req, res) => {
  try {
    const { from, to, modelo } = req.query as { from?: string; to?: string; modelo?: string };
    const invalid = validateDateRange(from, to);
    if (invalid) return res.status(400).json({ error: invalid });

    const rows = (await db.execute(sql`
      SELECT u.escritorio_id, e.nome AS escritorio_nome,
        COUNT(*) AS registros,
        COALESCE(SUM(t.prompt_tokens), 0) AS prompt_tokens,
        COALESCE(SUM(t.completion_tokens), 0) AS completion_tokens,
        COALESCE(SUM(t.total_tokens), 0) AS tokens_total,
        COALESCE(SUM(t.custo_brl::numeric), 0) AS custo_brl,
        COALESCE(SUM(t.custo_usd::numeric), 0) AS custo_usd
      FROM token_usage t
      JOIN usuarios u ON u.id = t.usuario_id
      LEFT JOIN escritorios e ON e.id = u.escritorio_id
      ${buildWhere([
        ...(from ? [sql`t.created_at >= ${new Date(from)}`] : []),
        ...(to ? [sql`t.created_at <= ${new Date(to)}`] : []),
        ...(modelo ? [sql`t.modelo = ${modelo}`] : []),
      ])}
      GROUP BY u.escritorio_id, e.nome
      ORDER BY tokens_total DESC
    `)) as any[];

    const escritorios = rows.map((r) => ({
      escritorioId: r.escritorio_id,
      escritorioNome: r.escritorio_nome ?? 'Sem escritório',
      registros: num(r.registros),
      promptTokens: num(r.prompt_tokens),
      completionTokens: num(r.completion_tokens),
      tokensTotal: num(r.tokens_total),
      custoBrl: num(r.custo_brl),
      custoUsd: num(r.custo_usd),
    }));

    res.json({
      period: { from: from ?? null, to: to ?? null },
      totalTokens: escritorios.reduce((s, e) => s + e.tokensTotal, 0),
      totalCustoBrl: escritorios.reduce((s, e) => s + e.custoBrl, 0),
      totalCustoUsd: escritorios.reduce((s, e) => s + e.custoUsd, 0),
      escritorios,
    });
  } catch (error) {
    console.error('Error fetching per-escritorio token logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs de tokens.' });
  }
});

// ---------------------------------------------------------------------------
// GET /logs/audit — audit_log agregado por actor/escritório
// ---------------------------------------------------------------------------
router.get('/logs/audit', async (req, res) => {
  try {
    const { from, to, acao } = req.query as { from?: string; to?: string; acao?: string };
    const invalid = validateDateRange(from, to);
    if (invalid) return res.status(400).json({ error: invalid });

    const rows = (await db.execute(sql`
      SELECT u.escritorio_id, e.nome AS escritorio_nome, a.acao,
        COUNT(*) AS total
      FROM audit_log a
      LEFT JOIN usuarios u ON u.id = a.actor_id
      LEFT JOIN escritorios e ON e.id = u.escritorio_id
      ${buildWhere([
        ...(from ? [sql`a.created_at >= ${new Date(from)}`] : []),
        ...(to ? [sql`a.created_at <= ${new Date(to)}`] : []),
        ...(acao ? [sql`a.acao = ${acao}`] : []),
      ])}
      GROUP BY u.escritorio_id, e.nome, a.acao
      ORDER BY total DESC
    `)) as any[];

    const escritorios = rows.map((r) => ({
      escritorioId: r.escritorio_id,
      escritorioNome: r.escritorio_nome ?? 'Sem escritório',
      acao: r.acao,
      total: num(r.total),
    }));

    res.json({
      period: { from: from ?? null, to: to ?? null },
      total: escritorios.reduce((s, e) => s + e.total, 0),
      escritorios,
    });
  } catch (error) {
    console.error('Error fetching per-escritorio audit logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
  }
});

// ---------------------------------------------------------------------------
// GET /metricas — métricas agregadas por escritório (uso/limite para ranking)
// ---------------------------------------------------------------------------
router.get('/metricas', async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT
        e.id, e.nome,
        COALESCE((
          SELECT SUM(total_tokens) FROM token_usage t
          JOIN usuarios u ON u.id = t.usuario_id
          WHERE u.escritorio_id = e.id AND t.created_at > now() - interval '30 days'
        ), 0) AS tokens30d,
        COALESCE((
          SELECT COUNT(*) FROM usuarios u WHERE u.escritorio_id = e.id AND u.ativo = true
        ), 0) AS usuarios_ativos,
        CASE WHEN e.limite_usuarios > 0
          THEN LEAST(100, ROUND(
            COALESCE((SELECT COUNT(*) FROM usuarios u WHERE u.escritorio_id = e.id AND u.ativo = true), 0)::numeric
            / e.limite_usuarios::numeric * 100, 1))
          ELSE 0
        END AS uso_percentual
      FROM escritorios e
      WHERE e.ativo = true
      ORDER BY tokens30d DESC
    `)) as any[];

    res.json(rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      tokens30d: num(r.tokens30d),
      usuariosAtivos: num(r.usuarios_ativos),
      usoPercentual: num(r.uso_percentual),
    })));
  } catch (error) {
    console.error('Error fetching per-escritorio metricas:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas agregadas.' });
  }
});

// ---------------------------------------------------------------------------
// GET /auditoria — últimos eventos de auditoria da plataforma (root vê tudo)
// ---------------------------------------------------------------------------
router.get('/auditoria', async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT al.id, al.created_at, al.acao, al.alvo_id, al.alvo_email, al.detalhes, al.ip_address,
             u.nome AS actor_nome
      FROM audit_log al
      LEFT JOIN usuarios u ON u.id = al.actor_id
      ORDER BY al.created_at DESC
      LIMIT 200
    `)) as any[];

    res.json(rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      acao: r.acao,
      alvoId: r.alvo_id,
      alvoEmail: r.alvo_email,
      detalhes: r.detalhes,
      ipAddress: r.ip_address,
      actorNome: r.actor_nome ?? null,
    })));
  } catch (error) {
    console.error('Error fetching platform audit log:', error);
    res.status(500).json({ error: 'Erro ao buscar auditoria.' });
  }
});

export default router;
