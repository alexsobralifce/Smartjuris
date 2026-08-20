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

// ---------------------------------------------------------------------------
// Modelo intermediário de blocos ricos (proveniente do editor TipTap)
// ---------------------------------------------------------------------------

export interface RunRico {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number; // size em pontos (pt)
}

export type AlinhamentoRico = 'left' | 'center' | 'right' | 'justify';

export interface BlocoRico {
  type: 'paragraph' | 'heading' | 'listItem';
  align?: AlinhamentoRico;
  level?: number; // heading: 1-6; listItem: aninhamento (use 0)
  ordered?: boolean; // listItem numerada (true) vs marcador (false)
  index?: number; // listItem numerada: número a exibir
  runs: RunRico[];
}

export interface PecaDocumento {
  titulo: string;
  blocos: BlocoRico[];
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
 * Extrai os runs formatados de um nó de conteúdo ProseMirror/TipTap.
 * - nós `text` → run com marcas bold/italic/underline e tamanho (textStyle).
 * - nós `hardBreak` → '\n' (anexado ao run anterior ou como run próprio).
 */
function runsDoConteudo(content: any[] | undefined): RunRico[] {
  if (!Array.isArray(content)) return [];
  const runs: RunRico[] = [];
  for (const node of content) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'text') {
      const text = typeof node.text === 'string' ? node.text : '';
      const marks: any[] = Array.isArray(node.marks) ? node.marks : [];
      const temMarca = (t: string): boolean => marks.some((m) => m?.type === t);
      const textStyle = marks.find((m) => m?.type === 'textStyle');
      let size: number | undefined;
      const fontSize: unknown = textStyle?.attrs?.fontSize;
      if (typeof fontSize === 'string') {
        const num = Number.parseInt(fontSize, 10);
        if (!Number.isNaN(num)) size = num;
      }
      runs.push({
        text,
        bold: temMarca('bold'),
        italic: temMarca('italic'),
        underline: temMarca('underline'),
        size,
      });
    } else if (node.type === 'hardBreak') {
      if (runs.length > 0) {
        runs[runs.length - 1].text += '\n';
      } else {
        runs.push({ text: '\n' });
      }
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      // Não achata sublistas aninhadas dentro de um item — ignoradas aqui.
      continue;
    } else if (Array.isArray(node.content)) {
      // Desce em blocos intermediários (ex.: `paragraph` que embrulha o texto
      // dentro de um `listItem`), coletando os runs de texto recursivamente.
      runs.push(...runsDoConteudo(node.content));
    }
  }
  return runs;
}

/**
 * Converte o JSON do editor TipTap (ProseMirror) em `BlocoRico[]`.
 * Suporta paragraph, heading (1-6), bulletList e orderedList (com `start`).
 */
export function tipTapParaBlocos(json: any): BlocoRico[] {
  if (!json || !Array.isArray(json.content)) return [];
  const blocos: BlocoRico[] = [];
  for (const node of json.content) {
    if (!node || typeof node !== 'object') continue;
    const type: string = node.type;
    const align = node.attrs?.textAlign as AlinhamentoRico | undefined;
    if (type === 'paragraph') {
      blocos.push({ type: 'paragraph', align, runs: runsDoConteudo(node.content) });
    } else if (type === 'heading') {
      blocos.push({
        type: 'heading',
        level: node.attrs?.level ?? 1,
        align,
        runs: runsDoConteudo(node.content),
      });
    } else if (type === 'bulletList' || type === 'orderedList') {
      const ordered = type === 'orderedList';
      const start = ordered ? Number(node.attrs?.start ?? 1) : 1;
      const items: any[] = Array.isArray(node.content) ? node.content : [];
      items.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        blocos.push({
          type: 'listItem',
          ordered,
          level: 0,
          index: ordered ? start + i : undefined,
          runs: runsDoConteudo(item.content),
        });
      });
    }
  }
  return blocos;
}

/**
 * Monta o objeto `PecaDocumento` usado pelos renderizadores PDF/DOCX.
 * Recebe rows crus do Drizzle (qualquer formato) e normaliza.
 * - Se `args.conteudoRico` (JSON do TipTap) existir, gera `blocos` ricos.
 * - Senão, converte o texto puro `peca.conteudo` em blocos paragraph.
 */
export function montarPecaDocumento(args: {
  peca: any;
  escritorio: any;
  advogado: any;
  processo?: any;
  conteudoRico?: any;
}): PecaDocumento {
  const { peca, escritorio, advogado, processo } = args;
  const titulo = String(peca?.tipo || 'Petição').toUpperCase();

  let blocos: BlocoRico[];
  const conteudoRico = args.conteudoRico ?? peca?.conteudoRico;
  if (conteudoRico && typeof conteudoRico === 'object' && Array.isArray(conteudoRico.content)) {
    blocos = tipTapParaBlocos(conteudoRico);
  } else {
    const conteudo = String(peca?.conteudo ?? '');
    blocos = conteudo
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((paragrafo) => ({
        type: 'paragraph' as const,
        runs: [{ text: paragrafo }],
      }));
  }

  const doc: PecaDocumento = {
    titulo,
    blocos,
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
