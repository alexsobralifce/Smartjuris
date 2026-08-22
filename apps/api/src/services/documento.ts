// ===========================================================================
// Fase 2A — Isolamento multi-tenant de documentos/chunks + metadados mínimos.
//
// Toda operação deriva o escritório do CONTEXTO AUTENTICADO (nunca do cliente).
// Documentos legados sem `escritorio_id` ficam em quarentena (`unscoped`) e só
// voltam ao uso após associação manual pelo root (com auditoria).
// ===========================================================================

import { db } from '../db/client.js';
import { documentos, chunks, processos, escritorios } from '../db/schema.js';
import { and, eq, isNull, or, sql, desc, cosineDistance, type SQL } from 'drizzle-orm';
import { generateEmbedding } from './embedding.js';

export type IndexedStatus = 'pending' | 'processing' | 'indexed' | 'failed' | 'unscoped';

export interface DocumentoUploadInput {
  nome: string;
  colecao: string;
  tamanho: string;
  area?: string;
  totalPages: number | null;
  escritorioId: string;
  processoId?: string | null;
  usuarioId?: string | null;
  chunkTexts: string[];
  /** Injetável para testes (padrão: embedding BGE-M3 via Ollama). */
  gerarEmbedding?: (texto: string, usuarioId?: string) => Promise<number[]>;
}

export interface DocumentoUploadResult {
  documento: typeof documentos.$inferSelect;
  totalChunks: number;
  chunksIndexed: number;
  failedChunks: number;
  status: 'indexed' | 'failed';
}

/**
 * Persiste o documento (status `processing`), gera os chunks com o escopo do
 * documento e atualiza o status final. Se NENHUM chunk for indexado, remove o
 * registro e lança erro (o serviço de embeddings está indisponível). Falha
 * parcial é registrada em `failed_chunks` e o documento vai para `failed`.
 */
export async function processarUploadDocumento(input: DocumentoUploadInput): Promise<DocumentoUploadResult> {
  const gerar = input.gerarEmbedding ?? generateEmbedding;
  const totalChunks = input.chunkTexts.length;

  const [novo] = await db.insert(documentos).values({
    nome: input.nome,
    colecao: input.colecao,
    tamanho: input.tamanho,
    chunks: 0,
    escritorioId: input.escritorioId,
    processoId: input.processoId ?? null,
    totalPages: input.totalPages,
    indexedStatus: 'processing',
    failedChunks: 0,
    updatedAt: new Date(),
  }).returning({ id: documentos.id });

  const documentoId = novo.id;
  const metadata: Record<string, string> = { fonte: input.nome };
  if (input.area) metadata.area = input.area;

  let indexedCount = 0;
  let failedChunks = 0;
  for (const texto of input.chunkTexts) {
    try {
      const embedding = await gerar(texto, input.usuarioId ?? undefined);
      await db.insert(chunks).values({
        documentoId,
        colecao: input.colecao,
        texto,
        embedding,
        metadata,
        escritorioId: input.escritorioId,
        processoId: input.processoId ?? null,
      });
      indexedCount += 1;
    } catch {
      failedChunks += 1;
    }
  }

  if (indexedCount === 0) {
    // Nenhum chunk indexado (ex.: embeddings indisponíveis): remove o registro
    // enganoso em vez de deixar um documento "processing" para sempre.
    await db.delete(documentos).where(eq(documentos.id, documentoId));
    throw new Error('Falha ao indexar o documento: serviço de embeddings indisponível.');
  }

  const status: 'indexed' | 'failed' = failedChunks > 0 ? 'failed' : 'indexed';
  const [atualizado] = await db.update(documentos).set({
    chunks: indexedCount,
    failedChunks,
    indexedStatus: status,
    indexedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(documentos.id, documentoId)).returning();

  return {
    documento: atualizado,
    totalChunks,
    chunksIndexed: indexedCount,
    failedChunks,
    status,
  };
}

/** Valida que um processo pertence ao escritório (usado no upload e no RAG). */
export async function validarProcessoDoEscritorio(
  processoId: string | null | undefined,
  escritorioId: string
): Promise<boolean> {
  if (!processoId) return true;
  const rows = await db.select({ id: processos.id }).from(processos)
    .where(and(eq(processos.id, processoId), eq(processos.escritorioId, escritorioId)))
    .limit(1);
  return rows.length > 0;
}

/** Puro: `escritorio_id` enviado no body nunca é aceito diferente do autenticado. */
export function validarEscritorioInformadoNoBody(
  informado: unknown,
  autenticado: string
): { ok: true } | { ok: false; motivo: string } {
  if (informado === undefined || informado === null || informado === '') return { ok: true };
  if (String(informado) === autenticado) return { ok: true }; // igual: ignora silenciosamente
  return { ok: false, motivo: 'escritorio_id é derivado do contexto autenticado e não pode ser diferente.' };
}

/** Lista APENAS os documentos do escritório (quarentena/unscoped excluída). */
export async function listarDocumentosDoEscritorio(escritorioId: string) {
  return db.select().from(documentos)
    .where(eq(documentos.escritorioId, escritorioId))
    .orderBy(desc(documentos.indexado));
}

// ---------------------------------------------------------------------------
// Consultas RAG escopadas por escritório (área continua sendo filtro adicional)
// ---------------------------------------------------------------------------

export interface ChunkRag {
  texto: string;
  metadata: unknown;
  similarity: number;
}

/** Condições de escopo: escritório OBRIGATÓRIO + filtros adicionais de área
 *  e/ou PROCESSO (o chunk herda processo_id do documento de origem — 2A).
 *  O `processoId` é sempre validado como pertencente ao escritório pelo
 *  chamador antes de chegar aqui. */
function condicoesEscopo(escritorioId: string, area: string | null, processoId?: string | null): SQL[] {
  const conds: SQL[] = [eq(chunks.escritorioId, escritorioId)];
  if (area) conds.push(sql`${chunks.metadata}->>'area' = ${area}`);
  if (processoId) conds.push(eq(chunks.processoId, processoId));
  return conds;
}

function whereDe(conds: SQL[]): SQL {
  // conds nunca é vazio (sempre tem o escopo do escritório); `and` tipa como
  // `SQL | undefined` apenas porque aceita zero condições.
  return conds.length === 1 ? conds[0] : (and(...conds) as SQL);
}

export async function buscarChunksPorEmbedding(
  escritorioId: string,
  area: string | null,
  embedding: number[],
  limit = 5,
  processoId?: string | null,
): Promise<ChunkRag[]> {
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, embedding)})`;
  return db
    .select({ texto: chunks.texto, metadata: chunks.metadata, similarity })
    .from(chunks)
    .where(whereDe(condicoesEscopo(escritorioId, area, processoId)))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);
}

export async function buscarChunksPorKeywords(
  escritorioId: string,
  area: string | null,
  keywords: string[],
  limit = 5,
  processoId?: string | null,
): Promise<ChunkRag[]> {
  const conds = condicoesEscopo(escritorioId, area, processoId);
  const likeClauses = keywords.map((k) => sql`${chunks.texto} ILIKE ${'%' + k.replace(/'/g, "''") + '%'}`);
  if (likeClauses.length > 0) conds.push(or(...likeClauses) as SQL);
  const rows = await db
    .select({ texto: chunks.texto, metadata: chunks.metadata })
    .from(chunks)
    .where(whereDe(conds))
    .limit(limit);
  return rows.map((r) => ({ texto: r.texto, metadata: r.metadata, similarity: 0 }));
}

export async function buscarChunksRecentes(escritorioId: string, limit = 5): Promise<ChunkRag[]> {
  const rows = await db
    .select({ texto: chunks.texto, metadata: chunks.metadata })
    .from(chunks)
    .where(eq(chunks.escritorioId, escritorioId))
    .limit(limit);
  return rows.map((r) => ({ texto: r.texto, metadata: r.metadata, similarity: 0 }));
}

// ---------------------------------------------------------------------------
// Admin (root): quarentena de documentos sem escopo
// ---------------------------------------------------------------------------

/** Root: lista documentos legados SEM escopo (quarentena) para associação. */
export async function listarDocumentosSemEscopo() {
  return db.select().from(documentos)
    .where(isNull(documentos.escritorioId))
    .orderBy(desc(documentos.indexado));
}

/**
 * Root: associa manualmente um documento sem escopo a um escritório,
 * propagando o escopo aos chunks e saindo da quarentena (indexed).
 * Lança erro se o documento já possui escopo ou o escritório não existe.
 */
export async function associarDocumentoEscritorio(
  documentoId: string,
  escritorioId: string
): Promise<{ documento: typeof documentos.$inferSelect; chunksAtualizados: number }> {
  const [esc] = await db.select({ id: escritorios.id }).from(escritorios)
    .where(eq(escritorios.id, escritorioId)).limit(1);
  if (!esc) throw new Error('Escritório não encontrado.');

  const [doc] = await db.select().from(documentos).where(eq(documentos.id, documentoId)).limit(1);
  if (!doc) throw new Error('Documento não encontrado.');
  if (doc.escritorioId != null) throw new Error('Documento já possui escopo.');

  const [atualizado] = await db.update(documentos).set({
    escritorioId,
    indexedStatus: 'indexed',
    updatedAt: new Date(),
  }).where(eq(documentos.id, documentoId)).returning();

  const chunkRows = await db.update(chunks).set({ escritorioId })
    .where(eq(chunks.documentoId, documentoId)).returning({ id: chunks.id });

  return { documento: atualizado, chunksAtualizados: chunkRows.length };
}
