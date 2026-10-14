import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AREAS } from './areas'

export interface Section {
  h2: string
  p?: string[]
  ul?: string[]
}

export interface Faq {
  q: string
  a: string
}

export type PageKind = 'resource' | 'blog' | 'info'

export interface PageSource {
  title: string
  url: string
}

export interface Page {
  path: string // sem barra final, ex.: /planos
  kind: PageKind
  title: string
  description: string
  h1: string
  lead: string
  sections: Section[]
  faq?: Faq[]
  datePublished?: string
  dateModified?: string
  related?: string[] // paths
  // Artigos gerados pela curadoria (seo/blog/*.json, sincronizados da API)
  image?: string // caminho local da capa, ex.: /blog/slug.webp
  imageAlt?: string
  imageCredit?: string
  sources?: PageSource[] // matéria(s) original(is) citada(s)
  category?: string
  author?: string
}

const DATE = '2026-09-20'

export const RESOURCES: Page[] = [
  {
    path: '/recursos/gerador-de-pecas-com-ia',
    kind: 'resource',
    title: 'Gerador de Petições com IA para Advogados | SmartJuris',
    description:
      'Gere iniciais, contestações e recursos com IA e RAG vetorial, com fila de validação humana, crivo ético OAB e exportação em PDF/DOCX com timbre.',
    h1: 'Gerador de petições com IA e supervisão humana',
    lead:
      'O SmartJuris produz minutas de peças processuais em minutos, ancoradas em uma base de conhecimento e em modelos de teses, e só libera a exportação depois da revisão do advogado.',
    sections: [
      {
        h2: 'Como funciona a geração de peças',
        p: [
          'O fluxo tem quatro etapas: escolha do tipo de peça, preenchimento dos dados do caso, geração com streaming e revisão final. Durante a geração, o sistema recupera trechos relevantes por busca vetorial (RAG) na base do escritório e combina com modelos de teses por área do Direito.',
          'Como o texto nasce de fontes recuperadas e não apenas do conhecimento genérico do modelo, o risco de citações inventadas diminui. Isso não dispensa conferência: toda peça segue para revisão humana.',
        ],
      },
      {
        h2: 'Fila de validação e crivo ético OAB',
        p: [
          'Cada peça entra em uma fila de validação com status de revisão, aprovação, protocolo ou reprovação. O advogado edita o texto em um editor rico, registra a decisão e mantém a trilha de auditoria.',
          'A exportação em PDF e DOCX com timbre do escritório só é permitida para peças aprovadas ou protocoladas. A regra é aplicada no servidor, não apenas na interface.',
        ],
      },
      {
        h2: 'O que você ganha',
        ul: [
          'Minutas de iniciais, contestações, recursos e outras peças em minutos.',
          'Vínculo com o processo e com os documentos indexados do caso.',
          'Metadados de custo e modelo utilizados em cada geração.',
          'Dados isolados por escritório e histórico auditável.',
        ],
      },
    ],
    faq: [
      {
        q: 'A IA substitui o advogado na elaboração da peça?',
        a: 'Não. O SmartJuris gera uma minuta e exige revisão humana antes da exportação. A responsabilidade técnica e ética pela peça continua sendo do advogado.',
      },
      {
        q: 'Quais formatos de exportação estão disponíveis?',
        a: 'PDF e DOCX, com o timbre e os dados do escritório, para peças aprovadas ou protocoladas.',
      },
    ],
    related: ['/recursos/pesquisa-de-jurisprudencia', '/software-para-advogado-trabalhista', '/software-para-advogado-civel', '/blog/ia-na-advocacia-supervisao-humana-e-etica-oab', '/planos'],
  },
  {
    path: '/recursos/gestao-de-processos',
    kind: 'resource',
    title: 'Gestão de Processos e Prazos para Escritórios de Advocacia | SmartJuris',
    description:
      'Controle processos, andamentos e prazos fatais com linha do tempo, agenda integrada e resumo de intimações por IA em duas frases.',
    h1: 'Gestão de processos, andamentos e prazos',
    lead:
      'Centralize processos, clientes, agenda e andamentos em um só lugar, com um painel por processo e resumos de intimações que apontam a ação recomendada e o prazo fatal.',
    sections: [
      {
        h2: 'Painel do processo e linha do tempo',
        p: [
          'Cada processo tem um painel com dados do caso, partes, vara, área, valor e status, além de uma linha do tempo com intimações, despachos, sentenças e audiências.',
        ],
      },
      {
        h2: 'Resumo de intimações por IA',
        p: [
          'Ao registrar um andamento, o sistema gera um resumo em duas frases com a ação recomendada e o prazo fatal. Antes de enviar o texto ao modelo, dados pessoais como CPF, CNPJ, e-mail, CEP e telefone são mascarados.',
        ],
      },
      {
        h2: 'Agenda e clientes',
        ul: [
          'Agenda com audiências, reuniões, prazos e diligências vinculados a processos e clientes.',
          'Cadastro de clientes pessoa física e jurídica com máscaras de CPF/CNPJ e busca de CEP.',
          'Permissões por módulo para cada usuário do escritório.',
        ],
      },
    ],
    faq: [
      {
        q: 'O sistema calcula prazos processuais automaticamente?',
        a: 'O resumo de IA identifica a ação recomendada e o prazo fatal a partir do texto da intimação, e o prazo fica registrado no andamento e na agenda. A conferência do cômputo do prazo continua sendo responsabilidade do advogado.',
      },
    ],
    related: ['/recursos/crm-para-advogados', '/recursos/gestao-financeira-e-timesheet', '/planos'],
  },
  {
    path: '/recursos/jurimetria',
    kind: 'resource',
    title: 'Jurimetria Preditiva para Advocacia | SmartJuris',
    description:
      'Analise a taxa de êxito por área e use a calculadora preditiva de risco para apoiar a estratégia processual e a precificação de honorários.',
    h1: 'Jurimetria preditiva para decisões estratégicas',
    lead:
      'Transforme o histórico de processos do escritório em indicadores: taxa de êxito por área e uma calculadora de risco interativa para apoiar a decisão de propor, negociar ou recorrer.',
    sections: [
      {
        h2: 'Indicadores do seu próprio escritório',
        p: [
          'O módulo consolida os processos cadastrados e mostra a taxa de êxito por área e por status, ajudando a enxergar onde o escritório performa melhor.',
        ],
      },
      {
        h2: 'Calculadora preditiva de risco',
        p: [
          'A calculadora combina parâmetros do caso para estimar o risco e apoiar conversas com o cliente sobre acordo, litígio e expectativa de resultado. É uma ferramenta de apoio, não uma garantia de resultado.',
        ],
      },
      {
        h2: 'Onde a jurimetria ajuda',
        ul: [
          'Definir honorários de êxito com base em dados.',
          'Priorizar áreas e carteiras mais rentáveis.',
          'Fundamentar propostas de acordo e comunicação com o cliente.',
        ],
      },
    ],
    faq: [
      {
        q: 'O que é jurimetria?',
        a: 'É a aplicação de estatística e análise de dados ao Direito, para observar padrões em decisões, prazos e resultados e apoiar a tomada de decisão.',
      },
    ],
    related: ['/blog/o-que-e-jurimetria-e-como-usar-no-escritorio', '/recursos/pesquisa-de-jurisprudencia', '/planos'],
  },
  {
    path: '/recursos/revisao-contratual-com-ia',
    kind: 'resource',
    title: 'Revisão de Contratos com IA | Scanner de Riscos | SmartJuris',
    description:
      'Envie a minuta e receba a detecção de cláusulas de risco com sugestões de redação. Scanner autônomo de contratos para advogados e escritórios.',
    h1: 'Revisão contratual com scanner de riscos',
    lead:
      'Submeta uma minuta ao scanner autônomo, veja os pontos de risco identificados e receba sugestões de redação para revisar contratos com mais rapidez e consistência.',
    sections: [
      {
        h2: 'O que o scanner faz',
        ul: [
          'Lê a minuta e detecta cláusulas com potencial de risco.',
          'Apresenta os apontamentos de forma organizada para a revisão.',
          'Sugere redações alternativas para os pontos identificados.',
        ],
      },
      {
        h2: 'Revisão humana continua indispensável',
        p: [
          'As sugestões aceleram a análise inicial, mas a decisão final sobre o que aceitar, negociar ou reescrever é do advogado, que conhece o contexto do cliente e da operação.',
        ],
      },
    ],
    faq: [
      {
        q: 'Meus contratos ficam expostos a outros escritórios?',
        a: 'Não. Todos os dados são isolados por escritório (multi-tenant), com controle de acesso por perfil e trilha de auditoria.',
      },
    ],
    related: ['/recursos/gerador-de-pecas-com-ia', '/faq', '/planos'],
  },
  {
    path: '/recursos/pesquisa-de-jurisprudencia',
    kind: 'resource',
    title: 'Pesquisa de Jurisprudência ao Vivo em Tribunais | SmartJuris',
    description:
      'Consulte decisões e jurisprudência ao vivo em tribunais pelo Jus IA, sem sair do sistema, e use os achados nas suas peças.',
    h1: 'Pesquisa de jurisprudência ao vivo',
    lead:
      'O módulo Decisões & Tribunais consulta a jurisprudência em tribunais em tempo real e permite localizar uma decisão específica sem sair do SmartJuris.',
    sections: [
      {
        h2: 'Busca e consulta pontual',
        p: [
          'Faça buscas por tema e filtre por tribunal, ou consulte uma decisão específica pelo identificador. Os resultados ajudam a fundamentar peças e a validar teses.',
        ],
      },
      {
        h2: 'Integração com o fluxo de trabalho',
        ul: [
          'Consulta dentro da mesma plataforma em que você gera e revisa peças.',
          'Base de conhecimento do escritório com busca semântica em julgados indexados.',
        ],
      },
    ],
    faq: [
      {
        q: 'A jurisprudência é consultada em tempo real?',
        a: 'Sim, o módulo integra uma API de jurisprudência ao vivo para busca e consulta de decisões em tribunais.',
      },
    ],
    related: ['/recursos/gerador-de-pecas-com-ia', '/recursos/jurimetria', '/planos'],
  },
  {
    path: '/recursos/gestao-financeira-e-timesheet',
    kind: 'resource',
    title: 'Financeiro e Timesheet para Escritórios de Advocacia | SmartJuris',
    description:
      'Controle honorários fixos, de êxito e despesas e registre horas faturáveis com cronômetro de timesheet integrado aos processos.',
    h1: 'Financeiro e timesheet faturável',
    lead:
      'Acompanhe honorários e despesas por processo e registre o tempo trabalhado com um cronômetro de timesheet para faturar com transparência.',
    sections: [
      {
        h2: 'Honorários e despesas',
        p: [
          'Registre lançamentos de honorários fixos, honorários de êxito e despesas, com vencimento e status, vinculados a processos e clientes.',
        ],
      },
      {
        h2: 'Cronômetro de timesheet',
        p: [
          'Inicie o cronômetro ao trabalhar em um processo, defina o valor-hora e marque as horas como faturadas. O acesso ao módulo financeiro pode ser liberado apenas para os usuários autorizados.',
        ],
      },
    ],
    faq: [
      {
        q: 'Posso restringir quem vê o financeiro?',
        a: 'Sim. O administrador do escritório define as permissões por módulo para cada usuário.',
      },
    ],
    related: ['/recursos/gestao-de-processos', '/recursos/crm-para-advogados', '/planos'],
  },
  {
    path: '/recursos/crm-para-advogados',
    kind: 'resource',
    title: 'CRM e Funil de Clientes para Advogados | SmartJuris',
    description:
      'Pipeline Kanban em quatro fases — Lead, Diagnóstico, Proposta e Contrato — com alerta de conflito de interesses para escritórios de advocacia.',
    h1: 'CRM e funil de clientes para advocacia',
    lead:
      'Organize a captação em um funil Kanban de quatro fases e evite surpresas com o alerta de conflito antes de aceitar um novo cliente.',
    sections: [
      {
        h2: 'Funil em quatro fases',
        ul: ['Lead', 'Diagnóstico', 'Proposta', 'Contrato'],
      },
      {
        h2: 'Alerta de conflito',
        p: [
          'O funil inclui um alerta de conflito para apoiar a análise do advogado antes de aceitar um novo cliente. A decisão final sobre conflito de interesses é sempre do profissional.',
        ],
      },
    ],
    faq: [
      {
        q: 'O CRM é um sistema separado?',
        a: 'O CRM faz parte da mesma plataforma e segue o mesmo controle de acesso por perfil e módulo do escritório.',
      },
    ],
    related: ['/recursos/gestao-de-processos', '/recursos/gestao-financeira-e-timesheet', '/planos'],
  },
]

export const BLOG: Page[] = [
  {
    path: '/blog/ia-na-advocacia-supervisao-humana-e-etica-oab',
    kind: 'blog',
    title: 'IA na advocacia: como usar com supervisão humana e ética OAB',
    description:
      'Boas práticas para usar IA generativa na advocacia: revisão humana, confidencialidade, LGPD, conferência de fontes e responsabilidade profissional.',
    h1: 'IA na advocacia: como usar com supervisão humana e ética OAB',
    lead:
      'A IA generativa acelera a redação de peças, mas não transfere a responsabilidade profissional. Veja práticas para adotá-la com segurança no escritório.',
    datePublished: DATE,
    sections: [
      {
        h2: 'A responsabilidade continua sendo do advogado',
        p: [
          'Ferramentas de IA produzem texto verossímil, o que não significa texto correto. O advogado responde tecnicamente e eticamente pelo que assina. Por isso, o fluxo ideal trata a saída da IA como minuta, que passa por revisão antes de qualquer protocolo.',
          'O Conselho Federal da OAB tem publicado orientações sobre o uso de IA generativa na prática jurídica, e vale acompanhá-las e alinhar a política interna do escritório a elas.',
        ],
      },
      {
        h2: 'Cinco práticas para reduzir riscos',
        ul: [
          'Exigir revisão humana registrada antes da exportação ou do protocolo.',
          'Conferir toda citação de lei, súmula e precedente na fonte oficial.',
          'Ancorar a geração em bases próprias e fontes recuperadas (RAG), em vez de depender só do conhecimento do modelo.',
          'Mascarar dados pessoais antes de enviar textos a modelos externos, em linha com a LGPD (Lei 13.709/2018).',
          'Manter trilha de auditoria de quem gerou, editou e aprovou cada peça.',
        ],
      },
      {
        h2: 'Como o SmartJuris trata isso',
        p: [
          'No SmartJuris, toda peça entra em uma fila de validação humana, a exportação é bloqueada para peças não aprovadas e as ações sensíveis ficam registradas em auditoria. Os dados são isolados por escritório.',
        ],
      },
    ],
    faq: [
      {
        q: 'Posso protocolar uma peça gerada por IA sem revisar?',
        a: 'Não é recomendável. A peça deve ser revisada e assumida pelo advogado responsável, que confere fatos, fundamentos e citações.',
      },
    ],
    related: ['/recursos/gerador-de-pecas-com-ia', '/faq', '/planos'],
  },
  {
    path: '/blog/o-que-e-jurimetria-e-como-usar-no-escritorio',
    kind: 'blog',
    title: 'O que é jurimetria e como usá-la no escritório de advocacia',
    description:
      'Entenda o que é jurimetria, quais dados observar e como aplicar taxa de êxito e análise de risco na estratégia e nos honorários do escritório.',
    h1: 'O que é jurimetria e como usá-la no escritório de advocacia',
    lead:
      'Jurimetria é a aplicação de estatística e análise de dados ao Direito. No dia a dia do escritório, ela ajuda a decidir com base em evidências, não só em intuição.',
    datePublished: DATE,
    sections: [
      {
        h2: 'O que a jurimetria mede',
        p: [
          'Ela observa padrões como tempo de tramitação, taxa de procedência, valores de condenação, comportamento por vara, juízo ou câmara e resultados por tipo de tese. Com isso, é possível estimar probabilidades e comparar cenários.',
        ],
      },
      {
        h2: 'Três usos práticos no escritório',
        ul: [
          'Estratégia: decidir entre acordo, litígio ou recurso com base em histórico.',
          'Precificação: calibrar honorários de êxito conforme o risco real do tipo de causa.',
          'Gestão: identificar as áreas e carteiras que mais geram resultado.',
        ],
      },
      {
        h2: 'Cuidados na interpretação',
        p: [
          'Estatística descreve o passado e não garante o resultado de um caso específico. Amostras pequenas, mudanças de entendimento e particularidades dos autos podem alterar o cenário. Use os números como apoio, junto com a análise técnica.',
          'No SmartJuris, o módulo de Jurimetria mostra a taxa de êxito por área a partir dos processos do escritório e oferece uma calculadora preditiva de risco para apoiar a conversa com o cliente.',
        ],
      },
    ],
    related: ['/recursos/jurimetria', '/recursos/pesquisa-de-jurisprudencia', '/planos'],
  },
  {
    path: '/blog/como-organizar-prazos-e-intimacoes-no-escritorio',
    kind: 'blog',
    title: 'Como organizar prazos e intimações no escritório de advocacia',
    description:
      'Um método simples para não perder prazos: centralização de intimações, registro no andamento, agenda, dupla checagem e uso de resumos por IA.',
    h1: 'Como organizar prazos e intimações no escritório de advocacia',
    lead:
      'Perder um prazo é um dos maiores riscos da advocacia. Um processo organizado de entrada, registro e conferência reduz esse risco.',
    datePublished: DATE,
    sections: [
      {
        h2: 'Centralize a entrada de intimações',
        p: [
          'Defina um único ponto de entrada para intimações e publicações. Quando cada advogado controla seus prazos em planilhas ou agendas próprias, o escritório perde visibilidade.',
        ],
      },
      {
        h2: 'Registre o andamento e o prazo fatal',
        ul: [
          'Cadastre o andamento no processo assim que a intimação chegar.',
          'Registre a ação necessária e o prazo fatal em um campo próprio.',
          'Lance o prazo na agenda compartilhada, vinculado ao processo.',
          'Lembre que, no processo civil, os prazos em dias contam apenas os dias úteis (art. 219 do CPC), e confira sempre o cômputo específico de cada caso.',
        ],
      },
      {
        h2: 'Use a IA como apoio, com dupla checagem',
        p: [
          'Resumos automáticos de intimações economizam tempo de leitura e destacam a ação recomendada, mas o prazo deve ser conferido por um advogado. No SmartJuris, o resumo em duas frases traz a ação e o prazo fatal, e o andamento fica no histórico do processo.',
        ],
      },
    ],
    related: ['/recursos/gestao-de-processos', '/faq', '/planos'],
  },
]

export const INFO: Page[] = [
  {
    path: '/planos',
    kind: 'info',
    title: 'Planos e Preços do SmartJuris | Software Jurídico com IA',
    description:
      'Conheça os planos Básico (R$ 180), Intermediário (R$ 300) e Avançado (R$ 500) do SmartJuris, com 20, 50 e 100 peças por mês.',
    h1: 'Planos e preços do SmartJuris',
    lead:
      'Escolha o plano pelo volume de peças do seu escritório. Todos incluem gestão de processos, agenda, clientes e exportação com timbre.',
    sections: [], // renderizado a partir de PLANS
    faq: [
      {
        q: 'Posso mudar de plano depois?',
        a: 'Sim. A assinatura é gerenciada dentro do sistema, na tela de Assinatura.',
      },
      {
        q: 'Onde vejo as condições de contratação?',
        a: 'A contratação é feita na tela de Assinatura, dentro do sistema, após o cadastro. O SmartJuris é uma ferramenta de apoio ao advogado e não substitui a análise e a decisão do profissional.',
      },
    ],
    related: ['/faq', '/recursos/gerador-de-pecas-com-ia'],
  },
  {
    path: '/sobre',
    kind: 'info',
    title: 'Sobre o SmartJuris | Ferramenta de Apoio ao Advogado',
    description:
      'Conheça o SmartJuris: plataforma de gestão jurídica com IA que apoia o advogado, sem atuar sem a sua revisão e responsabilidade.',
    h1: 'Sobre o SmartJuris',
    lead: 'Tecnologia a serviço do advogado, com revisão humana e responsabilidade profissional preservadas.',
    sections: [
      {
        h2: 'O que é o SmartJuris',
        p: [
          'O SmartJuris LexOS é uma plataforma de gestão jurídica que reúne processos, prazos, agenda, clientes, financeiro e ferramentas de inteligência artificial para apoiar o trabalho de advogados e escritórios.',
        ],
      },
      {
        h2: 'Como tratamos a inteligência artificial',
        ul: [
          'A IA é uma ferramenta de apoio: ela sugere minutas, resumos e pesquisas, mas não age por conta própria.',
          'Nenhuma peça é protocolada, enviada ou assinada sem a revisão e a aprovação do advogado.',
          'A responsabilidade técnica e ética pelo conteúdo é sempre do profissional, conforme o Estatuto da Advocacia e o Código de Ética e Disciplina da OAB.',
          'O SmartJuris não presta serviços jurídicos, não capta clientes e não divulga valores de honorários de advogados.',
          'Os dados são tratados conforme a LGPD (Lei nº 13.709/2018), com isolamento por escritório.',
        ],
      },
      {
        h2: 'Dados da empresa',
        p: [],
      },
    ],
    related: ['/contato', '/blog/ia-na-advocacia-supervisao-humana-e-etica-oab', '/faq'],
  },
  {
    path: '/contato',
    kind: 'info',
    title: 'Contato | SmartJuris',
    description: 'Fale com o suporte do SmartJuris por WhatsApp ou e-mail.',
    h1: 'Contato',
    lead: 'Canais de atendimento para dúvidas sobre o sistema, cadastro e suporte técnico.',
    sections: [],
    related: ['/sobre', '/faq'],
  },
  {
    path: '/faq',
    kind: 'info',
    title: 'Perguntas Frequentes | SmartJuris',
    description:
      'Respostas sobre IA na advocacia, segurança de dados, LGPD, supervisão OAB, planos, exportação de peças e suporte do SmartJuris.',
    h1: 'Perguntas frequentes sobre o SmartJuris',
    lead: 'Dúvidas comuns sobre IA, segurança, planos e uso do sistema.',
    sections: [],
    faq: [
      {
        q: 'O que é o SmartJuris?',
        a: 'É uma plataforma de gestão jurídica com IA para advogados e escritórios: geração de peças com RAG, gestão de processos e prazos, jurimetria, revisão contratual, financeiro, CRM e pesquisa de jurisprudência.',
      },
      {
        q: 'A IA pode inventar jurisprudência?',
        a: 'Modelos de linguagem podem errar. Por isso o SmartJuris ancora a geração em fontes recuperadas por busca vetorial e exige revisão humana antes da exportação. Recomendamos conferir toda citação na fonte oficial.',
      },
      {
        q: 'Como o SmartJuris trata a LGPD e a confidencialidade?',
        a: 'Os dados são isolados por escritório, há controle de acesso por perfil, dados pessoais são mascarados antes do envio a modelos de IA nos resumos de intimações e as ações sensíveis são registradas em auditoria.',
      },
      {
        q: 'Como funciona a supervisão ética da OAB no sistema?',
        a: 'Cada peça passa por uma fila de validação humana. Somente peças aprovadas ou protocoladas podem ser exportadas em PDF ou DOCX.',
      },
      {
        q: 'Quais formatos de exportação são suportados?',
        a: 'PDF e DOCX, com timbre e dados do escritório.',
      },
      {
        q: 'Como faço para contratar?',
        a: 'Acesse a página inicial, crie a conta do advogado e do escritório e escolha um plano. Em caso de dúvida, fale com o suporte por WhatsApp.',
      },
      {
        q: 'Quantos usuários posso ter?',
        a: 'O plano Avançado permite até 3 advogados simultâneos. Para necessidades maiores, fale com o suporte.',
      },
    ],
    related: ['/planos', '/blog'],
  },
  {
    path: '/blog',
    kind: 'info',
    title: 'Blog SmartJuris | IA, Jurimetria e Gestão para Advocacia',
    description:
      'Artigos sobre inteligência artificial, jurimetria, prazos e gestão de escritórios de advocacia.',
    h1: 'Blog SmartJuris',
    lead: 'Conteúdo prático sobre tecnologia, dados e gestão para advogados e escritórios.',
    sections: [],
  },
]

// ---- Artigos da curadoria (publicados no painel root; sincronizados por scripts/sincronizar-blog.mjs) ----
interface ArtigoSincronizado {
  slug: string
  titulo: string
  descricao: string
  categoria: string
  autor: string
  resumo: string
  secoes: Array<{ titulo: string; paragrafos: string[]; lista?: string[] }>
  faq: Faq[]
  fontes: Array<{ titulo: string; url: string }>
  imagem: string | null
  imagemAlt: string | null
  imagemCredito: string | null
  publicadoEm: string | null
  atualizadoEm: string | null
}

// Recurso mais próximo de cada categoria: link interno contextual no fim do artigo.
const RECURSO_POR_CATEGORIA: Record<string, string> = {
  'IA na advocacia': '/recursos/gerador-de-pecas-com-ia',
  'Gestão do escritório': '/recursos/gestao-financeira-e-timesheet',
  'Prazos e processos': '/recursos/gestao-de-processos',
  Jurimetria: '/recursos/jurimetria',
  Contratos: '/recursos/revisao-contratual-com-ia',
  'LGPD e ética': '/faq',
}

export function paginaDoArtigo(a: ArtigoSincronizado): Page {
  const dia = (iso: string | null) => (iso ?? new Date().toISOString()).slice(0, 10)
  return {
    path: `/blog/${a.slug}`,
    kind: 'blog',
    title: a.titulo,
    description: a.descricao,
    h1: a.titulo,
    lead: a.resumo,
    sections: a.secoes.map(s => ({ h2: s.titulo, p: s.paragrafos, ...(s.lista?.length ? { ul: s.lista } : {}) })),
    faq: a.faq?.length ? a.faq : undefined,
    datePublished: dia(a.publicadoEm),
    dateModified: dia(a.atualizadoEm ?? a.publicadoEm),
    related: [RECURSO_POR_CATEGORIA[a.categoria] ?? '/planos', '/planos', '/blog'],
    image: a.imagem ?? undefined,
    imageAlt: a.imagemAlt ?? undefined,
    imageCredit: a.imagemCredito ?? undefined,
    sources: (a.fontes ?? []).map(f => ({ title: f.titulo, url: f.url })),
    category: a.categoria,
    author: a.autor,
  }
}

function lerArtigosSincronizados(): Page[] {
  const dir = fileURLToPath(new URL('./blog/', import.meta.url))
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => paginaDoArtigo(JSON.parse(readFileSync(`${dir}${f}`, 'utf8')) as ArtigoSincronizado))
}

// Mais recentes primeiro (a lista /blog e o sitemap seguem esta ordem).
const BLOG_TODOS: Page[] = [...lerArtigosSincronizados(), ...BLOG].sort((a, b) =>
  (b.datePublished ?? '').localeCompare(a.datePublished ?? ''),
)

export const ALL_PAGES: Page[] = [...INFO, ...RESOURCES, ...AREAS, ...BLOG_TODOS]
export { BLOG_TODOS, AREAS }

export const HOME_FAQ: Faq[] = (INFO.find(p => p.path === '/faq')?.faq ?? []).slice(0, 5)
