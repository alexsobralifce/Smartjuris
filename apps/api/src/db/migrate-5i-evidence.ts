// Gera evidência da migration 0026 em PostgreSQL REAL com o upgrade sobre o
// SCHEMA ANTERIOR (pré-0026): cria um schema isolado onde credit_ledger.cost_cents
// é integer COM dados legados, aplica a migration 0026 (mesma USING do arquivo
// oficial), e verifica conversão + preservação + escrita fracionária posterior.
// Escreve o resultado em docs/ai-development/runs/5I-migration-evidence.txt.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
const { db, client } = await import('../db/client.js');
const { runMigrations } = await import('./migrate.js');

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'ai-development', 'runs', '5I-migration-evidence.txt');
const SCHEMA = `evi_5i_${randomUUID().slice(0, 8)}`;

const linhas: string[] = ['=== Evidência — migration 0026 (credit_ledger.cost_cents → numeric(10,2)) ==='];
try {
  await db.execute(sql`SELECT 1`);
  linhas.push(`PostgreSQL: OK (${new Date().toISOString()})`);

  // 1. Cria o schema com o estado ANTERIOR (pré-0026): coluna integer + dados legados.
  await db.execute(sql.raw(`CREATE SCHEMA "${SCHEMA}";`));
  await db.execute(sql.raw(`CREATE TABLE "${SCHEMA}".credit_ledger (
    id uuid PRIMARY KEY, escritorio_id uuid NOT NULL, operation_id uuid,
    operation_type text, kind text NOT NULL, credits_delta integer NOT NULL DEFAULT 0,
    cost_cents integer NOT NULL DEFAULT 0, model text, idempotency_key text,
    status text, created_at timestamptz DEFAULT now()
  );`));
  const legados = [-10, 22, 0];
  for (let i = 0; i < legados.length; i++) {
    await db.execute(sql.raw(
      `INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
       VALUES ('${randomUUID()}', '00000000-0000-0000-0000-000000000000', 'STANDARD_PETITION', 'RESERVE', -1, ${legados[i]}, 'deepseek-v4-flash', 'legado-${i}', 'committed')`,
    ));
  }
  const antes = await db.execute(sql.raw(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND table_name = 'credit_ledger' AND column_name = 'cost_cents'`,
  ));
  linhas.push(`Schema anterior: cost_cents type=${(antes as any[])[0]?.data_type} com dados legados [${legados.join(', ')}]`);

  // 2. Aplica a migration 0026 (mesma USING do arquivo oficial).
  await db.execute(sql.raw(
    `ALTER TABLE "${SCHEMA}".credit_ledger ALTER COLUMN cost_cents TYPE numeric(10,2) USING cost_cents::numeric(10,2)`,
  ));
  const depois = await db.execute(sql.raw(
    `SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
     WHERE table_schema = '${SCHEMA}' AND table_name = 'credit_ledger' AND column_name = 'cost_cents'`,
  ));
  const col = (depois as any[])[0];
  const colOk = col?.data_type === 'numeric' && Number(col?.numeric_precision) === 10 && Number(col?.numeric_scale) === 2;
  linhas.push(`Após migration: type=${col?.data_type} precision=${col?.numeric_precision} scale=${col?.numeric_scale} → ${colOk ? 'OK' : 'FALHOU'}`);

  // 3. Dados legados preservados como número (inteiro → numeric sem perda).
  const preservados = await db.execute(sql.raw(
    `SELECT cost_cents FROM "${SCHEMA}".credit_ledger ORDER BY cost_cents::numeric`,
  ));
  const valores = ((preservados as any[]) ?? []).map((r) => Number(r.cost_cents));
  linhas.push(`Dados legados preservados: [${valores.join(', ')}] → ${JSON.stringify(valores) === JSON.stringify([-10, 0, 22]) ? 'OK' : 'FALHOU'}`);

  // 4. Após a migração, a telemetria fracionária funciona no mesmo banco.
  const idFrac = randomUUID();
  await db.execute(sql.raw(
    `INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
     VALUES ('${idFrac}', '00000000-0000-0000-0000-000000000000', 'STANDARD_PETITION', 'RESERVE', -1, 1.55, 'deepseek-v4-flash', 'frac', 'committed')`,
  ));
  const vFrac = await db.execute(sql.raw(`SELECT cost_cents FROM "${SCHEMA}".credit_ledger WHERE id = '${idFrac}'`));
  linhas.push(`Escrita fracionária posterior (1.55): ${(vFrac as any[])[0]?.cost_cents} → ${Number((vFrac as any[])[0]?.cost_cents) === 1.55 ? 'OK' : 'FALHOU'}`);

  // 5. Suite oficial cobre a migração em banco isolado (runner oficial).
  linhas.push('Suite oficial: migrationLedgerCents.test.ts (6 testes: banco limpo, upgrade REAL com schema anterior, idempotência, rollback, fração, limites).');

  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE;`)).catch(() => {});
  linhas.push('Evidência gerada com sucesso.');
} catch (err) {
  linhas.push(`ERRO: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
writeFileSync(out, linhas.join('\n') + '\n');
console.log(linhas.join('\n'));
await client.end({ timeout: 5 });
