-- Fase 2F: idempotência escopada por escritório + fingerprint do payload.
-- A chave de idempotência passa a ser única por (escritorio_id, idempotency_key)
-- e a operação persiste o fingerprint canônico da requisição (para rejeitar
-- reutilização da mesma chave com payload/classificação diferente).

-- Remove a constraint UNIQUE global (idempotency_key).
ALTER TABLE "ai_operations" DROP CONSTRAINT IF EXISTS "ai_operations_idempotency_key_key";

-- Fingerprint canônico da requisição (payload + classificação + operação).
ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" text;

-- Unicidade por escritório: a MESMA chave pode existir em escritórios distintos.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_operations_tenant_key_unique"
  ON "ai_operations" ("escritorio_id", "idempotency_key");

-- ===========================================================================
-- ROLLBACK (se necessário):
--   DROP INDEX IF EXISTS "ai_operations_tenant_key_unique";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "idempotency_fingerprint";
--   ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_idempotency_key_key" UNIQUE ("idempotency_key");
-- ===========================================================================
