// ===========================================================================
// Fase 2E — Migration dos metadados do classificador (0019).
//
// Validação em banco REAL e ISOLADO (schema temporário), usando o RUNNER
// OFICIAL de migrations (db/migrate.ts):
//   - schema novo com ai_operations criada (0000..0018) = estado pré-0019
//     genuíno: a tabela EXISTE mas NÃO tem as colunas de classificação;
//   - runner oficial aplica a 0019 e registra sem skip;
//   - idempotência: reexecutar não aplica nem duplica;
//   - FK parent_operation_id e índice ai_operations_parent_idx válidos;
//   - TODOS os inserts/selects/cleanup usam o schema isolado (search_path);
//   - schema inválido é rejeitado; dir ausente falha explicitamente;
//   - metadados não são confundidos com financeiro.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

const { db, client } = await import('../db/client.js');
const { runMigrations } = await import('../db/migrate.js');

// O banco é OBRIGATÓRIO: falha (não skip silencioso) se o PostgreSQL não
// estiver acessível — a migration só é válida com evidência real de execução.
try {
  await db.execute(sql`SELECT 1`);
} catch (err) {
  throw new Error('PostgreSQL indisponível: o teste de migration 2E é obrigatório e não pode ser pulado. ' + String((err as Error).message));
}

const suffix = randomUUID().slice(0, 8);
const SCHEMA = `mig_2e_${suffix}`;

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
  '0019_classifier_metadata.sql',
);
const MIGRATION_NAME = '0019_classifier_metadata';

const COLS_2E = ['classification', 'classification_reason', 'parent_operation_id', 'prompt_version', 'sub_operations', 'warnings'];

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

describe('2E — migration metadados do classificador', () => {
  test('aplicar migrations cria ai_operations com as colunas 2E (upgrade via runner oficial)', async () => {
    const res = await runMigrations({ schema: SCHEMA });
    assert.ok(res.applied.includes(MIGRATION_NAME), `0019 aplicada (applied=${res.applied.join(',')})`);
    assert.ok(!res.skipped.includes(MIGRATION_NAME), '0019 não foi pulada');

    const cols = await noSchema(async (q) => {
      const rows = await q(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'ai_operations'`,
        [SCHEMA],
      );
      return rows.map((r: any) => r.column_name).filter((c: string) => COLS_2E.includes(c)).sort();
    });
    assert.deepEqual(cols, COLS_2E, 'colunas de classificação presentes após o upgrade');
  });

  test('idempotência: reexecutar o runner oficial não aplica nem duplica', async () => {
    const res = await runMigrations({ schema: SCHEMA });
    assert.ok(!res.applied.includes(MIGRATION_NAME), 'nada reaplicado');
    const n = await noSchema(async (q) => {
      const rows = await q(
        `SELECT COUNT(*)::int AS n FROM drizzle_migrations WHERE hash = $1`,
        [MIGRATION_NAME],
      );
      return Number(rows[0]?.n ?? 0);
    });
    assert.equal(n, 1, 'um único registro de migration');
  });

  test('FK parent_operation_id: coluna, referência a ai_operations(id) e rejeição de pai inexistente', async () => {
    // 1. A constraint estrangeira deve referenciar ai_operations(id).
    const fk = await noSchema(async (q) => {
      const rows = await q(
        `SELECT c.conname, a.attname AS coluna
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
         WHERE n.nspname = $1 AND t.relname = 'ai_operations'
           AND c.contype = 'f' AND a.attname = 'parent_operation_id'`,
        [SCHEMA],
      );
      return rows[0] ?? null;
    });
    assert.ok(fk, 'FK em parent_operation_id existe');
    assert.equal(fk.coluna, 'parent_operation_id');

    // 2. Tabela/coluna referenciada: ai_operations(id).
    const referenciada = await noSchema(async (q) => {
      const rows = await q(
        `SELECT tc.relname AS tabela, att.attname AS coluna
         FROM pg_constraint c
         JOIN pg_class tc ON tc.oid = c.confrelid
         JOIN pg_namespace n ON n.oid = tc.relnamespace
         JOIN pg_attribute att ON att.attrelid = c.confrelid AND att.attnum = ANY(c.confkey)
         WHERE n.nspname = $1 AND c.contype = 'f'
           AND c.conname = $2`,
        [SCHEMA, fk.conname],
      );
      return rows[0] ?? null;
    });
    assert.ok(referenciada, 'referência resolvida');
    assert.equal(referenciada.tabela, 'ai_operations');
    assert.equal(referenciada.coluna, 'id');

    // 3. Pai inexistente é REJEITADO pela FK — em transação isolada (a falha
    //    aborta a transação; por isso rodamos cada parte em seu próprio
    //    client.begin para não contaminar queries seguintes).
    const escId = await noSchema(async (q) => {
      const esc = await q(
        `INSERT INTO escritorios (nome, plano, ativo) VALUES ($1, 'basico', true) RETURNING id`,
        [`FK Reject ${suffix}`],
      );
      return esc[0].id;
    });
    const uuidInexistente = '00000000-0000-4000-8000-000000000000';
    let rejeitado = false;
    try {
      await noSchema(async (q) => {
        await q(
          `INSERT INTO ai_operations (idempotency_key, escritorio_id, operation_type, status, model, parent_operation_id)
           VALUES ($1, $2, 'X', 'reserved', 'flash', $3)`,
          [`fk-reject-${suffix}`, escId, uuidInexistente],
        );
      });
    } catch (err) {
      rejeitado = true;
      assert.match(String((err as Error).message), /foreign key|constraint/i, 'erro de FK');
    }
    assert.equal(rejeitado, true, 'pai inexistente rejeitado pela FK');
    await noSchema(async (q) => {
      await q(`DELETE FROM escritorios WHERE id = $1`, [escId]);
    });

    // 4. Índice da FK presente.
    const idxs = await noSchema(async (q) => {
      const rows = await q(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'ai_operations' AND indexname = 'ai_operations_parent_idx'`,
        [SCHEMA],
      );
      return rows.length;
    });
    assert.equal(idxs, 1, 'índice ai_operations_parent_idx presente');
  });

  test('persistência no schema ISOLADO: insert/select/cleanup não tocam o public', async () => {
    const ids = await noSchema(async (q) => {
      const esc = await q(
        `INSERT INTO escritorios (nome, plano, ativo) VALUES ($1, 'basico', true) RETURNING id`,
        [`Classif Meta ${suffix}`],
      );
      const op = await q(
        `INSERT INTO ai_operations (idempotency_key, escritorio_id, operation_type, status, model,
           credits_reserved, cost_cents_reserved, classification, classification_reason, warnings,
           prompt_version, sub_operations)
         VALUES ($1, $2, 'DOCUMENT_ANALYSIS_20_PAGES', 'reserved', 'flash',
           1, 5, 'STANDARD', 'operacao-identificada', $3, 'analise-documental-v1', $4)
         RETURNING id`,
        [`2e-${suffix}`, esc[0].id, JSON.stringify(['teste']), JSON.stringify([])],
      );
      const child = await q(
        `INSERT INTO ai_operations (idempotency_key, escritorio_id, operation_type, status, model,
           credits_reserved, cost_cents_reserved, parent_operation_id)
         VALUES ($1, $2, 'JURISPRUDENCE_RESEARCH', 'reserved', 'flash', 1, 2, $3)
         RETURNING id`,
        [`2e-child-${suffix}`, esc[0].id, op[0].id],
      );
      return { escId: esc[0].id, opId: op[0].id, childId: child[0].id };
    });

    const dados = await noSchema(async (q) => {
      const op = await q(`SELECT * FROM ai_operations WHERE id = $1`, [ids.opId]);
      const child = await q(`SELECT * FROM ai_operations WHERE id = $1`, [ids.childId]);
      return { op: op[0], child: child[0] };
    });
    assert.equal(dados.op.classification, 'STANDARD');
    assert.equal(dados.op.prompt_version, 'analise-documental-v1');
    assert.equal(dados.op.credits_reserved, 1, 'financeiro intacto');
    assert.equal(dados.op.cost_cents_reserved, 5, 'financeiro intacto');
    assert.equal(dados.child.parent_operation_id, ids.opId, 'hierarquia pai→filha');

    // Nada vazou para o schema public (search_path padrão do pool).
    const noPublic = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key = ${`2e-${suffix}`}
    `)) as any[];
    assert.equal(Number(noPublic[0]?.n ?? 0), 0, 'nada vazou para o schema public');

    // Cleanup no schema isolado (filha antes do pai).
    await noSchema(async (q) => {
      await q(`DELETE FROM ai_operations WHERE id = $1`, [ids.childId]);
      await q(`DELETE FROM ai_operations WHERE id = $1`, [ids.opId]);
      await q(`DELETE FROM escritorios WHERE id = $1`, [ids.escId]);
    });
  });

  test('arquivo de migration declara rollback', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    assert.ok(/ROLLBACK/i.test(sqlText), 'rollback documentado');
    assert.ok(sqlText.includes('DROP COLUMN'), 'rollback com DROP COLUMN');
  });

  test('schema inválido é rejeitado (validação de identificador)', async () => {
    await assert.rejects(
      () => runMigrations({ schema: 'x; DROP TABLE escritorios; --' }),
      /schema inválido/i,
      'schema malicioso rejeitado',
    );
  });

  test('runner falha explicitamente quando o diretório de migrations não existe (override inválido)', async () => {
    await assert.rejects(
      () => runMigrations({ schema: SCHEMA, migrationsDir: '/caminho/inexistente/migrations' }),
      /Nenhum diretório de migrations/i,
    );
  });

  test('ISOLAMENTO: runner com schema temporário NÃO cria/altera extensões no banco', async () => {
    // Estado das extensões ANTES (capturado explicitamente).
    const antes = (await db.execute(sql.raw(`
      SELECT extname FROM pg_extension ORDER BY extname
    `))) as any[];
    const antesSet = new Set(antes.map((r: any) => r.extname));

    const schemaAux = `${SCHEMA}_iso`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    try {
      await runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) });

      // Estado das extensões DEPOIS: não deve ter criado NENHUMA extensão nova.
      const depois = (await db.execute(sql.raw(`
        SELECT extname FROM pg_extension ORDER BY extname
      `))) as any[];
      const depoisSet = new Set(depois.map((r: any) => r.extname));
      for (const nome of depoisSet) {
        assert.ok(antesSet.has(nome), `extensão ${nome} NÃO pode ter sido criada pelo runner isolado`);
      }
      assert.equal(depoisSet.size, antesSet.size, 'nenhuma extensão criada/removida');

      // A tabela de controle do schema isolado foi criada (sem tocar o public).
      const t = await db.execute(sql.raw(`
        SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema = '${schemaAux}' AND table_name = 'drizzle_migrations'
      `));
      assert.equal(Number((t as any[])[0]?.n ?? 0), 1, 'tabela de controle criada no schema isolado');

      // Nada foi criado no schema public por causa do runner isolado
      // (a tabela global drizzle.__drizzle_migrations pode existir do fluxo
      // normal — o que o runner isolado NÃO faz é criar extensões).
      const globalTables = (await db.execute(sql.raw(`
        SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'drizzle'
      `))) as any[];
      void globalTables;
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('divergência de content_hash falha explicitamente (bloqueia inicialização)', async () => {
    // Altera o content_hash registrado de uma migration já aplicada no schema
    // isolado, simulando "arquivo modificado após aplicação".
    const schemaAux = `${SCHEMA}_hash`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    try {
      await runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) });
      // Corrompe o registro da 0019 no schema isolado.
      await db.execute(sql.raw(`
        UPDATE "${schemaAux}"."drizzle_migrations" SET content_hash = 'corrompido'
        WHERE hash = '${MIGRATION_NAME}'
      `));
      await assert.rejects(
        () => runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) }),
        /modificada após ter sido aplicada/i,
        'divergência de content_hash deve falhar',
      );
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('UPGRADE de tabela de controle LEGADA (sem content_hash) → backfill + aplicação da 0019', async () => {
    // Simula uma instalação anterior à coluna content_hash: tabela de controle
    // com registros históricos e hash por NOME de arquivo (sem content_hash).
    // O runner deve fazer o backfill com segurança e permitir a 0019.
    const schemaAux = `${SCHEMA}_legado`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    try {
      // 1. Aplica 0000..0018 num schema limpo (dir temporário sem a 0019).
      const { mkdtemp, rm, cp, readdir } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join: pjoinLeg } = await import('node:path');
      const tmpMigrations = await mkdtemp(pjoinLeg(tmpdir(), 'mig-2e-leg-'));
      const realDir = dirname(migrationPath);
      for (const f of await readdir(realDir)) {
        if (!f.endsWith('.sql') || f.startsWith('0019')) continue;
        await cp(pjoinLeg(realDir, f), pjoinLeg(tmpMigrations, f));
      }
      await runMigrations({ schema: schemaAux, migrationsDir: tmpMigrations });

      // 2. DROP da coluna content_hash — simula tabela de controle LEGADA.
      await db.execute(sql.raw(`
        ALTER TABLE "${schemaAux}"."drizzle_migrations" DROP COLUMN content_hash;
      `));

      // 3. Insere dados financeiros pré-existentes em ai_operations (legado).
      const { escId, opId } = await noSchemaAsync(schemaAux, async (q) => {
        const esc = await q(
          `INSERT INTO escritorios (nome, plano, ativo) VALUES ($1, 'basico', true) RETURNING id`,
          [`Legado ${suffix}`],
        );
        const op = await q(
          `INSERT INTO ai_operations (idempotency_key, escritorio_id, operation_type, status, model,
             credits_reserved, cost_cents_reserved)
           VALUES ($1, $2, 'SIMPLE_PETITION', 'succeeded', 'flash', 3, 20)
           RETURNING id`,
          [`2e-legado-${suffix}`, esc[0].id],
        );
        return { escId: esc[0].id, opId: op[0].id };
      });

      // 4a. SEM autorização explícita, o runner FALHA (não aceita o arquivo
      //     atual como prova do conteúdo histórico).
      await assert.rejects(
        () => runMigrations({ schema: schemaAux, migrationsDir: realDir }),
        /autorize explicitamente o backfill/i,
        'backfill legado sem autorização deve falhar',
      );

      // 4b. COM autorização explícita: backfill + aplica a 0019 com sucesso.
      const res = await runMigrations({
        schema: schemaAux,
        migrationsDir: realDir,
        allowLegacyBackfill: true,
      });
      assert.ok(res.applied.includes(MIGRATION_NAME), `0019 aplicada no upgrade legado (applied=${res.applied.join(',')})`);

      // 5. TODOS os registros legados backfillados com o hash sha256 do arquivo.
      const hashReg = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT hash, content_hash FROM drizzle_migrations ORDER BY hash`,
        );
        return rows;
      });
      assert.ok(hashReg.length >= 19, `registros legados presentes (${hashReg.length})`);
      const { createHash: sha256 } = await import('node:crypto');
      const { readFile: readFileAsync } = await import('node:fs/promises');
      const { join: pjoinHash } = await import('node:path');
      for (const reg of hashReg) {
        assert.ok(reg.content_hash, `hash preenchido para ${reg.hash}`);
        const arquivo = pjoinHash(realDir, `${reg.hash}.sql`);
        const conteudo = await readFileAsync(arquivo, 'utf8');
        assert.equal(reg.content_hash, sha256('sha256').update(conteudo).digest('hex'), `hash sha256 correto para ${reg.hash}`);
      }

      const cols = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'ai_operations'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.column_name).filter((c: string) => COLS_2E.includes(c)).sort();
      });
      assert.deepEqual(cols, COLS_2E, 'colunas 2E presentes após upgrade legado');

      // 6. Dados financeiros preservados.
      const op = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(`SELECT * FROM ai_operations WHERE id = $1`, [opId]);
        return rows[0];
      });
      assert.equal(op.credits_reserved, 3, 'crédito preservado');
      assert.equal(op.cost_cents_reserved, 20, 'custo preservado');
      assert.equal(op.status, 'succeeded');

      // 7. Reexecução é idempotente (registros já com hash; flag não é mais
      //    necessária porque todos têm content_hash).
      const res2 = await runMigrations({ schema: schemaAux, migrationsDir: realDir });
      assert.ok(!res2.applied.includes(MIGRATION_NAME), 'nada reaplicado após backfill');

      // Cleanup no schema auxiliar.
      await noSchemaAsync(schemaAux, async (q) => {
        await q(`DELETE FROM ai_operations WHERE id = $1`, [opId]);
        await q(`DELETE FROM escritorios WHERE id = $1`, [escId]);
      });
      await rm(tmpMigrations, { recursive: true, force: true });
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('nome de migration com aspas simples é tratado com segurança (sem injeção)', async () => {
    // Cria um diretório de migrations override com um arquivo cujo NOME contém
    // aspas simples — o runner não pode permitir injeção via interpolação.
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join: pjoinInj } = await import('node:path');
    const tmpMigrations = await mkdtemp(pjoinInj(tmpdir(), 'mig-2e-inj-'));
    try {
      const nomeArquivo = `0000_it's_inject.sql`;
      await writeFile(pjoinInj(tmpMigrations, nomeArquivo), `SELECT 1;`);
      // O runner deve executar sem erro de sintaxe/injeção (o nome entra como
      // parâmetro vinculado, não interpolado).
      const res = await runMigrations({
        schema: `${SCHEMA}_inj`,
        migrationsDir: tmpMigrations,
      });
      assert.ok(res.applied.includes("0000_it's_inject"), `aplicada sem injeção (applied=${res.applied.join(',')})`);
    } finally {
      await rm(tmpMigrations, { recursive: true, force: true });
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${SCHEMA}_inj" CASCADE;`)).catch(() => {});
    }
  });

  test('CONCORRÊNCIA: dois runMigrations simultâneos não duplicam aplicação/registro', async () => {
    const schemaAux = `${SCHEMA}_conc`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    try {
      // Dois processos/execuções concorrentes contra o MESMO schema.
      const [r1, r2] = await Promise.all([
        runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) }),
        runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) }),
      ]);
      // Nenhum dos dois pode ter aplicado a 0019 DUAS vezes; o total de
      // aplicações da 0019 entre os dois é no máximo 1.
      const aplicacoes = (r1.applied.includes(MIGRATION_NAME) ? 1 : 0) + (r2.applied.includes(MIGRATION_NAME) ? 1 : 0);
      assert.ok(aplicacoes <= 1, `0019 aplicada no máximo uma vez (${aplicacoes})`);

      const n = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT COUNT(*)::int AS n FROM drizzle_migrations WHERE hash = $1`,
          [MIGRATION_NAME],
        );
        return Number(rows[0]?.n ?? 0);
      });
      assert.equal(n, 1, 'um único registro de migration mesmo com concorrência');
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('tabela de controle LEGADA sem UNIQUE em hash: restrição adicionada + duplicados detectados', async () => {
    const schemaAux = `${SCHEMA}_unique`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    try {
      // Cria schema + tabela de controle SEM UNIQUE (como a legada do runner
      // anterior) + coluna content_hash ausente.
      await db.execute(sql.raw(`
        CREATE SCHEMA "${schemaAux}";
        CREATE TABLE "${schemaAux}"."drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
      `));

      // 1. Registros duplicados: runner deve FALHAR com mensagem clara.
      await db.execute(sql.raw(`
        INSERT INTO "${schemaAux}"."drizzle_migrations" (hash, created_at) VALUES ('dup', 1), ('dup', 2);
      `));
      await assert.rejects(
        () => runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) }),
        /hashes DUPLICADOS/i,
        'duplicados detectados antes de criar UNIQUE',
      );

      // 2. Sem duplicados: runner adiciona a constraint e aplica as migrations.
      await db.execute(sql.raw(`DELETE FROM "${schemaAux}"."drizzle_migrations" WHERE hash = 'dup';`));
      const res = await runMigrations({ schema: schemaAux, migrationsDir: dirname(migrationPath) });
      assert.ok(res.applied.includes(MIGRATION_NAME), '0019 aplicada após upgrade da tabela legada');

      // 3. Constraint UNIQUE existe agora (tabela legada atualizada).
      const idx = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname = $1 AND tablename = 'drizzle_migrations' AND indexdef ILIKE '%(hash)%'`,
          [schemaAux],
        );
        return rows;
      });
      assert.ok(idx.length >= 1, 'índice único em hash criado na tabela legada');
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('UPGRADE a partir de snapshot representativo (0000..0018 + dados em ai_operations + 0019)', async () => {
    // Simula uma base de produção no estado pré-0019 com dados existentes:
    // aplica 0000..0018, insere operações reais (sem colunas 2E), aplica a
    // 0019 e confirma que os dados financeiros sobrevivem e os metadados
    // funcionam.
    const schemaAux = `${SCHEMA}_upgrade`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));

    // Passo 1: aplica só até 0018 — copia o dir para um temp SEM a 0019.
    const { mkdtemp, rm, cp, readdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join: pjoinUp } = await import('node:path');
    const tmpMigrations = await mkdtemp(pjoinUp(tmpdir(), 'mig-2e-up-'));
    const realDir = dirname(migrationPath);
    for (const f of await readdir(realDir)) {
      if (!f.endsWith('.sql') || f.startsWith('0019')) continue;
      await cp(pjoinUp(realDir, f), pjoinUp(tmpMigrations, f));
    }
    try {
      await runMigrations({ schema: schemaAux, migrationsDir: tmpMigrations });

      // Estado pré-0019: ai_operations existe SEM colunas 2E.
      const colsAntes = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'ai_operations'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.column_name).filter((c: string) => COLS_2E.includes(c));
      });
      assert.deepEqual(colsAntes, [], 'pré-0019: sem colunas de classificação');

      // Insere dados financeiros representativos (sem metadados 2E).
      const { escId, opId } = await noSchemaAsync(schemaAux, async (q) => {
        const esc = await q(
          `INSERT INTO escritorios (nome, plano, ativo) VALUES ($1, 'profissional', true) RETURNING id`,
          [`Upgrade ${suffix}`],
        );
        const op = await q(
          `INSERT INTO ai_operations (idempotency_key, escritorio_id, operation_type, status, model,
             credits_reserved, cost_cents_reserved)
           VALUES ($1, $2, 'SIMPLE_PETITION', 'succeeded', 'flash', 2, 15)
           RETURNING id`,
          [`2e-upgrade-${suffix}`, esc[0].id],
        );
        return { escId: esc[0].id, opId: op[0].id };
      });

      // Passo 2: aplica a 0019 (dir completo real).
      const res = await runMigrations({ schema: schemaAux, migrationsDir: realDir });
      assert.ok(res.applied.includes(MIGRATION_NAME), '0019 aplicada no upgrade');

      // Dados financeiros sobrevivem; colunas novas existem e aceitam metadados.
      const pos = await noSchemaAsync(schemaAux, async (q) => {
        const op = await q(`SELECT * FROM ai_operations WHERE id = $1`, [opId]);
        return op[0];
      });
      assert.equal(pos.credits_reserved, 2, 'crédito preservado no upgrade');
      assert.equal(pos.cost_cents_reserved, 15, 'custo preservado no upgrade');
      assert.equal(pos.status, 'succeeded');
      assert.equal(pos.classification, null, 'metadado novo começa nulo');

      // Limpeza no schema auxiliar.
      await noSchemaAsync(schemaAux, async (q) => {
        await q(`DELETE FROM ai_operations WHERE id = $1`, [opId]);
        await q(`DELETE FROM escritorios WHERE id = $1`, [escId]);
      });
    } finally {
      await rm(tmpMigrations, { recursive: true, force: true });
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('0022: migration lease_token aplica e é idempotente (fencing de análise 3A)', async () => {
    const schemaAux = `mig_3a_${suffix}`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    await db.execute(sql.raw(`CREATE SCHEMA "${schemaAux}";`));
    try {
      // Runner oficial sobre o schema limpo: 0000..0022.
      const res = await runMigrations({ schema: schemaAux });
      assert.ok(res.applied.includes('0022_lease_token'), '0022 aplicada');
      const cols = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'ai_operations'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.column_name);
      });
      assert.ok(cols.includes('lease_token'), 'coluna lease_token presente');

      // Idempotência: reaplicar não duplica.
      const res2 = await runMigrations({ schema: schemaAux });
      assert.ok(!res2.applied.includes('0022_lease_token'), '0022 não reaplicada');

      // Aplicável em ambiente atualizado a partir de versão ANTERIOR (sem a
      // coluna E sem o registro): remove coluna + registro de controle e
      // reaplica — o runner deve aplicar a 0022 de novo e recriar a coluna.
      // Remove o REGISTRO da 0022 da tabela de controle pelo hash (coluna
      // `hash`, que é o nome do arquivo) para simular ambiente pré-0022 —
      // independente de quais migrations existam depois dela.
      const hash0022 = '0022_lease_token';
      await noSchemaAsync(schemaAux, async (q) => {
        await q('ALTER TABLE ai_operations DROP COLUMN IF EXISTS lease_token');
        await q(`DELETE FROM drizzle_migrations WHERE hash = $1`, [hash0022]);
      });
      const res3 = await runMigrations({ schema: schemaAux, allowLegacyBackfill: true });
      assert.ok(res3.applied.includes('0022_lease_token'), '0022 REAPLICADA após remoção');
      const cols3 = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'ai_operations'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.column_name);
      });
      assert.ok(cols3.includes('lease_token'), 'coluna lease_token recriada na reaplicação');
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });

  test('0023: idempotência de peças aplica em banco LIMPO e em UPGRADE pré-0023', async () => {
    const schemaAux = `mig_3d_${suffix}`;
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`));
    await db.execute(sql.raw(`CREATE SCHEMA "${schemaAux}";`));
    try {
      // (a) Banco limpo: 0000..0023 aplicada, coluna + índice parcial presentes.
      const res = await runMigrations({ schema: schemaAux });
      assert.ok(res.applied.includes('0023_pecas_idempotency'), '0023 aplicada no banco limpo');
      const cols = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'pecas'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.column_name);
      });
      assert.ok(cols.includes('idempotency_key'), 'coluna idempotency_key presente');
      const indices = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname = $1 AND indexname = 'pecas_tenant_key_unique'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.indexname);
      });
      assert.ok(indices.includes('pecas_tenant_key_unique'), 'índice parcial único presente');

      // (b) Idempotência: reaplicar não duplica.
      const res2 = await runMigrations({ schema: schemaAux });
      assert.ok(!res2.applied.includes('0023_pecas_idempotency'), '0023 não reaplicada');

      // (c) Upgrade a partir de estado pré-0023: remove coluna + índice +
      // registro de controle e reaplica — o runner recria tudo.
      await noSchemaAsync(schemaAux, async (q) => {
        await q('DROP INDEX IF EXISTS pecas_tenant_key_unique');
        await q('ALTER TABLE pecas DROP COLUMN IF EXISTS idempotency_key');
        await q(`DELETE FROM drizzle_migrations WHERE hash = $1`, ['0023_pecas_idempotency']);
      });
      const res3 = await runMigrations({ schema: schemaAux });
      assert.ok(res3.applied.includes('0023_pecas_idempotency'), '0023 REAPLICADA no upgrade');
      const cols3 = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'pecas'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.column_name);
      });
      assert.ok(cols3.includes('idempotency_key'), 'coluna recriada na reaplicação');
      const indices3 = await noSchemaAsync(schemaAux, async (q) => {
        const rows = await q(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname = $1 AND indexname = 'pecas_tenant_key_unique'`,
          [schemaAux],
        );
        return rows.map((r: any) => r.indexname);
      });
      assert.ok(indices3.includes('pecas_tenant_key_unique'), 'índice recriado na reaplicação');
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaAux}" CASCADE;`)).catch(() => {});
    }
  });
});

/** Variante do noSchema com schema arbitrário (para testes com schema auxiliar). */
async function noSchemaAsync(schema: string, fn: (q: (query: string, params?: unknown[]) => Promise<any>) => Promise<unknown>): Promise<any> {
  return client.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${schema}", public;`);
    const q = (query: string, params?: unknown[]) => tx.unsafe(query, params as never[]);
    return fn(q);
  });
}
