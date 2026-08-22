import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { documentos, documentosGerados } from '../db/schema.js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { generateEmbedding } from '../services/embedding.js';
import { checkTokenQuota } from '../services/usage.js';
import {
  processarUploadDocumento,
  indexarChunksDoDocumento,
  validarProcessoDoEscritorio,
  validarEscritorioInformadoNoBody,
  listarDocumentosDoEscritorio,
} from '../services/documento.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { parseBody, formatZodError, colecaoSchema } from '../validation/schemas.js';
import { aiRateLimiter } from '../middlewares/rateLimit.js';
import { recordAudit } from '../middlewares/audit.js';

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

// GET / — lista SOMENTE os documentos do escritório autenticado.
// Documentos sem escopo (quarentena 'unscoped') nunca aparecem aqui.
router.get('/', async (req, res) => {
  try {
    const escritorioId = tenantScopeEscritorioId(req as AuthenticatedRequest);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const data = await listarDocumentosDoEscritorio(escritorioId);
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

    // 1. Escopo derivado do CONTEXTO AUTENTICADO (nunca do body).
    const escritorioId = tenantScopeEscritorioId(req as AuthenticatedRequest);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }

    // 11. Nunca confia em escritorio_id enviado pelo frontend: diferente → rejeita.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const escInformado = body.escritorioId ?? body.escritorio_id;
    const escCheck = validarEscritorioInformadoNoBody(escInformado, escritorioId);
    if (!escCheck.ok) {
      await recordAudit(req, 'UPLOAD_DOCUMENTO_BLOQUEADO', {
        detalhes: { motivo: 'escritorio-id-informado-diferente' },
      });
      return res.status(403).json({ error: escCheck.motivo });
    }

    const parsed = parseBody(colecaoSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { colecao, area, processoId } = parsed.data;

    // 3/10. processoId (se enviado) deve pertencer ao MESMO escritório.
    if (processoId) {
      const pertence = await validarProcessoDoEscritorio(processoId, escritorioId);
      if (!pertence) {
        await recordAudit(req, 'UPLOAD_DOCUMENTO_BLOQUEADO', {
          alvoId: processoId,
          detalhes: { motivo: 'processo-de-outro-escritorio' },
        });
        return res.status(403).json({ error: 'Processo informado não pertence ao escritório do usuário.' });
      }
    }

    // Fase 4B — piloto controlado: teto de documentos por escritório (upload).
    const { excedeLimiteDocumentosPiloto } = await import('../services/pilotMode.js');
    if (await excedeLimiteDocumentosPiloto(escritorioId)) {
      return res.status(403).json({
        error: 'O piloto controlado limitou temporariamente o upload de documentos neste escritório.',
        code: 'PILOTO_LIMITE_DOCUMENTOS',
      });
    }

    // Cota de tokens do modo demo: bloqueia a indexação (geração de embeddings)
    const quota = await checkTokenQuota(req as AuthenticatedRequest);
    if (quota.status === 'blocked') {
      return res.status(403).json({
        error: 'Limite de tokens do modo demonstração atingido. A indexação de documentos está bloqueada até o próximo mês.',
        code: 'TOKEN_LIMIT_EXCEEDED',
      });
    }

    const sizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

    // Valida magic bytes do PDF (conteúdo deve começar com %PDF)
    const header = req.file.buffer.subarray(0, 5).toString('latin1');
    if (!header.startsWith('%PDF')) {
      return res.status(400).json({ error: 'Arquivo inválido: o conteúdo não é um PDF válido.' });
    }

    // 4. numPages do PDF → total_pages (pdf-parse expõe `numpages`).
    const pdfData = await pdfParse(req.file.buffer);
    const totalPages = Number((pdfData as any).numpages) || null;

    // 5–9. Persistência via serviço (escopo + status + failed_chunks).
    // Fase 4B — piloto: teto de documentos verificado+persistido ATOMICAMENTE
    // sob advisory lock, APENAS quando o piloto está ativo com limite
    // configurado. O lock cobre só contagem + insert do documento (persistência
    // indispensável); a indexação (embeddings) roda FORA do lock. Piloto
    // desligado/sem limite → caminho original, sem transação/lock adicional.
    const rawChunks = pdfData.text.split('\n\n').filter((c: string) => c.trim().length > 50);
    const arquivo = req.file; // já validado acima (`if (!req.file)` → 400)
    const baseUpload = {
      nome: arquivo!.originalname,
      colecao,
      tamanho: `${sizeMB} MB`,
      area,
      totalPages,
      escritorioId,
      processoId: processoId ?? null,
      usuarioId: (req as any).user?.id ?? null,
      chunkTexts: rawChunks,
      gerarEmbedding: async (texto: string, usuarioId?: string) => generateEmbedding(texto, usuarioId),
    };
    let resultado;
    const { configPiloto } = await import('../services/pilotMode.js');
    const cfgPiloto = configPiloto();
    if (cfgPiloto.ativo && cfgPiloto.maxDocumentosPorEscritorio != null) {
      const { comSlotPiloto: slotDocs, ErroPilotoLimite } = await import('../services/pilotMode.js');
      const { excedeLimiteDocumentosPiloto: excedeDocsPiloto } = await import('../services/pilotMode.js');
      const documentoId = await slotDocs(`piloto:documentos:${escritorioId}`, async (tx) => {
        if (await excedeDocsPiloto(escritorioId)) {
          throw new ErroPilotoLimite('PILOTO_LIMITE_DOCUMENTOS');
        }
        const [doc] = await tx.insert(documentos).values({
          nome: arquivo!.originalname,
          colecao,
          tamanho: `${sizeMB} MB`,
          chunks: 0,
          escritorioId,
          processoId: processoId ?? null,
          totalPages,
          indexedStatus: 'processing',
          failedChunks: 0,
          updatedAt: new Date(),
        }).returning({ id: documentos.id });
        return doc.id;
      });
      // Indexação FORA do lock (embeddings são lentos; não seguram o advisory lock).
      resultado = await indexarChunksDoDocumento(documentoId, baseUpload);
    } else {
      resultado = await processarUploadDocumento(baseUpload);
    }

    await recordAudit(req, 'UPLOAD_DOCUMENTO', {
      alvoId: resultado.documento.id,
      detalhes: {
        nome: req.file.originalname,
        colecao,
        tamanho: `${sizeMB} MB`,
        chunks: resultado.chunksIndexed,
        failedChunks: resultado.failedChunks,
        totalPages,
        processoId: processoId ?? null,
        status: resultado.status,
      },
    });

    await db.insert(documentosGerados).values({
      usuarioId: (req as any).user?.id || null,
      documentoId: resultado.documento.id,
      tipo: 'upload',
      titulo: req.file.originalname,
    });

    res.status(201).json({ ...resultado.documento, chunksIndexed: resultado.chunksIndexed });
  } catch (error) {
    // Fase 4B — teto do piloto atingido → 403 com código (não é falha interna).
    const { ErroPilotoLimite } = await import('../services/pilotMode.js');
    if (error instanceof ErroPilotoLimite) {
      return res.status(403).json({
        error: 'O piloto controlado limitou temporariamente o upload de documentos neste escritório.',
        code: error.code,
      });
    }
    if (error instanceof Error && error.message.includes('embeddings')) {
      return res.status(502).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
});

export default router;
