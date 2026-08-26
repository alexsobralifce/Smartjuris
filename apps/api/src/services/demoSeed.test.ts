// ===========================================================================
// Fase 2A — Testes do seed de demonstração (documentos/chunks escopados).
// Cobre: escopo dos documentos demo, herança aos chunks, ausência de
// quarentena, isolamento entre escritórios, idempotência e correção apenas de
// legados inequivocamente demo.
// ===========================================================================

import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, client } from '../db/client.js';
import { sql, eq, inArray } from 'drizzle-orm';
import { escritorios, documentos, chunks, processos, pecas, clientes } from '../db/schema.js';
import { ensureDemoDataset } from './demoSeed.js';
import { listarDocumentosDoEscritorio, buscarChunksPorKeywords } from './documento.js';

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const NOMES_DEMO = [
  'CLT_Compilada_2024.pdf',
  'Súmulas_TST_Atualizadas.pdf',
  'Jurisprudencia_Danos_Morais_Aereo.pdf',
];

const escIds: string[] = [];

// A garantia de documentos demo é por NOME (global). Para cada teste começar
// com estado limpo, remove TODOS os documentos com nome demo (de qualquer
// escopo) após cada execução — inclusive sobras de execuções falhas anteriores.
afterEach(async () => {
  if (!dbDisponivel) return;
  const docsDemo = await db.select({ id: documentos.id }).from(documentos).where(inArray(documentos.nome, NOMES_DEMO));
  for (const d of docsDemo) await db.delete(chunks).where(eq(chunks.documentoId, d.id)).catch(() => {});
  for (const d of docsDemo) await db.delete(documentos).where(eq(documentos.id, d.id)).catch(() => {});
});

after(async () => {
  if (dbDisponivel) {
    // Remove tudo dos escritórios criados (chunks → docs → peças → processos → clientes).
    for (const escId of escIds) {
      const docsDoEsc = await db.select({ id: documentos.id }).from(documentos).where(eq(documentos.escritorioId, escId));
      for (const d of docsDoEsc) await db.delete(chunks).where(eq(chunks.documentoId, d.id)).catch(() => {});
      for (const d of docsDoEsc) await db.delete(documentos).where(eq(documentos.id, d.id)).catch(() => {});
      await db.delete(pecas).where(eq(pecas.escritorioId, escId)).catch(() => {});
      await db.delete(processos).where(eq(processos.escritorioId, escId)).catch(() => {});
      await db.delete(clientes).where(eq(clientes.escritorioId, escId)).catch(() => {});
      await db.delete(escritorios).where(eq(escritorios.id, escId)).catch(() => {});
    }
  }
  await client.end({ timeout: 5 });
});

async function criarEscritorio(nome: string): Promise<string> {
  const [esc] = await db.insert(escritorios).values({
    nome: `${nome} ${randomUUID().slice(0, 8)}`,
    plano: 'basico',
    creditsAvailable: 100,
  }).returning({ id: escritorios.id });
  escIds.push(esc.id);
  return esc.id;
}

test('seed 01. documentos demo nascem com o escritório do escritório demo', { skip: !dbDisponivel }, async () => {
  const demoId = await criarEscritorio('Demo');
  await ensureDemoDataset(demoId, null);

  const docs = await db.select().from(documentos).where(inArray(documentos.nome, NOMES_DEMO));
  assert.equal(docs.length, 3, 'os 3 documentos demo devem existir');
  for (const d of docs) {
    assert.equal(d.escritorioId, demoId, `documento ${d.nome} deve pertencer ao escritório demo`);
  }
});

test('seed 02. chunks demo herdam o escritório (e o processo, quando aplicável)', { skip: !dbDisponivel }, async () => {
  const demoId = await criarEscritorio('Demo');
  await ensureDemoDataset(demoId, null);

  const rows = await db.select({
    texto: chunks.texto,
    esc: chunks.escritorioId,
    proc: chunks.processoId,
  }).from(chunks)
    .innerJoin(documentos, eq(chunks.documentoId, documentos.id))
    .where(inArray(documentos.nome, NOMES_DEMO));

  assert.ok(rows.length >= 5, 'seed deve criar chunks reais para os documentos demo');
  for (const r of rows) {
    assert.equal(r.esc, demoId, 'chunk demo deve herdar o escritório do documento');
  }
  assert.ok(rows.some((r) => r.proc != null), 'jurisprudência do caso deve herdar o processo correto');
});

test('seed 03. documentos demo não ficam em quarentena', { skip: !dbDisponivel }, async () => {
  const demoId = await criarEscritorio('Demo');
  await ensureDemoDataset(demoId, null);

  const docs = await db.select().from(documentos).where(inArray(documentos.nome, NOMES_DEMO));
  for (const d of docs) {
    assert.equal(d.indexedStatus, 'indexed', `documento ${d.nome} deve estar indexed`);
    assert.notEqual(d.indexedStatus, 'unscoped');
  }
});

test('seed 04. dados de dois escritórios permanecem isolados', { skip: !dbDisponivel }, async () => {
  const demoId = await criarEscritorio('Demo');
  const escB = await criarEscritorio('B');
  await ensureDemoDataset(demoId, null);

  const listaB = await listarDocumentosDoEscritorio(escB);
  for (const nome of NOMES_DEMO) {
    assert.ok(!listaB.some((d) => d.nome === nome), `documento demo ${nome} não pode aparecer para B`);
  }

  const chunksB = await buscarChunksPorKeywords(escB, 'Trabalhista', ['CLT']);
  assert.ok(!chunksB.some((c) => c.texto.includes('CLT')), 'chunks demo não podem ser recuperados por B');

  const listaDemo = await listarDocumentosDoEscritorio(demoId);
  for (const nome of NOMES_DEMO) {
    assert.ok(listaDemo.some((d) => d.nome === nome), `documento demo ${nome} aparece para o escritório demo`);
  }
});

test('seed 05. rodar o seed duas vezes não duplica documentos demo', { skip: !dbDisponivel }, async () => {
  const demoId = await criarEscritorio('Demo');
  await ensureDemoDataset(demoId, null);
  await ensureDemoDataset(demoId, null);

  const docs = await db.select({ nome: documentos.nome }).from(documentos).where(inArray(documentos.nome, NOMES_DEMO));
  assert.equal(docs.length, 3, 'segunda execução não pode duplicar documentos demo');
});

test('seed 06. legado demo sem escopo é corrigido; documento de usuário com mesmo nome não é tocado', { skip: !dbDisponivel }, async () => {
  const demoId = await criarEscritorio('Demo');
  const escB = await criarEscritorio('B');

  // Legado do seed antigo: nome demo, SEM escopo (quarentena).
  const [legado] = await db.insert(documentos).values({
    nome: 'CLT_Compilada_2024.pdf',
    colecao: 'Legislação Federal',
    tamanho: '2.4 MB',
    chunks: 0,
    escritorioId: null,
    processoId: null,
    sizeBytes: 0,
    indexedStatus: 'unscoped',
    failedChunks: 0,
  }).returning();

  // Documento de USUÁRIO com nome demo, escopado a outro escritório.
  const [doUsuario] = await db.insert(documentos).values({
    nome: 'Súmulas_TST_Atualizadas.pdf',
    colecao: 'Jurisprudência',
    tamanho: '1.1 MB',
    chunks: 0,
    escritorioId: escB,
    processoId: null,
    sizeBytes: 0,
    indexedStatus: 'indexed',
    failedChunks: 0,
  }).returning();

  await ensureDemoDataset(demoId, null);

  const [legadoAtualizado] = await db.select().from(documentos).where(eq(documentos.id, legado.id));
  assert.equal(legadoAtualizado.escritorioId, demoId, 'legado demo sem escopo deve ser corrigido para o demo');
  assert.equal(legadoAtualizado.indexedStatus, 'indexed');

  const [usuarioAtualizado] = await db.select().from(documentos).where(eq(documentos.id, doUsuario.id));
  assert.equal(usuarioAtualizado.escritorioId, escB, 'documento de usuário não pode ser alterado pelo seed');

  const clt = await db.select().from(documentos).where(eq(documentos.nome, 'CLT_Compilada_2024.pdf'));
  assert.equal(clt.length, 1, 'correção não pode duplicar o documento');
});
