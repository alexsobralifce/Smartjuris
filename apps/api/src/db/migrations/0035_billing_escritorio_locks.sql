-- ===========================================================================
-- 0035_billing_escritorio_locks.sql — Lease atômico por escritório.
--
-- Resposta ao revisor (fase 7A, achado HIGH): claim/lease atômico por
-- escritorioId válido durante TODA a operação remota de checkout/troca —
-- impede checkout OU cancelamento concorrente do mesmo escritório.
--
-- O advisory lock transacional (pg_advisory_xact_lock) só dura a transação;
-- as chamadas remotas (Fase 2) ficam fora dela. Esta tabela dá um lock de
-- nível de aplicação por escritório, independente do pool de conexões:
--   - adquirir: INSERT ... ON CONFLICT (re-adquire se lease expirado);
--   - liberar:  DELETE (em sucesso E falha — finally);
--   - expiração: processando_em + TTL (worker morto não trava o escritório).
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS billing_escritorio_locks (
  escritorio_id uuid PRIMARY KEY,
  processando_em timestamptz NOT NULL DEFAULT now(),
  dono text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- DROP TABLE IF EXISTS billing_escritorio_locks;
