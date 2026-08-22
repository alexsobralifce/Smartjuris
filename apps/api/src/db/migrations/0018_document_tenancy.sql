-- Fase 2A: isolamento multi-tenant de documentos/chunks + metadados mínimos.
-- Documentos antigos SEM escopo entram em quarentena (indexed_status='unscoped'):
-- não são retornados em buscas de nenhum escritório e não participam do RAG até
-- o root associá-los manualmente (nunca inventamos o dono).

ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "escritorio_id" uuid;
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "processo_id" uuid REFERENCES "processos"("id");
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "total_pages" integer;
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "indexed_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "failed_chunks" integer NOT NULL DEFAULT 0;
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "indexed_at" timestamp with time zone;
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS "escritorio_id" uuid;
ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS "processo_id" uuid;

-- Quarentena de registros legados sem escopo (nunca atribuir a um escritório).
UPDATE "documentos"
SET "indexed_status" = 'unscoped'
WHERE "escritorio_id" IS NULL
  AND "indexed_status" = 'pending';

CREATE INDEX IF NOT EXISTS "documentos_escritorio_idx" ON "documentos" ("escritorio_id");
CREATE INDEX IF NOT EXISTS "chunks_escritorio_idx" ON "chunks" ("escritorio_id");
CREATE INDEX IF NOT EXISTS "chunks_escritorio_colecao_idx" ON "chunks" ("escritorio_id", "colecao");
