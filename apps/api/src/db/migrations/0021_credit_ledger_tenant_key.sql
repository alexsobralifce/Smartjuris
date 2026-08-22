-- Fase 2F: escopa a unicidade do credit_ledger por (escritorio_id, idempotency_key).
-- A MESMA chave em escritórios distintos gera lançamentos independentes.

ALTER TABLE "credit_ledger" DROP CONSTRAINT IF EXISTS "credit_ledger_idempotency_key_key";

CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_tenant_key_unique"
  ON "credit_ledger" ("escritorio_id", "idempotency_key");

-- ===========================================================================
-- ROLLBACK (se necessário):
--   DROP INDEX IF EXISTS "credit_ledger_tenant_key_unique";
--   ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_idempotency_key_key" UNIQUE ("idempotency_key");
-- ===========================================================================
