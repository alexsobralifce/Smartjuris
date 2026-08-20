import { SQL, and, eq, sql } from 'drizzle-orm';
import { AuthenticatedRequest } from './auth.js';

/**
 * Retorna um filtro SQL de escopo de escritório (tenant) para uso no where do Drizzle.
 * - admin: registros do próprio escritório.
 * - user: registros do próprio escritório e de sua autoria.
 * - demais (root, role desconhecida ou tokens legados sem escritorioId):
 *   `sql`false`` — predicado que sempre é falso → 0 linhas (sem leak cross-tenant).
 */
export function tenantScope(req: AuthenticatedRequest, table: any): SQL {
  const escritorioId = req.user?.escritorioId;

  // Tokens legados (sem escritorioId) ou usuários sem vínculo de escritório
  // NUNCA devem enxergar linhas (anteriormente retornava undefined → todas).
  if (escritorioId == null) {
    return sql`false`;
  }

  if (req.user?.role === 'admin') {
    return eq(table.escritorioId, escritorioId);
  }

  if (req.user?.role === 'user') {
    return and(eq(table.escritorioId, escritorioId), eq(table.usuarioId, req.user.id)) as SQL;
  }

  // root / role desconhecida: bloqueado pelo rejectRoot nas rotas de negócio,
  // mas defensivamente também retorna 0 linhas.
  return sql`false`;
}

/**
 * Retorna o escritorioId do request para uso em inserts (POST), ex.:
 * `escritorioId: tenantScopeEscritorioId(req)`.
 */
export function tenantScopeEscritorioId(req: AuthenticatedRequest): string | null {
  return req.user?.escritorioId ?? null;
}
