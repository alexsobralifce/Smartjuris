-- ===========================================================================
-- 0027_billing_mercado_pago.sql — Assinatura recorrente via Mercado Pago.
--
-- Adiciona os campos de billing/assinatura em `escritorios`:
--   - mercado_pago_id:        ID do preapproval (assinatura) no Mercado Pago
--   - mercado_pago_plan_id:   ID do plano (preapproval_plan) no Mercado Pago
--   - assinatura_status:      nenhuma | pendente | ativa | atrasada | cancelada
--   - assinatura_plano:       plano contratado na assinatura (basico/profissional/office)
--   - assinatura_proxima_cobranca / assinatura_ultima_cobranca: datas da recorrência
--   - assinatura_expiracao:   fim da vigência (assinatura cancelada/pausada)
--
-- Compatível com dados legados: todas as colunas nullable (ou com default),
-- registros existentes não são alterados. Sem rollback destrutivo.
-- ===========================================================================

-- Mitigação de bloqueio em produção (ALTER TABLE exige lock forte).
SET LOCAL lock_timeout = '5s';

ALTER TABLE escritorios
  ADD COLUMN IF NOT EXISTS mercado_pago_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_plan_id text,
  ADD COLUMN IF NOT EXISTS assinatura_status text NOT NULL DEFAULT 'nenhuma',
  ADD COLUMN IF NOT EXISTS assinatura_plano text,
  ADD COLUMN IF NOT EXISTS assinatura_proxima_cobranca timestamp with time zone,
  ADD COLUMN IF NOT EXISTS assinatura_ultima_cobranca timestamp with time zone,
  ADD COLUMN IF NOT EXISTS assinatura_expiracao timestamp with time zone;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE escritorios
--   DROP COLUMN IF EXISTS mercado_pago_id,
--   DROP COLUMN IF EXISTS mercado_pago_plan_id,
--   DROP COLUMN IF EXISTS assinatura_status,
--   DROP COLUMN IF EXISTS assinatura_plano,
--   DROP COLUMN IF EXISTS assinatura_proxima_cobranca,
--   DROP COLUMN IF EXISTS assinatura_ultima_cobranca,
--   DROP COLUMN IF EXISTS assinatura_expiracao;
