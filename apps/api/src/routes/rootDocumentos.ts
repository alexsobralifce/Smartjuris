import { Router } from 'express';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, documentoEscritorioSchema, uuidSchema } from '../validation/schemas.js';
import { listarDocumentosSemEscopo, associarDocumentoEscritorio } from '../services/documento.js';

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

export default router;
