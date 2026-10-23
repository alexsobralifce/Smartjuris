// Pede ao Qwen (Token Plan) uma curadoria ORIGINAL com análise própria, a partir do título e do trecho público do feed.
import { z } from 'zod';
import type { Candidato } from './selecao.js';

export const CATEGORIAS = [
  'IA na advocacia',
  'Gestão do escritório',
  'Prazos e processos',
  'Jurimetria',
  'Contratos',
  'LGPD e ética',
] as const;

export const ArtigoGerado = z.object({
  relevante: z.boolean(),
  utilidade: z.number().int(),
  motivo: z.string(),
  titulo: z.string(),
  descricao: z.string(),
  alt_imagem: z.string(),
  prompt_imagem: z.string(),
  categoria: z.enum(CATEGORIAS),
  resumo: z.string(),
  secoes: z.array(
    z.object({ titulo: z.string(), paragrafos: z.array(z.string()), lista: z.array(z.string()).optional().default([]) }),
  ),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).optional().default([]),
});
export type ArtigoGeradoT = z.infer<typeof ArtigoGerado>;

export interface ClienteIA {
  /** Devolve o texto (JSON) da resposta; `usage` alimenta o custo. */
  gerar(args: { modelo?: string; sistema: string; usuario: string }): Promise<{
    texto: string | null;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }>;
}

const FORMATO = `Responda SOMENTE com um objeto JSON (sem markdown, sem comentários) neste formato:
{
  "relevante": boolean,
  "utilidade": inteiro de 1 a 5,
  "motivo": string,
  "titulo": string,
  "descricao": string,
  "alt_imagem": string,
  "prompt_imagem": string,
  "categoria": uma de ${CATEGORIAS.map((c) => `"${c}"`).join(', ')},
  "resumo": string,
  "secoes": [{ "titulo": string, "paragrafos": [string], "lista": [string] }],
  "faq": [{ "q": string, "a": string }]
}`;

export const SISTEMA = `Você escreve para o blog do SmartJuris, plataforma de gestão jurídica com IA para advogados e escritórios, em português do Brasil.
Sua tarefa é uma CURADORIA COM ANÁLISE: apresentar ao leitor uma notícia publicada por outro veículo, com texto 100% seu, mostrando o que ela muda na rotina de quem advoga, e levar o leitor à matéria original.

Regras obrigatórias:
- Use SOMENTE as informações do título e do trecho fornecidos. Não invente dados, números, julgados, leis, artigos, nomes ou conclusões que não estejam no trecho. Se o trecho não permitir dizer algo útil, marque relevante=false e explique em "motivo".
- "utilidade": nota inteira de 1 a 5 para o quanto o texto ajuda de forma PRÁTICA advogados e gestores de escritório, considerando só o que o trecho permite afirmar. 5 = orientação concreta e aplicável; 3 = genérica; 1 = sem utilidade. Seja rigoroso.
- Marque relevante=false se o tema não interessar à rotina profissional da advocacia (crimes, política partidária, casos de pessoas, curiosidades).
- Escreva com suas palavras. Nunca copie frases do trecho (nem traduza frase a frase). Não cite o texto original entre aspas.
- Não mencione nomes de partes que sejam pessoas físicas, nem dados de processos específicos de clientes.
- Tamanho: de 450 a 700 palavras no total, com no mínimo 4 parágrafos somando as seções (cada parágrafo com 2 a 4 frases), em 3 seções: "O que aconteceu" (atribua ao veículo: "Segundo o <veículo>..."), "Impacto para o escritório" (o que muda em prazos, rotina, contratos, honorários ou tecnologia; use "lista" para os pontos) e "Checklist prático" (3 a 5 passos curtos e prudentes, na "lista"). Quando a matéria não detalhar algo, diga "a matéria divulgada não detalha...".
- "faq": 2 ou 3 perguntas que um advogado faria sobre o tema, com resposta de 1 a 2 frases baseada apenas na matéria. Se não houver base, use [].
- Ética da advocacia (Código de Ética da OAB e Provimento 205/2021): nunca prometa resultado, nunca use "causa ganha", "garantido", "100%", "o melhor", nunca incentive captação de clientela e não dê parecer jurídico individual. Quando falar de IA, reforce que a revisão e a responsabilidade são do advogado.
- Não mencione o SmartJuris como solução. Nunca diga que o produto "resolve" ou "garante" algo. Nunca associe o SmartJuris a prompt injection, manipulação de sistemas ou ataques, e nunca diga ou dê a entender que as peças, petições ou documentos do SmartJuris (ou de qualquer escritório atendido por ele) foram feitos, escritos ou gerados por IA: o tema de IA é tratado como notícia de terceiros, sem relação com o produto.
- "descricao": entre 120 e 155 caracteres, convidando a ler. "titulo": diferente do original, claro, sem clickbait, com no máximo 60 caracteres e o assunto principal no começo.
- "alt_imagem": frase de 40 a 120 caracteres que descreve a foto de capa (ambiente de escritório de advocacia, tribunal, documentos, tecnologia), sem texto na imagem.
- "prompt_imagem": em inglês, 1 a 2 frases descrevendo uma cena fotográfica editorial coerente com o tema (ex.: "A lawyer reviewing documents on a laptop in a bright Brazilian law office"), sem texto, sem logotipos e sem rostos em close.

Otimização para buscadores e assistentes de IA, sempre aplicada:
- "resumo": resposta direta em no máximo 2 frases, dizendo o que a notícia traz de mais importante, sem introdução.
- Densidade factual: sem adjetivos vazios ("incrível", "revolucionário", "de alta qualidade"). Se a matéria não traz um fato concreto, não preencha com generalidade.

Voz e estilo:
- Fale com o leitor por "você", frases curtas, voz ativa, direto ao ponto. Sem abertura vazia nem fechamento que repete o que já foi dito.
- Em "Impacto para o escritório", traga uma situação concreta da rotina (o advogado conferindo prazos, o sócio revisando honorários), sem inventar dados.
- Nunca use estes clichês: "no mundo atual", "nos dias de hoje", "é fundamental", "é essencial", "é crucial", "vale ressaltar", "vale destacar", "nesse sentido", "em suma", "em resumo", "não é segredo que", "cada vez mais", "jornada", "potencializar", "alavancar", "desbloquear", "mergulhar", "um verdadeiro", "fique atento".

${FORMATO}`;

/** Variações de tom sorteadas por artigo, para os textos não ficarem repetitivos. */
export const ESTILOS = [
  'Abra com uma pergunta que o advogado se faria ao ler a notícia e responda logo em seguida.',
  'Abra com uma cena curta da rotina do escritório (o prazo na agenda, o sócio revisando uma minuta) e conecte com a notícia.',
  'Abra direto pelo fato principal da notícia, em tom de conversa entre colegas de profissão.',
  'Abra pela dúvida mais comum que a notícia ajuda a resolver e feche o checklist com um primeiro passo simples.',
  'Tom de sócio experiente explicando à equipe: próximo, objetivo, sem sermão.',
] as const;

export function sortearEstilo(): string {
  return ESTILOS[Math.floor(Math.random() * ESTILOS.length)];
}

export const AuditoriaEeat = z.object({
  aprovado: z.boolean(),
  experiencia: z.number().int(),
  confianca: z.number().int(),
  intencao: z.number().int(),
  correcoes: z.array(z.string()),
});
export type AuditoriaEeatT = z.infer<typeof AuditoriaEeat>;

export const SISTEMA_AUDITORIA = `Atue como Search Quality Rater sênior do Google e audite o texto abaixo pelo E-E-A-T, em tema jurídico (YMYL). O texto é uma CURADORIA que comenta uma notícia de outro veículo; ele não tem experiência própria nem dados próprios e não deve fingir que tem.
Dê notas inteiras de 1 a 5:
- "experiencia": traz orientação prática concreta para a rotina do escritório, em vez de generalidades?
- "confianca": as afirmações factuais estão atribuídas ao veículo e há prudência (sem promessa de resultado, sem parecer individual, sem dado ou lei inventados, respeitando a ética da OAB)?
- "intencao": as primeiras linhas respondem de forma direta o que o leitor quer saber?
"aprovado" é true somente se as três notas forem 4 ou mais. Em "correcoes" liste de 0 a 4 ações diretas de edição (vazio se aprovado).
Responda SOMENTE com JSON: {"aprovado": boolean, "experiencia": int, "confianca": int, "intencao": int, "correcoes": [string]}`;

/** Trechos de n palavras consecutivas do original que reaparecem no texto gerado. */
export function trechosCopiados(original: string, gerado: string, n = 7): string[] {
  const palavras = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const o = palavras(original);
  const g = ` ${palavras(gerado).join(' ')} `;
  const achados: string[] = [];
  for (let i = 0; i + n <= o.length; i++) {
    const janela = o.slice(i, i + n).join(' ');
    if (g.includes(` ${janela} `)) achados.push(janela);
  }
  return achados;
}

export function textoDoArtigo(a: ArtigoGeradoT): string {
  return [
    a.titulo, a.descricao, a.resumo,
    ...a.secoes.flatMap((s) => [s.titulo, ...s.paragrafos, ...s.lista]),
    ...a.faq.flatMap((f) => [f.q, f.a]),
  ].join('\n');
}

// Promessas e captação vedadas pelo Código de Ética da OAB / Provimento 205/2021.
const RISCOS =
  /\b(causa ganha|ganho garantido|garante|garantid[oa]s?|garantia de (?:resultado|[eê]xito|vit[oó]ria)|resultado garantido|100\s?%|milagre|milagros[oa]s?|o melhor advogado|melhor escrit[oó]rio|sem risco|capta[cç][aã]o de clientes?)\b/i;

/** Associações indevidas do SmartJuris: injeção de prompt, manipulação, ou
 *  peças/documentos apresentados como feitos por IA. Reprova o artigo. */
export function associacoesIndevidas(gerado: ArtigoGeradoT): string[] {
  const texto = textoDoArtigo(gerado);
  if (!/smartjuris/i.test(texto)) return [];
  const achados = texto.match(/[^.!?\n]*(?:injec\w*\s+de\s+prompt|prompt\s+injection|gerad\w*\s+(?:por|pela|pelo)\s+(?:ia|intelig\w*)|(?:feit|escrit|criad|redigid)\w*\s+(?:por|pela|pelo)\s+(?:ia|intelig\w*)|pe[cç]as?\s+(?:feitas?|geradas?|escritas?)\s+(?:por|pela|pelo)\s+(?:ia|intelig\w*))[^.!?\n]*/gi) ?? [];
  return achados.map((t) => t.trim()).slice(0, 2);
}

/** Trocas automáticas de clichês por equivalentes (evita reprovar texto bom). */
const TROCAS_CLICHE: Array<[RegExp, string]> = [
  [/(?<!\p{L})é fundamental\b/gu, 'é importante'],
  [/(?<!\p{L})É fundamental\b/gu, 'É importante'],
  [/(?<!\p{L})é crucial\b/gu, 'é decisivo'],
  [/(?<!\p{L})É crucial\b/gu, 'É decisivo'],
  [/(?<!\p{L})é essencial\b/gu, 'é necessário'],
  [/(?<!\p{L})É essencial\b/gu, 'É necessário'],
  [/\bvale ressaltar\b/gi, 'cabe notar'],
  [/\bvale destacar\b/gi, 'cabe notar'],
  [/\bnesse sentido\b/gi, 'nessa linha'],
  [/\bem suma\b/gi, 'em síntese'],
];

function trocarClichesEmTexto(t: string): string {
  return TROCAS_CLICHE.reduce((acc, [re, rep]) => acc.replace(re, rep), t);
}

/** Aplica as trocas em todos os textos do artigo (não mexe na categoria). */
export function limparClichesAutomaticos(gerado: ArtigoGeradoT): ArtigoGeradoT {
  const visit = (v: any, chave?: string): any => {
    if (typeof v === 'string') return chave === 'categoria' ? v : trocarClichesEmTexto(v);
    if (Array.isArray(v)) return v.map((x) => visit(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x, k)]));
    return v;
  };
  return visit(gerado) as ArtigoGeradoT;
}

export function termosDeRisco(gerado: ArtigoGeradoT): string[] {
  const achados = textoDoArtigo(gerado).match(new RegExp(RISCOS.source, 'gi')) ?? [];
  return [...new Set(achados.map((t) => t.toLowerCase()))];
}

const CLICHES =
  /\bno mundo atual\b|\bnos dias de hoje\b|(?<!\p{L})[eé] (?:fundamental|essencial|crucial)\b|\bvale (?:ressaltar|destacar)\b|\bnesse sentido\b|\bem suma\b|\bem resumo\b|\bn[aã]o [eé] segredo que\b|\bcada vez mais\b|\bjornada\b|\bpotencializ\w+|\balavanc\w+|\bdesbloque\w+|\bmergulh\w+|\bum verdadeiro\b|\bfique atento\b/iu;

export function clichesEncontrados(gerado: ArtigoGeradoT): string[] {
  const achados = textoDoArtigo(gerado).match(new RegExp(CLICHES.source, 'giu')) ?? [];
  return [...new Set(achados.map((t) => t.toLowerCase()))];
}

export function validar(gerado: ArtigoGeradoT, candidato: Pick<Candidato, 'item'>): string[] {
  const erros: string[] = [];
  const riscos = termosDeRisco(gerado);
  if (riscos.length) erros.push(`termos vedados pela ética da OAB (remova): ${riscos.join(', ')}`);
  const indevidas = associacoesIndevidas(gerado);
  if (indevidas.length) erros.push(`associação indevida do SmartJuris com IA/injeção de prompt (remova): "${indevidas[0]}"`);
  const cliches = clichesEncontrados(gerado);
  if (cliches.length) erros.push(`clichês de texto automático (reescreva com outras palavras): ${cliches.join(', ')}`);
  const travessoes = (textoDoArtigo(gerado).match(/—/g) ?? []).length;
  if (travessoes > 3) erros.push(`${travessoes} travessões (use no máximo 3)`);
  const d = gerado.descricao.trim().length;
  if (d < 90 || d > 160) erros.push(`descricao com ${d} caracteres (precisa de 90 a 160)`);
  if (gerado.titulo.trim().length > 60) erros.push(`titulo com ${gerado.titulo.trim().length} caracteres (máximo 60)`);
  const alt = gerado.alt_imagem.trim().length;
  if (alt < 40 || alt > 120) erros.push(`alt_imagem com ${alt} caracteres (precisa de 40 a 120)`);
  if (gerado.prompt_imagem.trim().length < 20) erros.push('prompt_imagem muito curto');
  if (gerado.titulo.trim().toLowerCase() === candidato.item.titulo.trim().toLowerCase()) erros.push('titulo igual ao original');
  if (gerado.secoes.length < 3) erros.push('menos de 3 seções');
  const palavras = textoDoArtigo(gerado).split(/\s+/).length;
  if (palavras < 220 || palavras > 800) erros.push(`${palavras} palavras (precisa de 220 a 800 no corpo)`);
  const paragrafos = gerado.secoes.reduce((n, sec) => n + sec.paragrafos.filter((p) => p.trim().length > 0).length, 0);
  if (paragrafos < 4) erros.push(`${paragrafos} parágrafos (precisa de no mínimo 4 no corpo)`);
  // Cópia do trecho do feed (7 palavras) reprova. O título pode reaparecer no
  // corpo (é normal em notícia), então só reprova repetição longa (10 palavras).
  const copiados = trechosCopiados(candidato.item.trecho, textoDoArtigo(gerado), 10);
  const copiadosDoTitulo = trechosCopiados(candidato.item.titulo, textoDoArtigo(gerado), 10);
  const todos = [...copiados, ...copiadosDoTitulo];
  if (todos.length) erros.push(`trechos copiados do original: "${todos[0]}"`);
  return erros;
}

export type ResultadoRedacao =
  | { ok: true; gerado: ArtigoGeradoT; tokens: Array<{ prompt_tokens?: number; completion_tokens?: number }> }
  | { ok: false; motivo: string; tokens: Array<{ prompt_tokens?: number; completion_tokens?: number }> };

/** Extrai o objeto JSON mesmo quando o modelo o cerca de ```json ... ```. */
export function extrairJson(texto: string | null): unknown {
  if (!texto) throw new Error('resposta vazia');
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini < 0 || fim <= ini) throw new Error('sem JSON');
  return JSON.parse(limpo.slice(ini, fim + 1));
}

export async function redigir(
  candidato: Candidato,
  opts: { cliente: ClienteIA; modelo?: string; utilidadeMinima?: number; auditar?: boolean; estilo?: string },
): Promise<ResultadoRedacao> {
  const { cliente, modelo, utilidadeMinima = 3, auditar = true, estilo = sortearEstilo() } = opts;
  const tokens: Array<{ prompt_tokens?: number; completion_tokens?: number }> = [];
  const base = `<materia>
<veiculo>${candidato.fonte.nome}</veiculo>
<titulo_original>${candidato.item.titulo}</titulo_original>
<trecho_publico_do_feed>${candidato.item.trecho}</trecho_publico_do_feed>
</materia>
<estilo_desta_leitura>${estilo}</estilo_desta_leitura>`;
  let feedback = '';
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const resposta = await cliente.gerar({ modelo, sistema: SISTEMA, usuario: base + feedback });
    if (resposta.usage) tokens.push(resposta.usage);
    let gerado: ArtigoGeradoT;
    try {
      gerado = limparClichesAutomaticos(ArtigoGerado.parse(extrairJson(resposta.texto)));
    } catch {
      return { ok: false, motivo: 'resposta sem JSON válido', tokens };
    }
    if (!gerado.relevante) return { ok: false, motivo: `descartado pelo redator: ${gerado.motivo}`, tokens };
    if (gerado.utilidade < utilidadeMinima) {
      return { ok: false, motivo: `utilidade ${gerado.utilidade}/5 abaixo do mínimo ${utilidadeMinima}: ${gerado.motivo}`, tokens };
    }
    const erros = validar(gerado, candidato);
    if (!erros.length && auditar) {
      const auditoria = await auditarEeat(gerado, { cliente, modelo });
      if (auditoria?.uso) tokens.push(auditoria.uso);
      const notaMinima = auditoria ? Math.min(auditoria.experiencia, auditoria.confianca, auditoria.intencao) : 5;
      if (auditoria && !auditoria.aprovado && notaMinima < 3) {
        erros.push(
          `auditoria E-E-A-T (experiência ${auditoria.experiencia}, confiança ${auditoria.confianca}, intenção ${auditoria.intencao}): ${auditoria.correcoes.join(' | ') || 'melhore a objetividade e a atribuição à fonte'}`,
        );
      }
    }
    if (!erros.length) return { ok: true, gerado, tokens };
    feedback = `\n\nSua tentativa anterior foi rejeitada: ${erros.join('; ')}. Reescreva corrigindo isso.`;
    if (tentativa === 3) return { ok: false, motivo: `reprovado na validação: ${erros.join('; ')}`, tokens };
  }
  return { ok: false, motivo: 'sem resultado', tokens };
}

/** Segunda chamada à IA com o prompt de auditoria. Falha técnica não bloqueia o rascunho (o root ainda revisa). */
export async function auditarEeat(
  gerado: ArtigoGeradoT,
  { cliente, modelo }: { cliente: ClienteIA; modelo?: string },
): Promise<(AuditoriaEeatT & { uso?: { prompt_tokens?: number; completion_tokens?: number } }) | null> {
  try {
    const resposta = await cliente.gerar({ modelo, sistema: SISTEMA_AUDITORIA, usuario: `<texto>\n${textoDoArtigo(gerado)}\n</texto>` });
    return { ...AuditoriaEeat.parse(extrairJson(resposta.texto)), uso: resposta.usage };
  } catch {
    return null;
  }
}

export function slugificar(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export function montarArtigo(candidato: Candidato, gerado: ArtigoGeradoT) {
  return {
    titulo: gerado.titulo.trim(),
    descricao: gerado.descricao.trim(),
    categoria: gerado.categoria,
    resumo: gerado.resumo.trim(),
    secoes: gerado.secoes.map((s) => ({
      titulo: s.titulo.trim(),
      paragrafos: s.paragrafos,
      ...(s.lista.length ? { lista: s.lista } : {}),
    })),
    faq: gerado.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
    imagemAlt: gerado.alt_imagem.trim(),
    promptImagem: gerado.prompt_imagem.trim(),
    origem: { veiculo: candidato.fonte.nome, titulo: candidato.item.titulo, url: candidato.item.link },
    fontes: [{ titulo: `${candidato.fonte.nome}: ${candidato.item.titulo}`, url: candidato.item.link }],
  };
}
