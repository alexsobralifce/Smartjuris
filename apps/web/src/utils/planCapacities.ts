// ===========================================================================
// Capacidades de produção mensal por plano (landing / showcase).
// Constante compartilhada entre componentes — sem lógica de renderização.
// ===========================================================================

export interface PlanCapacity {
  plan: string
  subtitle: string
  badge: string
  hoursSaved: string
  productionList: string[]
  highlight: boolean
  capacityNote: string
}

export const PLAN_CAPACITIES: PlanCapacity[] = [
  {
    plan: 'Plano 20 Peças/mês',
    subtitle: 'Básico · Advogado Solo',
    badge: 'Essencial',
    hoursSaved: '~40h / mês',
    productionList: [
      '6 Petições Iniciais (Cíveis, Família ou Trabalhistas)',
      '6 Contestações Técnicas (JEC e Varas Cíveis)',
      '4 Recursos (Agravos e Embargos de Declaração)',
      '4 Notificações / Pareceres / Contratos Simples',
    ],
    highlight: false,
    capacityNote: 'Capacidade ideal para bancas individuais com até 70 processos ativos.',
  },
  {
    plan: 'Plano 50 Peças/mês',
    subtitle: 'Intermediário · Sociedades de 2 a 3 Advogados',
    badge: 'Mais Escolhido',
    hoursSaved: '~100h / mês',
    productionList: [
      '15 Petições Iniciais Robustas (com Tutelas de Urgência)',
      '15 Contestações Complexas (com Preliminares de Mérito)',
      '10 Recursos de Grande Porte (Apelações com Cotejo / ROs)',
      '5 Auditorias & Scanners de Minutas Contratuais',
      '5 Réplicas e Manifestações sobre Perícias',
    ],
    highlight: true,
    capacityNote: 'Equivale à carga de trabalho de 1 advogado associado dedicado integralmente.',
  },
  {
    plan: 'Plano 100 Peças/mês',
    subtitle: 'Avançado · Bancas Estruturadas & Equipes',
    badge: 'Alta Performance',
    hoursSaved: '~200h / mês',
    productionList: [
      '30 Petições Iniciais Estratégicas e de Carteira',
      '30 Defesas e Contestações Corporativas Parametrizadas',
      '20 Recursos em Tribunais Superiores (STJ / STF / TST)',
      '10 Pareceres Societários, M&A e Acordos de Sócios',
      '10 Memoriais de Julgamento & Sustentações Orais',
    ],
    highlight: false,
    capacityNote: 'Custo unitário inferior a R$ 5,00 por peça qualificada produzida pela IA.',
  },
]
