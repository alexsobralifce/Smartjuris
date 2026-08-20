import { Router } from 'express';
import { db } from '../db/client.js';
import { pecas, documentosGerados, escritorios, usuarios, processos } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { canMutateTenant } from '../middlewares/ownership.js';
import { tenantScope, tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, pecasSchema, pecasPatchSchema, uuidSchema } from '../validation/schemas.js';
import { montarPecaDocumento } from '../services/letterhead.js';
import { renderPdf, renderDocx } from '../services/documentExport.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await db.select().from(pecas)
      .where(tenantScope(req, pecas))
      .orderBy(pecas.geradoEm);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar peças' });
  }
});

router.post('/', async (req, res) => {
  try {
    const escritorioId = tenantScopeEscritorioId(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(pecasSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const data = parsed.data;
    const [nova] = await db.insert(pecas).values({
      processoId: data.processoId ?? null,
      tipo: data.tipo,
      area: data.area,
      cliente: data.cliente,
      status: data.status,
      prazo: data.prazo,
      modelo: data.modelo,
      fontes: data.fontes,
      conteudo: data.conteudo,
      usuarioId: (req as any).user?.id ?? null,
      escritorioId,
    }).returning();
    if (nova) {
      await db.insert(documentosGerados).values({
        usuarioId: (req as any).user?.id ?? null,
        pecaId: nova.id,
        tipo: 'peca_gerada',
        titulo: nova.tipo,
      });
    }
    await recordAudit(req, 'CREATE_PECA', {
      alvoId: nova.id,
      detalhes: {
        tipo: data.tipo,
        area: data.area,
        cliente: data.cliente,
        status: data.status,
        prazo: data.prazo,
        modelo: data.modelo,
        fontes: data.fontes,
      },
    });
    res.status(201).json(nova);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar peça' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/export — exporta peça aprovada/protocolada em PDF ou DOCX com
// papel timbrado do escritório (deve vir antes do PATCH /:id).
// ---------------------------------------------------------------------------
router.get('/:id/export', async (req, res) => {
  try {
    const id = req.params.id;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [peca] = await db.select().from(pecas).where(eq(pecas.id, id)).limit(1);
    if (!peca) {
      return res.status(404).json({ error: 'Peça não encontrada.' });
    }
    if (!canMutateTenant(req, peca.escritorioId, peca.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    if (peca.status !== 'aprovado' && peca.status !== 'protocolado') {
      return res.status(403).json({ error: 'Apenas peças aprovadas podem ser exportadas.' });
    }

    const format = req.query.format === 'docx' ? 'docx' : 'pdf';

    const [escritorio] = peca.escritorioId
      ? await db.select().from(escritorios)
          .where(eq(escritorios.id, peca.escritorioId)).limit(1)
      : [];

    // Autor da última edição (senão o criador). Usa o advogado apenas como
    // origem de nome/OAB para a assinatura.
    const autorId = peca.updatedBy ?? peca.usuarioId;
    let advogado: { nome?: string | null; oab?: string | null; oabUf?: string | null } | undefined;
    if (autorId) {
      const [row] = await db.select({
        nome: usuarios.nome,
        oab: usuarios.oab,
        oabUf: usuarios.oabUf,
      }).from(usuarios).where(eq(usuarios.id, autorId)).limit(1);
      if (row) advogado = row;
    }

    let processo: { valor?: string | null } | undefined;
    if (peca.processoId) {
      const [row] = await db.select({ valor: processos.valor }).from(processos)
        .where(eq(processos.id, peca.processoId)).limit(1);
      if (row) processo = row;
    }

    const doc = montarPecaDocumento({ peca, escritorio: escritorio ?? {}, advogado, processo });
    const buffer = format === 'docx' ? await renderDocx(doc) : await renderPdf(doc);

    if (format === 'docx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }
    res.setHeader('Content-Disposition', `attachment; filename="peca-${peca.id.slice(0, 8)}.${format}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting peca:', error);
    res.status(500).json({ error: 'Erro ao exportar peça.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const [existente] = await db.select().from(pecas).where(eq(pecas.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ error: 'Peça não encontrada.' });
    }
    if (!canMutateTenant(req, existente.escritorioId, existente.usuarioId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const parsed = parseBody(pecasPatchSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    // Peças aprovadas/protocoladas são congeladas: conteúdo não pode ser alterado
    if ((existente.status === 'aprovado' || existente.status === 'protocolado') && parsed.data.conteudo !== undefined) {
      return res.status(403).json({ error: 'Peça aprovada ou protocolada não pode ter conteúdo alterado.' });
    }
    const atualizada = await db.update(pecas).set({
      ...parsed.data,
      updatedAt: new Date(),
      updatedBy: (req as any).user?.id ?? null,
    }).where(eq(pecas.id, id)).returning();
    const { conteudo: _conteudo, ...pecaAuditData } = parsed.data;
    await recordAudit(req, 'UPDATE_PECA', { alvoId: id, detalhes: pecaAuditData });
    res.json(atualizada[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar peça' });
  }
});

export default router;
