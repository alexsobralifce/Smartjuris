export interface SecaoModelo {
  titulo: string;
  instrucao: string;
}

export interface ModeloPeca {
  id: string;            // kebab-case, ex.: "peticao-inicial-civel"
  area: string;
  tipo: string;          // nome exato exibido/selecionado
  descricao: string;     // 1 frase: quando usar
  baseLegal: string[];   // artigos/leis
  secoes: SecaoModelo[]; // 5 a 9 seções
  observacoes?: string[]; // alertas (prazo, pressuposto, competência)
}

export const AREAS = ['Cível', 'Família', 'Sucessões', 'Trabalhista', 'Tributário', 'Penal', 'Previdenciário', 'Consumerista', 'Empresarial', 'Administrativo', 'Constitucional'];

// ---------------------------------------------------------------------------
// Seções base reutilizadas nos esqueletos das categorias
// ---------------------------------------------------------------------------
const SECAO_ENDERECAMENTO: SecaoModelo = {
  titulo: 'ENDEREÇAMENTO',
  instrucao: 'Enderece a peça ao juízo competente, indicando comarca, vara e, se aplicável, turma recursal.',
};
const SECAO_ENDERECAMENTO_TRABALHISTA: SecaoModelo = {
  titulo: 'ENDEREÇAMENTO',
  instrucao: 'Enderece a peça à Vara do Trabalho competente.',
};
const SECAO_QUALIFICACAO: SecaoModelo = {
  titulo: 'QUALIFICAÇÃO DAS PARTES',
  instrucao: 'Qualifique as partes com nome completo, CPF/CNPJ, estado civil, profissão, endereço e demais dados relevantes.',
};
const SECAO_FATOS: SecaoModelo = {
  titulo: 'DOS FATOS',
  instrucao: 'Narre os fatos de forma cronológica, objetiva e completa.',
};
const SECAO_DIREITO: SecaoModelo = {
  titulo: 'DO DIREITO',
  instrucao: 'Fundamente juridicamente a pretensão, citando doutrina, jurisprudência e os dispositivos legais aplicáveis.',
};
const SECAO_PEDIDOS: SecaoModelo = {
  titulo: 'DOS PEDIDOS',
  instrucao: 'Formule pedidos certos e determinados, com as consequências jurídicas pretendidas.',
};
const SECAO_VALOR_CAUSA: SecaoModelo = {
  titulo: 'VALOR DA CAUSA',
  instrucao: 'Indique o valor da causa, estimando quando não houver valor econômico imediato.',
};
const SECAO_PROVAS: SecaoModelo = {
  titulo: 'DAS PROVAS',
  instrucao: 'Requer a produção de todas as provas admitidas em direito.',
};
const SECAO_FECHAMENTO: SecaoModelo = {
  titulo: 'FECHAMENTO',
  instrucao: 'Feche com local, data, assinatura e número da OAB.',
};
const SECAO_REQUERIMENTOS_FINAIS: SecaoModelo = {
  titulo: 'REQUERIMENTOS FINAIS',
  instrucao: 'Requeira a citação da parte contrária, a designação de audiência e a procedência dos pedidos.',
};

// ---------------------------------------------------------------------------
// Esqueletos das categorias
// ---------------------------------------------------------------------------
const S_PETICAO_INICIAL: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  SECAO_QUALIFICACAO,
  SECAO_FATOS,
  SECAO_DIREITO,
  SECAO_PEDIDOS,
  SECAO_VALOR_CAUSA,
  SECAO_PROVAS,
  SECAO_REQUERIMENTOS_FINAIS,
  SECAO_FECHAMENTO,
];

const S_CONTESTACAO: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  SECAO_QUALIFICACAO,
  {
    titulo: 'PRELIMINARES',
    instrucao: 'Argua as preliminares do art. 337 do CPC aplicáveis ao caso, justificando cada uma.',
  },
  {
    titulo: 'PREJUDICIAL DE MÉRITO',
    instrucao: 'Alegue a prescrição ou decadência, se houver, como prejudicial de mérito.',
  },
  {
    titulo: 'DO MÉRITO',
    instrucao: 'Impugne especificamente os fatos e fundamentos da inicial, nos termos do art. 341 do CPC.',
  },
  {
    titulo: 'DOS PEDIDOS',
    instrucao: 'Requeira o afastamento das preliminares e a improcedência dos pedidos autorais.',
  },
  SECAO_PROVAS,
  SECAO_FECHAMENTO,
];

const S_RECURSO: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  {
    titulo: 'QUALIFICAÇÃO',
    instrucao: 'Qualifique o recorrente e o recorrido, indicando o processo de origem.',
  },
  {
    titulo: 'CABIMENTO, TEMPESTIVIDADE E PREPARO',
    instrucao: 'Demonstre o cabimento do recurso, sua tempestividade e o preparo, quando exigível.',
  },
  {
    titulo: 'SÍNTESE DA DECISÃO RECORRIDA',
    instrucao: 'Sintetize os termos da decisão recorrida e aponte o ponto impugnado.',
  },
  {
    titulo: 'DAS RAZÕES RECURSAIS',
    instrucao: 'Exponha as razões de reforma ou nulidade, fundamentando a violação legal ou o erro de julgamento.',
  },
  {
    titulo: 'DOS PEDIDOS',
    instrucao: 'Requeira o conhecimento e o provimento do recurso, com reforma ou anulação da decisão.',
  },
  SECAO_FECHAMENTO,
];

const S_EMBARGOS_DECLARACAO: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  {
    titulo: 'QUALIFICAÇÃO',
    instrucao: 'Qualifique o embargante e o embargado, indicando o processo de origem.',
  },
  {
    titulo: 'CABIMENTO E TEMPESTIVIDADE',
    instrucao: 'Demonstre o cabimento dos embargos e a tempestividade do protocolo.',
  },
  {
    titulo: 'SÍNTESE DA DECISÃO EMBARGADA',
    instrucao: 'Transcreva os pontos da decisão em que houve omissão, contradição, obscuridade ou erro material.',
  },
  {
    titulo: 'DAS RAZÕES DOS EMBARGOS',
    instrucao: 'Aponte as omissões, contradições, obscuridades ou erros materiais, requerendo o saneamento.',
  },
  {
    titulo: 'DOS PEDIDOS',
    instrucao: 'Requeira o acolhimento dos embargos, com efeito infringente quando cabível.',
  },
  SECAO_FECHAMENTO,
];

const S_EXECUCAO: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  SECAO_QUALIFICACAO,
  {
    titulo: 'DO TÍTULO EXECUTIVO E CÁLCULO',
    instrucao: 'Apresente o título executivo e demonstre o cálculo do valor devido, com juros e correção monetária.',
  },
  {
    titulo: 'DOS REQUERIMENTOS',
    instrucao: 'Requeira a citação do executado e a penhora de bens suficientes à satisfação do crédito.',
  },
  SECAO_PEDIDOS,
  SECAO_FECHAMENTO,
];

const S_EXECUCAO_DEFESA: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  SECAO_QUALIFICACAO,
  {
    titulo: 'DO TÍTULO EXECUTIVO E CÁLCULO',
    instrucao: 'Impugne o título executivo e o cálculo apresentado, apontando excessos e vícios.',
  },
  {
    titulo: 'DO MÉRITO DA DEFESA',
    instrucao: 'Exponha as matérias defensivas cabíveis, como excesso de execução, nulidade, cumprimento e decadência.',
  },
  SECAO_PEDIDOS,
  SECAO_FECHAMENTO,
];

const S_TRABALHISTA: SecaoModelo[] = [
  SECAO_ENDERECAMENTO_TRABALHISTA,
  SECAO_QUALIFICACAO,
  SECAO_FATOS,
  SECAO_DIREITO,
  {
    titulo: 'DOS PEDIDOS',
    instrucao: 'Formule os pedidos com valores líquidos ou estimados, discriminando parcelas e juros.',
  },
  SECAO_VALOR_CAUSA,
  SECAO_PROVAS,
  SECAO_FECHAMENTO,
];

const S_PENAL: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  {
    titulo: 'QUALIFICAÇÃO',
    instrucao: 'Qualifique o acusado (ou querelante/querelado) e os demais envolvidos, com os dados processuais.',
  },
  SECAO_FATOS,
  {
    titulo: 'DO DIREITO',
    instrucao: 'Fundamente as teses de absolvição, atipicidade, nulidade ou excesso de prazo, com doutrina e jurisprudência.',
  },
  SECAO_PEDIDOS,
  SECAO_FECHAMENTO,
];

const S_TRIBUTARIO: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  SECAO_QUALIFICACAO,
  {
    titulo: 'DOS FATOS',
    instrucao: 'Descreva o lançamento, autuação ou notificação fiscal questionada, com datas e valores.',
  },
  {
    titulo: 'DO DIREITO',
    instrucao: 'Demonstre a ilegalidade ou inconstitucionalidade do ato fiscal, com fundamentação legal e jurisprudencial.',
  },
  {
    titulo: 'DA LIMINAR',
    instrucao: 'Requeira e fundamente a liminar ou tutela de urgência, se cabível, com os requisitos legais.',
  },
  SECAO_PEDIDOS,
  SECAO_PROVAS,
  SECAO_FECHAMENTO,
];

const S_PREVIDENCIARIO: SecaoModelo[] = [
  SECAO_ENDERECAMENTO,
  SECAO_QUALIFICACAO,
  SECAO_FATOS,
  {
    titulo: 'DO DIREITO',
    instrucao: 'Demonstre o preenchimento dos requisitos legais do benefício, com provas documentais e precedentes.',
  },
  SECAO_PEDIDOS,
  SECAO_VALOR_CAUSA,
  SECAO_PROVAS,
  SECAO_FECHAMENTO,
];

// ---------------------------------------------------------------------------
// Seções específicas das novas áreas
// ---------------------------------------------------------------------------
const SECAO_ENDERECAMENTO_FAMILIA: SecaoModelo = {
  titulo: 'ENDEREÇAMENTO',
  instrucao: 'Enderece a peça à Vara de Família e Sucessões competente, indicando comarca e vara.',
};
const SECAO_ENDERECAMENTO_EMPRESARIAL: SecaoModelo = {
  titulo: 'ENDEREÇAMENTO',
  instrucao: 'Enderece a peça à Vara Empresarial ou de Falências e Recuperações Judiciais competente.',
};
const SECAO_ENDERECAMENTO_FAZENDA_PUBLICA: SecaoModelo = {
  titulo: 'ENDEREÇAMENTO',
  instrucao: 'Enderece a peça ao juízo competente — Vara da Fazenda Pública — indicando comarca e vara.',
};

const S_FAMILIA: SecaoModelo[] = [
  SECAO_ENDERECAMENTO_FAMILIA,
  SECAO_QUALIFICACAO,
  SECAO_FATOS,
  SECAO_DIREITO,
  SECAO_PEDIDOS,
  SECAO_VALOR_CAUSA,
  SECAO_PROVAS,
  SECAO_FECHAMENTO,
];

// ---------------------------------------------------------------------------
// Catálogo de modelos (99)
// ---------------------------------------------------------------------------
export const MODELOS_PECA: ModeloPeca[] = [
  // ============================ CÍVEL ============================
  {
    id: 'peticao-inicial-civel',
    area: 'Cível',
    tipo: 'Petição Inicial',
    descricao: 'Para dar início a uma ação cível, requerendo a tutela jurisdicional do Estado.',
    baseLegal: ['CPC 319'],
    secoes: [...S_PETICAO_INICIAL],
  },
  {
    id: 'contestacao',
    area: 'Cível',
    tipo: 'Contestação',
    descricao: 'Para apresentar defesa do réu contra os pedidos formulados na petição inicial.',
    baseLegal: ['CPC 335-342', 'CPC 337', 'CPC 341'],
    secoes: [...S_CONTESTACAO],
    observacoes: ['Prazo de 15 dias úteis (art. 335, CPC).'],
  },
  {
    id: 'replica',
    area: 'Cível',
    tipo: 'Réplica',
    descricao: 'Para impugnar as alegações trazidas na contestação, quando houver defesa processual ou fato novo.',
    baseLegal: ['CPC 350-351'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'PRELIMINARES',
        instrucao: 'Enfrente as preliminares arguidas na contestação e rejeite-as uma a uma.',
      },
      {
        titulo: 'PREJUDICIAL DE MÉRITO',
        instrucao: 'Refute a prescrição ou decadência alegada, se apresentada na contestação.',
      },
      {
        titulo: 'DO MÉRITO',
        instrucao: 'Rebata especificamente as teses defensivas da contestação, reafirmando os fundamentos da inicial.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o afastamento das teses defensivas e a procedência integral dos pedidos.',
      },
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 15 dias úteis contados da ciência da contestação (art. 350, CPC).'],
  },
  {
    id: 'recurso-de-apelacao',
    area: 'Cível',
    tipo: 'Recurso de Apelação',
    descricao: 'Para impugnar sentença definitiva ou terminativa perante o tribunal, buscando reforma ou nulidade.',
    baseLegal: ['CPC 1009-1014'],
    secoes: [...S_RECURSO],
    observacoes: [
      'Prazo de 15 dias úteis; preparo obrigatório (art. 1007, CPC).',
      'Verificar pressupostos de admissibilidade (art. 1010, CPC).',
    ],
  },
  {
    id: 'agravo-de-instrumento',
    area: 'Cível',
    tipo: 'Agravo de Instrumento',
    descricao: 'Para impugnar decisões interlocutórias do rol do art. 1015, CPC, diretamente no tribunal.',
    baseLegal: ['CPC 1015'],
    secoes: [...S_RECURSO],
    observacoes: [
      'Prazo de 15 dias úteis (art. 1015, §1º, CPC).',
      'Exige preparo (porte de remessa e retorno) e instrução obrigatória com peças obrigatórias.',
    ],
  },
  {
    id: 'embargos-de-declaracao-civel',
    area: 'Cível',
    tipo: 'Embargos de Declaração',
    descricao: 'Para sanar omissão, contradição, obscuridade ou erro material de decisão judicial.',
    baseLegal: ['CPC 1022'],
    secoes: [...S_EMBARGOS_DECLARACAO],
    observacoes: ['Prazo de 5 dias úteis; não há preparo (art. 1022, CPC).'],
  },
  {
    id: 'impugnacao-ao-cumprimento-de-sentenca',
    area: 'Cível',
    tipo: 'Impugnação ao Cumprimento de Sentença',
    descricao: 'Para o executado se defender no cumprimento de sentença, impugnando valor, excesso ou vícios do título.',
    baseLegal: ['CPC 525'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO EXECUTIVO E CÁLCULO',
        instrucao: 'Impugne o título executivo e o cálculo apresentado, apontando excessos e vícios.',
      },
      {
        titulo: 'DO MÉRITO DA IMPUGNAÇÃO',
        instrucao: 'Exponha as matérias defensivas do art. 525, §1º, CPC, como excesso de execução, cumprimento, nulidade e decadência.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 15 dias úteis contados da intimação para pagamento (art. 525, CPC).'],
  },
  {
    id: 'cumprimento-de-sentenca',
    area: 'Cível',
    tipo: 'Cumprimento de Sentença',
    descricao: 'Para promover a execução de título judicial, requerendo intimação para pagamento e penhora.',
    baseLegal: ['CPC 523-527'],
    secoes: [...S_EXECUCAO],
    observacoes: ['Intimação para pagamento em 15 dias, sob pena de multa de 10% (art. 523, CPC).'],
  },
  {
    id: 'execucao-de-titulo-extrajudicial',
    area: 'Cível',
    tipo: 'Execução de Título Extrajudicial',
    descricao: 'Para promover a execução de títulos extrajudiciais, como contratos, notas promissórias e cheques.',
    baseLegal: ['CPC 783-786'],
    secoes: [...S_EXECUCAO],
    observacoes: [
      'Competência da comarca do domicílio do executado (art. 781, CPC).',
      'Observar prescrição intercorrente.',
    ],
  },
  {
    id: 'embargos-a-execucao',
    area: 'Cível',
    tipo: 'Embargos à Execução',
    descricao: 'Para o executado se defender na execução de título extrajudicial, após garantia do juízo.',
    baseLegal: ['CPC 914'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO EXECUTIVO E CÁLCULO',
        instrucao: 'Impugne o título executivo e o cálculo apresentado, apontando excessos e vícios.',
      },
      {
        titulo: 'DO MÉRITO DOS EMBARGOS',
        instrucao: 'Exponha as matérias defensivas do art. 917, CPC, como nulidade do título, excesso de execução e cumprimento.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prazo de 15 dias úteis contados da juntada da citação (art. 915, CPC).',
      'Exige garantia do juízo para suspender a execução, salvo as exceções legais.',
    ],
  },
  {
    id: 'excecao-de-pre-executividade-civel',
    area: 'Cível',
    tipo: 'Exceção de Pré-Executividade',
    descricao: 'Para impugnar a execução sem seguro do juízo, quando houver matéria de ordem pública com prova documental.',
    baseLegal: ['Construção jurisprudencial do STJ'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO E DA EXECUÇÃO',
        instrucao: 'Identifique o título executivo e os atos de constrição praticados na execução.',
      },
      {
        titulo: 'DO MÉRITO DA EXCEÇÃO',
        instrucao: 'Apresente as matérias de ordem pública, como nulidade do título, prescrição e excesso de execução, com prova documental.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Sem prazo fixo; admite matérias cognoscíveis de ofício e exigência de prova documental pré-constituída (STJ).'],
  },
  {
    id: 'acao-monitoria',
    area: 'Cível',
    tipo: 'Ação Monitória',
    descricao: 'Para cobrar crédito com base em prova escrita sem eficácia de título executivo.',
    baseLegal: ['CPC 700'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Dispensa título executivo; basta prova escrita sem eficácia de título executivo (art. 700, CPC).'],
  },
  {
    id: 'acao-de-consignacao-em-pagamento',
    area: 'Cível',
    tipo: 'Ação de Consignação em Pagamento',
    descricao: 'Para depositar em juízo valor devido quando o credor recusar recebimento, cobrar excesso ou for incerto.',
    baseLegal: ['CC 334-345', 'CPC 539'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Depósito inicial obrigatório (art. 542, CPC).'],
  },
  {
    id: 'acao-de-despejo',
    area: 'Cível',
    tipo: 'Ação de Despejo',
    descricao: 'Para retomar o imóvel locado nas hipóteses da Lei do Inquilinato.',
    baseLegal: ['Lei 8.245/1991'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Possibilidade de liminar de despejo nas hipóteses do art. 59, §1º, Lei 8.245/1991.'],
  },
  {
    id: 'acao-de-usucapiao',
    area: 'Cível',
    tipo: 'Ação de Usucapião',
    descricao: 'Para adquirir a propriedade de imóvel pela posse qualificada e ininterrupta pelo prazo legal.',
    baseLegal: ['CC 1238-1244', 'CPC 941'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Citação dos confinantes e do Ministério Público e publicação de edital (art. 259, CPC).'],
  },
  {
    id: 'acao-reivindicatoria',
    area: 'Cível',
    tipo: 'Ação Reivindicatória',
    descricao: 'Para o proprietário reaver a posse do bem de quem injustamente o detenha.',
    baseLegal: ['CC 1228'],
    secoes: [...S_PETICAO_INICIAL],
  },
  {
    id: 'acao-de-obrigacao-de-fazer-civel',
    area: 'Cível',
    tipo: 'Ação de Obrigação de Fazer/Não Fazer',
    descricao: 'Para compelir o réu a cumprir ou abster-se de determinada conduta, com tutela específica.',
    baseLegal: ['CPC 497-501'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Possibilidade de tutela específica e multa coercitiva (art. 497, CPC).'],
  },
  {
    id: 'tutela-de-urgencia-antecipada',
    area: 'Cível',
    tipo: 'Tutela de Urgência/Antecipada',
    descricao: 'Para obter decisão antecipada do mérito ou acautelatória antes do julgamento definitivo.',
    baseLegal: ['CPC 294-311'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      SECAO_FATOS,
      SECAO_DIREITO,
      {
        titulo: 'DA TUTELA DE URGÊNCIA',
        instrucao: 'Demonstre a probabilidade do direito e o perigo de dano ou o risco ao resultado útil do processo (art. 300, CPC).',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Demonstrar probabilidade do direito e perigo de dano ou risco ao resultado útil do processo (art. 300, CPC).'],
  },

  // ============================ TRABALHISTA ============================
  {
    id: 'reclamacao-trabalhista',
    area: 'Trabalhista',
    tipo: 'Reclamação Trabalhista',
    descricao: 'Para o empregado ajuizar ação contra o empregador perante a Justiça do Trabalho.',
    baseLegal: ['CLT 840'],
    secoes: [...S_TRABALHISTA],
    observacoes: ['Pedidos líquidos ou com valores estimados; possibilidade de justiça gratuita.'],
  },
  {
    id: 'contestacao-trabalhista',
    area: 'Trabalhista',
    tipo: 'Contestação Trabalhista',
    descricao: 'Para o empregador apresentar defesa contra a reclamação trabalhista.',
    baseLegal: ['CLT 847'],
    secoes: [
      SECAO_ENDERECAMENTO_TRABALHISTA,
      SECAO_QUALIFICACAO,
      {
        titulo: 'PRELIMINARES',
        instrucao: 'Argua as preliminares aplicáveis, como inépcia da inicial, ilegitimidade e incompetência.',
      },
      {
        titulo: 'PREJUDICIAL DE MÉRITO',
        instrucao: 'Alegue a prescrição das parcelas anteriores ao quinquênio (art. 7º, XXIX, CF).',
      },
      {
        titulo: 'DO MÉRITO',
        instrucao: 'Impugne especificamente os pedidos da reclamação, rebatendo fato a fato.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a improcedência dos pedidos e a condenação do reclamante em litigância de má-fé, se cabível.',
      },
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 20 dias para resposta (art. 847, CLT); ausência gera revelia.'],
  },
  {
    id: 'recurso-ordinario',
    area: 'Trabalhista',
    tipo: 'Recurso Ordinário',
    descricao: 'Para impugnar sentenças da Justiça do Trabalho perante o Tribunal Regional do Trabalho.',
    baseLegal: ['CLT 895'],
    secoes: [...S_RECURSO],
    observacoes: ['Prazo de 8 dias (art. 895, CLT); preparo conforme Instrução Normativa do TST.'],
  },
  {
    id: 'recurso-de-revista',
    area: 'Trabalhista',
    tipo: 'Recurso de Revista',
    descricao: 'Para impugnar acórdãos de TRT perante o TST, por violação legal ou divergência jurisprudencial.',
    baseLegal: ['CLT 896'],
    secoes: [...S_RECURSO],
    observacoes: [
      'Prazo de 8 dias; exige prequestionamento e demonstração de divergência jurisprudencial (art. 896, CLT).',
    ],
  },
  {
    id: 'agravo-de-peticao',
    area: 'Trabalhista',
    tipo: 'Agravo de Petição',
    descricao: 'Para impugnar decisões proferidas na execução trabalhista perante o TRT.',
    baseLegal: ['CLT 897'],
    secoes: [...S_RECURSO],
    observacoes: ['Prazo de 8 dias; delimitação das matérias impugnadas (art. 897, §1º, CLT).'],
  },
  {
    id: 'impugnacao-a-sentenca-de-liquidacao',
    area: 'Trabalhista',
    tipo: 'Impugnação à Sentença de Liquidação',
    descricao: 'Para impugnar a sentença de liquidação e os cálculos homologados na execução trabalhista.',
    baseLegal: ['CLT 884'],
    secoes: [
      SECAO_ENDERECAMENTO_TRABALHISTA,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DA LIQUIDAÇÃO E DO CÁLCULO',
        instrucao: 'Impugne a sentença de liquidação e o cálculo apresentado, apontando os excessos e incorreções.',
      },
      {
        titulo: 'DO MÉRITO DA IMPUGNAÇÃO',
        instrucao: 'Apresente as matérias defensivas contra os valores liquidados, com fundamento nas decisões exequendas.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 10 dias para impugnação (art. 884, CLT).'],
  },
  {
    id: 'embargos-a-execucao-trabalhista',
    area: 'Trabalhista',
    tipo: 'Embargos à Execução Trabalhista',
    descricao: 'Para o executado se defender na execução trabalhista, com garantia do juízo.',
    baseLegal: ['CLT 884'],
    secoes: [
      SECAO_ENDERECAMENTO_TRABALHISTA,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO EXECUTIVO E CÁLCULO',
        instrucao: 'Impugne o título executivo e o cálculo apresentado, apontando excessos.',
      },
      {
        titulo: 'DO MÉRITO DOS EMBARGOS',
        instrucao: 'Exponha as matérias defensivas do art. 884 da CLT e da Lei 6.830/1980 aplicáveis.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 5 dias para embargos (art. 884, CLT).'],
  },
  {
    id: 'mandado-de-seguranca-trabalhista',
    area: 'Trabalhista',
    tipo: 'Mandado de Segurança Trabalhista',
    descricao: 'Para proteger direito líquido e certo contra ato coator de autoridade na seara trabalhista.',
    baseLegal: ['Lei 12.016/2009'],
    secoes: [
      SECAO_ENDERECAMENTO_TRABALHISTA,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o ato coator praticado pela autoridade, com data e forma de ciência.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o direito líquido e certo violado, com fundamentação legal e jurisprudencial.',
      },
      {
        titulo: 'DA LIMINAR',
        instrucao: 'Requeira e fundamente a liminar, com os requisitos do art. 7º da Lei 12.016/2009.',
      },
      SECAO_PEDIDOS,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prazo de 120 dias da ciência do ato coator (art. 23, Lei 12.016/2009).',
      'Exige direito líquido e certo.',
    ],
  },
  {
    id: 'acao-de-consignacao-de-verbas',
    area: 'Trabalhista',
    tipo: 'Ação de Consignação de Verbas',
    descricao: 'Para o empregador depositar em juízo verbas rescisórias recusadas ou incertas pelo empregado.',
    baseLegal: ['CLT 890-892'],
    secoes: [...S_TRABALHISTA],
    observacoes: ['Depósito prévio das verbas (art. 891, CLT).'],
  },
  {
    id: 'acao-rescisoria',
    area: 'Trabalhista',
    tipo: 'Ação Rescisória',
    descricao: 'Para desconstituir sentença ou acórdão transitado em julgado nas hipóteses do art. 966, CPC.',
    baseLegal: ['CPC 966-975'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a ação originária, a sentença rescindenda e o trânsito em julgado.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Enquadre o caso em uma das hipóteses do art. 966 do CPC e demonstre o preenchimento dos requisitos.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prazo decadencial de 2 anos do trânsito em julgado (art. 975, CPC).',
      'Depósito prévio de 5% do valor da causa (art. 968, II, CPC).',
    ],
  },

  // ============================ TRIBUTÁRIO ============================
  {
    id: 'mandado-de-seguranca-tributario',
    area: 'Tributário',
    tipo: 'Mandado de Segurança Tributário',
    descricao: 'Para impugnar ato coator de autoridade fiscal que viole direito líquido e certo do contribuinte.',
    baseLegal: ['Lei 12.016/2009'],
    secoes: [...S_TRIBUTARIO],
    observacoes: [
      'Prazo de 120 dias da ciência do ato coator (art. 23, Lei 12.016/2009).',
      'Não cabe para impugnar tributo cuja constitucionalidade dependa de dilação probatória.',
    ],
  },
  {
    id: 'acao-anulatoria',
    area: 'Tributário',
    tipo: 'Ação Anulatória',
    descricao: 'Para anular lançamento fiscal ilegal ou vício no procedimento administrativo.',
    baseLegal: ['CTN 169'],
    secoes: [...S_TRIBUTARIO],
    observacoes: ['Prazo decadencial de 5 anos (art. 169, CTN).'],
  },
  {
    id: 'acao-de-repeticao-de-indebito',
    area: 'Tributário',
    tipo: 'Ação de Repetição de Indébito',
    descricao: 'Para restituir tributo pago indevidamente ou a maior pelo contribuinte.',
    baseLegal: ['CTN 165-168'],
    secoes: [...S_TRIBUTARIO],
    observacoes: [
      'Prazo prescricional de 5 anos (art. 168, CTN).',
      'Verificar modulação dos Temas 881 e 885 do STF sobre repetibilidade.',
    ],
  },
  {
    id: 'embargos-a-execucao-fiscal',
    area: 'Tributário',
    tipo: 'Embargos à Execução Fiscal',
    descricao: 'Para o contribuinte se defender na execução fiscal, após a garantia da execução.',
    baseLegal: ['Lei 6.830/1980, art. 16'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO EXECUTIVO E CÁLCULO',
        instrucao: 'Impugne a Certidão de Dívida Ativa e o cálculo apresentado, apontando excessos e vícios.',
      },
      {
        titulo: 'DO MÉRITO DOS EMBARGOS',
        instrucao: 'Exponha as matérias defensivas do art. 16 da Lei 6.830/1980, como nulidade da CDA, prescrição e excesso de execução.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prazo de 30 dias da garantia da execução (art. 16, Lei 6.830/1980).',
      'Competência do juízo da execução fiscal.',
    ],
  },
  {
    id: 'acao-declaratoria-tributaria',
    area: 'Tributário',
    tipo: 'Ação Declaratória',
    descricao: 'Para declarar a inexistência de relação jurídico-tributária ou a não incidência do tributo.',
    baseLegal: ['CTN 169', 'CPC 19'],
    secoes: [...S_TRIBUTARIO],
  },
  {
    id: 'excecao-de-pre-executividade-tributaria',
    area: 'Tributário',
    tipo: 'Exceção de Pré-Executividade',
    descricao: 'Para impugnar a execução fiscal sem garantia do juízo, com matéria de ordem pública.',
    baseLegal: ['Construção jurisprudencial do STJ'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO E DA EXECUÇÃO',
        instrucao: 'Identifique a Certidão de Dívida Ativa e os atos de constrição praticados na execução fiscal.',
      },
      {
        titulo: 'DO MÉRITO DA EXCEÇÃO',
        instrucao: 'Apresente as matérias de ordem pública, como nulidade da CDA, prescrição e excesso de execução, com prova documental.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Sem prazo; admite matérias de ordem pública e prova documental pré-constituída (STJ).'],
  },
  {
    id: 'agravo-de-instrumento-tributario',
    area: 'Tributário',
    tipo: 'Agravo de Instrumento Tributário',
    descricao: 'Para impugnar decisões interlocutórias em matéria tributária perante o tribunal.',
    baseLegal: ['CPC 1015'],
    secoes: [...S_RECURSO],
    observacoes: ['Prazo de 15 dias úteis (art. 1015, CPC); verificar hipóteses de cabimento taxativas.'],
  },
  {
    id: 'acao-de-compensacao',
    area: 'Tributário',
    tipo: 'Ação de Compensação',
    descricao: 'Para compensar tributos com créditos líquidos e certos contra a Fazenda Pública.',
    baseLegal: ['CTN 170'],
    secoes: [...S_TRIBUTARIO],
    observacoes: ['Verificar regulamentação da compensação (PER/DCOMP) e o reconhecimento do direito creditório.'],
  },

  // ============================ PENAL ============================
  {
    id: 'queixa-crime',
    area: 'Penal',
    tipo: 'Queixa-Crime',
    descricao: 'Para o ofendido ou seu representante dar início à ação penal privada.',
    baseLegal: ['CPP 41'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o querelante e o querelado, com os requisitos do art. 41 do CPP.',
      },
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a tipicidade da conduta e o justo motivo para a ação penal privada.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prazo decadencial de 6 meses da ciência do autor (art. 38, CPP).',
      'Verificar necessidade de representação ou requisição do Ministério Público.',
    ],
  },
  {
    id: 'resposta-a-acusacao',
    area: 'Penal',
    tipo: 'Resposta à Acusação',
    descricao: 'Para o acusado apresentar defesa preliminar contra a acusação formalizada.',
    baseLegal: ['CPP 396-A'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o acusado, com os dados da ação penal.',
      },
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Apresente as preliminares e as teses de absolvição sumária (art. 397, CPP) ou de mérito.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 10 dias (art. 396, CPP); oportunidade para arguir preliminares e requerer absolvição sumária.'],
  },
  {
    id: 'memoriais-alegacoes-finais',
    area: 'Penal',
    tipo: 'Memoriais / Alegações Finais',
    descricao: 'Para apresentar as alegações finais por memoriais após a instrução processual.',
    baseLegal: ['CPP 403 §3º'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Identifique o acusado e o processo em que se alega.',
      },
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Retome as provas produzidas em audiência e fundamente a absolvição, desclassificação ou aplicação de minorante.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 5 dias, sucessivos, para alegações finais por memoriais (art. 403, §3º, CPP).'],
  },
  {
    id: 'habeas-corpus',
    area: 'Penal',
    tipo: 'Habeas Corpus',
    descricao: 'Para cessar coação ilegal à liberdade de locomoção do paciente.',
    baseLegal: ['CF 5º LXVIII', 'CPP 647'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o impetrante, o paciente e a autoridade coatora, com o número do processo de origem.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o ato de constrangimento ilegal sofrido pelo paciente.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a ilegalidade do ato, com fundamento constitucional e no CPP.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Isento de custas; possibilidade de liminar.'],
  },
  {
    id: 'apelacao-criminal',
    area: 'Penal',
    tipo: 'Apelação Criminal',
    descricao: 'Para impugnar sentenças penais condenatórias ou absolutórias impróprias perante o tribunal.',
    baseLegal: ['CPP 593'],
    secoes: [...S_RECURSO],
    observacoes: ['Prazo de 5 dias (art. 593, CPP); preparo dispensado ao réu pobre.'],
  },
  {
    id: 'recurso-em-sentido-estrito',
    area: 'Penal',
    tipo: 'Recurso em Sentido Estrito',
    descricao: 'Para impugnar as decisões interlocutórias do rol do art. 581, CPP, perante o tribunal.',
    baseLegal: ['CPP 581'],
    secoes: [...S_RECURSO],
    observacoes: ['Prazo de 5 dias (art. 586, CPP); possibilidade de retratação (art. 589, CPP).'],
  },
  {
    id: 'embargos-de-declaracao-penal',
    area: 'Penal',
    tipo: 'Embargos de Declaração Penal',
    descricao: 'Para sanar omissão, contradição, ambiguidade ou obscuridade de decisão penal.',
    baseLegal: ['CPP 619-620'],
    secoes: [...S_EMBARGOS_DECLARACAO],
    observacoes: ['Prazo de 2 dias (art. 619, CPP); sem preparo; interrompe o prazo do recurso principal.'],
  },
  {
    id: 'revisao-criminal',
    area: 'Penal',
    tipo: 'Revisão Criminal',
    descricao: 'Para revisar condenação penal transitada em julgado nas hipóteses do art. 621, CPP.',
    baseLegal: ['CPP 621'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o requerente e identifique a condenação transitada em julgado.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o processo originário, a condenação e o trânsito em julgado.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Enquadre o caso nas hipóteses do art. 621 do CPP e demonstre os fundamentos da revisão.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Pressupostos: condenação transitada em julgado e uma das hipóteses do art. 621, CPP.'],
  },
  {
    id: 'pedido-de-liberdade-provisoria',
    area: 'Penal',
    tipo: 'Pedido de Liberdade Provisória',
    descricao: 'Para obter a soltura do acusado preso, com ou sem fiança, nas hipóteses legais.',
    baseLegal: ['CPP 310'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o requerente preso e os dados da prisão preventiva.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a prisão em flagrante ou preventiva e as circunstâncias do caso.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a ausência dos requisitos do art. 312, CPP, ou a presença de fundamento para medidas cautelares alternativas (art. 319, CPP).',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Verificar requisitos do art. 312 e vedações do art. 313, CPP.'],
  },
  {
    id: 'relaxamento-de-prisao',
    area: 'Penal',
    tipo: 'Relaxamento de Prisão',
    descricao: 'Para relaxar prisão ilegal, notadamente o flagrante eivado de vícios.',
    baseLegal: ['CF 5º LXV', 'CPP 647'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o preso e identifique o auto de prisão em flagrante.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva as circunstâncias da prisão em flagrante.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a ilegalidade do flagrante (art. 310, I, CPP) e a necessidade de relaxamento.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Hipóteses de ilegalidade do flagrante (art. 310, I, CPP).'],
  },

  // ============================ PREVIDENCIÁRIO ============================
  {
    id: 'acao-de-concessao-de-beneficio',
    area: 'Previdenciário',
    tipo: 'Ação de Concessão de Benefício',
    descricao: 'Para obter judicialmente a concessão de benefício previdenciário indeferido pelo INSS.',
    baseLegal: ['Lei 8.213/1991'],
    secoes: [...S_PREVIDENCIARIO],
    observacoes: ['Decorrer do indeferimento administrativo ou do requerimento sem resposta.'],
  },
  {
    id: 'revisao-de-beneficio',
    area: 'Previdenciário',
    tipo: 'Revisão de Benefício',
    descricao: 'Para revisar benefício previdenciário concedido com erro de cálculo, renda ou tempo.',
    baseLegal: ['Lei 8.213/1991'],
    secoes: [...S_PREVIDENCIARIO],
    observacoes: ['Prazo decadencial de 10 anos para revisão (art. 103, Lei 8.213/1991).'],
  },
  {
    id: 'recurso-ao-crps',
    area: 'Previdenciário',
    tipo: 'Recurso ao CRPS',
    descricao: 'Para recorrer administrativamente de decisão do INSS perante o Conselho de Recursos da Previdência Social.',
    baseLegal: ['IN 128/2022'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Identifique o recorrente, o benefício e o processo administrativo.',
      },
      {
        titulo: 'CABIMENTO E TEMPESTIVIDADE',
        instrucao: 'Demonstre o cabimento do recurso e sua tempestividade (art. 305 da IN 128/2022).',
      },
      {
        titulo: 'SÍNTESE DA DECISÃO RECORRIDA',
        instrucao: 'Sintetize a decisão do INSS recorrida e o fundamento do indeferimento.',
      },
      {
        titulo: 'DAS RAZÕES RECURSAIS',
        instrucao: 'Exponha as razões para a reforma da decisão, com documentos e fundamentação.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o conhecimento e o provimento do recurso para concessão ou revisão do benefício.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 30 dias da ciência da decisão (art. 305, IN 128/2022).'],
  },
  {
    id: 'acao-de-auxilio-por-incapacidade',
    area: 'Previdenciário',
    tipo: 'Ação de Auxílio por Incapacidade',
    descricao: 'Para obter auxílio por incapacidade temporária ou aposentadoria por incapacidade permanente.',
    baseLegal: ['Lei 8.213/1991, art. 59'],
    secoes: [...S_PREVIDENCIARIO],
    observacoes: ['Requisição de perícia médica judicial.'],
  },
  {
    id: 'aposentadoria-por-idade-tempo-de-contribuicao',
    area: 'Previdenciário',
    tipo: 'Aposentadoria por Idade/Tempo de Contribuição',
    descricao: 'Para obter aposentadoria por idade ou por tempo de contribuição, com as regras vigentes.',
    baseLegal: ['Lei 8.213/1991, arts. 48-56'],
    secoes: [...S_PREVIDENCIARIO],
    observacoes: ['Comprovar carência e tempo de contribuição; verificar regras de transição pós-reforma.'],
  },
  {
    id: 'pensao-por-morte',
    area: 'Previdenciário',
    tipo: 'Pensão por Morte',
    descricao: 'Para obter pensão por morte em favor dos dependentes do segurado falecido.',
    baseLegal: ['Lei 8.213/1991, art. 74'],
    secoes: [...S_PREVIDENCIARIO],
    observacoes: ['Comprovar a dependência e a qualidade de segurado do instituidor.'],
  },
  {
    id: 'bpc-loas',
    area: 'Previdenciário',
    tipo: 'Benefício de Prestação Continuada BPC/LOAS',
    descricao: 'Para obter o benefício assistencial de um salário mínimo para idoso ou pessoa com deficiência.',
    baseLegal: ['Lei 8.742/1993, art. 20'],
    secoes: [...S_PREVIDENCIARIO],
    observacoes: ['Comprovar incapacidade/idade e renda familiar per capita de até 1/4 do salário mínimo.'],
  },
  {
    id: 'recurso-ordinario-a-tnu',
    area: 'Previdenciário',
    tipo: 'Recurso Ordinário à TNU',
    descricao: 'Para impugnar acórdão de Turma Recursal em matéria previdenciária perante a TNU.',
    baseLegal: ['Lei 10.259/2001, art. 14'],
    secoes: [...S_RECURSO],
    observacoes: [
      'Prazo de 15 dias; exige divergência entre Turmas Recursais ou violação à Súmula da TNU.',
    ],
  },

  // ============================ CONSUMERISTA ============================
  {
    id: 'peticao-inicial-cdc',
    area: 'Consumerista',
    tipo: 'Petição Inicial CDC',
    descricao: 'Para dar início a ação consumerista coletiva ou individual fundada no Código de Defesa do Consumidor.',
    baseLegal: ['CDC 81-83'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Possibilidade de inversão do ônus da prova (art. 6º, VIII, CDC).'],
  },
  {
    id: 'acao-de-danos-morais',
    area: 'Consumerista',
    tipo: 'Ação de Danos Morais',
    descricao: 'Para indenização por dano moral decorrente de relação de consumo ou responsabilidade civil.',
    baseLegal: ['CDC 14', 'CC 927'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Quantificação com parâmetros de razoabilidade e precedentes.'],
  },
  {
    id: 'acao-de-obrigacao-de-fazer-consumidor',
    area: 'Consumerista',
    tipo: 'Ação de Obrigação de Fazer',
    descricao: 'Para compelir o fornecedor a cumprir obrigação de fazer assumida na relação de consumo.',
    baseLegal: ['CDC 35', 'CPC 497'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Tutela específica e multa diária (astrante) (art. 497, CPC).'],
  },
  {
    id: 'acao-revisional-de-contrato',
    area: 'Consumerista',
    tipo: 'Ação Revisional de Contrato',
    descricao: 'Para revisar cláusulas contratuais abusivas em relação de consumo.',
    baseLegal: ['CDC 6º V'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Possibilidade de liminar para depósito em juízo e suspensão de negativação.'],
  },
  {
    id: 'acao-de-restituicao-de-valores-em-dobro',
    area: 'Consumerista',
    tipo: 'Ação de Restituição de Valores em Dobro',
    descricao: 'Para restituir em dobro valores cobrados indevidamente do consumidor, quando houver má-fé.',
    baseLegal: ['CDC 42, parágrafo único'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Exige cobrança indevida e má-fé do fornecedor.'],
  },
  {
    id: 'acao-declaratoria-de-inexigibilidade-de-debito',
    area: 'Consumerista',
    tipo: 'Ação Declaratória de Inexigibilidade de Débito',
    descricao: 'Para declarar inexistente ou inexigível débito cobrado indevidamente do consumidor.',
    baseLegal: ['CDC 90', 'CPC 19'],
    secoes: [...S_PETICAO_INICIAL],
  },
  {
    id: 'acao-por-vicio-do-produto-servico',
    area: 'Consumerista',
    tipo: 'Ação por Vício do Produto/Serviço',
    descricao: 'Para obter reparação ou substituição de produto/serviço viciado, com os remédios do CDC.',
    baseLegal: ['CDC 12-20'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Prazo de reclamar (art. 26, CDC) e prazo de 90 dias para saneamento.'],
  },
  {
    id: 'acao-por-negativacao-indevida',
    area: 'Consumerista',
    tipo: 'Ação por Negativação Indevida',
    descricao: 'Para obter a exclusão de inscrição indevida nos cadastros de inadimplentes e indenização.',
    baseLegal: ['CDC 43'],
    secoes: [...S_PETICAO_INICIAL],
    observacoes: ['Súmula 385 STJ: inscrição indevida gera dano moral in re ipsa.'],
  },

  // ============================ FAMÍLIA ============================
  {
    id: 'divorcio-consensual',
    area: 'Família',
    tipo: 'Divórcio Consensual',
    descricao: 'Para dissolver o casamento por mútuo consentimento, com acordo sobre guarda, alimentos e partilha.',
    baseLegal: ['CC 1.571-1.580', 'CPC 731-734'],
    secoes: [
      SECAO_ENDERECAMENTO_FAMILIA,
      SECAO_QUALIFICACAO,
      SECAO_FATOS,
      {
        titulo: 'DO ACORDO',
        instrucao: 'Descreva os termos do acordo quanto à guarda, regime de convivência, alimentos e partilha de bens.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o cabimento do divórcio consensual e a homologação do acordo (arts. 1.571 e 1.580, CC; arts. 731-734, CPC).',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Com filhos menores ou incapazes, o divórcio é judicial e exige manifestação do Ministério Público.',
      'Sem filhos menores ou incapazes, admite escritura pública (Lei 11.441/2007).',
    ],
  },
  {
    id: 'divorcio-litigioso',
    area: 'Família',
    tipo: 'Divórcio Litigioso',
    descricao: 'Para dissolver o casamento quando não houver consenso quanto à partilha, guarda ou alimentos.',
    baseLegal: ['CC 1.571-1.582', 'CPC 693-699'],
    secoes: [
      SECAO_ENDERECAMENTO_FAMILIA,
      SECAO_QUALIFICACAO,
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a ruptura da affectio maritalis e os fundamentos do divórcio (art. 1.580, CC), abordando guarda, alimentos e partilha.',
      },
      {
        titulo: 'DA GUARDA, ALIMENTOS E PARTILHA',
        instrucao: 'Detalhe o pedido de guarda, regime de convivência, pensão alimentícia e partilha de bens.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Audiência de mediação/conciliação (art. 695, CPC); a ausência de causa de pedir enseja emenda à inicial.'],
  },
  {
    id: 'acao-de-guarda',
    area: 'Família',
    tipo: 'Ação de Guarda',
    descricao: 'Para regular a guarda de menor, unilateral ou compartilhada, em favor de um dos genitores ou terceiro.',
    baseLegal: ['CC 1.583-1.590', 'ECA 33-35'],
    secoes: [...S_FAMILIA],
    observacoes: [
      'Guarda compartilhada é a regra (art. 1.584, §2º, CC), salvo fundamento em desfavor.',
      'Audiência de mediação e manifestação do Ministério Público quando envolver menor.',
    ],
  },
  {
    id: 'acao-de-alimentos',
    area: 'Família',
    tipo: 'Ação de Alimentos',
    descricao: 'Para fixar pensão alimentícia em favor de quem não pode prover a própria subsistência.',
    baseLegal: ['CC 1.694-1.710', 'CPC 528', 'Lei 5.478/1968'],
    secoes: [
      SECAO_ENDERECAMENTO_FAMILIA,
      SECAO_QUALIFICACAO,
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a necessidade do alimentando e a possibilidade do alimentante, aplicando o binômio necessidade-possibilidade (art. 1.694, §1º, CC).',
      },
      {
        titulo: 'DOS ALIMENTOS PROVISIONAIS',
        instrucao: 'Requeira e fundamente os alimentos provisionais desde a citação, com os requisitos legais.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Alimentos provisionais podem ser fixados na inicial (art. 4º, Lei 5.478/1968).',
      'Prestações vencem no dia 1º de cada mês; inadimplemento autoriza execução com prisão civil (art. 528, CPC).',
    ],
  },
  {
    id: 'execucao-de-alimentos',
    area: 'Família',
    tipo: 'Execução de Alimentos',
    descricao: 'Para cobrar judicialmente as três últimas prestações alimentares vencidas e vincendas.',
    baseLegal: ['CPC 528-533', 'CC 1.700'],
    secoes: [
      SECAO_ENDERECAMENTO_FAMILIA,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DO TÍTULO EXECUTIVO E DAS PRESTAÇÕES',
        instrucao: 'Apresente o título executivo (sentença, acordo ou termo) e discrimine as prestações vencidas e vincendas.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o rito da execução de alimentos e o cabimento da prisão civil ou da expropriação.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prisão civil de 1 a 3 meses para as 3 últimas prestações (art. 528, §3º e §7º, CPC).',
      'Prestações antigas seguem o rito da execução por quantia certa (art. 528, §8º, CPC).',
    ],
  },
  {
    id: 'investigacao-de-paternidade',
    area: 'Família',
    tipo: 'Investigação de Paternidade',
    descricao: 'Para declarar a paternidade socioafetiva ou biológica, com os efeitos de filiação e registro.',
    baseLegal: ['CC 1.596-1.614', 'Lei 8.560/1992'],
    secoes: [...S_FAMILIA],
    observacoes: [
      'Ação imprescritível; a recusa ao exame de DNA gera presunção relativa de paternidade (art. 2º-A, Lei 8.560/1992).',
      'Pode ser cumulada com pedido de alimentos e retificação de registro civil.',
    ],
  },
  {
    id: 'dissolucao-de-uniao-estavel',
    area: 'Família',
    tipo: 'Dissolução de União Estável',
    descricao: 'Para reconhecer e dissolver a união estável, com a partilha do patrimônio comum e demais efeitos.',
    baseLegal: ['CC 1.723-1.727', 'CPC 693-699'],
    secoes: [...S_FAMILIA],
    observacoes: [
      'Consensual e sem filhos menores: escritura pública (Lei 11.441/2007).',
      'Partilha do patrimônio adquirido onerosamente na constância (art. 1.725, CC), salvo contrato escrito em contrário.',
    ],
  },
  {
    id: 'regulamentacao-de-visitas',
    area: 'Família',
    tipo: 'Regulamentação de Visitas',
    descricao: 'Para fixar o regime de convivência entre o genitor não guardião e o menor.',
    baseLegal: ['CC 1.589', 'ECA 19'],
    secoes: [
      SECAO_ENDERECAMENTO_FAMILIA,
      SECAO_QUALIFICACAO,
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o direito de convivência familiar e a necessidade de regime fixo de visitas, no melhor interesse do menor.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['O descumprimento reiterado do regime pode gerar advertência, revisão da guarda ou ajuizamento de ação autônoma.'],
  },

  // ============================ SUCESSÕES ============================
  {
    id: 'inventario-judicial',
    area: 'Sucessões',
    tipo: 'Inventário Judicial',
    descricao: 'Para inventariar os bens do falecido e promover a partilha judicial entre os herdeiros.',
    baseLegal: ['CPC 610-658', 'CC 1.784-1.797'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO DO ESPÓLIO E HERDEIROS',
        instrucao: 'Qualifique o falecido, o espólio, os herdeiros e o testamenteiro, se houver, com os documentos de óbito e última residência.',
      },
      {
        titulo: 'DO INVENTÁRIO',
        instrucao: 'Descreva o rol de bens, direitos e dívidas do espólio, com valores e matrículas.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente a abertura do inventário, a nomeação do inventariante e a forma de partilha aplicável.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a abertura do inventário, a nomeação do inventariante e as providências de citação e avaliação.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Prazo de 60 dias do óbito para a abertura (art. 611, CPC), sob pena de multa.',
      'Recolhimento do imposto causa mortis antes da partilha; desnecessário na herança negativa.',
    ],
  },
  {
    id: 'inventario-extrajudicial',
    area: 'Sucessões',
    tipo: 'Inventário Extrajudicial',
    descricao: 'Para realizar o inventário por escritura pública, quando todos os herdeiros forem capazes e concordes.',
    baseLegal: ['Lei 11.441/2007', 'CPC 610, §1º'],
    secoes: [
      {
        titulo: 'ENDEREÇAMENTO',
        instrucao: 'Enderece a peça ao tabelionato de notas competente ou, se judicializado o pedido de homologação, ao juízo de família e sucessões.',
      },
      {
        titulo: 'QUALIFICAÇÃO DO ESPÓLIO E HERDEIROS',
        instrucao: 'Qualifique o falecido, os herdeiros e os documentos do óbito, com a comprovação de capacidade e consenso.',
      },
      {
        titulo: 'DOS BENS E DA PARTILHA',
        instrucao: 'Descreva os bens, valores e a forma de partilha consensualmente ajustada.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o cabimento do inventário extrajudicial (Lei 11.441/2007) e os requisitos legais.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a lavratura da escritura pública de inventário e partilha, com as certidões exigidas.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Requisitos: herdeiros maiores e capazes, consenso e assistência de advogado; não cabe se houver testamento ou imposto pendente.'],
  },
  {
    id: 'arrolamento-sumario',
    area: 'Sucessões',
    tipo: 'Arrolamento Sumário',
    descricao: 'Para inventariar e partilhar os bens de forma simplificada, quando todos os herdeiros forem maiores e capazes.',
    baseLegal: ['CPC 658-667'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO DO ESPÓLIO E HERDEIROS',
        instrucao: 'Qualifique o falecido, os herdeiros e o patrimônio, comprovando a capacidade de todos.',
      },
      {
        titulo: 'DO ARROLAMENTO',
        instrucao: 'Descreva os bens com valores e demonstre o preenchimento das hipóteses legais de arrolamento sumário.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o rito do arrolamento (arts. 658-667, CPC) e a dispensa de avaliação ou partilha formal.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Independe de consenso; não cabe quando houver herdeiro incapaz, testamento ou litígio sobre os bens.'],
  },
  {
    id: 'sobrepartilha-peticao-de-heranca',
    area: 'Sucessões',
    tipo: 'Sobrepartilha / Petição de Herança',
    descricao: 'Para partilhar bens sonegados ou reivindicar a herança de quem a detém indevidamente.',
    baseLegal: ['CPC 669-673', 'CC 1.824'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO DAS PARTES',
        instrucao: 'Qualifique o herdeiro requerente, o espólio e o detentor dos bens sonegados ou da herança.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o inventário originário, os bens sonegados ou a posse indevida da herança.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente a sobrepartilha (arts. 669-673, CPC) ou a petição de herança (art. 1.824, CC), com os efeitos da sentença.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Petição de herança: herdeiro aparente vs. herdeiro legítimo; a sentença tem eficácia declaratória e condenatória.'],
  },
  {
    id: 'anulacao-de-testamento',
    area: 'Sucessões',
    tipo: 'Ação de Anulação de Testamento',
    descricao: 'Para anular testamento eivado de vícios de forma, incapacidade do testador ou violação da legítima.',
    baseLegal: ['CC 1.857-1.877'],
    secoes: [
      SECAO_ENDERECAMENTO,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o testamento impugnado, o óbito do testador e os vícios que o invalidam.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre os vícios de forma ou consentimento, a incapacidade do testador ou a violação da legítima (arts. 1.857-1.860, CC).',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo decadencial de 4 anos para anular (art. 1.859, CC); legitimidade dos herdeiros e legatários prejudicados.'],
  },

  // ============================ EMPRESARIAL ============================
  {
    id: 'recuperacao-judicial',
    area: 'Empresarial',
    tipo: 'Recuperação Judicial',
    descricao: 'Para a empresa em crise econômico-financeira superar a situação mediante plano aprovado em assembleia de credores.',
    baseLegal: ['Lei 11.101/2005, arts. 47-69'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      {
        titulo: 'QUALIFICAÇÃO DA EMPRESA',
        instrucao: 'Qualifique a empresa com CNPJ, sede, atividade, e apresente a documentação exigida pelo art. 48 da LRE.',
      },
      {
        titulo: 'DA SITUAÇÃO ECONÔMICO-FINANCEIRA',
        instrucao: 'Descreva a crise, os motivos e as demonstrações contábeis dos últimos exercícios.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o preenchimento dos requisitos do art. 48 da Lei 11.101/2005 e a viabilidade da recuperação.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o processamento da recuperação judicial, com a nomeação de administrador judicial e a suspensão das execuções (stay period).',
      },
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Plano em até 60 dias do deferimento do processamento (art. 53, LRE).',
      'Stay period de 180 dias de suspensão das execuções (art. 6º, §4º, LRE).',
    ],
  },
  {
    id: 'recuperacao-extrajudicial',
    area: 'Empresarial',
    tipo: 'Recuperação Extrajudicial',
    descricao: 'Para a empresa negociar diretamente com credores e homologar o plano em juízo.',
    baseLegal: ['Lei 11.101/2005, arts. 161-167'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      {
        titulo: 'QUALIFICAÇÃO DA EMPRESA E DO PLANO',
        instrucao: 'Qualifique a empresa e descreva o plano negociado com as classes de credores, com as adesões obtidas.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre os requisitos dos arts. 161-163 da LRE e a viabilidade da homologação.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a homologação do plano de recuperação extrajudicial e as providências de publicação.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Exige adesão mínima de credores (art. 163, LRE); não abrange créditos trabalhistas e tributários na forma da lei.'],
  },
  {
    id: 'pedido-de-falencia',
    area: 'Empresarial',
    tipo: 'Pedido de Falência',
    descricao: 'Para requerer a falência do devedor nas hipóteses do art. 94 da LRE.',
    baseLegal: ['Lei 11.101/2005, arts. 94-97'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      {
        titulo: 'QUALIFICAÇÃO DAS PARTES',
        instrucao: 'Qualifique o credor requerente e o devedor, com o crédito e seus documentos comprobatórios.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a impontualidade injustificada, a execução frustrada ou os atos de falência praticados.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Enquadre o caso nas hipóteses do art. 94 da LRE e demonstre a legitimidade do credor.',
      },
      SECAO_PEDIDOS,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Citação do devedor para contestar em 10 dias (art. 98, LRE); o pagamento com correção obsta a falência.'],
  },
  {
    id: 'contestacao-ao-pedido-de-falencia',
    area: 'Empresarial',
    tipo: 'Contestação ao Pedido de Falência',
    descricao: 'Para o devedor se defender do pedido de falência, impugnando o crédito ou a hipótese legal.',
    baseLegal: ['Lei 11.101/2005, art. 96'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      SECAO_QUALIFICACAO,
      {
        titulo: 'PRELIMINARES',
        instrucao: 'Argua a ilegitimidade, a falta de interesse ou vícios do pedido, conforme o art. 96 da LRE.',
      },
      {
        titulo: 'DO MÉRITO',
        instrucao: 'Impugne o crédito ou a hipótese legal invocada, demonstrando a inexistência dos pressupostos da falência.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a rejeição do pedido de falência ou a decretação de sua improcedência.',
      },
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 10 dias da citação (art. 98, LRE); o depósito do valor pode evitar a decretação.'],
  },
  {
    id: 'dissolucao-parcial-de-sociedade',
    area: 'Empresarial',
    tipo: 'Dissolução Parcial de Sociedade',
    descricao: 'Para dissolver parcialmente a sociedade, com apuração de haveres do sócio retirante.',
    baseLegal: ['CC 1.028-1.032', 'CPC 599-609'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      {
        titulo: 'QUALIFICAÇÃO DAS PARTES',
        instrucao: 'Qualifique o sócio requerente, a sociedade e os demais sócios, com o contrato social.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a causa de dissolução parcial (retirada, morte, exclusão ou exercício de direito de retirada).',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o direito à dissolução parcial e à apuração de haveres (arts. 1.028-1.032, CC; arts. 599-609, CPC).',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Apuração de haveres por perícia com base no balanço de determinação; aplicável especialmente às sociedades limitadas.'],
  },
  {
    id: 'exclusao-de-socio',
    area: 'Empresarial',
    tipo: 'Exclusão de Sócio',
    descricao: 'Para excluir sócio por justa causa ou falta grave, com a apuração e o pagamento dos haveres.',
    baseLegal: ['CC 1.030, 1.085'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      {
        titulo: 'QUALIFICAÇÃO DAS PARTES',
        instrucao: 'Qualifique a sociedade, o sócio a ser excluído e os demais sócios, com o contrato social.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a falta grave ou justa causa, com as provas da conduta do sócio.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente a exclusão (arts. 1.030 e 1.085, CC) e o procedimento de deliberação ou judicial.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Justa causa comprovada ou deliberação de 3/4 do capital (art. 1.085, CC); exclusão por vias de fato ou atos ilegais (art. 1.030, CC).'],
  },
  {
    id: 'prestacao-de-contas',
    area: 'Empresarial',
    tipo: 'Ação de Prestação de Contas',
    descricao: 'Para exigir a prestação de contas de quem administra bens ou interesses alheios.',
    baseLegal: ['CC 1.020', 'CPC 550-553'],
    secoes: [
      SECAO_ENDERECAMENTO_EMPRESARIAL,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a relação jurídica que impõe a prestação de contas e a recusa ou omissão do requerido.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Fundamente o dever de prestar contas (art. 1.020, CC; arts. 550-553, CPC) e o rito bifásico da ação.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Rito bifásico: 1ª fase reconhece o dever de prestar contas; 2ª fase julga as contas (arts. 550-552, CPC).'],
  },

  // ============================ ADMINISTRATIVO ============================
  {
    id: 'mandado-de-seguranca-administrativo',
    area: 'Administrativo',
    tipo: 'Mandado de Segurança Administrativo',
    descricao: 'Para proteger direito líquido e certo contra ato coator de autoridade administrativa.',
    baseLegal: ['Lei 12.016/2009'],
    secoes: [
      SECAO_ENDERECAMENTO_FAZENDA_PUBLICA,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o impetrante, a autoridade coatora e a pessoa jurídica interessada, com o ato impugnado.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o ato coator, a data da ciência e o direito líquido e certo violado.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o direito líquido e certo e o cabimento do mandado de segurança, com fundamentação legal.',
      },
      {
        titulo: 'DA LIMINAR',
        instrucao: 'Requeira e fundamente a liminar, com os requisitos do art. 7º, III, da Lei 12.016/2009.',
      },
      SECAO_PEDIDOS,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 120 dias da ciência do ato coator (art. 23, Lei 12.016/2009); não cabe contra ato de que caiba recurso com efeito suspensivo.'],
  },
  {
    id: 'acao-ordinaria-ato-administrativo',
    area: 'Administrativo',
    tipo: 'Ação Ordinária contra Ato Administrativo',
    descricao: 'Para anular ou declarar a nulidade de ato administrativo ilegal, com a recomposição do direito do autor.',
    baseLegal: ['Lei 9.784/1999', 'CPC 319'],
    secoes: [
      SECAO_ENDERECAMENTO_FAZENDA_PUBLICA,
      SECAO_QUALIFICACAO,
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o ato administrativo impugnado, sua publicação ou notificação e o prejuízo causado.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a ilegalidade ou nulidade do ato (arts. 53-54, Lei 9.784/1999) e os efeitos pretendidos.',
      },
      {
        titulo: 'DA TUTELA DE URGÊNCIA',
        instrucao: 'Requeira e fundamente a tutela de urgência, se cabível, contra os efeitos do ato.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Decadência administrativa de 5 anos para anulação (art. 54, Lei 9.784/1999); citar a pessoa jurídica de direito público competente.'],
  },
  {
    id: 'defesa-em-pad',
    area: 'Administrativo',
    tipo: 'Defesa em Processo Administrativo Disciplinar',
    descricao: 'Para apresentar defesa escrita em processo administrativo disciplinar.',
    baseLegal: ['Lei 8.112/1990, arts. 143-147'],
    secoes: [
      {
        titulo: 'ENDEREÇAMENTO',
        instrucao: 'Enderece a defesa à Comissão Processante ou à autoridade administrativa competente.',
      },
      {
        titulo: 'QUALIFICAÇÃO DO ACUSADO',
        instrucao: 'Identifique o servidor acusado, o PAD e a portaria de instauração.',
      },
      {
        titulo: 'DA SÍNTESE DA ACUSAÇÃO',
        instrucao: 'Sintetize os fatos imputados na portaria e os artigos supostamente violados.',
      },
      {
        titulo: 'DAS PRELIMINARES',
        instrucao: 'Argua nulidades do processo, como incompetência, cerceamento de defesa e vícios da portaria.',
      },
      {
        titulo: 'DO MÉRITO',
        instrucao: 'Refute as imputações fato a fato, com provas documentais e testemunhais.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o acolhimento das preliminares ou a absolvição do acusado, com o arquivamento do PAD.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 10 dias para defesa escrita (art. 161, Lei 8.112/1990); contraditório e ampla defesa.'],
  },
  {
    id: 'impugnacao-a-licitacao',
    area: 'Administrativo',
    tipo: 'Impugnação a Licitação',
    descricao: 'Para impugnar edital ou ato de licitação com vícios de legalidade ou cláusulas restritivas.',
    baseLegal: ['Lei 14.133/2021, arts. 164-165'],
    secoes: [
      {
        titulo: 'ENDEREÇAMENTO',
        instrucao: 'Enderece a impugnação ao pregoeiro, à comissão de contratação ou à autoridade competente.',
      },
      {
        titulo: 'DO OBJETO DA IMPUGNAÇÃO',
        instrucao: 'Identifique o edital ou o ato impugnado e as cláusulas questionadas.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a ilegalidade ou restritividade do edital, com fundamento na Lei 14.133/2021.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a alteração ou anulação do edital, com a republicação e reabertura dos prazos, se cabível.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: [
      'Impugnação ao edital até 3 dias úteis antes da abertura do certame; recursos em 3 dias úteis (Lei 14.133/2021, arts. 164-165).',
      'Qualquer pessoa pode impugnar; licitantes têm prazo recursal próprio após a habilitação.',
    ],
  },
  {
    id: 'acao-de-improbidade',
    area: 'Administrativo',
    tipo: 'Ação de Improbidade Administrativa',
    descricao: 'Para responsabilizar agente público por atos de improbidade enriquecimento ilícito, dano ao erário ou violação de princípios.',
    baseLegal: ['Lei 8.429/1992, arts. 9º-12'],
    secoes: [
      SECAO_ENDERECAMENTO_FAZENDA_PUBLICA,
      {
        titulo: 'QUALIFICAÇÃO DAS PARTES',
        instrucao: 'Qualifique o autor legitimado (Ministério Público ou pessoa jurídica lesada) e os réus, com a função pública exercida.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva os atos de improbidade com datas, valores e o enquadramento nos arts. 9º, 10 ou 11 da Lei 8.429/1992.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o dolo, o enquadramento legal e as sanções aplicáveis (art. 12, Lei 8.429/1992).',
      },
      {
        titulo: 'DAS MEDIDAS CAUTELARES',
        instrucao: 'Requeira e fundamente as medidas cautelares, como indisponibilidade de bens e afastamento, se cabíveis.',
      },
      SECAO_PEDIDOS,
      SECAO_VALOR_CAUSA,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Legitimidade do Ministério Público e das pessoas jurídicas lesadas (art. 17, Lei 8.429/1992); medidas cautelares do §10.'],
  },
  {
    id: 'defesa-em-improbidade',
    area: 'Administrativo',
    tipo: 'Defesa em Improbidade Administrativa',
    descricao: 'Para o réu apresentar manifestação preliminar ou defesa em ação de improbidade administrativa.',
    baseLegal: ['Lei 8.429/1992, art. 17'],
    secoes: [
      SECAO_ENDERECAMENTO_FAZENDA_PUBLICA,
      {
        titulo: 'QUALIFICAÇÃO DO RÉU',
        instrucao: 'Qualifique o réu, indicando a ação de improbidade e a petição inicial impugnada.',
      },
      {
        titulo: 'PRELIMINARES',
        instrucao: 'Argua a decadência, a ilegitimidade passiva, a ausência de dolo ou vícios da petição inicial.',
      },
      {
        titulo: 'DO MÉRITO',
        instrucao: 'Refute os fatos e o enquadramento legal, demonstrando a ausência de ato ímprobo ou de dolo.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o acolhimento das preliminares ou a improcedência dos pedidos, com a rejeição da ação.',
      },
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Notificação preliminar para manifestação por escrito (art. 17, §7º, Lei 8.429/1992); decadência de 8 anos (art. 23).'],
  },
  {
    id: 'recurso-administrativo',
    area: 'Administrativo',
    tipo: 'Recurso Administrativo',
    descricao: 'Para recorrer de decisão administrativa desfavorável perante a autoridade competente.',
    baseLegal: ['Lei 9.784/1999, arts. 56-65'],
    secoes: [
      {
        titulo: 'ENDEREÇAMENTO',
        instrucao: 'Enderece o recurso à autoridade que proferiu a decisão ou à autoridade hierarquicamente superior.',
      },
      {
        titulo: 'DO RECORRENTE E DA DECISÃO RECORRIDA',
        instrucao: 'Identifique o recorrente, o processo administrativo e a decisão recorrida.',
      },
      {
        titulo: 'DAS RAZÕES RECURSAIS',
        instrucao: 'Exponha os fundamentos de fato e de direito para a reforma ou anulação da decisão.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o conhecimento e o provimento do recurso, com a reforma ou anulação da decisão.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 10 dias da ciência da decisão (art. 59, Lei 9.784/1999); efeito suspensivo quando o dano for de difícil reparação (art. 61).'],
  },

  // ============================ CONSTITUCIONAL ============================
  {
    id: 'mandado-de-injuncao',
    area: 'Constitucional',
    tipo: 'Mandado de Injunção',
    descricao: 'Para suprir a falta de norma regulamentadora que inviabiliza o exercício de direito constitucional.',
    baseLegal: ['CF 5º, LXXI', 'Lei 13.300/2016'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o impetrante, a autoridade impetrada e o órgão responsável pela omissão normativa.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a norma constitucional dependente de regulamentação e a omissão do Poder competente.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o direito constitucional inviabilizado e a omissão, com os precedentes do STF sobre o tema.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a ciência da omissão e a efetivação do direito, nos termos da Lei 13.300/2016.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Cabe quando a falta de norma regulamentadora inviabiliza o exercício do direito (CF 5º, LXXI); a decisão pode ser integrativa ou concretizadora.'],
  },
  {
    id: 'habeas-data',
    area: 'Constitucional',
    tipo: 'Habeas Data',
    descricao: 'Para assegurar o acesso, retificação ou complementação de informações pessoais em bancos de dados públicos.',
    baseLegal: ['CF 5º, LXXII', 'Lei 9.507/1997'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o impetrante e a entidade detentora do banco de dados, com o requerimento administrativo prévio.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o requerimento administrativo, a negativa ou a ausência de resposta da entidade.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o direito de acesso ou retificação das informações (CF 5º, LXXII; Lei 9.507/1997).',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira a exibição dos registros, a retificação ou a anotação nos assentamentos.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Esgotamento administrativo prévio: requerimento negado ou sem resposta no prazo (art. 8º, parágrafo único, Lei 9.507/1997).'],
  },
  {
    id: 'mandado-de-seguranca-coletivo',
    area: 'Constitucional',
    tipo: 'Mandado de Segurança Coletivo',
    descricao: 'Para proteger direito coletivo ou individual homogêneo contra ato coator, impetrado por entidade legitimada.',
    baseLegal: ['CF 5º, LXIX-LXX', 'Lei 12.016/2009, art. 21'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o impetrante (entidade legitimada), os substituídos e a autoridade coatora.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o ato coator e a violação de direito coletivo, líquido e certo, dos membros ou associados.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a legitimidade ativa e o direito líquido e certo violado, com fundamento na Lei 12.016/2009.',
      },
      {
        titulo: 'DA LIMINAR',
        instrucao: 'Requeira e fundamente a liminar, se cabível, com os requisitos legais.',
      },
      SECAO_PEDIDOS,
      SECAO_PROVAS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Legitimados: partido político com representação no Congresso, entidade de classe ou associação constituída há mais de 1 ano (art. 21, Lei 12.016/2009).'],
  },
  {
    id: 'adpf',
    area: 'Constitucional',
    tipo: 'Arguição de Descumprimento de Preceito Fundamental (ADPF)',
    descricao: 'Para evitar ou reparar lesão a preceito fundamental decorrente de ato do Poder Público.',
    baseLegal: ['CF 102, §1º', 'Lei 9.882/1999'],
    secoes: [
      {
        titulo: 'ENDEREÇAMENTO',
        instrucao: 'Enderece a petição ao Supremo Tribunal Federal.',
      },
      {
        titulo: 'DOS LEGITIMADOS',
        instrucao: 'Identifique o requerente entre os legitimados do art. 103 da CF e o ato impugnado.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva o ato do Poder Público que viola preceito fundamental, com sua repercussão.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a lesão a preceito fundamental e a subsidiariedade do instrumento (art. 4º, §1º, Lei 9.882/1999).',
      },
      {
        titulo: 'DA LIMINAR',
        instrucao: 'Requeira e fundamente a medida liminar, com os requisitos do art. 5º, §3º, da Lei 9.882/1999.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Legitimados do art. 103, CF; caráter subsidiário (inexistência de outro meio eficaz); possibilidade de liminar.'],
  },

  // ============================ PENAL — ampliação ============================
  {
    id: 'transacao-penal',
    area: 'Penal',
    tipo: 'Transação Penal',
    descricao: 'Para aceitar ou requerer a aplicação imediata de pena restritiva de direitos ou multa em infrações de menor potencial ofensivo.',
    baseLegal: ['Lei 9.099/1995, art. 76', 'CPP 61'],
    secoes: [...S_PENAL],
    observacoes: [
      'Cabível para infrações de menor potencial ofensivo, desde que preenchidos os requisitos do art. 76, Lei 9.099/1995.',
      'A proposta é formulada pelo Ministério Público antes do recebimento da denúncia; a aceitação não importa reincidência.',
    ],
  },
  {
    id: 'suspensao-condicional-do-processo',
    area: 'Penal',
    tipo: 'Suspensão Condicional do Processo',
    descricao: 'Para requerer a suspensão condicional do processo, com as condições do art. 89 da Lei 9.099/1995.',
    baseLegal: ['Lei 9.099/1995, art. 89'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o acusado e identifique a ação penal e os fatos imputados.',
      },
      SECAO_FATOS,
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre o preenchimento dos requisitos do art. 89 da Lei 9.099/1995 (pena mínima igual ou inferior a 1 ano e demais condições).',
      },
      {
        titulo: 'DAS CONDIÇÕES',
        instrucao: 'Proponha as condições a serem cumpridas durante o período de prova, conforme o art. 89, §1º.',
      },
      SECAO_PEDIDOS,
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Período de prova de 2 a 4 anos (art. 89, §1º); a suspensão não se aplica na continuidade delitiva ou violência doméstica, nas hipóteses legais.'],
  },
  {
    id: 'representacao-criminal',
    area: 'Penal',
    tipo: 'Representação Criminal',
    descricao: 'Para manifestar a vontade da vítima ou ofendido de que o autor de infração de ação penal pública condicionada seja processado.',
    baseLegal: ['CPP 39', 'CP 100-106'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o ofendido/representante e o autor do fato, com o relato da infração.',
      },
      {
        titulo: 'DOS FATOS',
        instrucao: 'Descreva a infração penal e as circunstâncias que ensejam a representação.',
      },
      {
        titulo: 'DO DIREITO',
        instrucao: 'Demonstre a condicionante de procedibilidade e a manifestação de vontade de processar (art. 39, CPP).',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o recebimento da representação e o encaminhamento ao Ministério Público.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo decadencial de 6 meses da ciência do autor (art. 38, CPP); a retratação só é admitida antes do recebimento da denúncia.'],
  },
  {
    id: 'progressao-de-regime',
    area: 'Penal',
    tipo: 'Pedido de Progressão de Regime',
    descricao: 'Para requerer a transferência do apenado para regime menos gravoso, preenchidos os requisitos legais.',
    baseLegal: ['LEP 7.210/1984, arts. 112-114'],
    secoes: [...S_PENAL],
    observacoes: [
      'Requisito objetivo: fração da pena cumprida (1/6; 40% ou 50% para crimes hediondos, conforme reincidência).',
      'Requisito subjetivo: mérito comprovado pelo exame criminológico ou atestado de boa conduta carcerária.',
    ],
  },
  {
    id: 'livramento-condicional',
    area: 'Penal',
    tipo: 'Livramento Condicional',
    descricao: 'Para requerer a liberdade antecipada do condenado sob condições, preenchidos os requisitos do Código Penal.',
    baseLegal: ['CP 83-90', 'LEP 131-146'],
    secoes: [...S_PENAL],
    observacoes: [
      'Cumprimento de mais de 1/3 (ou 1/2, para reincidente em crime hediondo) da pena, conforme o art. 83, CP.',
      'Exige comportamento satisfatório e reparação do dano, salvo impossibilidade (art. 83, III-IV, CP).',
    ],
  },
  {
    id: 'contra-razoes-apelacao-criminal',
    area: 'Penal',
    tipo: 'Contra-razões de Apelação Criminal',
    descricao: 'Para responder ao recurso de apelação criminal, impugnando as razões recursais da parte contrária.',
    baseLegal: ['CPP 600'],
    secoes: [
      SECAO_ENDERECAMENTO,
      {
        titulo: 'QUALIFICAÇÃO',
        instrucao: 'Qualifique o apelado e o apelante, indicando o processo de origem.',
      },
      {
        titulo: 'DA SÍNTESE DO RECURSO',
        instrucao: 'Sintetize as razões do apelante e os pontos impugnados.',
      },
      {
        titulo: 'DAS CONTRARRAZÕES',
        instrucao: 'Refute as razões recursais, demonstrando a manutenção da decisão recorrida.',
      },
      {
        titulo: 'DOS PEDIDOS',
        instrucao: 'Requeira o não conhecimento ou o desprovimento do recurso.',
      },
      SECAO_FECHAMENTO,
    ],
    observacoes: ['Prazo de 8 dias para as contrarrazões (art. 600, CPP); após, os autos sobem ao tribunal.'],
  },
];

export function buscarModelo(tipo: string, area: string): ModeloPeca | undefined {
  return MODELOS_PECA.find(m => m.tipo === tipo && m.area === area);
}
