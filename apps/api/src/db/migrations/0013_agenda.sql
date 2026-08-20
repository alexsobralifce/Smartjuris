-- Agenda: campo dataNascimento em clientes (nullable) + tabela eventos (soft-delete)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_nascimento date;

CREATE TABLE IF NOT EXISTS eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL,
  inicio timestamptz NOT NULL,
  fim timestamptz,
  dia_inteiro boolean NOT NULL DEFAULT false,
  processo_id uuid REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  cor text,
  usuario_id uuid REFERENCES usuarios(id),
  escritorio_id uuid REFERENCES escritorios(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS eventos_escritorio_inicio_idx ON eventos(escritorio_id, inicio);
