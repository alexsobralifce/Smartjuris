ALTER TABLE "pecas" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN IF NOT EXISTS "updated_by" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pecas" ADD CONSTRAINT "pecas_updated_by_usuarios_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
