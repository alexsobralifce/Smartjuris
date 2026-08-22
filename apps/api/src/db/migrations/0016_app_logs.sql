-- Log de aplicação (syslog): eventos info/warn/error do runtime para o Painel Root.
CREATE TABLE IF NOT EXISTS "app_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"source" text,
	"method" text,
	"path" text,
	"status" integer,
	"ip" text,
	"usuario_id" uuid,
	"escritorio_id" uuid,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "app_logs_created_idx" ON "app_logs" USING btree ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "app_logs_level_idx" ON "app_logs" USING btree ("level");
