/**
 * Montagem de dados de papel timbrado e conteúdo de peças para exportação
 * (PDF/DOCX). Isolado em um serviço próprio para que as rotas permaneçam
 * enxutas e a lógica de formatação seja testável.
 */

export interface EscritorioIdentity {
  razaoSocial?: string | null;
  cnpj?: string | null;
  inscricaoOab?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
  logoUrl?: string | null;
}

export interface PecaDocumento {
  titulo: string;
  enderecamento: string;
  corpo: string[];
  numeroProcesso?: string;
  valorCausa?: string;
  dataLocal: string;
  advogadoNome: string;
  advogadoOab: string;
  escritorio: EscritorioIdentity;
}

const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Retorna a data local no formato "<Cidade>, <dia> de <mês> de <ano>."
 * (ex.: "São Paulo, 20 de agosto de 2026."). Se a cidade for vazia,
 * omite a parte "<Cidade>, ".
 */
export function formatarDataLocal(cidade?: string | null): string {
  const agora = new Date();
  const dia = agora.getDate();
  const mes = MESES_PT_BR[agora.getMonth()] ?? '';
  const ano = agora.getFullYear();
  const data = `${dia} de ${mes} de ${ano}.`;
  const cidadeLimpa = (cidade ?? '').trim();
  if (!cidadeLimpa) return data;
  return `${cidadeLimpa}, ${data}`;
}

/**
 * Formata a inscrição da OAB no padrão "OAB/UF 123456".
 * - `oab` vazio → ''.
 * - `uf` vazio → "OAB 123456" (sem barra e sem espaço duplicado).
 */
export function formatarOab(oab?: string | null, uf?: string | null): string {
  const oabLimpo = (oab ?? '').trim();
  if (!oabLimpo) return '';
  const ufLimpo = (uf ?? '').trim();
  return ufLimpo ? `OAB/${ufLimpo} ${oabLimpo}` : `OAB ${oabLimpo}`;
}

/**
 * Mapeia o row do escritório (snake_case do SQL ou camelCase do Drizzle)
 * para a interface `EscritorioIdentity` (camelCase).
 */
function mapearEscritorio(r: any): EscritorioIdentity {
  if (!r || typeof r !== 'object') return {};
  const obter = (chaveSnake: string, chaveCamel: string): string | null | undefined =>
    r[chaveSnake] ?? r[chaveCamel];
  return {
    razaoSocial: obter('razao_social', 'razaoSocial'),
    cnpj: obter('cnpj', 'cnpj'),
    inscricaoOab: obter('inscricao_oab', 'inscricaoOab'),
    endereco: obter('endereco', 'endereco'),
    numero: obter('numero', 'numero'),
    bairro: obter('bairro', 'bairro'),
    cidade: obter('cidade', 'cidade'),
    uf: obter('uf', 'uf'),
    cep: obter('cep', 'cep'),
    telefone: obter('telefone', 'telefone'),
    email: obter('email', 'email'),
    site: obter('site', 'site'),
    logoUrl: obter('logo_url', 'logoUrl'),
  };
}

/**
 * Monta o objeto `PecaDocumento` usado pelos renderizadores PDF/DOCX.
 * Recebe rows crus do Drizzle (qualquer formato) e normaliza.
 */
export function montarPecaDocumento(args: {
  peca: any;
  escritorio: any;
  advogado: any;
  processo?: any;
}): PecaDocumento {
  const { peca, escritorio, advogado, processo } = args;
  const titulo = String(peca?.tipo || 'Petição').toUpperCase();

  const conteudo = String(peca?.conteudo ?? '');
  const paragrafos = conteudo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let enderecamento = '';
  let corpo: string[];
  if (paragrafos.length >= 2) {
    enderecamento = paragrafos[0];
    corpo = paragrafos.slice(1);
  } else if (paragrafos.length === 1) {
    corpo = [paragrafos[0]];
  } else {
    corpo = [];
  }

  const doc: PecaDocumento = {
    titulo,
    enderecamento,
    corpo,
    dataLocal: formatarDataLocal(escritorio?.cidade),
    advogadoNome: advogado?.nome || 'Advogado',
    advogadoOab:
      formatarOab(advogado?.oab, advogado?.oabUf) ||
      formatarOab(escritorio?.inscricaoOab, escritorio?.uf),
    escritorio: mapearEscritorio(escritorio),
  };

  if (processo?.valor) doc.valorCausa = String(processo.valor);

  return doc;
}
