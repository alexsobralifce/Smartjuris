import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios, usuarios } from '../db/schema.js';
import { requireRoot } from '../middlewares/roleGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import {
  parseBody,
  formatZodError,
  escritorioCreateSchema,
  escritorioPatchSchema,
  uuidSchema,
} from '../validation/schemas.js';
import { sendAccountActivatedEmail } from '../services/email.js';

const router = Router();

// Gestão de plataforma: apenas root. NÃO aplica forcePasswordChange (fluxo separado).
router.use(requireRoot);

const baseEscritorio = (r: any) => ({
  id: r.id,
  nome: r.nome,
  plano: r.plano,
  limiteUsuarios: Number(r.limiteUsuarios ?? r.limite_usuarios),
  limitePecasMes: Number(r.limitePecasMes ?? r.limite_pecas_mes),
  limiteProcessos: Number(r.limiteProcessos ?? r.limite_processos),
  isDemo: r.isDemo ?? r.is_demo ?? false,
  limiteTokensMes: r.limiteTokensMes != null ? Number(r.limiteTokensMes) : (r.limite_tokens_mes != null ? Number(r.limite_tokens_mes) : null),
  ativo: r.ativo,
  createdAt: r.createdAt ?? r.created_at,
  createdBy: r.createdBy ?? r.created_by ?? null,
});

const mapEscritorio = (r: any) => ({
  ...baseEscritorio(r),
  usuariosAtivos: r.usuarios_ativos !== undefined ? Number(r.usuarios_ativos) : undefined,
  tokens30d: r.tokens_30d !== undefined ? Number(r.tokens_30d) : undefined,
});

// ---------------------------------------------------------------------------
// POST / — cria escritório + admin inicial
// ---------------------------------------------------------------------------
router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = parseBody(escritorioCreateSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { nome, plano, limiteUsuarios, limitePecasMes, limiteProcessos, isDemo, limiteTokensMes, adminEmail, adminNome } = parsed.data;

    const [existing] = await db.select({ id: usuarios.id, email: usuarios.email }).from(usuarios)
      .where(eq(usuarios.email, adminEmail)).limit(1);
    if (existing) {
      return res.status(409).json({
        error: `O e-mail "${adminEmail}" já está cadastrado. Use outro e-mail para o administrador inicial.`,
        code: 'EMAIL_DUPLICATE',
        emailConflitante: adminEmail,
      });
    }

    const senhaTemporaria = randomBytes(12).toString('base64url');
    const senhaHash = await bcrypt.hash(senhaTemporaria, 12);

    const [escritorio] = await db.insert(escritorios).values({
      nome,
      plano,
      ...(limiteUsuarios !== undefined ? { limiteUsuarios } : {}),
      ...(limitePecasMes !== undefined ? { limitePecasMes } : {}),
      ...(limiteProcessos !== undefined ? { limiteProcessos } : {}),
      ...(isDemo !== undefined ? { isDemo } : {}),
      ...(limiteTokensMes !== undefined ? { limiteTokensMes } : {}),
      createdBy: req.user?.id ?? null,
    }).returning();

    await db.insert(usuarios).values({
      nome: adminNome,
      email: adminEmail,
      senha: senhaHash,
      role: 'admin',
      escritorioId: escritorio.id,
      precisaTrocarSenha: true,
      createdBy: req.user?.id ?? null,
    });

    await recordAudit(req, 'CREATE_ESCRITORIO', {
      alvoId: escritorio.id,
      detalhes: { adminEmail },
    });

    res.status(201).json({
      escritorio: baseEscritorio(escritorio),
      adminEmail,
      senhaTemporaria,
    });
  } catch (error) {
    console.error('Error creating escritorio:', error);
    res.status(500).json({ error: 'Erro ao criar escritório.' });
  }
});

// ---------------------------------------------------------------------------
// GET / — lista escritórios com contagem de usuários ativos
// ---------------------------------------------------------------------------
router.get('/', async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT e.*,
        (SELECT COUNT(*) FROM usuarios u WHERE u.escritorio_id = e.id AND u.ativo = true) AS usuarios_ativos
      FROM escritorios e
      ORDER BY e.created_at DESC
    `)) as any[];
    res.json(rows.map(mapEscritorio));
  } catch (error) {
    console.error('Error listing escritorios:', error);
    res.status(500).json({ error: 'Erro ao listar escritórios.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id — detalhe do escritório + KPIs agregados (não lista processos)
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const rows = (await db.execute(sql`
      SELECT e.*,
        (SELECT COUNT(*) FROM usuarios u WHERE u.escritorio_id = e.id AND u.ativo = true) AS usuarios_ativos,
        (SELECT COUNT(*) FROM token_usage t JOIN usuarios u ON u.id = t.usuario_id
          WHERE u.escritorio_id = e.id AND t.created_at > now() - interval '30 days') AS tokens_30d
      FROM escritorios e
      WHERE e.id = ${id}
    `)) as any[];
    if (!rows.length) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    res.json(mapEscritorio(rows[0]));
  } catch (error) {
    console.error('Error fetching escritorio:', error);
    res.status(500).json({ error: 'Erro ao buscar escritório.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/info — dados básicos do escritório + KPIs agregados (para o root)
// ---------------------------------------------------------------------------
router.get('/:id/info', async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const rows = (await db.execute(sql`
      SELECT e.*,
        (SELECT COUNT(*) FROM usuarios u WHERE u.escritorio_id = e.id AND u.ativo = true) AS usuarios_ativos,
        (SELECT COUNT(*) FROM processos p WHERE p.escritorio_id = e.id) AS processos_count,
        (SELECT COUNT(*) FROM pecas p WHERE p.escritorio_id = e.id) AS pecas_count,
        (SELECT COUNT(*) FROM token_usage t JOIN usuarios u ON u.id = t.usuario_id
          WHERE u.escritorio_id = e.id AND t.created_at > now() - interval '30 days') AS tokens_30d
      FROM escritorios e
      WHERE e.id = ${id}
    `)) as any[];
    if (!rows.length) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    const r = rows[0];
    res.json({
      escritorio: baseEscritorio(r),
      usuariosAtivos: Number(r.usuarios_ativos),
      processosCount: Number(r.processos_count),
      pecasCount: Number(r.pecas_count),
      tokens30d: Number(r.tokens_30d),
    });
  } catch (error) {
    console.error('Error fetching escritorio info:', error);
    res.status(500).json({ error: 'Erro ao buscar informações do escritório.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id — atualiza campos do escritório
// ---------------------------------------------------------------------------
router.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const parsed = parseBody(escritorioPatchSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const [existente] = await db.select({ id: escritorios.id, ativo: escritorios.ativo, nome: escritorios.nome }).from(escritorios)
      .where(eq(escritorios.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    const [atualizado] = await db.update(escritorios).set(parsed.data)
      .where(eq(escritorios.id, id)).returning();

    // Se o escritório foi ativado agora (era inativo e virou ativo), notifica o admin por e-mail
    if (parsed.data.ativo === true && existente.ativo === false) {
      db.select({ email: usuarios.email, nome: usuarios.nome })
        .from(usuarios)
        .where(eq(usuarios.escritorioId, id))
        .limit(1)
        .then(([admin]) => {
          if (admin?.email) {
            sendAccountActivatedEmail(admin.email, admin.nome, atualizado.nome).catch((err) => {
              console.error('[Escritorios] Erro ao enviar e-mail de ativação:', err);
            });
          }
        })
        .catch((err) => console.error('[Escritorios] Erro ao buscar admin para e-mail:', err));
    }

    await recordAudit(req, 'UPDATE_ESCRITORIO', { alvoId: id, detalhes: parsed.data });
    res.json(baseEscritorio(atualizado));
  } catch (error) {
    console.error('Error updating escritorio:', error);
    res.status(500).json({ error: 'Erro ao atualizar escritório.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — soft delete (ativo = false)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select({ id: escritorios.id }).from(escritorios)
      .where(eq(escritorios.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    await db.update(escritorios).set({ ativo: false }).where(eq(escritorios.id, id));
    await recordAudit(req, 'DELETE_ESCRITORIO', { alvoId: id });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting escritorio:', error);
    res.status(500).json({ error: 'Erro ao excluir escritório.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id/permanente — hard delete irreversível (cascade manual)
// ---------------------------------------------------------------------------
router.delete('/:id/permanente', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const [escritorio] = await db.select({ id: escritorios.id, nome: escritorios.nome }).from(escritorios)
      .where(eq(escritorios.id, id)).limit(1);
    if (!escritorio) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    // Coletar usuários do escritório ANTES da transação (para audit)
    const usuariosDoEsc = await db.select({ id: usuarios.id, email: usuarios.email }).from(usuarios)
      .where(eq(usuarios.escritorioId, id));

    // Cascata manual em transação (sem FK ON DELETE CASCADE no schema).
    // Ordem: dependentes primeiro → escritorio → usuarios por último.
    await db.transaction(async (tx) => {
      // 1. Documentos gerados (referenciam pecas e usuarios do escritório)
      await tx.execute(sql`
        DELETE FROM documentos_gerados
        WHERE peca_id IN (SELECT id FROM pecas WHERE escritorio_id = ${id})
           OR usuario_id IN (SELECT id FROM usuarios WHERE escritorio_id = ${id})
      `);
      // 2. Registros de negócio do escritório
      await tx.execute(sql`DELETE FROM pecas WHERE escritorio_id = ${id}`);
      await tx.execute(sql`DELETE FROM andamentos WHERE escritorio_id = ${id}`);
      await tx.execute(sql`DELETE FROM lancamentos_financeiros WHERE escritorio_id = ${id}`);
      await tx.execute(sql`DELETE FROM timesheet WHERE escritorio_id = ${id}`);
      await tx.execute(sql`DELETE FROM processos WHERE escritorio_id = ${id}`);
      await tx.execute(sql`DELETE FROM clientes WHERE escritorio_id = ${id}`);
      // 3. Registros que referenciam usuários do escritório
      await tx.execute(sql`
        DELETE FROM permissoes_usuario WHERE usuario_id IN
          (SELECT id FROM usuarios WHERE escritorio_id = ${id})
      `);
      await tx.execute(sql`
        DELETE FROM token_usage WHERE usuario_id IN
          (SELECT id FROM usuarios WHERE escritorio_id = ${id})
      `);
      await tx.execute(sql`
        DELETE FROM logins WHERE usuario_id IN
          (SELECT id FROM usuarios WHERE escritorio_id = ${id})
      `);
      // Audit do próprio escritório (actor_id referencia usuarios — evitar FK violation)
      await tx.execute(sql`
        DELETE FROM audit_log WHERE actor_id IN
          (SELECT id FROM usuarios WHERE escritorio_id = ${id})
      `);
      // 4. Usuários do escritório e, por fim, o escritório
      await tx.execute(sql`DELETE FROM usuarios WHERE escritorio_id = ${id}`);
      await tx.execute(sql`DELETE FROM escritorios WHERE id = ${id}`);
    });

    await recordAudit(req, 'DELETE_ESCRITORIO_PERMANENTE', {
      alvoId: id,
      detalhes: { escritorioNome: escritorio.nome, usuariosRemovidos: usuariosDoEsc.length },
    });

    res.status(200).json({
      ok: true,
      escritorioId: id,
      escritorioNome: escritorio.nome,
      usuariosRemovidos: usuariosDoEsc.length,
    });
  } catch (error) {
    console.error('Error hard-deleting escritorio:', error);
    res.status(500).json({ error: 'Erro ao excluir escritório permanentemente.' });
  }
});

export default router;
