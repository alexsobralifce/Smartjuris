-- ===========================================================================
-- Fase 8A — Documentos do Cliente
-- Vincula documentos (e seus chunks, por herança de escopo) a um cliente do
-- MESMO escritório. O `cliente_id` é opcional (upload sem vínculo continua
-- permitido — compatibilidade regressiva) e o escopo do escritório permanece
-- obrigatório (nenhum documento sem escopo é retornado a usuários).
-- ===========================================================================

ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "cliente_id" uuid REFERENCES "clientes"("id");
CREATE INDEX IF NOT EXISTS "idx_documentos_cliente_id" ON "documentos"("cliente_id");

-- O chunk herda o cliente_id do documento de origem (mesmo padrão do
-- escritorio_id/processo_id), mantendo o escopo completo recuperável no RAG.
ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS "cliente_id" uuid REFERENCES "clientes"("id");
CREATE INDEX IF NOT EXISTS "idx_chunks_cliente_id" ON "chunks"("cliente_id");

-- ===========================================================================
-- ROLLBACK (se necessário):
--   ALTER TABLE "chunks" DROP COLUMN IF EXISTS "cliente_id";
--   ALTER TABLE "documentos" DROP COLUMN IF EXISTS "cliente_id";
-- ===========================================================================
