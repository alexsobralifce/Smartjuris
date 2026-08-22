-- ===========================================================================
-- 0022_lease_token.sql — Token de posse (fencing) do lease de análise.
--
-- Fase 3A (unidades de análise documental): o lease/heartbeat de execução de
-- um bloco precisa de um TOKEN DE POSSE dedicado e auditável, com semântica
-- própria. `fallback_reason` (motivo de fallback de modelo) NÃO é o lugar
-- para tokens de posse — esta migration adiciona `lease_token` a
-- `ai_operations`, usado exclusivamente pelo mecanismo de fencing da análise.
--
-- Compatível com dados legados: coluna nullable; registros existentes não são
-- alterados. Sem rollback destrutivo: DROP COLUMN simples.
-- ===========================================================================

-- Mitigação de bloqueio em produção: limite de espera do lock de tabela
-- (ALTER TABLE exige lock forte; com lock_timeout curto a migration falha
-- cedo em vez de bloquear escritas concorrentes em ai_operations).
SET LOCAL lock_timeout = '5s';

ALTER TABLE ai_operations ADD COLUMN IF NOT EXISTS lease_token text;

-- Sem CREATE INDEX aqui: o runner oficial aplica migrations dentro de uma
-- TRANSAÇÃO ÚNICA, onde CREATE INDEX CONCURRENTLY é proibido e CREATE INDEX
-- comum bloquearia escritas em ai_operations (tabela em uso). O acesso à
-- coluna é sempre por operationId (índice da PK) — nenhum índice adicional
-- é necessário para o fencing.

-- ===========================================================================
-- ROLLBACK (comentado — não executado automaticamente)
-- ===========================================================================
-- ALTER TABLE ai_operations DROP COLUMN IF EXISTS lease_token;
