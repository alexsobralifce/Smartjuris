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

// ---------------------------------------------------------------------------
// GET /logs/sistema — eventos de log de aplicação (syslog), com filtro por
// nível e texto de busca. Root vê tudo (detalhado, não agregado).
// ---------------------------------------------------------------------------
router.get('/logs/sistema', async (req, res) => {
  try {
    const { level, busca, from, to, escritorioId, limit, offset, format } = req.query as {
      level?: string; busca?: string; from?: string; to?: string; escritorioId?: string; limit?: string; offset?: string; format?: string;
    };
    const invalid = validateDateRange(from, to);
    if (invalid) return res.status(400).json({ error: invalid });

    const conds: SQL[] = [];
    if (level) conds.push(sql`al.level = ${level}`);
    if (escritorioId) conds.push(sql`al.escritorio_id = ${escritorioId}`);
    if (busca) conds.push(sql`(al.message ILIKE ${'%' + busca + '%'} OR al.stack ILIKE ${'%' + busca + '%'} OR al.source ILIKE ${'%' + busca + '%'})`);
    if (from) conds.push(sql`al.created_at >= ${new Date(from)}`);
    if (to) conds.push(sql`al.created_at <= ${new Date(to)}`);
    const whereSql = conds.length ? sql` WHERE ${sql.join(conds, sql` AND `)}` : sql``;

    const limitN = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const offsetN = Math.max(Number(offset) || 0, 0);

    const rows = (await db.execute(sql`
      SELECT * FROM app_logs al ${whereSql} ORDER BY al.created_at DESC LIMIT ${limitN} OFFSET ${offsetN}
    `)) as any[];

    if (format === 'text') {
      // Texto puro estilo .log — fácil de colar/copiar e enviar ao dev.
      const text = rows.map((r) => {
        const t = new Date(r.created_at).toISOString();
        const linha = `[${t}] ${String(r.level).toUpperCase()} ${r.message}`;
        const extras = [r.source && `(fonte: ${r.source})`, r.ip && `(ip: ${r.ip})`].filter(Boolean).join(' ');
        return `${linha}${extras ? ' ' + extras : ''}${r.stack ? '\n' + r.stack : ''}`;
      }).join('\n\n');
      res.type('text/plain').send(text);
      return;
    }

    const total = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM app_logs al ${whereSql}`)) as any[];
    res.json({
      total: Number(total[0]?.n ?? 0),
      rows: rows.map((r) => ({
        id: r.id,
        level: r.level,
        message: r.message,
        stack: r.stack ?? null,
        source: r.source ?? null,
        method: r.method ?? null,
        path: r.path ?? null,
        status: r.status ?? null,
        ip: r.ip ?? null,
        usuarioId: r.usuario_id ?? null,
        escritorioId: r.escritorio_id ?? null,
        context: r.context ?? null,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching app logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs do sistema.' });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/dev — PAINEL DE DESENVOLVEDOR do billing (Mercado Pago).
// Visão técnica para o root/gestor: status da configuração, últimos webhooks
// recebidos, operações de checkout e escritórios com assinatura. Dados
// agregados/técnicos — nunca expõe segredos nem dados de negócio.
// ---------------------------------------------------------------------------
router.get('/billing/dev', async (_req, res) => {
  try {
    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '';
    const mpPublicKey = process.env.MERCADO_PAGO_PUBLIC_KEY ?? '';
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? '';

    const [webhookCount] = await db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS ultimas_24h
      FROM billing_webhook_events
    `);
    const webhooksRecentes = await db.execute(sql`
      SELECT event_type, data_id, data_estado, result_status, escritorio_id, created_at
      FROM billing_webhook_events
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const operacoesRecentes = await db.execute(sql`
      SELECT idempotency_key, plano, estado, fase, resultado_incerto, mercado_pago_id, error, created_at
      FROM billing_checkout_operations
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const assinaturas = await db.execute(sql`
      SELECT id, nome, plano, assinatura_status, assinatura_plano, mercado_pago_id,
             credits_available, assinatura_proxima_cobranca, ativo
      FROM escritorios
      WHERE assinatura_status != 'nenhuma'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({
      config: {
        mpConfigurado: mpToken.length > 0,
        temPublicKey: mpPublicKey.length > 0,
        temWebhookSecret: webhookSecret.length > 0,
        // mascarado — apenas diagnóstico
        accessTokenPrefix: mpToken.length > 8 ? `${mpToken.slice(0, 8)}…` : null,
        publicKeyPrefix: mpPublicKey.length > 8 ? `${mpPublicKey.slice(0, 8)}…` : null,
        appUrl: process.env.APP_URL ?? '(não configurado)',
        publicApiUrl: process.env.PUBLIC_API_URL ?? '(não configurado)',
        webhookUrl: process.env.PUBLIC_API_URL
          ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/billing/webhook`
          : '(não configurado)',
      },
      webhooks: {
        total: Number((webhookCount as any)[0]?.total ?? 0),
        ultimas24h: Number((webhookCount as any)[0]?.ultimas_24h ?? 0),
        recentes: (webhooksRecentes as any).map((w: any) => ({
          tipo: w.event_type,
          dataId: w.data_id,
          estado: w.data_estado,
          resultado: w.result_status,
          escritorioId: w.escritorio_id,
          createdAt: w.created_at,
        })),
      },
      operacoes: (operacoesRecentes as any).map((o: any) => ({
        idempotencyKey: o.idempotency_key,
        plano: o.plano,
        estado: o.estado,
        fase: o.fase,
        resultadoIncerto: o.resultado_incerto,
        mercadoPagoId: o.mercado_pago_id,
        error: o.error,
        createdAt: o.created_at,
      })),
      assinaturas: (assinaturas as any).map((e: any) => ({
        id: e.id,
        nome: e.nome,
        plano: e.plano,
        assinaturaStatus: e.assinatura_status,
        assinaturaPlano: e.assinatura_plano,
        mercadoPagoId: e.mercado_pago_id,
        creditsAvailable: Number(e.credits_available ?? 0),
        proximaCobranca: e.assinatura_proxima_cobranca,
        ativo: e.ativo,
      })),
    });
  } catch (error) {
    console.error('Error fetching billing dev panel:', error);
    res.status(500).json({ error: 'Erro ao buscar painel de dev do billing.' });
  }
});

export default router;
