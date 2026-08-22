-- Fase 4B (piloto controlado): metadados de upload — área e autor do documento.
-- O caminho piloto e o caminho normal persistem os MESMOS metadados; estas
-- colunas (nullable, sem backfill) tornam `area` e `usuario_id` consultáveis
-- diretamente no documento (antes só existiam no metadata do chunk/embedding).

ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "area" text;
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;

-- ===========================================================================
-- ROLLBACK (se necessário):
--   ALTER TABLE "documentos" DROP COLUMN IF EXISTS "usuario_id";
--   ALTER TABLE "documentos" DROP COLUMN IF EXISTS "area";
-- ===========================================================================
