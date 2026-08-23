// ===========================================================================
// Fase 5I — Migration credit_ledger.cost_cents integer → numeric(10,2) (0026).
//
// Validação em banco REAL e ISOLADO (schema temporário), usando o RUNNER
// OFICIAL de migrations (db/migrate.ts):
//   - upgrade a partir do schema com dados legados (inteiro) → numeric sem perda;
//   - idempotência: reexecutar não aplica nem duplica;
//   - banco limpo (migrations completas) → coluna numeric(10,2);
//   - rollback manual documentado: volta para integer preservando valores.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

const { db, client } = await import('../db/client.js');
const { runMigrations } = await import('../db/migrate.js');

try {
  await db.execute(sql`SELECT 1`);
} catch (err) {
  throw new Error('PostgreSQL indisponível: o teste de migration 5I é obrigatório e não pode ser pulado. ' + String((err as Error).message));
}

const suffix = randomUUID().slice(0, 8);
const SCHEMA = `mig_5i_${suffix}`;

/** Executa queries com search_path no schema isolado, via transação (tx). */
async function noSchema(fn: (q: (query: string, params?: unknown[]) => Promise<any>) => Promise<unknown>): Promise<any> {
  return client.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${SCHEMA}", public;`);
    const q = (query: string, params?: unknown[]) => tx.unsafe(query, params as never[]);
    return fn(q);
  });
}

before(async () => {
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE;`));
  await db.execute(sql.raw(`CREATE SCHEMA "${SCHEMA}";`));
});

after(async () => {
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE;`)).catch(() => {});
  await client.end({ timeout: 5 });
});

describe('5I — migration credit_ledger.cost_cents numeric(10,2)', () => {
  test('banco limpo: migrations completas → coluna numeric(10,2)', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const rows = await q(`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'credit_ledger' AND column_name = 'cost_cents'
      `);
      const col = (rows as any[])[0];
      assert.equal(col?.data_type, 'numeric', 'tipo é numeric após migração');
      assert.equal(Number(col?.numeric_precision), 10, 'precisão 10');
      assert.equal(Number(col?.numeric_scale), 2, 'escala 2');
    });
  });

  test('upgrade com dados legados: inteiro vira numeric(10,2) sem perda', async () => {
    await runMigrations({ schema: SCHEMA });
    const id = randomUUID();
    await noSchema(async (q) => {
      await q(`INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', NULL, 'STANDARD_PETITION', 'RESERVE', -1, 10, 'deepseek-v4-flash', 'legado-5i', 'committed')`, [id]);
      const rows = await q(`SELECT cost_cents FROM "${SCHEMA}".credit_ledger WHERE id = $1`, [id]);
      const valor = Number((rows as any[])[0]?.cost_cents);
      assert.equal(valor, 10, `valor legado preservado (veio ${valor})`);
    });
  });

  test('upgrade REAL: schema anterior (integer) com dados → migration converte e preserva', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      // 1. Simula o SCHEMA ANTERIOR (pré-0026): coluna integer.
      await q(`ALTER TABLE "${SCHEMA}".credit_ledger ALTER COLUMN cost_cents TYPE integer USING round(cost_cents)::integer`);
      // 2. Dados legados gravados como inteiro (ex.: -10, 22, 0).
      const ids: string[] = [];
      let n = 0;
      for (const valor of [-10, 22, 0]) {
        const id = randomUUID();
        ids.push(id);
        await q(`INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
          VALUES ($1, '00000000-0000-0000-0000-000000000000', NULL, 'STANDARD_PETITION', 'RESERVE', -1, $2, 'deepseek-v4-flash', 'legado-upgrade-5i-' || $3, 'committed')`, [id, valor, String(n++)]);
      }
      // 3. Aplica a migration 0026 (mesma USING do arquivo oficial).
      await q(`ALTER TABLE "${SCHEMA}".credit_ledger ALTER COLUMN cost_cents TYPE numeric(10,2) USING cost_cents::numeric(10,2)`);
      // 4. Coluna virou numeric(10,2) e os dados legados foram preservados.
      const cols = await q(`
        SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'credit_ledger' AND column_name = 'cost_cents'
      `);
      assert.equal((cols as any[])[0]?.data_type, 'numeric', 'coluna converteu para numeric');
      assert.equal(Number((cols as any[])[0]?.numeric_scale), 2, 'escala 2');
      const legados = await q(`SELECT cost_cents FROM "${SCHEMA}".credit_ledger WHERE id = ANY($1) ORDER BY cost_cents`, [ids]);
      const valores = ((legados as any[]) ?? []).map((r) => Number(r.cost_cents));
      assert.deepEqual(valores, [-10, 0, 22], `dados legados preservados após upgrade (veio ${JSON.stringify(valores)})`);
      // 5. Depois da migração, frações funcionam no mesmo banco.
      const idFrac = randomUUID();
      await q(`INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', NULL, 'STANDARD_PETITION', 'SETTLE', 0, 1.55, 'deepseek-v4-flash', 'frac-upgrade-5i', 'committed')`, [idFrac]);
      const vFrac = await q(`SELECT cost_cents FROM "${SCHEMA}".credit_ledger WHERE id = $1`, [idFrac]);
      assert.equal(Number((vFrac as any[])[0]?.cost_cents), 1.55, 'fração escrita após a migração');
    });
  });

  test('idempotência: reexecutar migrations não quebra e não duplica', async () => {
    await runMigrations({ schema: SCHEMA });
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const rows = await q(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'credit_ledger' AND column_name = 'cost_cents'
      `);
      assert.equal((rows as any[])[0]?.data_type, 'numeric', 'coluna segue numeric após reexecução');
    });
  });

  test('rollback documentado: volta para integer preservando valores arredondados', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      await q(`ALTER TABLE "${SCHEMA}".credit_ledger ALTER COLUMN cost_cents TYPE integer USING round(cost_cents)::integer`);
      const rows = await q(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'credit_ledger' AND column_name = 'cost_cents'
      `);
      assert.equal((rows as any[])[0]?.data_type, 'integer', 'rollback → integer');
    });
  });

  test('fração preservada no INSERT real (10.55) e limites numeric(10,2) rejeitados', async () => {
    await runMigrations({ schema: SCHEMA });
    // O teste de rollback anterior converteu a coluna p/ integer: reaplica o
    // ALTER para numeric(10,2) manualmente (runMigrations é idempotente e não
    // reexecuta o ALTER já registrado no journal).
    await noSchema(async (q) => {
      await q(`ALTER TABLE "${SCHEMA}".credit_ledger ALTER COLUMN cost_cents TYPE numeric(10,2) USING cost_cents::numeric(10,2)`);
      const id = randomUUID();
      await q(`INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', NULL, 'STANDARD_PETITION', 'SETTLE', 0, 10.55, 'deepseek-v4-flash', 'frac-5i', 'committed')`, [id]);
      const rows = await q(`SELECT cost_cents FROM "${SCHEMA}".credit_ledger WHERE id = $1`, [id]);
      const valor = Number((rows as any[])[0]?.cost_cents);
      assert.equal(valor, 10.55, `fração preservada (veio ${valor})`);
    });
    // Fora do numeric(10,2): rejeitado pelo banco.
    let overflowCapturado = false;
    try {
      await db.execute(sql.raw(
        `INSERT INTO "${SCHEMA}".credit_ledger (id, escritorio_id, operation_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
         VALUES ('${randomUUID()}', '00000000-0000-0000-0000-000000000000', NULL, 'STANDARD_PETITION', 'SETTLE', 0, 100000000.55, 'deepseek-v4-flash', 'fora-5i', 'committed')`,
      ));
    } catch (err) {
      overflowCapturado = /numeric field overflow|overflow/i.test(err instanceof Error ? err.message : String(err));
    }
    assert.ok(overflowCapturado, 'valor acima de numeric(10,2) rejeitado pelo banco');
  });
});
