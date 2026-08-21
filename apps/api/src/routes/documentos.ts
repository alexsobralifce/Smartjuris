import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { documentos, chunks, documentosGerados } from '../db/schema.js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { generateEmbedding } from '../services/embedding.js';
import { checkTokenQuota } from '../services/usage.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { parseBody, formatZodError, colecaoSchema } from '../validation/schemas.js';
import { aiRateLimiter } from '../middlewares/rateLimit.js';
import { recordAudit } from '../middlewares/audit.js';
import { eq } from 'drizzle-orm';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Somente arquivos PDF são permitidos.'));
    }
  },
});

// Converte erros do multer (tamanho/tipo) em respostas JSON
function handleUploadError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Arquivo excede o limite de 15 MB.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
}

router.get('/', async (req, res) => {
  try {
    const data = await db.select().from(documentos).orderBy(documentos.indexado);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
});

router.post('/upload', aiRateLimiter, upload.single('file'), handleUploadError, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    const parsed = parseBody(colecaoSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const colecao = parsed.data.colecao;

    // Cota de tokens do modo demo: bloqueia a indexação (geração de embeddings)
    const quota = await checkTokenQuota(req as AuthenticatedRequest);
    if (quota.status === 'blocked') {
      return res.status(403).json({
        error: 'Limite de tokens do modo demonstração atingido. A indexação de documentos está bloqueada até o próximo mês.',
        code: 'TOKEN_LIMIT_EXCEEDED',
      });
    }
    
    // Mock upload flow for Phase 1 -> Now Real Flow!
    const sizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

    // Valida magic bytes do PDF (conteúdo deve começar com %PDF)
    const header = req.file.buffer.subarray(0, 5).toString('latin1');
    if (!header.startsWith('%PDF')) {
      return res.status(400).json({ error: 'Arquivo inválido: o conteúdo não é um PDF válido.' });
    }
    
    // Parse PDF
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;

    // Simple chunking (e.g. by paragraphs or fixed length)
    const rawChunks = text.split('\n\n').filter((c: string) => c.trim().length > 50);
    
    const novo = await db.insert(documentos).values({
      nome: req.file.originalname,
      colecao,
      tamanho: `${sizeMB} MB`,
      chunks: rawChunks.length,
    }).returning();
    
    const docId = novo[0].id;

    // Process chunks and get embeddings
    let indexedCount = 0;
    for (const chunkText of rawChunks) {
      try {
        const embedding = await generateEmbedding(chunkText, (req as any).user?.id);
        await db.insert(chunks).values({
          documentoId: docId,
          colecao,
          texto: chunkText,
          embedding,
          metadata: { fonte: req.file.originalname, ...(parsed.data.area ? { area: parsed.data.area } : {}) }
        });
        indexedCount += 1;
      } catch (e) {
        console.error('Error generating embedding for chunk:', e);
      }
    }

    // Nenhum chunk foi indexado (ex.: serviço de embeddings indisponível):
    // remove o registro enganoso do documento e falha a operação em vez de retornar 201.
    if (indexedCount === 0) {
      await db.delete(documentos).where(eq(documentos.id, docId));
      await db.delete(documentosGerados).where(eq(documentosGerados.documentoId, docId));
      return res.status(502).json({ error: 'Falha ao indexar o documento: serviço de embeddings indisponível.' });
    }

    // Mantém a contagem de chunks do documento coerente com o que realmente foi indexado
    if (indexedCount !== rawChunks.length) {
      await db.update(documentos).set({ chunks: indexedCount }).where(eq(documentos.id, docId));
    }

    await recordAudit(req, 'UPLOAD_DOCUMENTO', {
      alvoId: docId,
      detalhes: { nome: req.file.originalname, colecao, tamanho: `${sizeMB} MB`, chunks: indexedCount },
    });

    await db.insert(documentosGerados).values({
      usuarioId: (req as any).user?.id || null,
      documentoId: docId,
      tipo: 'upload',
      titulo: req.file.originalname,
    });

    res.status(201).json({ ...novo[0], chunksIndexed: indexedCount });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
});

export default router;
