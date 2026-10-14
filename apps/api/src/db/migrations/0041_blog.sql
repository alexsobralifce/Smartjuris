-- ===========================================================================
-- Blog automático (curadoria semanal com IA)
-- `blog_artigos`: artigos (rascunho → publicado) com fonte citada e capa gerada.
-- `blog_curadoria_execucoes`: uma linha por rodada da curadoria (relatório).
-- A imagem fica em bytea (webp ~100 KB; 3 artigos/semana) — sem bucket externo.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "blog_artigos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL UNIQUE,
  "tipo" text NOT NULL DEFAULT 'CURADORIA',
  "status" text NOT NULL DEFAULT 'RASCUNHO',
  "titulo" text NOT NULL,
  "descricao" text NOT NULL,
  "categoria" text NOT NULL,
  "autor" text NOT NULL DEFAULT 'Equipe SmartJuris',
  "resumo" text NOT NULL,
  "secoes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "faq" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fontes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "origem" jsonb,
  "imagem" bytea,
  "imagem_mime" text,
  "imagem_alt" text,
  "imagem_credito" text,
  "publicado_em" timestamptz,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "blog_artigos_status_chk" CHECK ("status" IN ('RASCUNHO','PUBLICADO','DESPUBLICADO')),
  CONSTRAINT "blog_artigos_tipo_chk" CHECK ("tipo" IN ('ORIGINAL','CURADORIA'))
);

CREATE INDEX IF NOT EXISTS "blog_artigos_status_pub_idx" ON "blog_artigos" ("status", "publicado_em");

CREATE TABLE IF NOT EXISTS "blog_curadoria_execucoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'EXECUTANDO',
  "origem" text NOT NULL DEFAULT 'MANUAL',
  "quantidade" integer NOT NULL DEFAULT 3,
  "geradas" integer NOT NULL DEFAULT 0,
  "relatorio" jsonb,
  "erro" text,
  "iniciado_em" timestamptz NOT NULL DEFAULT now(),
  "concluido_em" timestamptz,
  CONSTRAINT "blog_exec_status_chk" CHECK ("status" IN ('EXECUTANDO','OK','ERRO')),
  CONSTRAINT "blog_exec_origem_chk" CHECK ("origem" IN ('AGENDADA','MANUAL'))
);

CREATE INDEX IF NOT EXISTS "blog_exec_iniciado_idx" ON "blog_curadoria_execucoes" ("iniciado_em");

-- ===========================================================================
-- ROLLBACK (se necessário):
--   DROP TABLE IF EXISTS "blog_curadoria_execucoes";
--   DROP TABLE IF EXISTS "blog_artigos";
-- ===========================================================================
