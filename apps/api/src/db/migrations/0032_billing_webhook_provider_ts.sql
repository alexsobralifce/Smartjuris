-- ===========================================================================
-- 0032_billing_webhook_provider_ts.sql — Ordenação/monotonicidade de eventos.
--
-- Resposta ao revisor (fase 7A, achado HIGH): processar cada evento de forma
-- idempotente e ORDENADA — eventos fora de ordem não devem regredir o estado.
--
-- Coluna `provedor_ts` em billing_webhook_events: timestamp/versão do recurso
-- no Mercado Pago (ex.: date_created/last_modified do preapproval ou payment).
-- Na aquisição, eventos cujo provedor_ts é MAIS ANTIGO que o último evento
-- aplicado para a mesma assinatura são rejeitados (transição obsoleta).
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

ALTER TABLE billing_webhook_events
  ADD COLUMN IF NOT EXISTS provedor_ts timestamptz;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE billing_webhook_events DROP COLUMN IF EXISTS provedor_ts;
