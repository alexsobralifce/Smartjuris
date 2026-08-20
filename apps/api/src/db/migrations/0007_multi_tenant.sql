-- Extensão pgcrypto para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabela de escritórios (tenants)
CREATE TABLE escritorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  plano text NOT NULL DEFAULT 'basico',
  limite_usuarios integer NOT NULL DEFAULT 2,
  limite_pecas_mes integer NOT NULL DEFAULT 50,
  limite_processos integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES usuarios(id)
);
CREATE INDEX escritorios_ativo_idx ON escritorios(ativo);

-- Permissões granulares por módulo (apenas para role='user')
CREATE TABLE permissoes_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (usuario_id, modulo)
);
CREATE INDEX permissoes_usuario_idx ON permissoes_usuario(usuario_id);

-- escritorioId + precisaTrocarSenha em usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS precisa_trocar_senha boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS usuarios_escritorio_idx ON usuarios(escritorio_id);

-- escritorioId em TODAS as tabelas de negócio
ALTER TABLE processos ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
ALTER TABLE pecas ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
ALTER TABLE andamentos ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
ALTER TABLE lancamentos_financeiros ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
ALTER TABLE timesheet ADD COLUMN IF NOT EXISTS escritorio_id uuid REFERENCES escritorios(id);
CREATE INDEX IF NOT EXISTS processos_escritorio_idx ON processos(escritorio_id);
CREATE INDEX IF NOT EXISTS pecas_escritorio_idx ON pecas(escritorio_id);
CREATE INDEX IF NOT EXISTS clientes_escritorio_idx ON clientes(escritorio_id);
CREATE INDEX IF NOT EXISTS andamentos_escritorio_idx ON andamentos(escritorio_id);

-- MIGRAÇÃO RETROATIVA
DO $$
DECLARE demo_id uuid;
BEGIN
  INSERT INTO escritorios (nome, plano, created_by)
    VALUES ('Escritório de Demonstração', 'basico', NULL)
    RETURNING id INTO demo_id;

  UPDATE usuarios SET escritorio_id = demo_id
    WHERE escritorio_id IS NULL AND role <> 'root';

  UPDATE usuarios SET role = 'admin'
    WHERE email = 'admin@smartjuris.com' AND escritorio_id = demo_id;

  UPDATE processos SET escritorio_id = demo_id WHERE escritorio_id IS NULL;
  UPDATE pecas SET escritorio_id = demo_id WHERE escritorio_id IS NULL;
  UPDATE clientes SET escritorio_id = demo_id WHERE escritorio_id IS NULL;
  UPDATE andamentos SET escritorio_id = demo_id WHERE escritorio_id IS NULL;
  UPDATE lancamentos_financeiros SET escritorio_id = demo_id WHERE escritorio_id IS NULL;
  UPDATE timesheet SET escritorio_id = demo_id WHERE escritorio_id IS NULL;

  -- Permissões default para users existentes do Demo (padrão do plano anexo)
  INSERT INTO permissoes_usuario (usuario_id, modulo, ativo)
    SELECT id, m, true FROM usuarios, unnest(ARRAY[
      'processos','clientes','pecas','validacao','jurimetria','contratos','documentacao'
    ]) AS m
    WHERE escritorio_id = demo_id AND role = 'user'
    ON CONFLICT (usuario_id, modulo) DO NOTHING;
END $$;
