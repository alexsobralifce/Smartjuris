import { db } from './db/client.js';
import { sql } from 'drizzle-orm';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('🔄 Running migrations...');
  try {
    // Enable pgvector extension
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
    
    // Drizzle migrations table
    await db.execute(sql`
      CREATE SCHEMA IF NOT EXISTS drizzle;
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    const migrationsDir = join(__dirname, 'db', 'migrations');
    
    let files: string[] = [];
    try {
      files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    } catch {
      console.log('No migrations directory found, skipping.');
      return;
    }

    // Get applied migrations
    const applied = await db.execute(sql`SELECT hash FROM drizzle.__drizzle_migrations`);
    const appliedHashes = new Set((applied as any).map((r: any) => r.hash));

    for (const file of files) {
      const hash = file.replace('.sql', '');
      if (appliedHashes.has(hash)) {
        console.log(`  ✓ Already applied: ${file}`);
        continue;
      }

      const { readFile } = await import('fs/promises');
      const sqlContent = await readFile(join(migrationsDir, file), 'utf-8');
      
      await db.execute(sql.raw(sqlContent));
      await db.execute(sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`);
      console.log(`  ✅ Applied: ${file}`);
    }

    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  }
}

migrate()
  .then(() => {
    console.log('🚀 Starting server...');
    import('./server.js');
  })
  .catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
