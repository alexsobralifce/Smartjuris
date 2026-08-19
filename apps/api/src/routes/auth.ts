import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { usuarios, logins } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimit.js';
import { revokeToken, isRevoked } from '../middlewares/revocation.js';

const router = Router();
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const COOKIE_NAME = 'smartjuris_token';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
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

router.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.toLowerCase() : '';

  try {
    // Per-email lockout: targeted brute force on a single account
    const lockEntry = emailLockout.get(normalizedEmail);
    if (lockEntry && lockEntry.lockedUntil > Date.now()) {
      return res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' });
    }
    if (lockEntry && lockEntry.lockedUntil <= Date.now()) {
      emailLockout.delete(normalizedEmail);
    }

    // Busca usuário no banco
    const [user] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);

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

    // Gera token JWT real com jti
    const jti = randomUUID();
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.nome, email: user.email, jti },
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
        name: user.nome,
        role: user.role,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  res.json({
    user: {
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
    },
  });
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

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.status(200).json({ message: 'Logout realizado com sucesso.' });
});

export default router;
