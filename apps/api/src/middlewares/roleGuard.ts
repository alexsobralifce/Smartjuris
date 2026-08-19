import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export const requireRole = (...roles: string[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    next();
  };

export const requireRoot = requireRole('root');
