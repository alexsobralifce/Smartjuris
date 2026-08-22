-- Camada de créditos: operações de IA auditáveis, ledger e saldo/reserva do escritório.
-- Valores monetários SEMPRE em centavos inteiros (integer).

ALTER TABLE "escritorios" ADD COLUMN IF NOT EXISTS "credits_available" integer NOT NULL DEFAULT 0;
ALTER TABLE "escritorios" ADD COLUMN IF NOT EXISTS "reserve_cents_used" integer NOT NULL DEFAULT 0;
ALTER TABLE "escritorios" ADD COLUMN IF NOT EXISTS "cycle_month" text NOT NULL DEFAULT to_char(now(), 'YYYY-MM');

-- Backfill: saldo inicial do ciclo conforme o plano atual.
UPDATE "escritorios"
SET "credits_available" = CASE lower(coalesce("plano", 'basico'))
      WHEN 'pro' THEN 50
      WHEN 'office' THEN 100
      ELSE 20 END,
    "cycle_month" = to_char(now(), 'YYYY-MM')
WHERE "credits_available" = 0;

CREATE TABLE IF NOT EXISTS "ai_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"escritorio_id" uuid NOT NULL,
	"usuario_id" uuid,
	"operation_type" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"model" text,
	"model_used" text,
	"fallback_reason" text,
	"credits_reserved" integer DEFAULT 0 NOT NULL,
	"credits_settled" integer DEFAULT 0 NOT NULL,
	"cost_cents_reserved" integer DEFAULT 0 NOT NULL,
	"cost_cents_actual" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"max_input_tokens" integer,
	"max_output_tokens" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "ai_operations_esc_idx" ON "ai_operations" USING btree ("escritorio_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_operations_status_idx" ON "ai_operations" USING btree ("status");

CREATE TABLE IF NOT EXISTS "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"usuario_id" uuid,
	"operation_id" uuid,
	"operation_type" text,
	"kind" text NOT NULL,
	"credits_delta" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"model" text,
	"idempotency_key" text UNIQUE,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "credit_ledger_esc_idx" ON "credit_ledger" USING btree ("escritorio_id", "created_at" DESC);
