-- ===========================================================================
-- 0030_billing_webhook_lease.sql — Lease/estado de processamento do webhook.
--
-- Resposta ao revisor (fase 7A, achado HIGH): aquisição atômica/exclusiva do
-- evento antes do processamento, com estado PROCESSANDO e retomada segura
-- contra concorrência.
--
-- Colunas adicionadas em billing_webhook_events:
--   - processando_em: quando o processamento atual começou (lease);
--   - attempts:       número de tentativas (para observabilidade/retry).
-- Semântica: um evento com result_status='PROCESSANDO' está sendo processado
-- por um worker; outro worker só pode retomá-lo se o lease expirou
-- (processando_em antigo) — evita efeitos duplicados em corridas.
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

ALTER TABLE billing_webhook_events
  ADD COLUMN IF NOT EXISTS processando_em timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE billing_webhook_events DROP COLUMN IF EXISTS processando_em;
-- ALTER TABLE billing_webhook_events DROP COLUMN IF EXISTS attempts;
