import { Router } from 'express';

const router = Router();

router.get('/stats', (req, res) => {
  // Mock jurimetria stats for Phase 1
  res.json({
    taxaExito: 78,
    distribuicaoArea: [
      { name: 'Trabalhista', value: 45 },
      { name: 'Cível', value: 30 },
      { name: 'Tributário', value: 15 },
      { name: 'Penal', value: 10 },
    ],
    previsoes: [
      { mes: 'Jan', exitos: 12, improcedentes: 3 },
      { mes: 'Fev', exitos: 15, improcedentes: 2 },
      { mes: 'Mar', exitos: 18, improcedentes: 4 },
    ]
  });
});

export default router;
