-- Fase 3D (integração frontend): idempotência DURÁVEL da persistência de peças.
-- O POST /api/pecas passa a aceitar idempotency_key: a MESMA chave (mesmo
-- escritório) retorna a peça existente em vez de criar duplicata. Cobre
-- remontagem do componente, reload da página e repetição após falha ambígua
-- de rede — a deduplicação no cliente (Map) é apenas otimização intra-SPA.

ALTER TABLE "pecas" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

-- Unicidade por escritório; registros sem chave (peças legadas/manuais, NULL)
-- não participam da restrição.
CREATE UNIQUE INDEX IF NOT EXISTS "pecas_tenant_key_unique"
  ON "pecas" ("escritorio_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- ===========================================================================
-- ROLLBACK (se necessário):
--   DROP INDEX IF EXISTS "pecas_tenant_key_unique";
--   ALTER TABLE "pecas" DROP COLUMN IF EXISTS "idempotency_key";
-- ===========================================================================
