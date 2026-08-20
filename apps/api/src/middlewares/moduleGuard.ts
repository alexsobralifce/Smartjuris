import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export const requireModule = (modulo: string) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (req.user.role === 'admin' || req.user.role === 'root') return next();
    if ((req.user.permissoes ?? []).includes(modulo)) return next();
    res.status(403).json({ error: 'Acesso negado a este módulo.' });
  };
