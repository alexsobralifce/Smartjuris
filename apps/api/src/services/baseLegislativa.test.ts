import { test, describe, before, after, after as afterAll } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { buscarChunksPorKeywords } from './documento.js';

let dbOk = true;
try { await db.execute(sql`SELECT 1`); } catch { dbOk = false; }

const ids = { global: '', a: '', b: '' };
const termo = `lei-global-${Date.now()}`;

describe('Base Legislativa (escopo global)', { skip: !dbOk }, () => {
  before(async () => {
    const esc = async (nome: string) => {
      const [r] = (await db.execute(sql`INSERT INTO escritorios (nome, plano) VALUES (${nome}, 'basico') RETURNING id`)) as any[];
      return r.id as string;
    };
    ids.global = await esc('Base Legislativa Teste');
    ids.a = await esc('Escritório A Teste');
    ids.b = await esc('Escritório B Teste');
    const doc = async (esc: string, nome: string) => {
      const [r] = (await db.execute(sql`INSERT INTO documentos (nome, colecao, tamanho, chunks, escritorio_id) VALUES (${nome}, 'Legislação', '0.01 MB', 1, ${esc}) RETURNING id`)) as any[];
      return r.id as string;
    };
    const dg = await doc(ids.global, 'lei-global.pdf');
    const db_ = await doc(ids.b, 'privado-b.pdf');
    await db.execute(sql`INSERT INTO chunks (documento_id, colecao, texto, escritorio_id) VALUES (${dg}, 'Legislação', ${`Art. 1 ${termo} texto da lei`}, ${ids.global})`);
    await db.execute(sql`INSERT INTO chunks (documento_id, colecao, texto, escritorio_id) VALUES (${db_}, 'Privado', ${`Art. 1 ${termo} dado sigiloso de B`}, ${ids.b})`);
    process.env.RAG_GLOBAL_ESCRITORIO_ID = ids.global;
  });

  after(async () => {
    delete process.env.RAG_GLOBAL_ESCRITORIO_ID;
    for (const id of [ids.global, ids.a, ids.b]) {
      if (!id) continue;
      await db.execute(sql`DELETE FROM chunks WHERE escritorio_id = ${id}`);
      await db.execute(sql`DELETE FROM documentos WHERE escritorio_id = ${id}`);
      await db.execute(sql`DELETE FROM escritorios WHERE id = ${id}`);
    }
  });

  test('escritório comum encontra a legislação global', async () => {
    const r = await buscarChunksPorKeywords(ids.a, null, [termo]);
    assert.equal(r.length, 1);
    assert.match(r[0].texto, /texto da lei/);
  });

  test('escritório comum NÃO encontra documentos de outro escritório', async () => {
    const r = await buscarChunksPorKeywords(ids.a, null, [termo]);
    assert.equal(r.some((c) => c.texto.includes('sigiloso de B')), false);
  });

  test('legislação muito extensa NÃO empurra o trecho do próprio escritório para fora', async () => {
    const termo2 = `jurisprudencia-propria-${Date.now()}`;
    const [d] = (await db.execute(sql`INSERT INTO documentos (nome, colecao, tamanho, chunks, escritorio_id) VALUES ('juris-a.pdf', 'Jurisprudência', '0.01 MB', 1, ${ids.a}) RETURNING id`)) as any[];
    await db.execute(sql`INSERT INTO chunks (documento_id, colecao, texto, escritorio_id) VALUES (${d.id}, 'Jurisprudência', ${`Precedente próprio ${termo2}`}, ${ids.a})`);
    const [dg] = (await db.execute(sql`SELECT id FROM documentos WHERE escritorio_id = ${ids.global} LIMIT 1`)) as any[];
    for (let i = 0; i < 12; i++) {
      await db.execute(sql`INSERT INTO chunks (documento_id, colecao, texto, escritorio_id) VALUES (${dg.id}, 'Legislação', ${`Art. ${i} ${termo2} lei extensa`}, ${ids.global})`);
    }
    const r = await buscarChunksPorKeywords(ids.a, null, [termo2], 5);
    assert.ok(r.some((c) => c.texto.includes('Precedente próprio')), 'trecho do escritório deve aparecer');
    assert.ok(r.length <= 5);
  });

  test('sem RAG_GLOBAL_ESCRITORIO_ID, a legislação não aparece', async () => {
    delete process.env.RAG_GLOBAL_ESCRITORIO_ID;
    const r = await buscarChunksPorKeywords(ids.a, null, [termo]);
    assert.equal(r.length, 0);
    process.env.RAG_GLOBAL_ESCRITORIO_ID = ids.global;
  });
});

afterAll(async () => { await client.end({ timeout: 2 }); });
