import { Router } from 'express';
import { db } from '../db/client.js';
import { documentos, chunks, documentosGerados } from '../db/schema.js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { generateEmbedding } from '../services/embedding.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', async (req, res) => {
  try {
    const data = await db.select().from(documentos).orderBy(documentos.indexado);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    const { colecao } = req.body;
    
    // Mock upload flow for Phase 1 -> Now Real Flow!
    const sizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
    
    // Parse PDF
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;

    // Simple chunking (e.g. by paragraphs or fixed length)
    const rawChunks = text.split('\n\n').filter((c: string) => c.trim().length > 50);
    
    const novo = await db.insert(documentos).values({
      nome: req.file.originalname,
      colecao: colecao || 'Jurisprudência',
      tamanho: `${sizeMB} MB`,
      chunks: rawChunks.length,
    }).returning();
    
    const docId = novo[0].id;

    await db.insert(documentosGerados).values({
      usuarioId: (req as any).user?.id || null,
      documentoId: docId,
      tipo: 'upload',
      titulo: req.file.originalname,
    });

    // Process chunks and get embeddings
    for (const chunkText of rawChunks) {
      try {
        const embedding = await generateEmbedding(chunkText, (req as any).user?.id);
        await db.insert(chunks).values({
          documentoId: docId,
          colecao: colecao || 'Jurisprudência',
          texto: chunkText,
          embedding,
          metadata: { fonte: req.file.originalname }
        });
      } catch (e) {
        console.error('Error generating embedding for chunk:', e);
      }
    }

    
    res.status(201).json(novo[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
});

export default router;
