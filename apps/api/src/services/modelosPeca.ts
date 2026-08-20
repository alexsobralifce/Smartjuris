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

export const AREAS = ['Cível', 'Trabalhista', 'Tributário', 'Penal', 'Previdenciário', 'Consumerista'];

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
// Catálogo de modelos (62)
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
];

export function buscarModelo(tipo: string, area: string): ModeloPeca | undefined {
  return MODELOS_PECA.find(m => m.tipo === tipo && m.area === area);
}
