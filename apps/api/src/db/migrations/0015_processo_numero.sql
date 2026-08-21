-- Número do processo (ex.: 0001234-56.2026.8.26.0100) para qualificação e peças.
ALTER TABLE "processos" ADD COLUMN IF NOT EXISTS "numero" text;
