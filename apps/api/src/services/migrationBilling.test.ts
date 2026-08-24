// ===========================================================================
// Fase 7A — Migrations de billing Mercado Pago (0027 + 0028).
//
// Validação em banco REAL e ISOLADO (schema temporário), usando o RUNNER
// OFICIAL de migrations (db/migrate.ts):
//   - 0027 cria as colunas de assinatura em escritorios;
//   - 0028 adiciona as CHECK constraints de status/plano;
//   - idempotência: reexecutar não aplica nem duplica;
//   - constraints rejeitam valores inválidos e aceitam os válidos.
//
// Resposta ao achado BLOCKER do revisor (migration validada em banco real).
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
  throw new Error('PostgreSQL indisponível: o teste de migration 7A é obrigatório e não pode ser pulado. ' + String((err as Error).message));
}

const suffix = randomUUID().slice(0, 8);
const SCHEMA = `mig_7a_${suffix}`;

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

describe('7A — migrations de billing Mercado Pago (0027 + 0028)', () => {
  test('banco limpo: migrations aplicadas criam colunas de assinatura', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const cols = await q(`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'escritorios'
          AND column_name IN ('mercado_pago_id','mercado_pago_plan_id','assinatura_status','assinatura_plano','assinatura_proxima_cobranca','assinatura_ultima_cobranca','assinatura_expiracao')
      `);
      const names = (cols as any[]).map((c) => c.column_name).sort();
      assert.deepEqual(names, [
        'assinatura_expiracao',
        'assinatura_plano',
        'assinatura_proxima_cobranca',
        'assinatura_status',
        'assinatura_ultima_cobranca',
        'mercado_pago_id',
        'mercado_pago_plan_id',
      ]);
    });
  });

  test('assinatura_status tem default "nenhuma" e não é nulo', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const rows = await q(`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'escritorios' AND column_name = 'assinatura_status'
      `);
      const col = (rows as any[])[0];
      assert.equal(col?.is_nullable, 'NO', 'assinatura_status NOT NULL');
      assert.match(col?.column_default ?? '', /nenhuma/, 'default nenhuma');
    });
  });

  test('CHECK constraints de status e plano existem e rejeitam inválidos', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      // Constraints presentes
      const cons = await q(`
        SELECT conname FROM pg_constraint
        WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${SCHEMA}')
          AND conname IN ('escritorios_assinatura_status_check','escritorios_assinatura_plano_check')
      `);
      const nomes = (cons as any[]).map((c: any) => c.conname).sort();
      assert.deepEqual(nomes, ['escritorios_assinatura_plano_check', 'escritorios_assinatura_status_check']);
    });

    // Cada INSERT inválido roda em transação PRÓPRIA: uma falha de constraint
    // aborta a transação e statements seguintes rejeitariam com
    // "transaction aborted" (não com a mensagem da constraint).
    const rejeitaCom = (fn: () => Promise<unknown>) => assert.rejects(fn(), /check constraint|violates check/);

    await rejeitaCom(async () => {
      const id = randomUUID();
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${SCHEMA}", public;`);
        await tx.unsafe(`INSERT INTO "${SCHEMA}".escritorios (id, nome, assinatura_status) VALUES ($1, 'X', 'hackeado')`, [id]);
      });
    });

    await rejeitaCom(async () => {
      const id = randomUUID();
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${SCHEMA}", public;`);
        await tx.unsafe(`INSERT INTO "${SCHEMA}".escritorios (id, nome, assinatura_plano) VALUES ($1, 'X', 'luxo')`, [id]);
      });
    });
  });

  test('valores válidos passam pelas constraints', async () => {
    await runMigrations({ schema: SCHEMA });
    await noSchema(async (q) => {
      const id = randomUUID();
      await q(
        `INSERT INTO "${SCHEMA}".escritorios (id, nome, assinatura_status, assinatura_plano) VALUES ($1, 'X', 'ativa', 'profissional')`,
        [id],
      );
      const rows = await q(`SELECT assinatura_status, assinatura_plano FROM "${SCHEMA}".escritorios WHERE id = $1`, [id]);
      const row = (rows as any[])[0];
      assert.equal(row?.assinatura_status, 'ativa');
      assert.equal(row?.assinatura_plano, 'profissional');
    });
  });

  test('idempotência: reexecutar migrations não duplica nem falha', async () => {
    await runMigrations({ schema: SCHEMA });
    await runMigrations({ schema: SCHEMA }); // segunda execução
    await noSchema(async (q) => {
      const cons = await q(`
        SELECT COUNT(*) AS n FROM pg_constraint
        WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${SCHEMA}')
          AND conname IN ('escritorios_assinatura_status_check','escritorios_assinatura_plano_check')
      `);
      assert.equal(Number((cons as any[])[0]?.n), 2, 'constraints não duplicadas');
    });
  });
});
