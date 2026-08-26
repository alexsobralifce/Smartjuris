-- ===========================================================================
-- Fase 8B — Limite de storage 1GB por escritório
-- `size_bytes` (bigint) guarda o tamanho em bytes do arquivo original no
-- documento. O total por escritório (SUM) alimenta a checagem do upload e a
-- barra de storage do frontend. Registros legados entram com 0 (sem backfill).
-- ===========================================================================

ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "size_bytes" bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "idx_documentos_escritorio_size" ON "documentos"("escritorio_id", "size_bytes");

-- ===========================================================================
-- ROLLBACK (se necessário):
--   ALTER TABLE "documentos" DROP COLUMN IF EXISTS "size_bytes";
-- ===========================================================================
