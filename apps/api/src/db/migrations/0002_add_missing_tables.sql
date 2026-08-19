-- Migration: Add missing tables (andamentos, lancamentos_financeiros, timesheet, clientes)
-- This migration adds tables that were defined in schema.ts but never created

CREATE TABLE IF NOT EXISTS "andamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processo_id" uuid,
	"data" timestamp with time zone DEFAULT now(),
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"resumo_ia" text,
	"prazo_fatal" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lancamentos_financeiros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processo_id" uuid,
	"cliente" text NOT NULL,
	"tipo" text NOT NULL,
	"valor" text NOT NULL,
	"vencimento" text NOT NULL,
	"status" text DEFAULT 'pendente'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timesheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processo_id" uuid,
	"advogado" text NOT NULL,
	"descricao" text NOT NULL,
	"minutos" integer NOT NULL,
	"valor_hora" text DEFAULT '350,00',
	"faturado" text DEFAULT 'nao',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"cpf_cnpj" text NOT NULL,
	"email" text NOT NULL,
	"telefone" text NOT NULL,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"qualificacao" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "andamentos" ADD CONSTRAINT "andamentos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;