-- ===========================================================================
-- 0033_billing_webhook_event_state.sql — Deduplicação por transição de estado.
--
-- Resposta ao revisor (fase 7A, achado HIGH): separar a deduplicação de
-- TRANSPORTE da ordenação de ESTADO. O mesmo recurso do Mercado Pago (mesmo
-- data.id) emite MÚLTIPLAS notificações conforme o estado muda (ex.:
-- subscription_preapproval: pending → authorized → cancelled). A chave única
-- (event_type, data_id) impedia processar a segunda transição do mesmo recurso.
--
-- Nova coluna `data_estado` (status do recurso na notificação) incorporada à
-- chave única: cada TRANSIÇÃO do recurso é um evento distinto, processado 1x.
-- A ordenação por provedor_ts (0032) continua impedindo regressões.
--
-- Compatível com dados legados: a constraint antiga é removida e recriada com
-- a coluna nova; registros existentes ganham data_estado NULL.
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

ALTER TABLE billing_webhook_events
  ADD COLUMN IF NOT EXISTS data_estado text;

-- Recria a chave única incluindo o estado do recurso.
ALTER TABLE billing_webhook_events DROP CONSTRAINT IF EXISTS billing_webhook_events_unique;
CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_events_unique
  ON billing_webhook_events (event_type, data_id, data_estado);

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- DROP INDEX IF EXISTS billing_webhook_events_unique;
-- ALTER TABLE billing_webhook_events DROP COLUMN IF EXISTS data_estado;
-- CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_events_unique
--   ON billing_webhook_events (event_type, data_id);
