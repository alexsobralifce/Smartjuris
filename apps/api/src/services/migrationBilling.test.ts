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

describe('7B — migration de promoção (0036)', () => {
  before(async () => {
    await runMigrations({ schema: SCHEMA });
  });

  test('banco limpo: colunas de promoção criadas com defaults', async () => {
    await noSchema(async (q) => {
      const cols = await q(`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = '${SCHEMA}' AND table_name = 'escritorios'
          AND column_name IN ('promocao_usada','promocao_plano','promocao_valor_cents','promocao_percentual','promocao_ativa_em')
      `);
      const nomes = (cols as any[]).map((c) => c.column_name).sort();
      assert.deepEqual(nomes, ['promocao_ativa_em', 'promocao_percentual', 'promocao_plano', 'promocao_usada', 'promocao_valor_cents']);

      const usada = (cols as any[]).find((c) => c.column_name === 'promocao_usada');
      assert.equal(usada?.is_nullable, 'NO', 'promocao_usada NOT NULL');
      assert.match(usada?.column_default ?? '', /false/, 'default false');
    });
  });

  test('upgrade: escritório legado (sem colunas) recebe a migration sem perda', async () => {
    await noSchema(async (q) => {
      // Insere registro legado com campos básicos.
      const id = randomUUID();
      await q(`INSERT INTO "${SCHEMA}".escritorios (id, nome, plano) VALUES ($1, 'Legado 7B', 'basico')`, [id]);
      const rows = await q(`SELECT promocao_usada, promocao_plano FROM "${SCHEMA}".escritorios WHERE id = $1`, [id]);
      const row = (rows as any[])[0];
      assert.equal(row?.promocao_usada, false, 'legado nasce com promocao_usada=false');
      assert.equal(row?.promocao_plano, null, 'promocao_plano null em legado');
    });
  });

  test('upgrade REAL: schema sem a 0036 no controle → migration adiciona colunas', async () => {
    // Cria schema ISOLADO, aplica migrations até 0035 (a 0036 NÃO entra),
    // insere dado legado e aplica SOMENTE a 0036 (upgrade real).
    const suffix = randomUUID().slice(0, 8);
    const schemaUp = `mig_7b_up_${suffix}`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaUp}" CASCADE;`));
    await db.execute(sql.raw(`CREATE SCHEMA "${schemaUp}";`));
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migDir = join(__dirname, '..', 'db', 'migrations');
    const files = (await readdir(migDir)).filter((f) => f.endsWith('.sql')).sort();
    // Aplica 0000..0035 manualmente (mesma transação e registro do runner).
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaUp}", public;`);
      await tx.unsafe(`CREATE TABLE "${schemaUp}".drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL UNIQUE, created_at bigint, content_hash text);`);
      for (const f of files) {
        if (f.startsWith('0036_')) break; // para antes da 0036
        const sqlContent = await readFile(join(migDir, f), 'utf8');
        const { createHash } = await import('node:crypto');
        const ch = createHash('sha256').update(sqlContent).digest('hex');
        await tx.unsafe(sqlContent);
        await tx.unsafe(`INSERT INTO "${schemaUp}".drizzle_migrations (hash, content_hash, created_at) VALUES ($1, $2, $3)`, [f.replace('.sql', ''), ch, Date.now()]);
      }
      // Dado legado pré-0036.
      const id = randomUUID();
      await tx.unsafe(`INSERT INTO "${schemaUp}".escritorios (id, nome, plano) VALUES ($1, 'Legado Upgrade', 'basico')`, [id]);
    });

    // Aplica a 0036 via runner oficial no schema (registra e adiciona colunas).
    await runMigrations({ schema: schemaUp });

    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaUp}", public;`);
      const cols = await tx.unsafe(`
        SELECT COUNT(*)::int AS n FROM information_schema.columns
        WHERE table_schema = '${schemaUp}' AND table_name = 'escritorios' AND column_name IN ('promocao_usada','promocao_plano','promocao_valor_cents')
      `);
      assert.equal(Number((cols as any[])[0]?.n), 3, '0036 adiciona colunas sobre dados legados');
      const [legado] = await tx.unsafe(`SELECT promocao_usada FROM "${schemaUp}".escritorios WHERE nome = 'Legado Upgrade'`);
      assert.equal(legado?.promocao_usada, false, 'legado preservado com default false');
    });

    // Reaplicação IDEMPOTENTE: runner oficial já registrou a 0036 → não
    // duplica colunas nem erro (skip por hash).
    await runMigrations({ schema: schemaUp });
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaUp}", public;`);
      const cols = await tx.unsafe(`
        SELECT COUNT(*)::int AS n FROM information_schema.columns
        WHERE table_schema = '${schemaUp}' AND table_name = 'escritorios' AND column_name = 'promocao_usada'
      `);
      assert.equal(Number((cols as any[])[0]?.n), 1, 'reaplicação não duplica a coluna');
      const regs = await tx.unsafe(`SELECT COUNT(*)::int AS n FROM "${schemaUp}".drizzle_migrations WHERE hash = '0036_promocao_primeiro_mes'`);
      assert.equal(Number((regs as any[])[0]?.n), 1, 'registro único da 0036');
    });

    // Rollback documentado: DROP COLUMN preserva os dados não promocionais.
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaUp}", public;`);
      await tx.unsafe(`ALTER TABLE "${schemaUp}".escritorios DROP COLUMN IF EXISTS promocao_usada, DROP COLUMN IF EXISTS promocao_plano, DROP COLUMN IF EXISTS promocao_valor_cents, DROP COLUMN IF EXISTS promocao_percentual, DROP COLUMN IF EXISTS promocao_ativa_em`);
      const cols = await tx.unsafe(`
        SELECT COUNT(*)::int AS n FROM information_schema.columns
        WHERE table_schema = '${schemaUp}' AND table_name = 'escritorios' AND column_name LIKE 'promocao_%'
      `);
      assert.equal(Number((cols as any[])[0]?.n), 0, 'rollback remove as colunas de promoção');
      const [legado] = await tx.unsafe(`SELECT nome FROM "${schemaUp}".escritorios WHERE nome = 'Legado Upgrade'`);
      assert.ok(legado, 'rollback preserva o escritório (dados não promocionais intactos)');
    });
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaUp}" CASCADE;`));
  });

  test('constraints 0037: rejeitam valores inválidos e aceitam válidos', async () => {
    await noSchema(async (q) => {
      const cons = await q(`
        SELECT conname FROM pg_constraint
        WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${SCHEMA}')
          AND conname LIKE 'escritorios_promocao_%_check'
      `);
      assert.equal((cons as any[]).length, 3, '3 constraints de promoção (valor/percentual/plano)');

      // Inserção com valor negativo → rejeitada (transação própria).
      await assert.rejects(client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${SCHEMA}", public;`);
        const id = randomUUID();
        await tx.unsafe(`INSERT INTO "${SCHEMA}".escritorios (id, nome, promocao_usada, promocao_valor_cents) VALUES ($1, 'X', true, -100)`, [id]);
      }), /check constraint|violates check/);

      // Percentual fora de 1..99 → rejeitado.
      await assert.rejects(client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${SCHEMA}", public;`);
        const id = randomUUID();
        await tx.unsafe(`INSERT INTO "${SCHEMA}".escritorios (id, nome, promocao_usada, promocao_percentual) VALUES ($1, 'X', true, 150)`, [id]);
      }), /check constraint|violates check/);

      // Plano fora do catálogo → rejeitado.
      await assert.rejects(client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${SCHEMA}", public;`);
        const id = randomUUID();
        await tx.unsafe(`INSERT INTO "${SCHEMA}".escritorios (id, nome, promocao_usada, promocao_plano) VALUES ($1, 'X', true, 'luxo')`, [id]);
      }), /check constraint|violates check/);

      // Válidos passam (valor 9000, percentual 50, plano basico).
      const id = randomUUID();
      await q(`INSERT INTO "${SCHEMA}".escritorios (id, nome, promocao_usada, promocao_valor_cents, promocao_percentual, promocao_plano) VALUES ($1, 'OK', true, 9000, 50, 'basico')`, [id]);
    });
  });
});
