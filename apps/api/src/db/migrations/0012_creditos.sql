-- Créditos mensais por usuário (override individual, usado em escritórios demo).
-- 1 crédito = 1 token. `NULL` = herda o saldo do escritório.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creditos_mes integer;

-- Invariantes: créditos nunca negativos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_creditos_mes_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_creditos_mes_check
      CHECK (creditos_mes IS NULL OR creditos_mes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escritorios_limite_tokens_mes_check') THEN
    ALTER TABLE escritorios ADD CONSTRAINT escritorios_limite_tokens_mes_check
      CHECK (limite_tokens_mes IS NULL OR limite_tokens_mes >= 0);
  END IF;
END $$;
