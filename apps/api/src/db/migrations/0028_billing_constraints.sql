-- ===========================================================================
-- 0028_billing_constraints.sql — Invariantes de banco da assinatura.
--
-- Resposta ao revisor (fase 7A, achado MEDIUM): estados de assinatura e
-- planos devem ser restringidos por invariantes de banco — CHECK constraints
-- para `assinatura_status` e `assinatura_plano`, garantindo que valores
-- arbitrários nunca sejam persistidos (defesa em profundidade além da
-- validação no código).
--
-- Compatível com dados legados e com testes em SCHEMA ISOLADO: a verificação
-- de existência é escopada por `current_schema()` (e não por nome global em
-- pg_constraint), para que a constraint seja criada no schema onde a
-- migration roda — inclusive em schemas temporários de teste — sem duplicar
-- nem conflitar com o schema public.
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

-- Estados válidos da assinatura (espelha o código services/billing.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'escritorios_assinatura_status_check'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE format('ALTER TABLE %I.escritorios ADD CONSTRAINT escritorios_assinatura_status_check CHECK (assinatura_status IN (''nenhuma'', ''pendente'', ''ativa'', ''atrasada'', ''cancelada''))', current_schema());
  END IF;
END $$;

-- Planos válidos na assinatura (aliases canônicos aceitos).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'escritorios_assinatura_plano_check'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE format('ALTER TABLE %I.escritorios ADD CONSTRAINT escritorios_assinatura_plano_check CHECK (assinatura_plano IS NULL OR assinatura_plano IN (''basico'', ''profissional'', ''office''))', current_schema());
  END IF;
END $$;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE escritorios DROP CONSTRAINT IF EXISTS escritorios_assinatura_status_check;
-- ALTER TABLE escritorios DROP CONSTRAINT IF EXISTS escritorios_assinatura_plano_check;
