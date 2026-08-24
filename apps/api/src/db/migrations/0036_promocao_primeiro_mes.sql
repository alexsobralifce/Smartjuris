-- ===========================================================================
-- 0036_promocao_primeiro_mes.sql — Promoção de boas-vindas (Fase 7B).
--
-- Campos de uso da promoção em escritorios (anti-abuso: 1x por escritório;
-- cancelar/re-assinar NÃO reaplica). O valor promocional é calculado no
-- backend (services/promocao.ts) — estes campos apenas REGISTRAM o uso.
--
-- Compatível com dados legados: colunas nullable, sem alteração de existentes.
-- ===========================================================================

SET LOCAL lock_timeout = '5s';

ALTER TABLE escritorios
  ADD COLUMN IF NOT EXISTS promocao_usada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promocao_plano text,
  ADD COLUMN IF NOT EXISTS promocao_valor_cents integer,
  ADD COLUMN IF NOT EXISTS promocao_percentual integer,
  ADD COLUMN IF NOT EXISTS promocao_ativa_em timestamptz;

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE escritorios
--   DROP COLUMN IF EXISTS promocao_usada,
--   DROP COLUMN IF EXISTS promocao_plano,
--   DROP COLUMN IF EXISTS promocao_valor_cents,
--   DROP COLUMN IF EXISTS promocao_percentual,
--   DROP COLUMN IF EXISTS promocao_ativa_em;
