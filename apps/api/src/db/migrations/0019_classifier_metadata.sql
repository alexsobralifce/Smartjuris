-- Fase 2E: metadados de classificação em ai_operations.
-- Estes campos NÃO são financeiros: créditos/custos/reservas permanecem nas
-- colunas existentes (credits_reserved, cost_cents_reserved, etc.). Nenhum
-- metadado é confundido com dado financeiro.

ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "classification" text;
ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "classification_reason" text;
ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "warnings" jsonb;
ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "prompt_version" text;
ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "parent_operation_id" uuid REFERENCES "ai_operations"("id");
ALTER TABLE "ai_operations" ADD COLUMN IF NOT EXISTS "sub_operations" jsonb;

CREATE INDEX IF NOT EXISTS "ai_operations_parent_idx" ON "ai_operations" ("parent_operation_id");

-- ===========================================================================
-- ROLLBACK (se necessário) — NÃO destrói metadados silenciosamente:
-- primeiro faz BACKUP dos metadados para uma tabela de preservação, depois
-- remove as colunas. O backup pode ser restaurado antes do DROP final.
--
--   DROP TABLE IF EXISTS "ai_operations_classifier_metadata_backup";
--   CREATE TABLE "ai_operations_classifier_metadata_backup" AS
--     SELECT id, classification, classification_reason, warnings, prompt_version,
--            parent_operation_id, sub_operations
--     FROM "ai_operations"
--     WHERE classification IS NOT NULL
--        OR classification_reason IS NOT NULL
--        OR warnings IS NOT NULL
--        OR prompt_version IS NOT NULL
--        OR parent_operation_id IS NOT NULL
--        OR sub_operations IS NOT NULL;
--
--   DROP INDEX IF EXISTS "ai_operations_parent_idx";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "classification";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "classification_reason";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "warnings";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "prompt_version";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "parent_operation_id";
--   ALTER TABLE "ai_operations" DROP COLUMN IF EXISTS "sub_operations";
--
-- Restauração a partir do backup (antes do re-aplicar):
--   UPDATE "ai_operations" a
--   SET classification = b.classification, classification_reason = b.classification_reason,
--       warnings = b.warnings, prompt_version = b.prompt_version,
--       parent_operation_id = b.parent_operation_id, sub_operations = b.sub_operations
--   FROM "ai_operations_classifier_metadata_backup" b
--   WHERE a.id = b.id;
-- ===========================================================================
