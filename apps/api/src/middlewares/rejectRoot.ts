import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export const rejectRoot = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.role === 'root') {
    return res.status(403).json({ error: 'Acesso restrito ao escritório.' });
  }
  next();
};
