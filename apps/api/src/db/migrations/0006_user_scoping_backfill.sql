UPDATE processos SET usuario_id = (SELECT id FROM usuarios WHERE role = 'root' ORDER BY created_at LIMIT 1) WHERE usuario_id IS NULL;
UPDATE pecas SET usuario_id = (SELECT id FROM usuarios WHERE role = 'root' ORDER BY created_at LIMIT 1) WHERE usuario_id IS NULL;
UPDATE clientes SET usuario_id = (SELECT id FROM usuarios WHERE role = 'root' ORDER BY created_at LIMIT 1) WHERE usuario_id IS NULL;
UPDATE lancamentos_financeiros SET usuario_id = (SELECT id FROM usuarios WHERE role = 'root' ORDER BY created_at LIMIT 1) WHERE usuario_id IS NULL;
UPDATE timesheet SET usuario_id = (SELECT id FROM usuarios WHERE role = 'root' ORDER BY created_at LIMIT 1) WHERE usuario_id IS NULL;
UPDATE andamentos SET usuario_id = (SELECT id FROM usuarios WHERE role = 'root' ORDER BY created_at LIMIT 1) WHERE usuario_id IS NULL;
