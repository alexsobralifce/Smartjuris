export const SITE_URL = 'https://www.smartjuris.com.br'
export const SITE_NAME = 'SmartJuris'
export const SITE_TITLE = 'SmartJuris — Software Jurídico com IA para Advogados e Escritórios'
export const SITE_DESCRIPTION =
  'Plataforma de gestão jurídica com IA: gere petições com RAG, acompanhe processos e prazos, use jurimetria, revise contratos e controle honorários. Supervisão ética OAB.'
export const OG_IMAGE = `${SITE_URL}/og-image.png`
export const WHATSAPP_URL = 'https://wa.me/5588993573809'

export interface Plan {
  name: string
  price: string
  priceNumber: string
  audience: string
  limit: string
  features: string[]
}

// Valores de tabela (espelham PricingSection.tsx). Promoções são aplicadas no app.
export const PLANS: Plan[] = [
  {
    name: 'Básico',
    price: 'R$ 180,00',
    priceNumber: '180.00',
    audience: 'Ideal para advogados solo',
    limit: '20 peças completas por mês',
    features: [
      'Até 20 peças geradas com RAG + IA',
      'Exportação em PDF/DOCX com timbre personalizado',
      'Histórico seguro de peças por 60 dias',
      'Suporte técnico via WhatsApp e e-mail',
    ],
  },
  {
    name: 'Intermediário',
    price: 'R$ 300,00',
    priceNumber: '300.00',
    audience: 'Melhor custo-benefício',
    limit: '50 peças completas por mês',
    features: [
      'Tudo do Básico',
      'Análise de até 150 páginas de autos (PDF) por peça',
      'Scanner de riscos contratuais e jurimetria preditiva',
      'Consultas ao Jus IA (jurisprudência ao vivo)',
      'Suporte prioritário no WhatsApp',
      'Histórico com busca semântica',
    ],
  },
  {
    name: 'Avançado',
    price: 'R$ 500,00',
    priceNumber: '500.00',
    audience: 'Ideal para bancas estabelecidas',
    limit: '100 peças completas por mês',
    features: [
      'Tudo do Intermediário',
      'Múltiplos perfis de usuário (até 3 advogados simultâneos)',
      'Jus IA com acesso prioritário e alertas de jurisprudência',
      'Fila de validação com governança e aprovação por sócio',
    ],
  },
]
