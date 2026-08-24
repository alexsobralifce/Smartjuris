-- ===========================================================================
-- 0037_promocao_constraints.sql — Integridade dos dados promocionais (Fase 7B).
--
-- CHECK constraints em escritorios para os dados financeiros da promoção:
--   - promocao_valor_cents >= 0 (nunca negativo);
--   - promocao_percentual IS NULL OU entre 1 e 99 (inteiro);
--   - promocao_plano dentro do catálogo (basico/profissional/office) quando preenchido.
-- Independe do chamador: o banco rejeita valores inválidos mesmo se o código
-- falhar. Nomes fixos → idempotente; dados legados NULL passam (checks com
-- IS NULL permitido).
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'escritorios_promocao_valor_cents_check'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE format('ALTER TABLE %I.escritorios ADD CONSTRAINT escritorios_promocao_valor_cents_check CHECK (promocao_valor_cents IS NULL OR promocao_valor_cents >= 0)', current_schema());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'escritorios_promocao_percentual_check'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE format('ALTER TABLE %I.escritorios ADD CONSTRAINT escritorios_promocao_percentual_check CHECK (promocao_percentual IS NULL OR (promocao_percentual >= 1 AND promocao_percentual <= 99))', current_schema());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'escritorios_promocao_plano_check'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE format('ALTER TABLE %I.escritorios ADD CONSTRAINT escritorios_promocao_plano_check CHECK (promocao_plano IS NULL OR promocao_plano IN (''basico'', ''profissional'', ''office''))', current_schema());
  END IF;
END $$;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE escritorios DROP CONSTRAINT IF EXISTS escritorios_promocao_valor_cents_check;
-- ALTER TABLE escritorios DROP CONSTRAINT IF EXISTS escritorios_promocao_percentual_check;
-- ALTER TABLE escritorios DROP CONSTRAINT IF EXISTS escritorios_promocao_plano_check;
