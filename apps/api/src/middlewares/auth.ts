import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isRevoked } from './revocation.js';

const SECRET: string = process.env.JWT_SECRET ?? '';
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    name: string;
    email: string;
    escritorioId: string | null;
    permissoes: string[];
    precisaTrocarSenha: boolean;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Resolve token: cookie first, then Bearer header
  let token: string | undefined = req.cookies?.smartjuris_token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
      return res.status(401).json({ error: 'Erro no token.' });
    }

    const [scheme, bearerToken] = parts;
    if (!/^Bearer$/i.test(scheme)) {
      return res.status(401).json({ error: 'Token malformatado.' });
    }

    token = bearerToken;
  }

  jwt.verify(token, SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    if (decoded?.jti && isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    // Tolerância a tokens antigos (pré-multi-tenant): preenche com defaults seguros
    // quando o payload não contém os novos campos.
    req.user = {
      id: decoded?.id,
      role: decoded?.role,
      name: decoded?.name,
      email: decoded?.email,
      escritorioId: decoded?.escritorioId ?? null,
      permissoes: decoded?.permissoes ?? [],
      precisaTrocarSenha: decoded?.precisaTrocarSenha ?? false,
    };
    return next();
  });
}
