ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "ultimo_login" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "created_by" uuid;
--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;
--> statement-breakpoint
ALTER TABLE "andamentos" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"email_tentado" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"sucesso" boolean NOT NULL,
	"motivo_falha" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"modelo" text NOT NULL,
	"operacao" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"custo_usd" numeric(12,6) DEFAULT '0',
	"custo_brl" numeric(12,6) DEFAULT '0',
	"horario_pico" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentos_gerados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"documento_id" uuid,
	"peca_id" uuid,
	"tipo" text NOT NULL,
	"titulo" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"acao" text NOT NULL,
	"alvo_id" uuid,
	"alvo_email" text,
	"detalhes" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logins_usuario" ON "logins" ("usuario_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logins_created" ON "logins" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_token_usage_usuario" ON "token_usage" ("usuario_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_token_usage_created" ON "token_usage" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documentos_gerados_usuario" ON "documentos_gerados" ("usuario_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "logins" ADD CONSTRAINT "logins_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentos_gerados" ADD CONSTRAINT "documentos_gerados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentos_gerados" ADD CONSTRAINT "documentos_gerados_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentos_gerados" ADD CONSTRAINT "documentos_gerados_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_usuarios_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
