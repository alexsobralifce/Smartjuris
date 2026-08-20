import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

function findEnv(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, '..');
  }
  return undefined;
}

const envPath = findEnv();
if (envPath) dotenv.config({ path: envPath });
dotenv.config({ path: resolve(process.cwd(), '.env') });
