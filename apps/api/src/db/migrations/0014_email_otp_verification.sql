ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "email_verificado" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "codigos_verificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text DEFAULT 'registro' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"utilizado" boolean DEFAULT false NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "codigos_verificacao_email_idx" ON "codigos_verificacao" USING btree ("email");
