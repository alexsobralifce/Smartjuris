import { Router } from 'express';

const router = Router();

router.get('/stats', (req, res) => {
  // Mock jurimetria stats for Phase 1
  res.json({
    taxaExito: 78,
    distribuicaoArea: [
      { name: 'Cível', value: 20 },
      { name: 'Família', value: 8 },
      { name: 'Sucessões', value: 3 },
      { name: 'Trabalhista', value: 30 },
      { name: 'Tributário', value: 10 },
      { name: 'Penal', value: 8 },
      { name: 'Previdenciário', value: 6 },
      { name: 'Consumerista', value: 6 },
      { name: 'Empresarial', value: 4 },
      { name: 'Administrativo', value: 3 },
      { name: 'Constitucional', value: 2 },
    ],
    previsoes: [
      { processo: '0001234-56.2026.5.02.0001', tipo: 'Reclamação Trabalhista', cliente: 'Fernanda Oliveira', valor: 'R$ 87.500,00', prazo: '2026-09-15', chance: 86 },
      { processo: '0005678-91.2026.8.26.0224', tipo: 'Ação de Danos Morais', cliente: 'Roberto Souza', valor: 'R$ 15.000,00', prazo: '2026-08-25', chance: 72 },
      { processo: '0009876-54.2026.8.26.0100', tipo: 'Defesa Cível', cliente: 'Construtora Alfa', valor: 'R$ 150.000,00', prazo: '2026-09-01', chance: 64 },
      { processo: '0004321-09.2025.8.26.0100', tipo: 'Ação Ordinária de Cobrança', cliente: 'Lúcia Ferreira', valor: 'R$ 42.000,00', prazo: '2025-11-20', chance: 91 },
    ]
  });
});

export default router;
