// Páginas por área do Direito ("software para advogado <área>").
// Cada página tem texto próprio: peças reais do gerador (services/modelosPeca.ts), prazos da área e cuidados éticos.
// Não prometem resultado; o texto legal citado deve ser conferido na norma vigente pelo advogado.
import type { Page } from './content'
import { PLANS } from './site'

const precos = PLANS.map(p => p.price.replace(',00', ''))
const faixa = `${precos[0]} a ${precos[precos.length - 1]}`

interface Area {
  slug: string
  nome: string // "Trabalhista"
  titulo: string
  descricao: string
  h1: string
  lead: string
  pecas: string[] // tipos reais do gerador
  rotinaTitulo: string
  rotina: string[]
  rotinaLista: string[]
  gestao: string[]
  cuidadosTitulo: string
  cuidados: string[]
  faq: Array<{ q: string; a: string }>
  relacionadas: string[]
}

const AREAS_DADOS: Area[] = [
  {
    slug: 'trabalhista',
    nome: 'Trabalhista',
    titulo: 'Software para Advogado Trabalhista com IA | SmartJuris',
    descricao:
      'Controle prazos em dias úteis, gere reclamações, contestações e recursos com IA e revise tudo antes de exportar. Para advogados e escritórios trabalhistas.',
    h1: 'Software para advogado trabalhista',
    lead:
      'Prazos curtos, audiências em sequência e muitas peças repetitivas: o SmartJuris organiza a rotina do escritório trabalhista e gera minutas que o advogado revisa antes de protocolar.',
    pecas: [
      'Reclamação Trabalhista',
      'Contestação Trabalhista',
      'Recurso Ordinário',
      'Recurso de Revista',
      'Agravo de Petição',
      'Embargos à Execução Trabalhista',
      'Impugnação à Sentença de Liquidação',
      'Mandado de Segurança Trabalhista',
      'Ação Rescisória',
    ],
    rotinaTitulo: 'Prazos e audiências na rotina trabalhista',
    rotina: [
      'Na Justiça do Trabalho, os prazos processuais são contados em dias úteis (art. 775 da CLT), e o prazo para recurso ordinário, em regra, é de oito dias (art. 895). Confirme sempre a norma vigente e o caso concreto.',
      'Como a margem para erro é pequena, o escritório precisa enxergar, em um só lugar, o que vence esta semana, qual audiência está marcada e qual intimação ainda não foi tratada.',
    ],
    rotinaLista: [
      'Resumo de cada intimação em duas frases, com a ação recomendada e o prazo fatal.',
      'Agenda integrada com audiências, prazos e diligências, vinculados ao processo e ao cliente.',
      'Linha do tempo do processo para conferir a sequência de atos antes de recorrer.',
    ],
    gestao: [
      'Cadastro de clientes pessoa física e jurídica, com a qualificação pronta para as petições.',
      'Honorários fixos e de êxito, despesas e cronômetro de horas faturáveis para controlar a rentabilidade das causas.',
      'Pipeline de captação com alerta de conflito de interesses antes de aceitar um novo cliente.',
    ],
    cuidadosTitulo: 'Supervisão do advogado e proteção de dados',
    cuidados: [
      'A IA entrega uma minuta, não uma peça pronta: o texto passa pela fila de validação do advogado e só pode ser exportado depois da aprovação.',
      'Dados pessoais são mascarados antes do envio à IA e os registros ficam isolados por escritório, em conformidade com a LGPD.',
    ],
    faq: [
      {
        q: 'O SmartJuris calcula verbas trabalhistas ou liquidação?',
        a: 'Não. O sistema organiza prazos, processos e documentos e gera minutas de peças. Cálculos de liquidação continuam sendo feitos pelo advogado ou por ferramenta especializada.',
      },
      {
        q: 'Posso usar para recursos como recurso ordinário e agravo de petição?',
        a: 'Sim. O gerador tem modelos de teses para recurso ordinário, recurso de revista, agravo de petição e outras peças da área, que servem de ponto de partida e sempre exigem revisão do advogado.',
      },
      {
        q: 'A IA garante o resultado da reclamação?',
        a: 'Não. O SmartJuris é uma ferramenta de apoio e não promete resultado. A estratégia e a responsabilidade técnica e ética pela peça são do advogado.',
      },
    ],
    relacionadas: ['/software-para-advogado-civel', '/software-para-advogado-previdenciario'],
  },
  {
    slug: 'previdenciario',
    nome: 'Previdenciário',
    titulo: 'Software para Advogado Previdenciário com IA | SmartJuris',
    descricao:
      'Organize benefícios, prazos e documentos de segurados e gere iniciais e recursos previdenciários com IA, sempre com revisão do advogado.',
    h1: 'Software para advogado previdenciário',
    lead:
      'Muitos clientes, documentos de saúde e processos em fases administrativa e judicial: o SmartJuris ajuda o escritório previdenciário a manter tudo organizado e a produzir minutas com mais rapidez.',
    pecas: [
      'Ação de Concessão de Benefício',
      'Revisão de Benefício',
      'Ação de Auxílio por Incapacidade',
      'Aposentadoria por Idade/Tempo de Contribuição',
      'Pensão por Morte',
      'Benefício de Prestação Continuada BPC/LOAS',
      'Recurso ao CRPS',
      'Recurso Ordinário à TNU',
    ],
    rotinaTitulo: 'Da via administrativa ao Judiciário',
    rotina: [
      'O mesmo cliente costuma passar por um requerimento administrativo, um eventual recurso ao CRPS e, depois, uma ação judicial. Cada fase tem prazos e documentos próprios, e perder o fio da história do caso custa tempo.',
      'Escritórios previdenciários também lidam com alto volume: dezenas de segurados com perfis parecidos, cada um com sua cronologia de vínculos e benefícios.',
    ],
    rotinaLista: [
      'Todos os processos e andamentos de um cliente reunidos em um painel, com a linha do tempo de cada caso.',
      'Upload de documentos com indexação para busca semântica, útil para localizar um laudo ou comprovante rapidamente.',
      'Resumo de intimações com prazo fatal, para não depender da leitura manual de cada publicação.',
    ],
    gestao: [
      'Cadastro de clientes com qualificação completa e acompanhamento por processo.',
      'Honorários contratuais e de êxito controlados por lançamento, com vencimento e status.',
      'Painel de jurimetria nos planos Intermediário e Avançado, para observar a taxa de êxito por área e status no próprio escritório.',
    ],
    cuidadosTitulo: 'Dados de saúde e sigilo do segurado',
    cuidados: [
      'Laudos, CID e histórico médico são dados pessoais sensíveis pela LGPD (arts. 5º e 11). O SmartJuris mascara dados pessoais antes de enviá-los à IA e isola os registros por escritório.',
      'A minuta gerada é ponto de partida: o advogado confere fatos, documentos e fundamentos antes de aprovar e exportar.',
    ],
    faq: [
      {
        q: 'O sistema consulta o CNIS ou o Meu INSS?',
        a: 'Não. O SmartJuris não se integra ao CNIS nem ao Meu INSS. Você anexa os documentos do caso e o sistema os indexa para consulta e geração de minutas.',
      },
      {
        q: 'Há modelos para BPC/LOAS, pensão por morte e auxílio por incapacidade?',
        a: 'Sim. O gerador conta com modelos de teses para essas ações e para recursos ao CRPS e à TNU. Todos exigem revisão e adaptação ao caso concreto.',
      },
      {
        q: 'Os dados de saúde dos clientes ficam seguros?',
        a: 'Os dados são isolados por escritório, e informações pessoais são mascaradas antes do envio à IA. O tratamento deve seguir a LGPD e a política do seu escritório.',
      },
    ],
    relacionadas: ['/software-para-advogado-trabalhista', '/software-para-advogado-de-familia'],
  },
  {
    slug: 'de-familia',
    nome: 'Família',
    titulo: 'Software para Advogado de Família com IA | SmartJuris',
    descricao:
      'Gerencie divórcios, guardas e alimentos com sigilo, controle prazos e gere iniciais de família com IA, com revisão do advogado em cada peça.',
    h1: 'Software para advogado de família',
    lead:
      'Casos sensíveis, clientes em momentos difíceis e processos que correm em segredo de justiça: o SmartJuris apoia o escritório de família com organização, prazos e minutas revisadas por quem assina.',
    pecas: [
      'Divórcio Consensual',
      'Divórcio Litigioso',
      'Dissolução de União Estável',
      'Ação de Guarda',
      'Regulamentação de Visitas',
      'Ação de Alimentos',
      'Execução de Alimentos',
      'Investigação de Paternidade',
    ],
    rotinaTitulo: 'Rotina do escritório de família',
    rotina: [
      'Os processos de casamento, união estável, filiação, alimentos e guarda tramitam, em regra, em segredo de justiça (art. 189, II, do CPC). Isso exige cuidado com quem acessa cada informação dentro do escritório.',
      'Ao mesmo tempo, o contato com o cliente é frequente e emocional, e muitos casos pedem ações coordenadas, como alimentos, guarda e visitas, cada uma com seus prazos.',
    ],
    rotinaLista: [
      'Permissões por usuário e dados isolados por escritório, para que só quem atua no caso o acesse.',
      'Agenda de audiências de conciliação e mediação, com vínculo ao processo e ao cliente.',
      'Resumo de intimações com prazo fatal e linha do tempo para acompanhar execuções de alimentos.',
    ],
    gestao: [
      'Cadastro de clientes pessoa física, com qualificação para as petições.',
      'Honorários e despesas por processo, e cronômetro de horas para casos de longa duração.',
      'Pipeline de captação com alerta de conflito, importante quando partes de um mesmo núcleo familiar procuram o escritório.',
    ],
    cuidadosTitulo: 'Sigilo, ética e responsabilidade',
    cuidados: [
      'O SmartJuris não é indicado para substituir a escuta e a estratégia do advogado: ele gera minutas e organiza a rotina, e cada peça passa pela fila de validação antes da exportação.',
      'Nomes, CPFs e dados de contato são mascarados antes do envio à IA, e a publicidade do escritório deve seguir as regras de publicidade da OAB.',
    ],
    faq: [
      {
        q: 'O sistema ajuda em casos em segredo de justiça?',
        a: 'Ele isola os dados por escritório e permite controlar o acesso por usuário. O sigilo processual em si é determinado pelo juízo; o escritório continua responsável pelo manuseio das informações.',
      },
      {
        q: 'Há modelos para divórcio, guarda e alimentos?',
        a: 'Sim. O gerador tem modelos para divórcio consensual e litigioso, guarda, visitas, alimentos, execução de alimentos, união estável e investigação de paternidade, sempre sujeitos a revisão.',
      },
      {
        q: 'A IA pode redigir acordos entre as partes?',
        a: 'Pode gerar uma minuta inicial para o advogado revisar, mas a negociação, a orientação ao cliente e a adequação ao caso são atividades do profissional.',
      },
    ],
    relacionadas: ['/software-para-advogado-civel', '/software-para-advogado-previdenciario'],
  },
  {
    slug: 'civel',
    nome: 'Cível',
    titulo: 'Software para Advogado Cível com IA | SmartJuris',
    descricao:
      'Gere iniciais, contestações e recursos cíveis com IA, controle prazos em dias úteis e acompanhe cada processo do escritório em um só painel.',
    h1: 'Software para advogado cível',
    lead:
      'O contencioso cível reúne muitos tipos de ação e prazos em sequência. O SmartJuris apoia a rotina com modelos de teses, agenda e resumo de intimações, sem tirar a revisão da mão do advogado.',
    pecas: [
      'Petição Inicial',
      'Contestação',
      'Réplica',
      'Recurso de Apelação',
      'Agravo de Instrumento',
      'Embargos de Declaração',
      'Cumprimento de Sentença',
      'Impugnação ao Cumprimento de Sentença',
      'Execução de Título Extrajudicial',
      'Embargos à Execução',
      'Ação Monitória',
      'Ação de Despejo',
      'Ação de Usucapião',
      'Tutela de Urgência/Antecipada',
    ],
    rotinaTitulo: 'Prazos no Código de Processo Civil',
    rotina: [
      'O CPC conta os prazos processuais em dias úteis (art. 219). Como referência geral, o prazo para a maioria dos recursos é de 15 dias (art. 1.003, § 5º) e o dos embargos de declaração é de cinco dias (art. 1.023). Há exceções, então confira a norma e o caso.',
      'Quem atua em volume trabalha com dezenas de processos em fases diferentes, e a dificuldade costuma ser saber, a cada manhã, o que exige ação hoje.',
    ],
    rotinaLista: [
      'Painel por processo com andamentos, documentos, peças e prazos reunidos.',
      'Resumo de intimações com a ação recomendada e o prazo fatal.',
      'Pesquisa de jurisprudência ao vivo nos planos Intermediário e Avançado, com resultados que podem ser usados na geração das peças.',
    ],
    gestao: [
      'Clientes pessoa física e jurídica, com máscaras de CPF e CNPJ e busca de CEP.',
      'Lançamentos de honorários fixos, de êxito e despesas, com cronômetro de horas faturáveis.',
      'Scanner de riscos contratuais nos planos Intermediário e Avançado, útil em consultivo e em ações de cobrança.',
    ],
    cuidadosTitulo: 'Revisão e rastreabilidade das peças',
    cuidados: [
      'Todo texto gerado entra em uma fila de validação, com crivo ético OAB, histórico e trilha de auditoria. A exportação em PDF ou DOCX só é liberada para peças aprovadas ou protocoladas.',
      'Como a IA pode errar, citações e fundamentos precisam ser conferidos pelo advogado antes do protocolo.',
    ],
    faq: [
      {
        q: 'O SmartJuris protocola peças nos tribunais?',
        a: 'Não. Ele gera minutas e organiza a rotina; o protocolo é feito pelo advogado no sistema do tribunal.',
      },
      {
        q: 'Posso gerar peças para ações de despejo, usucapião e execução?',
        a: 'Sim, há modelos de teses para essas e outras ações cíveis. Eles são ponto de partida e devem ser adaptados ao caso e revisados.',
      },
      {
        q: 'Quanto custa?',
        a: `Os planos custam ${precos.join(', ')} por mês, com limites de peças por plano, e estão detalhados na página de planos.`,
      },
    ],
    relacionadas: ['/software-para-advogado-consumerista', '/software-para-advogado-tributarista'],
  },
  {
    slug: 'consumerista',
    nome: 'Consumerista',
    titulo: 'Software para Advogado do Consumidor com IA | SmartJuris',
    descricao:
      'Gere ações do consumidor com IA, de negativação indevida a vício do produto, controle prazos e acompanhe volume de processos com revisão do advogado.',
    h1: 'Software para advogado do consumidor',
    lead:
      'O direito do consumidor costuma envolver muitos casos parecidos. O SmartJuris ajuda o escritório a padronizar o fluxo de trabalho, gerar minutas por tipo de ação e manter cada peça sob revisão.',
    pecas: [
      'Petição Inicial CDC',
      'Ação de Danos Morais',
      'Ação por Negativação Indevida',
      'Ação Declaratória de Inexigibilidade de Débito',
      'Ação por Vício do Produto/Serviço',
      'Ação de Restituição de Valores em Dobro',
      'Ação Revisional de Contrato',
      'Ação de Obrigação de Fazer',
    ],
    rotinaTitulo: 'Alto volume e prazos do CDC',
    rotina: [
      'Casos de negativação, cobrança indevida e vícios de produto repetem estruturas: partes, documentos e pedidos se parecem. O ganho está em padronizar o que é igual e dedicar tempo ao que é diferente em cada cliente.',
      'O CDC prevê prazos para reclamar de vícios aparentes (art. 26: 30 dias para produtos e serviços não duráveis e 90 para duráveis) e prescrição própria para a reparação (art. 27). A contagem exige atenção ao caso.',
    ],
    rotinaLista: [
      'Modelos de teses por tipo de ação, que servem de base para a minuta e permitem ajustar cada caso.',
      'Organização por cliente e processo, com documentos indexados para busca semântica.',
      'Resumo de intimações e prazo fatal para não depender de leitura manual em um volume grande.',
    ],
    gestao: [
      'Funil de captação em quatro fases, de lead a contrato, com alerta de conflito de interesses.',
      'Controle de honorários de êxito e despesas por processo.',
      'Jurimetria nos planos Intermediário e Avançado, para observar a taxa de êxito por área e status no escritório.',
    ],
    cuidadosTitulo: 'Cuidado com publicidade e promessa de resultado',
    cuidados: [
      'A advocacia do consumidor costuma ser muito divulgada. O Código de Ética e o Provimento 205/2021 da OAB restringem a publicidade e vedam a promessa de resultado e a captação indevida.',
      'O SmartJuris não prevê indenização nem resultado: ele ajuda a produzir minutas, que o advogado deve revisar e adequar a cada situação.',
    ],
    faq: [
      {
        q: 'Posso usar o sistema para operar em grande volume?',
        a: 'Sim, ele foi pensado para organizar muitos processos por escritório. Os limites de peças por mês dependem do plano contratado.',
      },
      {
        q: 'Há modelos para negativação indevida e vício do produto?',
        a: 'Sim. O gerador tem modelos para ação por negativação indevida, vício do produto ou serviço, inexigibilidade de débito, revisão de contrato e outras.',
      },
      {
        q: 'A IA estima o valor da indenização?',
        a: 'Não. O sistema não calcula nem promete valor de indenização. A estratégia e o pedido são definidos pelo advogado.',
      },
    ],
    relacionadas: ['/software-para-advogado-civel', '/software-para-advogado-tributarista'],
  },
  {
    slug: 'tributarista',
    nome: 'Tributário',
    titulo: 'Software para Advogado Tributarista com IA | SmartJuris',
    descricao:
      'Controle prazos fiscais, gere mandados de segurança, embargos à execução fiscal e ações anulatórias com IA e revise cada peça antes de exportar.',
    h1: 'Software para advogado tributarista',
    lead:
      'Prazos decadenciais e prescricionais, execuções fiscais e teses repetitivas: o SmartJuris organiza a rotina do escritório tributário e gera minutas que o advogado revisa antes de exportar.',
    pecas: [
      'Mandado de Segurança Tributário',
      'Ação Anulatória',
      'Ação de Repetição de Indébito',
      'Ação de Compensação',
      'Ação Declaratória',
      'Embargos à Execução Fiscal',
      'Exceção de Pré-Executividade',
      'Agravo de Instrumento Tributário',
    ],
    rotinaTitulo: 'Prazos que não admitem descuido',
    rotina: [
      'Na área tributária, vários prazos têm consequência definitiva: a ação para repetição de indébito prescreve em cinco anos (CTN, art. 168), o mandado de segurança deve ser impetrado em até 120 dias (Lei 12.016/2009, art. 23) e os embargos à execução fiscal têm 30 dias (Lei 6.830/1980, art. 16). Verifique sempre o termo inicial e a norma vigente.',
      'Além disso, escritórios tributários acompanham clientes empresariais com vários autos, em diferentes esferas, e relatórios consolidados fazem diferença.',
    ],
    rotinaLista: [
      'Agenda com prazos fatais e vencimentos vinculados ao processo e ao cliente.',
      'Resumo de intimações com a ação recomendada e o prazo fatal.',
      'Pesquisa de jurisprudência ao vivo nos planos Intermediário e Avançado, para apoiar teses e recursos.',
    ],
    gestao: [
      'Clientes pessoa jurídica com CNPJ e dados cadastrais para as petições.',
      'Lançamentos de honorários fixos e de êxito, despesas e horas faturáveis por processo.',
      'Scanner de riscos contratuais nos planos Intermediário e Avançado, para apoiar a revisão de contratos do cliente empresarial.',
    ],
    cuidadosTitulo: 'Responsabilidade técnica e sigilo empresarial',
    cuidados: [
      'Dados fiscais e contábeis são sensíveis para o cliente. Os registros ficam isolados por escritório, e informações pessoais são mascaradas antes do envio à IA.',
      'O modelo de peça é um ponto de partida: teses tributárias mudam com a jurisprudência e com a legislação, e a conferência é do advogado.',
    ],
    faq: [
      {
        q: 'O sistema apura tributos ou calcula o valor a restituir?',
        a: 'Não. O SmartJuris gera minutas e organiza a rotina; apuração, cálculo e análise fiscal continuam sendo do advogado ou de ferramenta especializada.',
      },
      {
        q: 'Há modelos para mandado de segurança e embargos à execução fiscal?',
        a: 'Sim. O gerador tem modelos para mandado de segurança tributário, ação anulatória, repetição de indébito, embargos à execução fiscal e outras peças da área.',
      },
      {
        q: 'Posso pesquisar jurisprudência dentro do sistema?',
        a: 'Sim, nos planos Intermediário e Avançado há consulta de jurisprudência ao vivo em tribunais, com resultados que podem apoiar a geração das peças.',
      },
    ],
    relacionadas: ['/software-para-advogado-civel', '/software-para-advogado-consumerista'],
  },
]

export const AREAS: Page[] = AREAS_DADOS.map(a => ({
  path: `/software-para-advogado-${a.slug}`,
  kind: 'resource',
  title: a.titulo,
  description: a.descricao,
  h1: a.h1,
  lead: a.lead,
  sections: [
    {
      h2: `Peças que o SmartJuris gera para a área ${a.nome.toLowerCase()}`,
      p: [
        `O gerador conta com modelos de teses para ${a.nome === 'Tributário' ? 'o Direito Tributário' : `a área ${a.nome.toLowerCase()}`}. Eles servem de ponto de partida: o texto nasce de fontes recuperadas por busca vetorial na base do escritório e segue para revisão humana antes de qualquer exportação.`,
      ],
      ul: a.pecas,
    },
    { h2: a.rotinaTitulo, p: a.rotina, ul: a.rotinaLista },
    { h2: 'Gestão do escritório além das peças', ul: a.gestao },
    { h2: a.cuidadosTitulo, p: a.cuidados },
    {
      h2: 'Quanto custa e como começar',
      p: [
        `Os planos vão de ${faixa} por mês, com limite mensal de peças. Veja os planos e escolha o que cabe no seu escritório.`,
      ],
    },
  ],
  faq: a.faq,
  related: ['/recursos/gerador-de-pecas-com-ia', '/recursos/gestao-de-processos', ...a.relacionadas, '/planos'],
}))
