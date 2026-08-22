import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios, usuarios, permissoesUsuario } from '../db/schema.js';
import { requireAdmin } from '../middlewares/roleGuard.js';
import { forcePasswordChange } from '../middlewares/forcePasswordChange.js';
import { recordAudit } from '../middlewares/audit.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import {
  parseBody,
  formatZodError,
  escritorioUserCreateSchema,
  escritorioUserPatchSchema,
  escritorioIdentitySchema,
  uuidSchema,
} from '../validation/schemas.js';

const router = Router();

// Rotas de gestão do escritório: apenas admin do escritório, sem troca de senha pendente.
router.use(requireAdmin, forcePasswordChange);

const escritorioIdDe = (req: AuthenticatedRequest): string | null => req.user?.escritorioId ?? null;

const mapUsuario = (r: any) => ({
  id: r.id,
  nome: r.nome,
  email: r.email,
  role: r.role,
  ativo: r.ativo,
  ultimoLogin: r.ultimo_login ?? null,
  precisaTrocarSenha: r.precisa_trocar_senha,
  createdAt: r.created_at,
  oab: r.oab ?? null,
  oabUf: r.oab_uf ?? null,
  permissoesAtivas: r.permissoes_ativas !== undefined ? Number(r.permissoes_ativas) : undefined,
});

const mapUsuarioDrizzle = (u: any) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  role: u.role,
  ativo: u.ativo,
  ultimoLogin: u.ultimoLogin ?? null,
  precisaTrocarSenha: u.precisaTrocarSenha,
  createdAt: u.createdAt,
  oab: u.oab ?? null,
  oabUf: u.oabUf ?? null,
});

// ---------------------------------------------------------------------------
// GET /info — dados básicos do escritório do admin logado
// ---------------------------------------------------------------------------
router.get('/info', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
    if (!esc) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    res.json({
      id: esc.id,
      nome: esc.nome,
      plano: esc.plano,
      limiteUsuarios: esc.limiteUsuarios,
      limitePecasMes: esc.limitePecasMes,
      limiteProcessos: esc.limiteProcessos,
      ativo: esc.ativo,
      createdAt: esc.createdAt,
      // Papel timbrado (identidade do escritório)
      razaoSocial: esc.razaoSocial ?? null,
      cnpj: esc.cnpj ?? null,
      inscricaoOab: esc.inscricaoOab ?? null,
      endereco: esc.endereco ?? null,
      numero: esc.numero ?? null,
      bairro: esc.bairro ?? null,
      cidade: esc.cidade ?? null,
      uf: esc.uf ?? null,
      cep: esc.cep ?? null,
      telefone: esc.telefone ?? null,
      email: esc.email ?? null,
      site: esc.site ?? null,
      logoUrl: esc.logoUrl ?? null,
    });
  } catch (error) {
    console.error('Error fetching escritorio info:', error);
    res.status(500).json({ error: 'Erro ao buscar informações do escritório.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /info — atualiza dados do papel timbrado (identidade do escritório)
// ---------------------------------------------------------------------------
router.patch('/info', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(escritorioIdentitySchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const d = parsed.data;
    const updates: Record<string, any> = {};
    // Atenção: o Drizzle espera os NOMES DOS CAMPOS (camelCase da tabela), não
    // os nomes das colunas. Usar snake_case aqui fazia razaoSocial/inscricaoOab/
    // logoUrl serem silenciosamente ignorados (voltavam null no GET /info).
    if (d.razaoSocial !== undefined) updates.razaoSocial = d.razaoSocial;
    if (d.cnpj !== undefined) updates.cnpj = d.cnpj;
    if (d.inscricaoOab !== undefined) updates.inscricaoOab = d.inscricaoOab;
    if (d.endereco !== undefined) updates.endereco = d.endereco;
    if (d.numero !== undefined) updates.numero = d.numero;
    if (d.bairro !== undefined) updates.bairro = d.bairro;
    if (d.cidade !== undefined) updates.cidade = d.cidade;
    if (d.uf !== undefined) updates.uf = d.uf;
    if (d.cep !== undefined) updates.cep = d.cep;
    if (d.telefone !== undefined) updates.telefone = d.telefone;
    if (d.email !== undefined) updates.email = d.email;
    if (d.site !== undefined) updates.site = d.site;
    if (d.logoUrl !== undefined) updates.logoUrl = d.logoUrl;

    if (Object.keys(updates).length > 0) {
      await db.update(escritorios).set(updates).where(eq(escritorios.id, escritorioId));
    }

    await recordAudit(req, 'UPDATE_ESCRITORIO_IDENTITY', { alvoId: escritorioId, detalhes: parsed.data });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating escritorio identity:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados do escritório.' });
  }
});

// ---------------------------------------------------------------------------
// GET /metricas — KPIs agregados do escritório do admin logado
// ---------------------------------------------------------------------------
router.get('/metricas', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const rows = (await db.execute(sql`
      SELECT e.limite_pecas_mes,
        (SELECT COUNT(*) FROM processos WHERE escritorio_id = e.id) AS total_processos,
        (SELECT COUNT(*) FROM processos WHERE escritorio_id = e.id AND status = 'ativo') AS processos_ativos,
        (SELECT COUNT(*) FROM pecas WHERE escritorio_id = e.id AND gerado_em >= date_trunc('month', now())) AS pecas_mes,
        (SELECT COALESCE(SUM(t.total_tokens), 0) FROM token_usage t JOIN usuarios u ON u.id = t.usuario_id
          WHERE u.escritorio_id = e.id AND t.created_at >= date_trunc('month', now())) AS tokens_mes,
        (SELECT COUNT(*) FROM usuarios WHERE escritorio_id = e.id AND ativo = true) AS usuarios_ativos
      FROM escritorios e
      WHERE e.id = ${escritorioId}
    `)) as any[];

    const r = rows[0];
    if (!r) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    const tokensMes = Number(r.tokens_mes ?? 0);
    const limiteTokens = Number(r.limite_pecas_mes ?? 0) * 10000;
    const usoPercentual = limiteTokens > 0 ? Math.round((tokensMes / limiteTokens) * 100) : 0;

    res.json({
      totalProcessos: Number(r.total_processos ?? 0),
      processosAtivos: Number(r.processos_ativos ?? 0),
      pecasMes: Number(r.pecas_mes ?? 0),
      tokensMes,
      usuariosAtivos: Number(r.usuarios_ativos ?? 0),
      limiteTokens,
      usoPercentual,
    });
  } catch (error) {
    console.error('Error fetching escritorio metricas:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas do escritório.' });
  }
});

// ---------------------------------------------------------------------------
// GET /usuarios — lista usuários do escritório (sem senha)
// ---------------------------------------------------------------------------
router.get('/usuarios', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const rows = (await db.execute(sql`
      SELECT u.id, u.nome, u.email, u.role, u.ativo, u.ultimo_login, u.precisa_trocar_senha, u.created_at,
        u.oab, u.oab_uf,
        (SELECT COUNT(*) FROM permissoes_usuario p WHERE p.usuario_id = u.id AND p.ativo = true) AS permissoes_ativas
      FROM usuarios u
      WHERE u.escritorio_id = ${escritorioId}
      ORDER BY u.created_at DESC
    `)) as any[];
    res.json(rows.map(mapUsuario));
  } catch (error) {
    console.error('Error listing escritorio users:', error);
    res.status(500).json({ error: 'Erro ao listar usuários do escritório.' });
  }
});

// ---------------------------------------------------------------------------
// POST /usuarios — cria user do escritório (com permissões e senha temporária)
// ---------------------------------------------------------------------------
router.post('/usuarios', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }

    const parsed = parseBody(escritorioUserCreateSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { nome, email } = parsed.data;
    const modulos: string[] = parsed.data.modulos ?? [];

    const [esc] = await db.select({ limiteUsuarios: escritorios.limiteUsuarios }).from(escritorios)
      .where(eq(escritorios.id, escritorioId)).limit(1);
    if (!esc) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    const [cnt] = await db.select({ total: count() }).from(usuarios)
      .where(and(eq(usuarios.escritorioId, escritorioId), eq(usuarios.ativo, true)));
    if (Number(cnt?.total ?? 0) >= Number(esc.limiteUsuarios)) {
      return res.status(403).json({ error: 'Limite de usuários do escritório atingido.' });
    }

    // Fase 4B — piloto controlado: teto ADICIONAL de usuários por escritório.
    const { excedeLimiteUsuariosPiloto } = await import('../services/pilotMode.js');
    if (await excedeLimiteUsuariosPiloto(escritorioId)) {
      return res.status(403).json({
        error: 'O piloto controlado limitou temporariamente a criação de usuários neste escritório.',
        code: 'PILOTO_LIMITE_USUARIOS',
      });
    }

    const [existing] = await db.select({ id: usuarios.id }).from(usuarios)
      .where(eq(usuarios.email, email)).limit(1);
    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    const senhaTemporaria = randomBytes(12).toString('base64url');
    const senhaHash = await bcrypt.hash(senhaTemporaria, 12);

    // Fase 4B — piloto: teto de usuários verificado+insert ATOMICAMENTE sob
    // advisory lock SOMENTE com piloto ativo E limite configurado; caso
    // contrário, caminho original sem transação/lock adicional (rollback).
    // TODAS as mutações da criação (usuário + permissões) rodam na MESMA
    // transação do slot: falha posterior → rollback integral (sem usuário
    // órfão consumindo a vaga do piloto).
    const { configPiloto } = await import('../services/pilotMode.js');
    const cfgPiloto = configPiloto();
    let created: typeof usuarios.$inferSelect | undefined;
    if (cfgPiloto.ativo && cfgPiloto.maxUsuariosPorEscritorio != null) {
      const { comSlotPiloto: slotUsers, ErroPilotoLimite } = await import('../services/pilotMode.js');
      const { excedeLimiteUsuariosPiloto: excedeUsersPiloto } = await import('../services/pilotMode.js');
      [created] = await slotUsers(`piloto:usuarios:${escritorioId}`, async (tx) => {
        // Contagem tx-aware: MESMA conexão que detém o advisory lock.
        if (await excedeUsersPiloto(escritorioId, tx)) {
          throw new ErroPilotoLimite('PILOTO_LIMITE_USUARIOS');
        }
        const linhas = await tx.insert(usuarios).values({
          nome,
          email,
          senha: senhaHash,
          role: 'user',
          escritorioId,
          precisaTrocarSenha: true,
          createdBy: req.user?.id ?? null,
        }).returning();
        if (modulos.length && linhas[0]) {
          await tx.insert(permissoesUsuario).values(
            modulos.map((m) => ({ usuarioId: linhas[0].id, modulo: m, ativo: true }))
          ).onConflictDoUpdate({
            target: [permissoesUsuario.usuarioId, permissoesUsuario.modulo],
            set: { ativo: sql`EXCLUDED.ativo` },
          });
        }
        return linhas;
      });
    } else {
      [created] = await db.insert(usuarios).values({
        nome,
        email,
        senha: senhaHash,
        role: 'user',
        escritorioId,
        precisaTrocarSenha: true,
        createdBy: req.user?.id ?? null,
      }).returning();
      if (modulos.length) {
        await db.insert(permissoesUsuario).values(
          modulos.map((m) => ({ usuarioId: created!.id, modulo: m, ativo: true }))
        ).onConflictDoUpdate({
          target: [permissoesUsuario.usuarioId, permissoesUsuario.modulo],
          set: { ativo: sql`EXCLUDED.ativo` },
        });
      }
    }

    if (!created) throw new Error('usuário não criado');
    await recordAudit(req, 'CREATE_ESCRITORIO_USER', { alvoId: created.id, detalhes: { email } });

    res.status(201).json({
      user: {
        id: created.id,
        nome: created.nome,
        email: created.email,
        role: created.role,
        ativo: created.ativo,
        precisaTrocarSenha: created.precisaTrocarSenha,
        createdAt: created.createdAt,
      },
      senhaTemporaria,
    });
  } catch (error) {
    // Fase 4B — teto do piloto atingido → 403 com código (não é falha interna).
    const { ErroPilotoLimite } = await import('../services/pilotMode.js');
    if (error instanceof ErroPilotoLimite) {
      return res.status(403).json({
        error: 'O piloto controlado limitou temporariamente a criação de usuários neste escritório.',
        code: error.code,
      });
    }
    console.error('Error creating escritorio user:', error);
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /usuarios/:id — atualiza user do escritório
// ---------------------------------------------------------------------------
router.patch('/usuarios/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const [target] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (target.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const parsed = parseBody(escritorioUserPatchSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { nome, email, role, ativo, oab, oabUf } = parsed.data;

    // Guard defensivo: nunca elevar para root (o schema já restringe, mas não confiar)
    if (role === 'root') {
      return res.status(403).json({ error: 'Não é permitido atribuir papel root.' });
    }

    if (email !== undefined && email !== target.email) {
      const [dup] = await db.select({ id: usuarios.id }).from(usuarios)
        .where(and(eq(usuarios.email, email), ne(usuarios.id, id))).limit(1);
      if (dup) {
        return res.status(409).json({ error: 'Email já cadastrado para outro usuário.' });
      }
    }

    const updates: Record<string, any> = {};
    if (nome !== undefined) updates.nome = nome;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (ativo !== undefined) updates.ativo = ativo;
    if (oab !== undefined) updates.oab = oab;
    if (oabUf !== undefined) updates.oabUf = oabUf;

    let updated = target;
    if (Object.keys(updates).length > 0) {
      const [row] = await db.update(usuarios).set(updates).where(eq(usuarios.id, id)).returning();
      updated = row;
    }

    await recordAudit(req, 'UPDATE_ESCRITORIO_USER', {
      alvoId: id,
      alvoEmail: target.email,
      detalhes: updates,
    });
    res.json(mapUsuarioDrizzle(updated));
  } catch (error) {
    console.error('Error updating escritorio user:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /usuarios/:id — soft delete (ativo = false)
// ---------------------------------------------------------------------------
router.delete('/usuarios/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    if (id === req.user?.id) {
      return res.status(403).json({ error: 'Não é permitido desativar a própria conta.' });
    }

    const [target] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (target.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, id));
    await recordAudit(req, 'DELETE_ESCRITORIO_USER', { alvoId: id, alvoEmail: target.email });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting escritorio user:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

// ---------------------------------------------------------------------------
// POST /usuarios/:id/reset-password — redefine senha e força troca no login
// ---------------------------------------------------------------------------
router.post('/usuarios/:id/reset-password', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const [target] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (target.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const senhaTemporaria = randomBytes(12).toString('base64url');
    const senhaHash = await bcrypt.hash(senhaTemporaria, 12);
    await db.update(usuarios).set({ senha: senhaHash, precisaTrocarSenha: true })
      .where(eq(usuarios.id, id));

    await recordAudit(req, 'RESET_ESCRITORIO_USER_PASSWORD', { alvoId: id, alvoEmail: target.email });
    res.json({ success: true, senhaTemporaria });
  } catch (error) {
    console.error('Error resetting escritorio user password:', error);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// ---------------------------------------------------------------------------
// GET /usuarios/:id/stats — métricas agregadas do usuário do escritório
// ---------------------------------------------------------------------------
router.get('/usuarios/:id/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = escritorioIdDe(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const [target] = await db.select({ id: usuarios.id, escritorioId: usuarios.escritorioId })
      .from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!target) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (target.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const rows = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM pecas WHERE usuario_id = ${id}) AS pecas_count,
        (SELECT COUNT(*) FROM processos WHERE usuario_id = ${id}) AS processos_count,
        (SELECT COUNT(*) FROM andamentos WHERE usuario_id = ${id}) AS andamentos_count,
        (SELECT COUNT(*) FROM lancamentos_financeiros WHERE usuario_id = ${id}) AS lancamentos_count,
        (SELECT COUNT(*) FROM token_usage WHERE usuario_id = ${id}) AS token_usage_count,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE usuario_id = ${id}) AS tokens_total
    `)) as any[];

    const r = rows[0] ?? {};
    res.json({
      pecasCount: Number(r.pecas_count ?? 0),
      processosCount: Number(r.processos_count ?? 0),
      andamentosCount: Number(r.andamentos_count ?? 0),
      lancamentosCount: Number(r.lancamentos_count ?? 0),
      tokenUsageCount: Number(r.token_usage_count ?? 0),
      tokensTotal: Number(r.tokens_total ?? 0),
    });
  } catch (error) {
    console.error('Error fetching escritorio user stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas do usuário.' });
  }
});

export default router;
