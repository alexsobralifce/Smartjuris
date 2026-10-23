import { Router } from 'express';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, documentoEscritorioSchema, uuidSchema } from '../validation/schemas.js';
import { listarDocumentosSemEscopo, associarDocumentoEscritorio, processarUploadDocumento, escritorioBaseLegislativa } from '../services/documento.js';
import { generateEmbedding } from '../services/embedding.js';
import { db } from '../db/client.js';
import { documentos } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import multer from 'multer';
import { extrairTexto, formatoSuportado } from '../services/extracaoTexto.js';

// Rotas administrativas (root) da quarentena de documentos legados sem escopo.
// Montado em /api/root/documentos com authMiddleware + requireRoot (server.ts).
const router = Router();

// GET /unscoped — lista documentos sem escritorio_id (quarentena) p/ associação.
router.get('/unscoped', async (_req, res) => {
  try {
    const rows = await listarDocumentosSemEscopo();
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar documentos sem escopo:', error);
    res.status(500).json({ error: 'Erro ao listar documentos sem escopo.' });
  }
});

// PATCH /:id/escritorio — associa manualmente documento sem escopo a um escritório
// (propaga aos chunks e sai da quarentena). Auditoria obrigatória.
router.patch('/:id/escritorio', async (req, res) => {
  try {
    const id = req.params.id;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const parsed = parseBody(documentoEscritorioSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const resultado = await associarDocumentoEscritorio(id, parsed.data.escritorioId);
    await recordAudit(req, 'ASSOCIAR_DOCUMENTO_ESCRITORIO', {
      alvoId: resultado.documento.id,
      detalhes: {
        escritorioId: parsed.data.escritorioId,
        chunksAtualizados: resultado.chunksAtualizados,
      },
    });
    res.json(resultado.documento);
  } catch (error: any) {
    const msg = error?.message ?? '';
    if (msg.includes('não encontrado') || msg.includes('já possui escopo')) {
      return res.status(400).json({ error: msg });
    }
    console.error('Erro ao associar documento ao escritório:', error);
    res.status(500).json({ error: 'Erro ao associar documento ao escritório.' });
  }
});

// ---------------------------------------------------------------------------
// Base Legislativa (global): PDFs de legislação válidos para todos os escritórios.
// Indexados no escritório técnico configurado em RAG_GLOBAL_ESCRITORIO_ID.
// ---------------------------------------------------------------------------
const uploadLegislacao = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (formatoSuportado(file.originalname)) cb(null, true);
    else cb(new Error('Formato não suportado. Use PDF, DOCX, HTML, Markdown ou TXT.'));
  },
});

router.get('/legislacao', async (_req, res) => {
  const global = escritorioBaseLegislativa();
  if (!global) return res.json([]);
  try {
    const rows = await db.select().from(documentos)
      .where(eq(documentos.escritorioId, global))
      .orderBy(desc(documentos.createdAt));
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar base legislativa:', error);
    res.status(500).json({ error: 'Erro ao listar base legislativa.' });
  }
});

router.post('/legislacao', uploadLegislacao.single('file'), async (req, res) => {
  const global = escritorioBaseLegislativa();
  if (!global) {
    return res.status(503).json({ error: 'Base Legislativa não configurada (RAG_GLOBAL_ESCRITORIO_ID ausente).' });
  }
  const arquivo = req.file;
  if (!arquivo) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  if (arquivo.originalname.toLowerCase().endsWith('.pdf') && !arquivo.buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
    return res.status(400).json({ error: 'Arquivo inválido: o conteúdo não é um PDF válido.' });
  }
  if (arquivo.originalname.toLowerCase().endsWith('.docx') && !arquivo.buffer.subarray(0, 2).toString('latin1').startsWith('PK')) {
    return res.status(400).json({ error: 'Arquivo inválido: o conteúdo não é um DOCX válido.' });
  }
  try {
    const { texto, paginas } = await extrairTexto(arquivo.buffer, arquivo.originalname);
    const totalPages = paginas;
    const rawChunks = texto.split('\n\n').filter((c: string) => c.trim().length > 50);
    const colecao = typeof req.body?.colecao === 'string' && req.body.colecao.trim() ? req.body.colecao.trim().slice(0, 80) : 'Legislação';
    const sizeMB = (arquivo.size / (1024 * 1024)).toFixed(2);
    const resultado = await processarUploadDocumento({
      nome: arquivo.originalname,
      colecao,
      tamanho: `${sizeMB} MB`,
      area: undefined,
      totalPages,
      escritorioId: global,
      processoId: null,
      clienteId: null,
      usuarioId: (req as any).user?.id ?? null,
      sizeBytes: arquivo.size,
      chunkTexts: rawChunks,
      gerarEmbedding: async (texto: string, usuarioId?: string) => generateEmbedding(texto, usuarioId),
    });
    await recordAudit(req, 'UPLOAD_BASE_LEGISLATIVA', {
      alvoId: resultado.documento.id,
      detalhes: { nome: arquivo.originalname, colecao, chunks: resultado.chunksIndexed, failedChunks: resultado.failedChunks, status: resultado.status },
    });
    res.status(201).json({
      ...resultado.documento,
      chunksIndexed: resultado.chunksIndexed,
      ...(resultado.status === 'failed' ? { warning: 'Documento salvo sem indexação vetorial (serviço de embeddings indisponível).' } : {}),
    });
  } catch (error) {
    console.error('Erro ao indexar legislação:', error);
    res.status(500).json({ error: 'Erro ao indexar legislação.' });
  }
});

export default router;
