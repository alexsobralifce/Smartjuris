import { AuthenticatedRequest } from './auth.js';

export function isRoot(role?: string): boolean {
  return role === 'root';
}

/**
 * Verifica se o usuário autenticado pode mutar um registro no contexto de um escritório.
 * - root: não deve chegar aqui (é barrado antes pelo rejectRoot). Fallback defensivo: nega.
 * - admin: pode mutar qualquer registro do seu próprio escritório.
 * - user: pode mutar apenas registros do seu escritório e dos quais é dono (ownerId === req.user.id).
 */
export function canMutateTenant(
  req: AuthenticatedRequest,
  escritorioId: string | null | undefined,
  ownerId: string | null | undefined
): boolean {
  if (isRoot(req.user?.role)) return false;
  if (req.user?.role === 'admin') {
    return req.user.escritorioId != null && req.user.escritorioId === escritorioId;
  }
  if (req.user?.role === 'user') {
    return req.user.escritorioId === escritorioId && ownerId === req.user.id;
  }
  return false;
}
