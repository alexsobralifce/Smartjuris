// Configura o PLAYWRIGHT_BROWSERS_PATH ANTES de o módulo playwright ser
// carregado (o playwright lê o env no import/registry). Os browsers ficam no
// workspace (tools/playwright-tutorial/.browsers) — o cache padrão
// (~/Library/Caches/ms-playwright) pode ser bloqueado por permissões/sandbox.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(ROOT, 'tools', 'playwright-tutorial', '.browsers');
