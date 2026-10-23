// ===========================================================================
// Fase 2A — Isolamento multi-tenant de documentos/chunks + metadados mínimos.
//
// Toda operação deriva o escritório do CONTEXTO AUTENTICADO (nunca do cliente).
// Documentos legados sem `escritorio_id` ficam em quarentena (`unscoped`) e só
// voltam ao uso após associação manual pelo root (com auditoria).
// ===========================================================================

import { db } from '../db/client.js';
import { documentos, chunks, processos, escritorios } from '../db/schema.js';
import { and, eq, isNull, ne, or, sql, desc, cosineDistance, type SQL } from 'drizzle-orm';
import { generateEmbedding } from './embedding.js';

export type IndexedStatus = 'pending' | 'processing' | 'indexed' | 'failed' | 'unscoped';

/** Limite de storage por escritório: 1 GB binário (1.073.741.824 bytes). */
export const STORAGE_LIMIT_BYTES = 1_073_741_824;

export interface DocumentoUploadInput {
  nome: string;
  colecao: string;
  tamanho: string;
  area?: string;
  totalPages: number | null;
  escritorioId: string;
  processoId?: string | null;
  // Fase 8A — vínculo opcional a um cliente do MESMO escritório (validado na
  // rota antes de chegar aqui). Os chunks herdam o escopo do documento.
  clienteId?: string | null;
  usuarioId?: string | null;
  // Fase 8B — tamanho em bytes do arquivo original (limite de 1 GB por escritório).
  sizeBytes: number;
  chunkTexts: string[];
  /** Injetável para testes (padrão: generateEmbedding — Token Plan). */
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
 * documento e atualiza o status final. Falha total de embeddings NÃO remove o
 * registro: o documento é mantido como `failed` (o upload continua funcionando
 * mesmo sem serviço de embeddings — apenas sem busca vetorial). Falha parcial é
 * registrada em `failed_chunks` e o documento vai para `failed`.
 */
export async function processarUploadDocumento(input: DocumentoUploadInput): Promise<DocumentoUploadResult> {
  const [novo] = await db.insert(documentos).values({
    nome: input.nome,
    colecao: input.colecao,
    tamanho: input.tamanho,
    chunks: 0,
    escritorioId: input.escritorioId,
    processoId: input.processoId ?? null,
    clienteId: input.clienteId ?? null,
    area: input.area ?? null,
    usuarioId: input.usuarioId ?? null,
    totalPages: input.totalPages,
    sizeBytes: input.sizeBytes,
    indexedStatus: 'processing',
    failedChunks: 0,
    updatedAt: new Date(),
  }).returning({ id: documentos.id });

  return indexarChunksDoDocumento(novo.id, input);
}

/** Indexa (chunks + embeddings) um documento JÁ persistido e devolve o
 *  resultado consolidado. Extraído na 4B para o upload do piloto persistir o
 *  documento (contagem) sob advisory lock SEM segurar o lock durante a
 *  geração de embeddings (processamento pesado). */
export async function indexarChunksDoDocumento(documentoId: string, input: DocumentoUploadInput): Promise<DocumentoUploadResult> {
  const gerar = input.gerarEmbedding ?? generateEmbedding;
  const totalChunks = input.chunkTexts.length;
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
        clienteId: input.clienteId ?? null,
      });
      indexedCount += 1;
    } catch {
      failedChunks += 1;
    }
  }

  if (indexedCount === 0) {
    // Nenhum chunk indexado (ex.: serviço de embeddings indisponível): o
    // documento é MANTIDO persistido com status `failed` — o upload continua
    // funcionando, apenas sem busca vetorial.
    // Não lança erro nem remove o registro (pode ser reindexado depois).
    const [atualizado] = await db.update(documentos).set({
      chunks: 0,
      failedChunks: totalChunks,
      indexedStatus: 'failed',
      indexedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(documentos.id, documentoId)).returning();

    return {
      documento: atualizado,
      totalChunks,
      chunksIndexed: 0,
      failedChunks: totalChunks,
      status: 'failed',
    };
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

/** Lista APENAS os documentos do escritório (quarentena/unscoped excluída).
 *  Fase 8A: `clienteId` opcional filtra por cliente — o escopo do escritório
 *  é SEMPRE aplicado, mesmo com o filtro de cliente (nenhum documento sem
 *  escopo é retornado). */
export async function listarDocumentosDoEscritorio(escritorioId: string, clienteId?: string | null) {
  if (clienteId) {
    return db.select().from(documentos)
      .where(and(
        eq(documentos.escritorioId, escritorioId),
        eq(documentos.clienteId, clienteId),
        ne(documentos.indexedStatus, 'unscoped'),
      ))
      .orderBy(desc(documentos.indexado));
  }
  return db.select().from(documentos)
    .where(eq(documentos.escritorioId, escritorioId))
    .orderBy(desc(documentos.indexado));
}

/** Soma o storage (bytes) de TODOS os documentos do escritório — usado no
 *  check do upload e na barra de storage do frontend. `SUM(bigint)` volta como
 *  string do driver; `Number()` normaliza. */
export async function calcularStorageEscritorio(escritorioId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<bigint>`COALESCE(SUM(size_bytes), 0)` })
    .from(documentos)
    .where(eq(documentos.escritorioId, escritorioId));
  return Number(rows[0]?.total ?? 0);
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
/** Escritório técnico da Base Legislativa (documentos válidos para todos os
 *  escritórios). Configurado por `RAG_GLOBAL_ESCRITORIO_ID`; ausente = desligado. */
export function escritorioBaseLegislativa(): string | null {
  return process.env.RAG_GLOBAL_ESCRITORIO_ID || null;
}

function condicoesProprias(escritorioId: string, area: string | null, processoId?: string | null): SQL[] {
  const proprio: SQL[] = [eq(chunks.escritorioId, escritorioId)];
  if (area) proprio.push(sql`${chunks.metadata}->>'area' = ${area}`);
  if (processoId) proprio.push(eq(chunks.processoId, processoId));
  return proprio;
}

/** Vagas reservadas à Base Legislativa quando ela existe. As leis são grandes e
 *  podem ocupar a busca inteira; por isso o escritório mantém a maioria das vagas. */
const VAGAS_BASE_LEGISLATIVA = 2;

/** Busca em duas partes: o escritório tem prioridade e a Base Legislativa entra
 *  em no máximo VAGAS_BASE_LEGISLATIVA vagas (ou nas vagas que sobrarem). */
async function buscarDividido<T extends { texto: string }>(
  escritorioId: string,
  limit: number,
  consultar: (conds: SQL[], n: number) => Promise<T[]>,
  condsProprias: SQL[],
): Promise<T[]> {
  const global = escritorioBaseLegislativa();
  if (!global || global === escritorioId) {
    return consultar(condsProprias, limit);
  }
  const reserva = Math.min(VAGAS_BASE_LEGISLATIVA, limit);
  const proprios = await consultar(condsProprias, limit - reserva);
  const legis = await consultar([eq(chunks.escritorioId, global)], limit);
  const restante = Math.max(0, limit - proprios.length);
  return [...proprios, ...legis.slice(0, restante)];
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
  const consultar = (conds: SQL[], n: number) => n <= 0 ? Promise.resolve([]) : db
    .select({ texto: chunks.texto, metadata: chunks.metadata, similarity })
    .from(chunks)
    .where(whereDe(conds))
    .orderBy((t) => desc(t.similarity))
    .limit(n);
  const achados = await buscarDividido(escritorioId, limit, consultar, condicoesProprias(escritorioId, area, processoId));
  return achados.sort((a, b) => Number(b.similarity) - Number(a.similarity));
}

export async function buscarChunksPorKeywords(
  escritorioId: string,
  area: string | null,
  keywords: string[],
  limit = 5,
  processoId?: string | null,
): Promise<ChunkRag[]> {
  const likeClauses = keywords.map((k) => sql`${chunks.texto} ILIKE ${'%' + k.replace(/'/g, "''") + '%'}`);
  const extra = likeClauses.length > 0 ? [or(...likeClauses) as SQL] : [];
  const consultar = async (conds: SQL[], n: number) => {
    if (n <= 0) return [];
    const rows = await db
      .select({ texto: chunks.texto, metadata: chunks.metadata })
      .from(chunks)
      .where(whereDe([...conds, ...extra]))
      .limit(n);
    return rows.map((r) => ({ texto: r.texto, metadata: r.metadata, similarity: 0 }));
  };
  return buscarDividido(escritorioId, limit, consultar, condicoesProprias(escritorioId, area, processoId));
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
