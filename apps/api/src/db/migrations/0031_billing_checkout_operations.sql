-- ===========================================================================
-- 0031_billing_checkout_operations.sql — Operações de checkout persistidas.
--
-- Resposta ao revisor (fase 7A, achado HIGH): protocolo explícito de
-- consistência/compensação para falhas após efeitos remotos.
--
-- Tabela de OPERAÇÕES de checkout (outbox leve): cada intenção de criar/
-- trocar assinatura é persistida com estado e chave de idempotência ANTES da
-- chamada ao Mercado Pago. Assim:
--   - retries usam a MESMA chave (idempotência estável por operação);
--   - se a chamada remota falhar após criar o preapproval, o id fica gravado
--     (reconciliação);
--   - falhas entre "chamada ao MP" e "gravação do id" são detectáveis e
--     recuperáveis (operações pendentes podem ser consultadas/reconciliadas).
--
-- Campos:
--   - idempotency_key: chave única da operação (escritorio_id:plano:uuid);
--   - estado: pending | created | done | failed | cancelled;
--   - mercado_pago_id: preapproval criado (gravado após a chamada);
--   - error: mensagem da falha (se houver).
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS billing_checkout_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  plano text NOT NULL,
  estado text NOT NULL DEFAULT 'pending',
  mercado_pago_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_checkout_operations_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS billing_checkout_operations_esc_idx
  ON billing_checkout_operations (escritorio_id, created_at);

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- DROP TABLE IF EXISTS billing_checkout_operations;
