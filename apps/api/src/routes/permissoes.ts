import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { usuarios, permissoesUsuario } from '../db/schema.js';
import { requireAdmin } from '../middlewares/roleGuard.js';
import { forcePasswordChange } from '../middlewares/forcePasswordChange.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { parseBody, formatZodError, permissoesUpdateSchema, uuidSchema } from '../validation/schemas.js';

const router = Router();

// Permissões por módulo do escritório: apenas admin, sem troca de senha pendente.
router.use(requireAdmin, forcePasswordChange);

async function findUserInTenant(req: AuthenticatedRequest, userId: string) {
  const escritorioId = req.user?.escritorioId ?? null;
  if (!escritorioId) return { escritorioId, user: null };
  const [u] = await db.select({ id: usuarios.id, role: usuarios.role, escritorioId: usuarios.escritorioId })
    .from(usuarios).where(eq(usuarios.id, userId)).limit(1);
  return { escritorioId, user: u ?? null };
}

// ---------------------------------------------------------------------------
// GET /:userId — lista permissões { modulo, ativo } de um usuário
// ---------------------------------------------------------------------------
router.get('/:userId', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    if (!uuidSchema.safeParse(userId).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const { escritorioId, user } = await findUserInTenant(req, userId);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (user.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    if (user.role !== 'user') {
      return res.status(400).json({ error: 'Admins têm acesso total ao escritório.' });
    }

    const rows = await db.select({ modulo: permissoesUsuario.modulo, ativo: permissoesUsuario.ativo })
      .from(permissoesUsuario).where(eq(permissoesUsuario.usuarioId, userId))
      .orderBy(permissoesUsuario.modulo);

    res.json({ permissoes: rows });
  } catch (error) {
    console.error('Error listing user permissions:', error);
    res.status(500).json({ error: 'Erro ao listar permissões.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /:userId — substitui o conjunto de permissões do usuário
// ---------------------------------------------------------------------------
router.put('/:userId', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    if (!uuidSchema.safeParse(userId).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const { escritorioId, user } = await findUserInTenant(req, userId);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (user.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    if (user.role !== 'user') {
      return res.status(400).json({ error: 'Admins têm acesso total ao escritório.' });
    }

    const parsed = parseBody(permissoesUpdateSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { permissoes } = parsed.data as { permissoes: { modulo: string; ativo: boolean }[] };

    // Substitui o conjunto: apaga tudo e reinsere
    await db.delete(permissoesUsuario).where(eq(permissoesUsuario.usuarioId, userId));
    if (permissoes.length) {
      await db.insert(permissoesUsuario).values(
        permissoes.map((p) => ({ usuarioId: userId, modulo: p.modulo, ativo: p.ativo }))
      );
    }

    const rows = await db.select({ modulo: permissoesUsuario.modulo, ativo: permissoesUsuario.ativo })
      .from(permissoesUsuario).where(eq(permissoesUsuario.usuarioId, userId))
      .orderBy(permissoesUsuario.modulo);

    res.json({ permissoes: rows });
  } catch (error) {
    console.error('Error updating user permissions:', error);
    res.status(500).json({ error: 'Erro ao atualizar permissões.' });
  }
});

export default router;
