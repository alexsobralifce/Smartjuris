import { Router } from 'express';
import { listCourts, searchDecisions, lookupDecision } from '../services/jurisprudencias.js';
import { getTelemetriaJurisprudencia } from '../services/jurisprudenciaRag.js';
import { requireAdmin } from '../middlewares/roleGuard.js';

const router = Router();

// GET /api/jurisprudencias/telemetria — saúde da integração (fase 6E).
// Acesso admin (a rota é montada com authMiddleware; rejectRoot bloqueia root).
// Só agrega contadores e estado de pausa (número de escritórios), sem expor
// dados sensíveis nem quais escritórios estão pausados.
router.get('/telemetria', requireAdmin, (_req, res) => {
  res.json(getTelemetriaJurisprudencia());
});

// GET /api/jurisprudencias/courts
router.get('/courts', async (_req, res) => {
  try {
    const result = await listCourts();
    res.json(result);
  } catch (error: any) {
    console.error('[Jurisprudencias] Erro ao listar tribunais:', error);
    res.status(500).json({ error: error?.message || 'Falha ao obter lista de tribunais.' });
  }
});

// GET /api/jurisprudencias/search?court=stj&q=dano+moral&page=0&pub_from=2024-01-01&pub_to=2024-12-31
router.get('/search', async (req, res) => {
  try {
    const court = typeof req.query.court === 'string' ? req.query.court.trim().toLowerCase() : 'stj';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!q) {
      return res.status(400).json({ error: 'O parâmetro de busca "q" é obrigatório.' });
    }

    const page = req.query.page !== undefined ? parseInt(String(req.query.page), 10) || 0 : 0;
    const pub_from = typeof req.query.pub_from === 'string' && req.query.pub_from ? req.query.pub_from : undefined;
    const pub_to = typeof req.query.pub_to === 'string' && req.query.pub_to ? req.query.pub_to : undefined;
    const trial_from = typeof req.query.trial_from === 'string' && req.query.trial_from ? req.query.trial_from : undefined;
    const trial_to = typeof req.query.trial_to === 'string' && req.query.trial_to ? req.query.trial_to : undefined;

    const result = await searchDecisions(court, q, {
      page,
      pub_from,
      pub_to,
      trial_from,
      trial_to,
    });

    if (result.rateLimit) {
      if (result.rateLimit.limit) res.setHeader('X-RateLimit-Limit', result.rateLimit.limit);
      if (result.rateLimit.remaining) res.setHeader('X-RateLimit-Remaining', result.rateLimit.remaining);
      if (result.rateLimit.reset) res.setHeader('X-RateLimit-Reset', result.rateLimit.reset);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[Jurisprudencias] Erro na busca de decisões:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar decisões.' });
  }
});

// GET /api/jurisprudencias/lookup?court=stj&n=1234567
router.get('/lookup', async (req, res) => {
  try {
    const court = typeof req.query.court === 'string' ? req.query.court.trim().toLowerCase() : 'stj';
    const n = typeof req.query.n === 'string' ? req.query.n.trim() : '';

    if (!n) {
      return res.status(400).json({ error: 'O parâmetro "n" (número do processo) é obrigatório.' });
    }

    const result = await lookupDecision(court, n);

    if (result.rateLimit) {
      if (result.rateLimit.limit) res.setHeader('X-RateLimit-Limit', result.rateLimit.limit);
      if (result.rateLimit.remaining) res.setHeader('X-RateLimit-Remaining', result.rateLimit.remaining);
      if (result.rateLimit.reset) res.setHeader('X-RateLimit-Reset', result.rateLimit.reset);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[Jurisprudencias] Erro no lookup da decisão:', error);
    res.status(500).json({ error: error?.message || 'Falha ao consultar decisão.' });
  }
});

export default router;
