ALTER TABLE "processos" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;
--> statement-breakpoint
ALTER TABLE "lancamentos_financeiros" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;
--> statement-breakpoint
ALTER TABLE "timesheet" ADD COLUMN IF NOT EXISTS "usuario_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "processos" ADD CONSTRAINT "processos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
