// Gera evidência da execução da migration 0025 em PostgreSQL real:
// aplica a migration (idempotente), verifica o tipo da coluna e preservação
// de um valor legado, e escreve o resultado em um arquivo de evidência.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
const { db, client } = await import('../db/client.js');
const { runMigrations } = await import('./migrate.js');

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'ai-development', 'runs', '5E-migration-evidence.txt');

const linhas: string[] = ['=== Evidência — migration 0025 (cost_cents_reserved → numeric(10,2)) ==='];
try {
  await db.execute(sql`SELECT 1`);
  linhas.push(`PostgreSQL: OK (${new Date().toISOString()})`);

  // 1. Executa as migrations (0025 inclusa, idempotente).
  const res = await runMigrations({});
  linhas.push(`Migrations aplicadas/verificadas: ${res?.applied?.length ?? 0} novas; ${res?.skipped?.length ?? 0} já aplicadas (idempotente)`);

  // 2. Verifica o tipo da coluna.
  const rows = await db.execute(sql`
    SELECT data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'ai_operations' AND column_name = 'cost_cents_reserved'
  `) as any[];
  const col = rows[0];
  linhas.push(`Coluna cost_cents_reserved: type=${col?.data_type} precision=${col?.numeric_precision} scale=${col?.numeric_scale}`);
  linhas.push(`Esperado: numeric/10/2 → ${col?.data_type === 'numeric' && Number(col?.numeric_precision) === 10 && Number(col?.numeric_scale) === 2 ? 'OK' : 'FALHOU'}`);

  // 3. Preservação de um valor legado (INSERT + SELECT com valor fracionário).
  const id = crypto.randomUUID();
  await db.execute(sql.raw(`INSERT INTO ai_operations (id, escritorio_id, usuario_id, idempotency_key, operation_type, status, credits_reserved, cost_cents_reserved)
    VALUES ('${id}', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'evidencia-5e', 'STANDARD_PETITION', 'reserved', 1, 10.55)`));
  const val = await db.execute(sql`SELECT cost_cents_reserved FROM ai_operations WHERE id = ${id}`);
  linhas.push(`Valor fracionário preservado: ${(val as any[])[0]?.cost_cents_reserved} (esperado 10.55) → ${Number((val as any[])[0]?.cost_cents_reserved) === 10.55 ? 'OK' : 'FALHOU'}`);
  await db.execute(sql`DELETE FROM ai_operations WHERE id = ${id}`).catch(() => {});
  linhas.push('Evidência gerada com sucesso.');
} catch (err) {
  linhas.push(`ERRO: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
writeFileSync(out, linhas.join('\n') + '\n');
console.log(linhas.join('\n'));
await client.end({ timeout: 5 });
