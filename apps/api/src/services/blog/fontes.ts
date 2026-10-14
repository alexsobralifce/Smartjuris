// Fontes e palavras-chave da curadoria semanal. Para trocar uma fonte, edite este arquivo.
// Feeds validados em 2026-10-14 (HTTP 200 com itens). STF/STJ/CNJ/Migalhas não expõem RSS público estável.
export interface FonteFeed {
  id: string;
  nome: string;
  feed: string;
  peso: number;
}

export interface ConfigCuradoria {
  janelaDias: number;
  fontes: FonteFeed[];
  positivas: string[];
  negativas: string[];
  praticas: string[];
}

export const CONFIG_CURADORIA: ConfigCuradoria = {
  janelaDias: 14,
  fontes: [
    { id: 'conjur', nome: 'Consultor Jurídico', feed: 'https://www.conjur.com.br/feed/', peso: 1.2 },
    { id: 'conjur-advocacia', nome: 'Consultor Jurídico (Advocacia)', feed: 'https://www.conjur.com.br/secoes/advocacia/feed/', peso: 1.4 },
    { id: 'jota', nome: 'JOTA', feed: 'https://www.jota.info/feed', peso: 1.1 },
    { id: 'oab', nome: 'OAB Nacional', feed: 'https://www.oab.org.br/rss', peso: 1.3 },
    { id: 'tst', nome: 'Tribunal Superior do Trabalho', feed: 'https://www.tst.jus.br/rss', peso: 0.9 },
    { id: 'agencia-brasil', nome: 'Agência Brasil (Justiça)', feed: 'https://agenciabrasil.ebc.com.br/rss/justica/feed.xml', peso: 0.8 },
    { id: 'senado', nome: 'Agência Senado', feed: 'https://www12.senado.leg.br/noticias/rss', peso: 0.7 },
    { id: 'camara', nome: 'Agência Câmara', feed: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', peso: 0.7 },
  ],
  // Temas úteis a quem advoga e gere escritório (casados sem acento e em minúsculas).
  positivas: [
    'advogad', 'advocacia', 'escritorio de advocacia', 'oab', 'honorarios', 'prazo', 'prazos', 'intimacao', 'processo eletronico',
    'pje', 'peticao', 'recurso', 'cpc', 'codigo de processo civil', 'jurisprudencia', 'sumula', 'tese', 'precedente',
    'inteligencia artificial', ' ia ', 'jurimetria', 'lgpd', 'protecao de dados', 'contrato', 'contratos', 'cnj',
    'tribunal', 'stj', 'stf', 'tst', 'tramitacao', 'digital', 'tecnologia', 'honorario',
  ],
  // Descartam: política partidária, crimes e casos de pessoas.
  negativas: [
    'candidato', 'eleicao', 'partido', 'homicidio', 'feminicidio', 'estupro', 'assassinato', 'celebridade', 'cantor', 'cantora',
    'futebol', 'fofoca', 'bolsonaro', 'lula', 'trafico', 'prisao preventiva de', 'horoscopo',
  ],
  // Conteúdo prático sobe na pontuação.
  praticas: ['prazo', 'novas regras', 'nova regra', 'passa a', 'entendimento', 'como ', 'o que muda', 'resolucao', 'obrigatori', 'advogados devem'],
};
