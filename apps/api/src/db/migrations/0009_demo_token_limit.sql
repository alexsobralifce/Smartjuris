ALTER TABLE escritorios ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE escritorios ADD COLUMN IF NOT EXISTS limite_tokens_mes integer;
UPDATE escritorios SET is_demo = true, limite_tokens_mes = 10000
  WHERE nome = 'Escritório de Demonstração';
