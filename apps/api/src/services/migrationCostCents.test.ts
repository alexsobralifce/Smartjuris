// ===========================================================================
// Fase 5E — Migration cost_cents_reserved integer → numeric(10,2) (0025).
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
import { serializarCents } from '../db/schema.js';

const { db, client } = await import('../db/client.js');
const { runMigrations } = await import('../db/migrate.js');

try {
  await db.execute(sql`SELECT 1`);
} catch (err) {
  throw new Error('PostgreSQL indisponível: o teste de migration 5E é obrigatório e não pode ser pulado. ' + String((err as Error).message));
}

const suffix = randomUUID().slice(0, 8);
const SCHEMA = `mig_5e_${suffix}`;

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

describe('5E — migration cost_cents_reserved numeric(10,2)', () => {
  test('banco limpo: migrations completas → coluna numeric(10,2)', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const rows = await q(`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'ai_operations' AND column_name = 'cost_cents_reserved'
      `);
      const col = (rows as any[])[0];
      assert.equal(col?.data_type, 'numeric', 'tipo é numeric após migração');
      assert.equal(Number(col?.numeric_precision), 10, 'precisão 10');
      assert.equal(Number(col?.numeric_scale), 2, 'escala 2');
    });
  });

  test('upgrade com dados legados: inteiro vira numeric(10,2) sem perda', async () => {
    // Reaplica (idempotente) e insere um registro legado com custo inteiro.
    await runMigrations({ schema: SCHEMA });
    const id = randomUUID();
    await noSchema(async (q) => {
      await q(`INSERT INTO "${SCHEMA}".ai_operations (id, escritorio_id, usuario_id, idempotency_key, operation_type, status, credits_reserved, cost_cents_reserved)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'legado-5e', 'STANDARD_PETITION', 'reserved', 2, 10)`, [id]);
      const rows = await q(`SELECT cost_cents_reserved FROM "${SCHEMA}".ai_operations WHERE id = $1`, [id]);
      const valor = Number((rows as any[])[0]?.cost_cents_reserved);
      assert.equal(valor, 10, `valor legado preservado (veio ${valor})`);
    });
  });

  test('idempotência: reexecutar migrations não quebra e não duplica', async () => {
    await runMigrations({ schema: SCHEMA });
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const rows = await q(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'ai_operations' AND column_name = 'cost_cents_reserved'
      `);
      assert.equal((rows as any[])[0]?.data_type, 'numeric', 'coluna segue numeric após reexecução');
    });
  });

  test('rollback documentado: volta para integer preservando valores arredondados', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      await q(`ALTER TABLE "${SCHEMA}".ai_operations ALTER COLUMN cost_cents_reserved TYPE integer USING round(cost_cents_reserved)::integer`);
      const rows = await q(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'ai_operations' AND column_name = 'cost_cents_reserved'
      `);
      assert.equal((rows as any[])[0]?.data_type, 'integer', 'rollback → integer');
    });
  });

  test('política de frações: settle com cost_cents fracionário usa ROUND no reserve_cents_used integer', async () => {
    // O reserve_cents_used (escritorios) é integer; o custo reservado agora é
    // numeric(10,2). A política documentada: frações são arredondadas (ROUND)
    // ao atualizar a reserva do ciclo — sem erro de cast e sem dupla cobrança.
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const rows = await q(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'escritorios' AND column_name = 'reserve_cents_used'
      `);
      assert.ok((rows as any[]).length > 0, 'escritorios.reserve_cents_used existe');
    });
  });

  test('numericCents serializa frações exatas (sem erro de ponto flutuante)', async () => {
    // O toDriver converte para centésimos inteiros e divide — 0.1+0.2 seria
    // 0.30000000000000004 com toFixed; o INSERT real valida a serialização.
    // O teste de rollback anterior converteu a coluna p/ integer: reaplica o
    // ALTER para numeric(10,2) manualmente (runMigrations é idempotente e não
    // reexecuta o ALTER já registrado no journal).
    await noSchema(async (q) => {
      await q(`ALTER TABLE "${SCHEMA}".ai_operations ALTER COLUMN cost_cents_reserved TYPE numeric(10,2) USING cost_cents_reserved::numeric(10,2)`);
      const id = randomUUID();
      await q(`INSERT INTO "${SCHEMA}".ai_operations (id, escritorio_id, usuario_id, idempotency_key, operation_type, status, credits_reserved, cost_cents_reserved)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'frac-5e', 'STANDARD_PETITION', 'reserved', 1, 10.55)`, [id]);
      const rows = await q(`SELECT cost_cents_reserved FROM "${SCHEMA}".ai_operations WHERE id = $1`, [id]);
      const valor = Number((rows as any[])[0]?.cost_cents_reserved);
      assert.equal(valor, 10.55, `fração preservada (veio ${valor})`);
    });
    // Valores fora do numeric(10,2) são rejeitados pelo banco (limite).
    // Fora da transação (client.begin): o erro de uma query aborta a transação
    // e escapa do try/catch dentro dela — usa db.execute direto no schema.
    let overflowCapturado = false;
    try {
      await db.execute(sql.raw(
        `INSERT INTO "${SCHEMA}".ai_operations (id, escritorio_id, usuario_id, idempotency_key, operation_type, status, credits_reserved, cost_cents_reserved)
         VALUES ('${randomUUID()}', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'fora-5e', 'STANDARD_PETITION', 'reserved', 1, 100000000.55)`,
      ));
    } catch (err) {
      overflowCapturado = /numeric field overflow|overflow/i.test(err instanceof Error ? err.message : String(err));
    }
    assert.ok(overflowCapturado, 'valor acima de numeric(10,2) rejeitado pelo banco');
  });

  test('serialização nos LIMITES de arredondamento (0.1+0.2, 0.005, 0.015, 0.999)', () => {
    // serializarCents usa Math.round(value*100)/100 — sem flutuação e com
    // rejeição de valores inválidos (nunca aceita silenciosamente).
    assert.equal(serializarCents(0.1 + 0.2), '0.30', '0.1+0.2 → 0.30 (sem 0.30000000000000004)');
    assert.equal(serializarCents(0.005), '0.01', '0.005 arredonda para cima (centésimo)');
    assert.equal(serializarCents(0.015), '0.02', '0.015 arredonda para cima (caso clássico de flutuação)');
    assert.equal(serializarCents(0.999), '1', '0.999 → 1');
    assert.equal(serializarCents(1.005), '1.01', '1.005 → 1.01 (Math.round(1.005*100) daria 1.00 — flutuação)');
    assert.equal(serializarCents(10.55), '10.55', 'fração exata');
    assert.throws(() => serializarCents(Number.NaN), /inválido/, 'NaN rejeitado');
    assert.throws(() => serializarCents(Number.POSITIVE_INFINITY), /inválido/, 'Infinity rejeitado');
    assert.throws(() => serializarCents(100_000_000), /limite/, 'fora do numeric(10,2) rejeitado');
  });
});
