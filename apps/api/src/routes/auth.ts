import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { usuarios, logins, permissoesUsuario, escritorios } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimit.js';
import { revokeToken } from '../middlewares/revocation.js';
import { recordAudit } from '../middlewares/audit.js';
import { getTokenUsageMes } from '../services/usage.js';

const router = Router();
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const COOKIE_NAME = 'smartjuris_token';
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // `*.up.railway.app` são sites distintos (up.railway.app está no Public Suffix List),
  // então o cookie precisa de SameSite=None para ser enviado cross-origin entre web e API.
  // Em dev (localhost = same-site) mantemos Lax, pois None exige Secure (incompatível com http).
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 86400000,
  path: '/',
};

const MAX_EMAIL_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

interface EmailLockEntry {
  count: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const emailLockout = new Map<string, EmailLockEntry>();

function resolveTokenFromRequest(req: AuthenticatedRequest): string | null {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function recordEmailFailure(normalizedEmail: string): void {
  const now = Date.now();
  const existing = emailLockout.get(normalizedEmail);
  if (!existing || now - existing.firstFailureAt > FAILURE_WINDOW_MS) {
    emailLockout.set(normalizedEmail, { count: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  const count = existing.count + 1;
  if (count >= MAX_EMAIL_FAILURES) {
    emailLockout.set(normalizedEmail, {
      count,
      firstFailureAt: existing.firstFailureAt,
      lockedUntil: now + LOCKOUT_MS,
    });
  } else {
    emailLockout.set(normalizedEmail, { count, firstFailureAt: existing.firstFailureAt, lockedUntil: 0 });
  }
}

/**
 * Limite de tokens mensal do usuário: apenas escritórios demo têm limite.
 * Usuários sem escritório (root) e escritórios não-demo retornam null.
 */
async function getLimiteTokensMes(escritorioId: string | null | undefined): Promise<number | null> {
  if (!escritorioId) return null;
  const rows = await db
    .select({ limiteTokensMes: escritorios.limiteTokensMes })
    .from(escritorios)
    .where(and(eq(escritorios.id, escritorioId), eq(escritorios.isDemo, true)))
    .limit(1);
  return rows[0]?.limiteTokensMes ?? null;
}

router.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  // Validação de entrada antes de qualquer acesso ao banco/criptografia
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  const normalizedEmail = email.toLowerCase();

  try {
    // Per-email lockout: targeted brute force on a single account
    const lockEntry = emailLockout.get(normalizedEmail);
    if (lockEntry && lockEntry.lockedUntil > Date.now()) {
      return res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' });
    }
    if (lockEntry && lockEntry.lockedUntil <= Date.now()) {
      emailLockout.delete(normalizedEmail);
    }

    // Busca usuário no banco (normalizado para não contornar o lockout com variação de caixa)
    const [user] = await db.select().from(usuarios).where(eq(usuarios.email, normalizedEmail)).limit(1);

    if (!user) {
      recordEmailFailure(normalizedEmail);
      await db.insert(logins).values({
        usuarioId: null,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Credenciais inválidas',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    if (user.ativo === false) {
      recordEmailFailure(normalizedEmail);
      await db.insert(logins).values({
        usuarioId: user.id,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Usuário inativo',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Compara senha criptografada
    const isValid = await bcrypt.compare(password, user.senha);
    if (!isValid) {
      recordEmailFailure(normalizedEmail);
      await db.insert(logins).values({
        usuarioId: user.id,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Credenciais inválidas',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Sucesso: reseta contador de bloqueio por email
    emailLockout.delete(normalizedEmail);

    // Busca dados de tenancy e flag de troca de senha do banco (valores atuais/defensivos)
    const [tenantRow] = await db
      .select({ escritorioId: usuarios.escritorioId, precisaTrocarSenha: usuarios.precisaTrocarSenha })
      .from(usuarios)
      .where(eq(usuarios.id, user.id))
      .limit(1);

    const escritorioId = tenantRow?.escritorioId ?? null;
    const precisaTrocarSenha = tenantRow?.precisaTrocarSenha ?? false;

    // Se o usuário pertence a um escritório, verifica se o escritório está ativo
    let limiteTokensMes: number | null = null;
    if (escritorioId) {
      const [escritorio] = await db
        .select({ ativo: escritorios.ativo, isDemo: escritorios.isDemo, limiteTokensMes: escritorios.limiteTokensMes })
        .from(escritorios)
        .where(eq(escritorios.id, escritorioId))
        .limit(1);
      if (!escritorio || escritorio.ativo === false) {
        await db.insert(logins).values({
          usuarioId: user.id,
          emailTentado: email,
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
          sucesso: false,
          motivoFalha: 'Escritório desativado',
        });
        return res.status(403).json({ error: 'Escritório desativado. Contate o suporte da plataforma.' });
      }
      // Apenas escritórios demo expõem limite de tokens (demais: null)
      if (escritorio.isDemo && escritorio.limiteTokensMes != null) {
        limiteTokensMes = Number(escritorio.limiteTokensMes);
      }
    }

    // Consumo de tokens do mês (apenas quando há limite definido)
    let tokensMes = 0;
    if (limiteTokensMes != null) {
      tokensMes = await getTokenUsageMes(user.id);
    }

    // Permissões de módulo: apenas role 'user' tem permissões granulares
    let permissoes: string[] = [];
    if (user.role === 'user') {
      const permRows = await db.select({ modulo: permissoesUsuario.modulo }).from(permissoesUsuario)
        .where(and(eq(permissoesUsuario.usuarioId, user.id), eq(permissoesUsuario.ativo, true)));
      permissoes = permRows.map((r) => r.modulo);
    }

    // Gera token JWT real com jti e payload multi-tenant completo
    const jti = randomUUID();
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.nome,
        email: user.email,
        escritorioId,
        permissoes,
        precisaTrocarSenha,
        jti,
      },
      SECRET,
      { expiresIn: '1d' }
    );

    await db.insert(logins).values({
      usuarioId: user.id,
      emailTentado: email,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      sucesso: true,
    });
    await db.update(usuarios).set({ ultimoLogin: new Date() }).where(eq(usuarios.id, user.id));

    res.cookie(COOKIE_NAME, token, cookieOptions);

    res.json({
      user: {
        id: user.id,
        name: user.nome,
        role: user.role,
        email: user.email,
        escritorioId: escritorioId ?? null,
        permissoes,
        precisaTrocarSenha,
        tokensMes,
        limiteTokensMes,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  const [tokensMes, limiteTokensMes] = await Promise.all([
    req.user.id ? getTokenUsageMes(req.user.id) : Promise.resolve(0),
    getLimiteTokensMes(req.user.escritorioId),
  ]);
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
      escritorioId: req.user.escritorioId ?? null,
      permissoes: req.user.permissoes ?? [],
      precisaTrocarSenha: req.user.precisaTrocarSenha ?? false,
      tokensMes,
      limiteTokensMes,
    },
  });
});

router.post('/trocar-senha', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { senhaAtual, novaSenha } = (req.body ?? {}) as { senhaAtual?: string; novaSenha?: string };

  if (typeof novaSenha !== 'string' || novaSenha.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }
  // Decisão segura: a senha atual é SEMPRE exigida (inclusive quando precisaTrocarSenha=true,
  // pois o usuário deve saber a senha temporária informada pelo admin).
  if (typeof senhaAtual !== 'string' || !senhaAtual) {
    return res.status(400).json({ error: 'A senha atual é obrigatória.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  try {
    const [user] = await db.select().from(usuarios).where(eq(usuarios.id, req.user.id)).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const isValid = await bcrypt.compare(senhaAtual, user.senha);
    if (!isValid) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 12);
    await db.update(usuarios).set({ senha: senhaHash, precisaTrocarSenha: false })
      .where(eq(usuarios.id, user.id));
    await recordAudit(req, 'PASSWORD_CHANGE', {});

    // Revoga o token antigo (que ainda carregava precisaTrocarSenha=true)
    const oldToken = resolveTokenFromRequest(req);
    if (oldToken) {
      try {
        const decoded = jwt.verify(oldToken, SECRET);
        if (typeof decoded === 'object' && decoded !== null && decoded.jti && typeof decoded.exp === 'number') {
          revokeToken(decoded.jti, decoded.exp * 1000);
        }
      } catch {
        // Token inválido/expirado: nada a revogar.
      }
    }

    const permRows = await db.select({ modulo: permissoesUsuario.modulo }).from(permissoesUsuario)
      .where(and(eq(permissoesUsuario.usuarioId, user.id), eq(permissoesUsuario.ativo, true)));
    const permissoes = permRows.map((r) => r.modulo);

    const jti = randomUUID();
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.nome,
        email: user.email,
        escritorioId: user.escritorioId,
        permissoes,
        precisaTrocarSenha: false,
        jti,
      },
      SECRET,
      { expiresIn: '1d' }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({
      user: {
        id: user.id,
        name: user.nome,
        role: user.role,
        email: user.email,
        escritorioId: user.escritorioId,
        permissoes,
        precisaTrocarSenha: false,
      },
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Erro ao trocar a senha.' });
  }
});

router.post('/logout', (req, res) => {
  const token = resolveTokenFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET);
      if (typeof decoded === 'object' && decoded !== null && decoded.jti && typeof decoded.exp === 'number') {
        revokeToken(decoded.jti, decoded.exp * 1000);
      }
    } catch {
      // Token inválido/expirado: nada a revogar. Ainda assim limpa o cookie e responde sucesso.
    }
  }

  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(200).json({ message: 'Logout realizado com sucesso.' });
});

export default router;
