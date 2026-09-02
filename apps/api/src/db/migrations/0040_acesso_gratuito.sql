-- ===========================================================================
-- Fase 1 — Acesso gratuito/cortesia concedido pelo root
-- `isento_mensalidade` (boolean) marca escritórios que usam o sistema SEM
-- cobrança de mensalidade (cortesia do root). O gate `decidirTrava` libera e o
-- billing.status retorna `acesso: 'cortesia'`. Não afeta assinaturas pagas.
-- ===========================================================================

ALTER TABLE "escritorios" ADD COLUMN IF NOT EXISTS "isento_mensalidade" boolean NOT NULL DEFAULT false;

-- ===========================================================================
-- ROLLBACK (se necessário):
--   ALTER TABLE "escritorios" DROP COLUMN IF EXISTS "isento_mensalidade";
-- ===========================================================================
