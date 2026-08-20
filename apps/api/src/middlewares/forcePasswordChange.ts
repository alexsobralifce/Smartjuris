import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export const forcePasswordChange = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.precisaTrocarSenha) {
    return res.status(403).json({
      error: 'Troca de senha obrigatória.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
};
