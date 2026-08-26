import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { documentos, chunks, documentosGerados, clientes } from '../db/schema.js';
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
import { requireRole } from '../middlewares/roleGuard.js';
import { parseBody, formatZodError, colecaoSchema, uuidSchema } from '../validation/schemas.js';
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

/** Valida que um cliente pertence ao escritório (usado no upload e na
 *  listagem por cliente — Fase 8A). Cliente inexistente ou de outro
 *  escritório retorna false. */
async function validarClienteDoEscritorio(
  clienteId: string | null | undefined,
  escritorioId: string
): Promise<boolean> {
  if (!clienteId) return true;
  const rows = await db.select({ id: clientes.id }).from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.escritorioId, escritorioId)))
    .limit(1);
  return rows.length > 0;
}

// GET / — lista SOMENTE os documentos do escritório autenticado.
// Documentos sem escopo (quarentena 'unscoped') nunca aparecem aqui.
// Fase 8A: `?clienteId=` filtra por cliente (validado no MESMO escritório).
router.get('/', async (req, res) => {
  try {
    const escritorioId = tenantScopeEscritorioId(req as AuthenticatedRequest);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const clienteId = typeof req.query.clienteId === 'string' && req.query.clienteId
      ? req.query.clienteId
      : undefined;
    if (clienteId) {
      const pertence = await validarClienteDoEscritorio(clienteId, escritorioId);
      if (!pertence) {
        await recordAudit(req, 'LISTAR_DOCUMENTOS_BLOQUEADO', {
          alvoId: clienteId,
          detalhes: { motivo: 'cliente-de-outro-escritorio' },
        });
        return res.status(403).json({ error: 'Cliente informado não pertence ao escritório do usuário.' });
      }
    }
    const data = await listarDocumentosDoEscritorio(escritorioId, clienteId);
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
    const { colecao, area, processoId, clienteId } = parsed.data;

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

    // Fase 8A — clienteId (se enviado) deve pertencer ao MESMO escritório.
    if (clienteId) {
      const pertence = await validarClienteDoEscritorio(clienteId, escritorioId);
      if (!pertence) {
        await recordAudit(req, 'UPLOAD_DOCUMENTO_BLOQUEADO', {
          alvoId: clienteId,
          detalhes: { motivo: 'cliente-de-outro-escritorio' },
        });
        return res.status(403).json({ error: 'Cliente informado não pertence ao escritório do usuário.' });
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
      clienteId: clienteId ?? null,
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
        // Contagem tx-aware: MESMA conexão que detém o advisory lock.
        if (await excedeDocsPiloto(escritorioId, tx)) {
          throw new ErroPilotoLimite('PILOTO_LIMITE_DOCUMENTOS');
        }
        const [doc] = await tx.insert(documentos).values({
          nome: arquivo!.originalname,
          colecao,
          tamanho: `${sizeMB} MB`,
          chunks: 0,
          escritorioId,
          processoId: processoId ?? null,
          clienteId: clienteId ?? null,
          area: area ?? null,
          usuarioId: (req as any).user?.id ?? null,
          totalPages,
          indexedStatus: 'processing',
          failedChunks: 0,
          updatedAt: new Date(),
        }).returning({ id: documentos.id });
        return doc.id;
      });
      // Indexação FORA do lock (embeddings são lentos; não seguram o advisory lock).
      // COMPENSAÇÃO (piloto): falha de indexação (total ou parcial) NUNCA deixa
      // documento/chunks órfãos nem consome o teto permanentemente — remove
      // chunks + documento reservado e o erro vira 502 (embeddings).
      try {
        resultado = await indexarChunksDoDocumento(documentoId, baseUpload);
        if (resultado.status === 'failed') {
          await removerDocumentoPiloto(documentoId);
          throw new Error('Falha ao indexar o documento: serviço de embeddings indisponível.');
        }
      } catch (err) {
        await removerDocumentoPiloto(documentoId).catch(() => {});
        throw err;
      }
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
        clienteId: clienteId ?? null,
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


/** Compensação do piloto: remove chunks + documento reservado (falha de
 *  indexação) — libera o slot e não deixa órfãos. Ordem: chunks → documento
 *  (FK); segura contra retries (DELETE idempotente). */
async function removerDocumentoPiloto(documentoId: string): Promise<void> {
  await db.delete(chunks).where(eq(chunks.documentoId, documentoId));
  await db.delete(documentos).where(eq(documentos.id, documentoId));
}

// Fase 8A — DELETE /:id — apenas admin; o documento deve pertencer ao
// escritório autenticado. Chunks são removidos ANTES do documento (FK).
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const escritorioId = tenantScopeEscritorioId(req as AuthenticatedRequest);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const [existente] = await db.select().from(documentos).where(eq(documentos.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }
    if (existente.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    // Ordem de remoção respeitando FKs (sem CASCADE no schema): dependentes
    // primeiro (documentos_gerados e chunks), depois o documento.
    await db.delete(documentosGerados).where(eq(documentosGerados.documentoId, id));
    await db.delete(chunks).where(eq(chunks.documentoId, id));
    await db.delete(documentos).where(eq(documentos.id, id));
    await recordAudit(req, 'DELETE_DOCUMENTO', { alvoId: id });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting documento:', error);
    res.status(500).json({ error: 'Erro ao excluir documento.' });
  }
});

export default router;
