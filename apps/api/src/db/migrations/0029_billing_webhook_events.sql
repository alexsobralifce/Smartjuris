-- ===========================================================================
-- 0029_billing_webhook_events.sql — Idempotência persistida de webhooks.
--
-- Resposta ao revisor (fase 7A, achado HIGH): webhooks de pagamento devem
-- impedir replay e processar cada evento de forma idempotente e ordenada.
--
-- Tabela append-only de eventos processados, com chave única por
-- (tipo, data_id): o mesmo evento (mesmo tipo + mesmo id do recurso) só é
-- processado UMA vez — replays/reenvios do Mercado Pago são ignorados sem
-- efeito. `processed_at` e `resultado` dão rastreabilidade completa.
--
-- Compatível com dados legados: tabela nova, sem alteração de existentes.
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  data_id text NOT NULL,
  result_status text NOT NULL,
  result_detail text,
  escritorio_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Chave de idempotência: mesmo (tipo, data_id) nunca é processado 2x.
  CONSTRAINT billing_webhook_events_unique UNIQUE (event_type, data_id)
);

CREATE INDEX IF NOT EXISTS billing_webhook_events_esc_idx
  ON billing_webhook_events (escritorio_id, created_at);

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- DROP TABLE IF EXISTS billing_webhook_events;
