-- ===========================================================================
-- 0034_billing_checkout_lease.sql — Fase explícita + resultado incerto + lease.
--
-- Resposta ao revisor (fase 7A, achado HIGH): operações `failed` potencialmente
-- AMBÍGUAS (timeout/5xx após efeito remoto) devem ser reprocessáveis por
-- RECONCILIAÇÃO antes de gerar nova idempotencyKey; distinguir falha
-- CONFIRMADA de resultado INCERTO; claim/lease atômico da operação para
-- impedir chamadas remotas concorrentes.
--
-- Colunas adicionadas em billing_checkout_operations:
--   - fase:            etapa atual (pending | cancelando | criando | gravando |
--                      done) — persistência explícita da transição;
--   - resultado_incerto: true quando o resultado remoto é ambíguo (ex.: timeout
--                      após criar o preapproval) — retry deve reconciliar;
--   - processando_em:  lease atômico da operação (quem a executa).
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

ALTER TABLE billing_checkout_operations
  ADD COLUMN IF NOT EXISTS fase text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resultado_incerto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processando_em timestamptz;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE billing_checkout_operations
--   DROP COLUMN IF EXISTS fase,
--   DROP COLUMN IF EXISTS resultado_incerto,
--   DROP COLUMN IF EXISTS processando_em;
