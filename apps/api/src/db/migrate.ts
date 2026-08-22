// ===========================================================================
// Runner oficial de migrations (extraído do startup.ts).
//
// Aplica migrations SQL de apps/api/src/db/migrations em ordem, registrando
// cada uma em drizzle.__drizzle_migrations (ou <schema>.drizzle_migrations
// quando `schema` é informado — usado por testes isolados).
//
// Comportamento:
//   - idempotente: verifica o registro antes de executar;
//   - conteúdo com hash sha256: arquivo modificado após aplicação FALHA
//     (revisão manual requerida);
//   - registros legados sem content_hash exigem `allowLegacyBackfill` explícito;
//   - lock global: toda a execução roda numa transação única com
//     pg_advisory_xact_lock, serializando concorrência e impedindo
//     aplicação/registro duplicado;
//   - cada migration roda dentro da transação (rollback total em falha).
// ===========================================================================

import { db, client } from './client.js';
import { sql } from 'drizzle-orm';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';

export interface RunMigrationsOptions {
  /** Schema isolado (testes). Quando informado, a tabela de controle e o
   *  search_path da transação usam esse schema — nada é tocado no schema real. */
  schema?: string;
  /** Diretório de migrations (override para testes; padrão: autodescoberta). */
  migrationsDir?: string;
  /** Autoriza explicitamente o backfill de content_hash de registros legados
   *  (instalações anteriores à coluna content_hash). Sem esta flag, o runner
   *  FALHA ao encontrar registros legados — o operador deve revisar e optar
   *  pelo backfill conscientemente. */
  allowLegacyBackfill?: boolean;
}

export interface RunMigrationsResult {
  applied: string[];
  skipped: string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Valida que o identificador de schema é seguro (evita injeção em SQL raw). */
function validarSchemaIdentificador(schema: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Nome de schema inválido: ${JSON.stringify(schema)}`);
  }
}

/** Chave do advisory lock (evita execuções concorrentes de migrations). */
const MIGRATION_LOCK_KEY = 0x534d4152; // "SMAR" (SmartJuris migrations)

/**
 * Garante constraint UNIQUE em `hash` na tabela de controle, inclusive em
 * tabelas legadas (criadas sem a constraint). Se houver hashes duplicados,
 * FALHA com mensagem clara (exige correção manual) — nunca deduplica
 * silenciosamente.
 */
async function garantirUniqueHash(tx: any, controlTable: string, schemaNome: string | undefined): Promise<void> {
  const tabela = controlTable.includes('__drizzle_migrations') ? '__drizzle_migrations' : 'drizzle_migrations';
  const schemaname = schemaNome ?? (tabela === '__drizzle_migrations' ? 'drizzle' : 'public');
  const idxRows = await tx.unsafe(`
    SELECT 1 FROM pg_indexes
    WHERE schemaname = $1 AND tablename = $2 AND indexdef ILIKE '%(hash)%'
    LIMIT 1
  `, [schemaname, tabela]);
  if (idxRows.length > 0) return; // já existe índice único em hash

  const dup = await tx.unsafe(`
    SELECT hash, COUNT(*)::int AS n FROM ${controlTable} GROUP BY hash HAVING COUNT(*) > 1
  `);
  if (dup.length > 0) {
    throw new Error(
      'Tabela de migrations com hashes DUPLICADOS: ' +
        dup.map((d: any) => `${d.hash} (${d.n}x)`).join(', ') +
        '. Correção manual requerida antes de adicionar a restrição UNIQUE.',
    );
  }
  // Índice único com nome FIXO (sem qualificação de schema no nome do índice;
  // o schema é definido pelo controlTable — nomes duplicados em schemas
  // distintos são aceitos pelo PostgreSQL porque os índices são por schema).
  await tx.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS drizzle_migrations_hash_unique ON ${controlTable} (hash);`);
}

export async function runMigrations(opts: RunMigrationsOptions = {}): Promise<RunMigrationsResult> {
  const { schema, migrationsDir: migrationsDirOverride, allowLegacyBackfill } = opts;
  const applied: string[] = [];
  const skipped: string[] = [];

  // Validação ANTES de qualquer alteração no banco (fail-fast):
  if (schema) validarSchemaIdentificador(schema);

  let migrationsDir = migrationsDirOverride ?? '';
  if (!migrationsDir) {
    const candidateDirs = [
      join(__dirname, 'migrations'),
      join(process.cwd(), 'apps', 'api', 'src', 'db', 'migrations'),
      join(process.cwd(), 'src', 'db', 'migrations'),
    ];
    for (const dir of candidateDirs) {
      if (existsSync(dir)) {
        migrationsDir = dir;
        break;
      }
    }
  }
  if (!migrationsDir || !existsSync(migrationsDir)) {
    throw new Error('Nenhum diretório de migrations encontrado (ou override inválido): ' + (migrationsDirOverride ?? '(autodescoberta)'));
  }

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const controlTable = schema
    ? `"${schema}"."drizzle_migrations"`
    : `drizzle."__drizzle_migrations"`;

  // Transação ÚNICA com lock global: serializa concorrência e garante que a
  // leitura do estado + aplicação + registro são atômicos (nenhuma duplicação).
  return client.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);

    if (schema) {
      await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS "${schema}"."drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL UNIQUE,
          created_at bigint
        );
      `);
    } else {
      // Enable pgvector extension (apenas no fluxo normal/produção).
      await tx.unsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
      await tx.unsafe(`
        CREATE SCHEMA IF NOT EXISTS drizzle;
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL UNIQUE,
          created_at bigint
        );
      `);
    }

    // Coluna content_hash (backward compatible).
    if (schema) {
      await tx.unsafe(`ALTER TABLE "${schema}"."drizzle_migrations" ADD COLUMN IF NOT EXISTS content_hash text;`);
    } else {
      await tx.unsafe(`ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN IF NOT EXISTS content_hash text;`);
    }

    // Garantia de UNIQUE em hash em tabelas LEGADAS (CREATE TABLE IF NOT EXISTS
    // não adiciona a constraint a tabelas antigas). Detecta duplicados antes
    // de criar a restrição — falha com mensagem clara se houver.
    if (schema) {
      await garantirUniqueHash(tx, `"${schema}"."drizzle_migrations"`, schema);
    } else {
      await garantirUniqueHash(tx, `drizzle."__drizzle_migrations"`, undefined);
    }

    // Estado aplicado (dentro da mesma transação + lock).
    const appliedRows = await tx.unsafe(`SELECT hash, content_hash FROM ${controlTable}`);
    const appliedMap = new Map<string, string | null>();
    for (const row of appliedRows as any[]) {
      appliedMap.set(row.hash, row.content_hash ?? null);
    }

    for (const file of files) {
      const name = file.replace('.sql', '');
      const sqlContent = await readFile(join(migrationsDir, file), 'utf-8');
      const contentHash = createHash('sha256').update(sqlContent).digest('hex');
      const prior = appliedMap.get(name);

      if (prior !== undefined) {
        if (prior === contentHash) {
          skipped.push(name);
          console.log(`  ✓ Already applied: ${file}`);
          continue;
        }
        if (prior === null) {
          if (allowLegacyBackfill !== true) {
            throw new Error(
              `Migration ${file} está registrada sem content_hash (registro legado). ` +
                'Para continuar, revise o histórico e autorize explicitamente o backfill ' +
                '(runMigrations({ allowLegacyBackfill: true })) — sem isso o arquivo atual ' +
                'não é aceito como prova do conteúdo aplicado.',
            );
          }
          await tx.unsafe(
            `UPDATE ${controlTable} SET content_hash = $1 WHERE hash = $2`,
            [contentHash, name],
          );
          skipped.push(name);
          console.log(
            `  ✓ Already applied (legacy record, content_hash backfilled com autorização explícita): ${file}`,
          );
          continue;
        }
        throw new Error(
          `Migration ${file} foi modificada após ter sido aplicada (content_hash divergente). ` +
            'Revisão manual requerida: reverta a alteração ou aplique uma nova migration.',
        );
      }

      // Aplica a migration DENTRO da transação (rollback total em falha).
      if (schema) {
        await tx.unsafe(`SET LOCAL search_path TO "${schema}", public;`);
      }
      await tx.unsafe(sqlContent);
      await tx.unsafe(
        `INSERT INTO ${controlTable} (hash, content_hash, created_at) VALUES ($1, $2, $3)`,
        [name, contentHash, Date.now()],
      );
      applied.push(name);
      console.log(`  ✅ Applied: ${file}`);
    }

    console.log('✅ Migrations complete.');
    return { applied, skipped };
  });
}
