-- Fase 5I (granularidade de custo — telemetria): credit_ledger.cost_cents
-- passa de integer para numeric(10,2) — a telemetria de eventos de custo
-- (RESERVE/SETTLE/RELEASE/ADJUST) precisa registrar o custo reservado com a
-- nova precisão de centésimos (ex.: 1.55), sem renomear o campo (leitores que
-- esperam número inteiro continuam funcionando: Number('22') = 22).
-- Dados legados inteiros (ex.: -10) viram numeric(10,2) sem perda (-10.00).

ALTER TABLE "credit_ledger"
  ALTER COLUMN "cost_cents" TYPE numeric(10,2)
  USING "cost_cents"::numeric(10,2);

-- ===========================================================================
-- ROLLBACK (se necessário):
--   ALTER TABLE "credit_ledger"
--     ALTER COLUMN "cost_cents" TYPE integer
--     USING round("cost_cents")::integer;
-- ===========================================================================
