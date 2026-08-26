import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { decidirTrava } from '../services/travaAssinatura.js';

/**
 * Middleware que bloqueia escritórios self-service NÃO assinantes de usar
 * recursos de IA. Escritórios não-demo (criados pelo root) são isentos.
 *
 * Retorna 403 com code 'ASSINATURA_OBRIGATORIA' se o escritório não tem
 * assinatura ativa.
 */
export const requireAssinaturaAtiva = () =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const escritorioId = req.user.escritorioId;
    if (!escritorioId) return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });

    const decisao = await decidirTrava(escritorioId);
    if (!decisao.liberado && decisao.aplica) {
      return res.status(403).json({
        error: 'Os recursos avançados de IA estão disponíveis apenas para assinantes. Assine um plano para desbloquear.',
        code: 'ASSINATURA_OBRIGATORIA',
      });
    }

    next();
  };