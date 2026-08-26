// ===========================================================================
// Fase 2A — Testes de isolamento multi-tenant e metadados de documentos.
// Cobre os 12 cenários obrigatórios. Requer banco com migration 0018 aplicada.
// ===========================================================================

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, client } from '../db/client.js';
import { sql, eq } from 'drizzle-orm';
import { escritorios, processos, documentos, chunks } from '../db/schema.js';
import {
  processarUploadDocumento,
  validarProcessoDoEscritorio,
  validarEscritorioInformadoNoBody,
  listarDocumentosDoEscritorio,
  buscarChunksPorKeywords,
  buscarChunksPorEmbedding,
  listarDocumentosSemEscopo,
  associarDocumentoEscritorio,
} from './documento.js';

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

// IDs criados nos testes para limpeza (chunks → documentos → processos → escritórios).
const escIds: string[] = [];
const procIds: string[] = [];
const docIds: string[] = [];

after(async () => {
  if (dbDisponivel) {
    for (const docId of docIds) await db.delete(chunks).where(eq(chunks.documentoId, docId)).catch(() => {});
    for (const docId of docIds) await db.delete(documentos).where(eq(documentos.id, docId)).catch(() => {});
    for (const procId of procIds) await db.delete(processos).where(eq(processos.id, procId)).catch(() => {});
    for (const escId of escIds) await db.delete(escritorios).where(eq(escritorios.id, escId)).catch(() => {});
  }
  await client.end({ timeout: 5 });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const embeddingFake = async (): Promise<number[]> => Array(1024).fill(0.01);

async function criarEscritorio(nome: string): Promise<string> {
  const [esc] = await db.insert(escritorios).values({
    nome: `${nome} ${randomUUID().slice(0, 8)}`,
    plano: 'basico',
    creditsAvailable: 100,
  }).returning({ id: escritorios.id });
  escIds.push(esc.id);
  return esc.id;
}

async function criarProcesso(escId: string, area = 'Cível'): Promise<string> {
  const [p] = await db.insert(processos).values({
    tipo: 'Ação Teste',
    cliente: 'Cliente A',
    adverso: 'Réu B',
    vara: 'Vara X',
    area,
    status: 'ativo',
    valor: 'R$ 1.000,00',
    prazo: '2026-12-31',
    advogado: 'Advogado',
    escritorioId: escId,
  }).returning({ id: processos.id });
  procIds.push(p.id);
  return p.id;
}

async function inserirDocumento(opts: {
  escId?: string | null;
  nome?: string;
  status?: string;
  totalPages?: number | null;
} = {}) {
  const [doc] = await db.insert(documentos).values({
    nome: opts.nome ?? `Doc ${randomUUID().slice(0, 6)}.pdf`,
    colecao: 'Jurisprudência',
    tamanho: '1 MB',
    chunks: 0,
    escritorioId: opts.escId ?? null,
    processoId: null,
    totalPages: opts.totalPages ?? null,
    sizeBytes: 0,
    indexedStatus: opts.status ?? 'indexed',
    failedChunks: 0,
  }).returning();
  docIds.push(doc.id);
  return doc;
}

async function inserirChunk(
  docId: string,
  escId: string | null,
  texto: string,
  area = 'Cível',
  colecao = 'Jurisprudência'
) {
  await db.insert(chunks).values({
    documentoId: docId,
    colecao,
    texto,
    embedding: Array(1024).fill(0.01),
    metadata: { area, fonte: 'teste.pdf' },
    escritorioId: escId,
    processoId: null,
  });
}

// ---------------------------------------------------------------------------
// 1–6. Isolamento multi-tenant
// ---------------------------------------------------------------------------

test('01. usuário do escritório A não lista documentos do escritório B', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const escB = await criarEscritorio('Esc B');
  await inserirDocumento({ escId: escA, nome: 'a.pdf' });
  await inserirDocumento({ escId: escB, nome: 'b.pdf' });

  const lista = await listarDocumentosDoEscritorio(escA);
  assert.ok(lista.some((d) => d.nome === 'a.pdf'));
  assert.ok(!lista.some((d) => d.nome === 'b.pdf'), 'documento de B não pode aparecer para A');
});

test('02. usuário do escritório A não busca chunks do escritório B', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const escB = await criarEscritorio('Esc B');
  const docA = await inserirDocumento({ escId: escA, nome: 'docA.pdf' });
  const docB = await inserirDocumento({ escId: escB, nome: 'docB.pdf' });
  await inserirChunk(docA.id, escA, 'TEXTOA cláusula de juros abusivos');
  await inserirChunk(docB.id, escB, 'TEXTOB cláusula de juros abusivos');

  const res = await buscarChunksPorKeywords(escA, 'Cível', ['juros']);
  assert.ok(res.some((c) => c.texto.includes('TEXTOA')));
  assert.ok(!res.some((c) => c.texto.includes('TEXTOB')), 'chunk de B não pode ser recuperado por A');
});

test('03. usuário do escritório A não anexa documento ao processo do escritório B', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const escB = await criarEscritorio('Esc B');
  const procA = await criarProcesso(escA);
  const procB = await criarProcesso(escB);

  assert.equal(await validarProcessoDoEscritorio(procA, escA), true);
  assert.equal(await validarProcessoDoEscritorio(procB, escA), false);
  assert.equal(await validarProcessoDoEscritorio(undefined, escA), true);
});

test('04. usuário do escritório A não gera RAG usando coleção do escritório B', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const escB = await criarEscritorio('Esc B');
  const docA = await inserirDocumento({ escId: escA, nome: 'colA.pdf' });
  const docB = await inserirDocumento({ escId: escB, nome: 'colB.pdf' });
  await inserirChunk(docA.id, escA, 'TEXTOCOLA precedente vinculante');
  await inserirChunk(docB.id, escB, 'TEXTOCOLB precedente vinculante', 'Cível', 'Jurisprudência');

  // Fallback por palavras-chave e busca vetorial: ambos escopados ao escritório.
  const keyword = await buscarChunksPorKeywords(escA, 'Cível', ['precedente']);
  assert.ok(!keyword.some((c) => c.texto.includes('TEXTOCOLB')), 'busca keyword não pode vazar coleção de B');

  const vetorial = await buscarChunksPorEmbedding(escA, 'Cível', Array(1024).fill(0.01));
  assert.ok(!vetorial.some((c) => c.texto.includes('TEXTOCOLB')), 'busca vetorial não pode vazar coleção de B');
});

test('05. documento antigo sem escopo não aparece para usuários', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const legado = await inserirDocumento({ escId: null, status: 'unscoped', nome: 'legado.pdf' });
  await inserirChunk(legado.id, null, 'TEXTOLEGADO cláusula antiga');

  const lista = await listarDocumentosDoEscritorio(escA);
  assert.ok(!lista.some((d) => d.nome === 'legado.pdf'), 'documento em quarentena não aparece para A');

  const res = await buscarChunksPorKeywords(escA, 'Cível', ['textolegado']);
  assert.ok(!res.some((c) => c.texto.includes('TEXTOLEGADO')), 'chunk em quarentena não é recuperável');
});

test('06. root lista documentos sem escopo e associa manualmente (com propagação)', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const legado = await inserirDocumento({ escId: null, status: 'unscoped', nome: 'legado2.pdf' });
  await inserirChunk(legado.id, null, 'TEXTOLEGADO2');

  const semEscopo = await listarDocumentosSemEscopo();
  assert.ok(semEscopo.some((d) => d.id === legado.id), 'root vê documentos sem escopo');

  const res = await associarDocumentoEscritorio(legado.id, escA);
  assert.equal(res.documento.escritorioId, escA);
  assert.equal(res.documento.indexedStatus, 'indexed');
  assert.equal(res.chunksAtualizados, 1);

  const [chunkRow] = await db.select().from(chunks).where(eq(chunks.documentoId, legado.id)).limit(1);
  assert.equal(chunkRow.escritorioId, escA, 'chunk herdou o escritório na associação');

  const lista = await listarDocumentosDoEscritorio(escA);
  assert.ok(lista.some((d) => d.id === legado.id), 'documento associado aparece no escritório');

  await assert.rejects(() => associarDocumentoEscritorio(legado.id, escA), /já possui escopo/);
});

// ---------------------------------------------------------------------------
// 7–11. Upload: metadados, status e herança de escopo
// ---------------------------------------------------------------------------

test('07. upload salva total_pages', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const res = await processarUploadDocumento({
    nome: 'contrato.pdf',
    colecao: 'Jurisprudência',
    tamanho: '1 MB',
    totalPages: 12,
    escritorioId: escA,
    sizeBytes: 1024,
    chunkTexts: ['texto do documento um'],
    gerarEmbedding: embeddingFake,
  });
  docIds.push(res.documento.id);
  assert.equal(res.documento.totalPages, 12);
  assert.equal(res.documento.escritorioId, escA);
});

test('08. upload salva indexed_status', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const res = await processarUploadDocumento({
    nome: 'ok.pdf',
    colecao: 'Jurisprudência',
    tamanho: '1 MB',
    totalPages: 3,
    escritorioId: escA,
    sizeBytes: 2048,
    chunkTexts: ['texto um', 'texto dois'],
    gerarEmbedding: embeddingFake,
  });
  docIds.push(res.documento.id);
  assert.equal(res.status, 'indexed');
  assert.equal(res.documento.indexedStatus, 'indexed');
  assert.equal(res.chunksIndexed, 2);
  assert.equal(res.failedChunks, 0);
});

test('09. falha parcial atualiza failed_chunks e status failed', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const res = await processarUploadDocumento({
    nome: 'parcial.pdf',
    colecao: 'Jurisprudência',
    tamanho: '1 MB',
    totalPages: 5,
    escritorioId: escA,
    sizeBytes: 4096,
    chunkTexts: ['OK1', 'FALHA2', 'OK3', 'FALHA4', 'OK5'],
    gerarEmbedding: async (texto) => {
      if (texto.startsWith('FALHA')) throw new Error('embedding falhou');
      return Array(1024).fill(0.01);
    },
  });
  docIds.push(res.documento.id);
  assert.equal(res.chunksIndexed, 3);
  assert.equal(res.failedChunks, 2);
  assert.equal(res.status, 'failed');
  assert.equal(res.documento.failedChunks, 2);
  assert.equal(res.documento.chunks, 3);

  const rows = await db.select({ id: chunks.id }).from(chunks).where(eq(chunks.documentoId, res.documento.id));
  assert.equal(rows.length, 3, 'apenas os chunks bem-sucedidos são persistidos');
});

test('10. novo chunk herda o escritório e o processo do documento', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const procA = await criarProcesso(escA);
  const res = await processarUploadDocumento({
    nome: 'heranca.pdf',
    colecao: 'Jurisprudência',
    tamanho: '1 MB',
    totalPages: 2,
    escritorioId: escA,
    processoId: procA,
    sizeBytes: 512,
    chunkTexts: ['texto com herança de escopo'],
    gerarEmbedding: embeddingFake,
  });
  docIds.push(res.documento.id);

  const [chunkRow] = await db.select().from(chunks).where(eq(chunks.documentoId, res.documento.id)).limit(1);
  assert.equal(chunkRow.escritorioId, escA);
  assert.equal(chunkRow.processoId, procA);
});

test('11. tentativa de enviar escritorio_id diferente é rejeitada (e igual é ignorada)', () => {
  const rejeitado = validarEscritorioInformadoNoBody('escritorio-B', 'escritorio-A');
  assert.equal(rejeitado.ok, false);

  const igual = validarEscritorioInformadoNoBody('escritorio-A', 'escritorio-A');
  assert.equal(igual.ok, true);

  const ausente = validarEscritorioInformadoNoBody(undefined, 'escritorio-A');
  assert.equal(ausente.ok, true);

  const vazio = validarEscritorioInformadoNoBody('', 'escritorio-A');
  assert.equal(vazio.ok, true);
});

// ---------------------------------------------------------------------------
// 12. Filtro de área dentro do escritório
// ---------------------------------------------------------------------------

test('12. filtro de área continua funcionando dentro do escritório correto', { skip: !dbDisponivel }, async () => {
  const escA = await criarEscritorio('Esc A');
  const docA = await inserirDocumento({ escId: escA, nome: 'areas.pdf' });
  await inserirChunk(docA.id, escA, 'TEXTOAREACIVEL cláusula contratual', 'Cível');
  await inserirChunk(docA.id, escA, 'TEXTOAREATRAB cláusula trabalhista', 'Trabalhista');

  const civel = await buscarChunksPorKeywords(escA, 'Cível', ['cláusula']);
  assert.ok(civel.some((c) => c.texto.includes('TEXTOAREACIVEL')));
  assert.ok(!civel.some((c) => c.texto.includes('TEXTOAREATRAB')), 'área Trabalhista não vaza na busca Cível de A');

  // Área funciona apenas quando combinada com o escritório certo (teste 4 cobre B).
  const trabalhista = await buscarChunksPorKeywords(escA, 'Trabalhista', ['cláusula']);
  assert.ok(trabalhista.some((c) => c.texto.includes('TEXTOAREATRAB')));
});
