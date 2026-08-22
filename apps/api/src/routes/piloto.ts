// ===========================================================================
// Fase 4B — Acompanhamento manual do piloto (root).
// ===========================================================================

import { Router } from 'express';
import { statusPiloto } from '../services/pilotMode.js';

const router = Router();

/** GET /api/root/piloto/status — relatório do piloto (READY_FOR_PILOT). */
router.get('/status', async (_req, res) => {
  try {
    res.json(await statusPiloto());
  } catch {
    res.status(500).json({ error: 'Erro ao obter status do piloto' });
  }
});

export default router;
