import { AuthenticatedRequest } from './auth.js';

export function isAdminRole(role?: string): boolean {
  return role === 'admin' || role === 'root';
}

/**
 * Verifica se o usuário autenticado pode mutar um registro.
 * - Admin/root: sempre podem.
 * - Usuário comum: apenas se for o dono (ownerId === req.user.id).
 * - Registros legados/sem dono (ownerId == null): apenas admin/root.
 */
export function canMutate(
  req: AuthenticatedRequest,
  ownerId: string | null | undefined
): boolean {
  const role = req.user?.role;
  if (isAdminRole(role)) return true;
  if (!ownerId) return false;
  return ownerId === req.user?.id;
}
