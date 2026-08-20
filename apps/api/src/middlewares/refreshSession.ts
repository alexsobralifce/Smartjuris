import { Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from './auth.js';

const SECRET: string = process.env.JWT_SECRET ?? '';
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const COOKIE_NAME = 'smartjuris_token';
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 86400000,
  path: '/',
};

// Fração da vida do token a partir da qual renovamos (20% da vida restante).
// Vida = 1 dia; renovamos quando faltarem <= 20% (~4h48m) para expirar.
const RENEW_THRESHOLD = 0.2;

/**
 * Sessão deslizante: após o authMiddleware validar o token, este middleware
 * re-emite um token novo (novo jti, expiração resetada para 1 dia) e re-seta o
 * cookie quando o token atual estiver próximo de expirar. Assim, enquanto o
 * usuário utiliza o sistema, a sessão nunca expira — só expira por inatividade
 * prolongada que ultrapassa a vida do token.
 *
 * Uso: rodar SEMPRE depois de `authMiddleware` nas rotas autenticadas.
 */
export function refreshSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(); // sem usuário autenticado: não renova
  }

  // Resolve o token atual (para checar expiração e revogar o antigo ao renovar)
  const currentToken = req.cookies?.[COOKIE_NAME] as string | undefined
    ?? bearer(req.headers.authorization);

  if (!currentToken) {
    return next(); // sem token: nada a renovar
  }

  try {
    const decoded = jwt.verify(currentToken, SECRET) as jwt.JwtPayload;
    if (typeof decoded.exp !== 'number') {
      return next();
    }

    const nowSec = Date.now() / 1000;
    const remaining = decoded.exp - nowSec;
    // Vida total do token em segundos (fallback para 1 dia se iat ausente)
    const totalLife = (decoded.iat != null) ? (decoded.exp - decoded.iat) : 86400;

    // Renova apenas quando estiver perto de expirar (evita re-emitir a cada request)
    if (totalLife > 0 && remaining > totalLife * RENEW_THRESHOLD) {
      return next();
    }

    // NOTA: não revogamos o token antigo aqui. Revogá-lo no momento do renew
    // quebraria requests em voo que ainda chegam com o cookie antigo (ex.: híbridos
    // paralelos do mesmo page load) → 401 indevido → reload espúrio no frontend.
    // O token antigo expira sozinho em <=4h48m; o overlap é do MESMO usuário e
    // de baixo risco.

    // Re-emite token com novo jti e expiração de 1 dia
    const jti = randomUUID();
    const token = jwt.sign(
      {
        id: req.user.id,
        role: req.user.role,
        name: req.user.name,
        email: req.user.email,
        escritorioId: req.user.escritorioId ?? null,
        permissoes: req.user.permissoes ?? [],
        precisaTrocarSenha: req.user.precisaTrocarSenha ?? false,
        jti,
      },
      SECRET,
      { expiresIn: '1d' },
    );

    res.cookie(COOKIE_NAME, token, cookieOptions);
  } catch {
    // Token inválido/expirado: deixa o fluxo seguir (as rotas/guard vão tratar o 401)
  }

  return next();
}

function bearer(header?: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return undefined;
}
