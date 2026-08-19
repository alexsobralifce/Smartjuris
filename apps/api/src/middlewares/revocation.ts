// In-memory JWT revocation denylist keyed by token jti (maps jti -> expiration in ms).
// Prunes expired entries lazily on access.

const denylist = new Map<string, number>();

export function revokeToken(jti: string, expMs: number): void {
  // Lazy pruning of expired entries
  const now = Date.now();
  for (const [key, expiresAt] of denylist) {
    if (expiresAt <= now) {
      denylist.delete(key);
    }
  }
  denylist.set(jti, expMs);
}

export function isRevoked(jti: string): boolean {
  const expiresAt = denylist.get(jti);
  if (expiresAt === undefined) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    denylist.delete(jti);
    return false;
  }
  return true;
}
