-- Fase 5E (granularidade de custo): cost_cents_reserved passa de integer para
-- numeric(10,2) — a reserva precisa distinguir volumes de tokens que, com
-- preços em centavos por milhão, colapsam para o mesmo centavo inteiro.
-- Dados legados inteiros (ex.: 10) viram numeric(10,2) sem perda (10.00).

ALTER TABLE "ai_operations"
  ALTER COLUMN "cost_cents_reserved" TYPE numeric(10,2)
  USING "cost_cents_reserved"::numeric(10,2);

-- ===========================================================================
-- ROLLBACK (se necessário):
--   ALTER TABLE "ai_operations"
--     ALTER COLUMN "cost_cents_reserved" TYPE integer
--     USING round("cost_cents_reserved")::integer;
-- ===========================================================================
