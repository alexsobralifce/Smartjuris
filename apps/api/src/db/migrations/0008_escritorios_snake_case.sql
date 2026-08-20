-- Alinhar a tabela `escritorios` à convenção snake_case do schema Drizzle.
-- A migration 0007 (original) criou colunas camelCase (limiteUsuarios, limitePecasMes,
-- limiteProcessos), mas o Drizzle gera SQL com nomes snake_case (limite_usuarios,
-- limite_pecas_mes, limite_processos). Isso causava `column "limite_usuarios" does not
-- exist` → 500 nas rotas que leem limites (adminEscritorio, escritorios, rootStats).
-- Idempotente: usa INFORMATION_SCHEMA.COLUMNS para renomear apenas o que existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='escritorios' AND column_name='limiteUsuarios') THEN
    ALTER TABLE escritorios RENAME COLUMN "limiteUsuarios" TO limite_usuarios;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='escritorios' AND column_name='limitePecasMes') THEN
    ALTER TABLE escritorios RENAME COLUMN "limitePecasMes" TO limite_pecas_mes;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='escritorios' AND column_name='limiteProcessos') THEN
    ALTER TABLE escritorios RENAME COLUMN "limiteProcessos" TO limite_processos;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='escritorios' AND column_name='createdAt') THEN
    ALTER TABLE escritorios RENAME COLUMN "createdAt" TO created_at;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='escritorios' AND column_name='createdBy') THEN
    ALTER TABLE escritorios RENAME COLUMN "createdBy" TO created_by;
  END IF;
END $$;
