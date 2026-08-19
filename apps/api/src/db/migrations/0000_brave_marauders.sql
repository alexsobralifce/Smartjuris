CREATE TABLE IF NOT EXISTS "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid,
	"colecao" text NOT NULL,
	"texto" text NOT NULL,
	"embedding" vector(1024),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"colecao" text NOT NULL,
	"tamanho" text NOT NULL,
	"indexado" timestamp with time zone DEFAULT now(),
	"chunks" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pecas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processo_id" uuid,
	"tipo" text NOT NULL,
	"area" text NOT NULL,
	"cliente" text NOT NULL,
	"status" text NOT NULL,
	"prazo" date NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now(),
	"modelo" text NOT NULL,
	"fontes" integer NOT NULL,
	"conteudo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"cliente" text NOT NULL,
	"adverso" text NOT NULL,
	"vara" text NOT NULL,
	"area" text NOT NULL,
	"status" text NOT NULL,
	"valor" text NOT NULL,
	"prazo" date NOT NULL,
	"advogado" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chunks" ADD CONSTRAINT "chunks_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pecas" ADD CONSTRAINT "pecas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_index" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);