// ===========================================================================
// Fase 5A — Busca ao vivo de jurisprudência na geração de peças.
//
// Quando `includeJurisprudence=true` (e NÃO SECTION_REVIEW), este orquestrador
// consulta a Jurisprudências.ai Live API (searchDecisions) em paralelo ao RAG
// local, mapeia a área canônica para tribunal padrão, extrai termos de busca
// dos fatos, limita a quantidade de decisões e o tamanho do bloco, e injeta um
// texto formatado com fonte rastreável. Falhas são BEST-EFFORT: sem chave ou
// API indisponível → retorna '' e registra aviso (a geração continua só com RAG).
// ===========================================================================

import { searchDecisions } from './jurisprudencias.js';

// ---------------------------------------------------------------------------
// Mapeamento área canônica → tribunal padrão
// ---------------------------------------------------------------------------

const AREA_PARA_TRIBUNAL: Record<string, string> = {
  TRABALHISTA: 'tst',
  TRABALHO: 'tst',
  CIVEL: 'stj',
  CIVIL: 'stj',
  TRIBUTARIO: 'stj',
  TRIBUTÁRIO: 'stj',
  PREVIDENCIARIO: 'stj',
  PREVIDENCIÁRIO: 'stj',
  PENAL: 'stj',
  CONSUMIDOR: 'stj',
  FAMILIA: 'stj',
  FAMÍLIA: 'stj',
  ADMINISTRATIVO: 'stj',
};

const TRIBUNAL_PADRAO = 'stj';

export function tribunalParaArea(area?: string | null): string {
  if (!area) return TRIBUNAL_PADRAO;
  const chave = area.trim().toUpperCase().replace(/[^A-ZÀ-Ú0-9]/g, '');
  return AREA_PARA_TRIBUNAL[chave] ?? TRIBUNAL_PADRAO;
}

// ---------------------------------------------------------------------------
// Extração de termos de busca a partir dos fatos
// ---------------------------------------------------------------------------

const STOPWORDS_PT = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'em', 'um', 'uma', 'que', 'para', 'por', 'com', 'sem',
  'no', 'na', 'os', 'as', 'ao', 'aos', 'das', 'dos', 'foi', 'ser', 'sendo', 'se', 'mas',
  'mais', 'muito', 'como', 'quando', 'onde', 'porque', 'entao', 'então', 'sobre', 'pelo',
  'pela', 'pelos', 'pelas', 'entre', 'até', 'ate', 'após', 'apos', 'contra', 'durante',
]);

/** Extrai até `max` termos significativos (>= 4 chars, sem stopwords). */
export function extrairTermosDeBusca(texto: string, max = 8): string[] {
  const palavras = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS_PT.has(w));
  const vistos = new Set<string>();
  const termos: string[] = [];
  for (const p of palavras) {
    if (!vistos.has(p)) {
      vistos.add(p);
      termos.push(p);
      if (termos.length >= max) break;
    }
  }
  return termos;
}

// ---------------------------------------------------------------------------
// Cache por escritório (evita chamadas pagas repetidas dentro do TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  chave: string;
  escritorioId: string;
  decisoes: unknown[];
  expiraEm: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const cache = new Map<string, CacheEntry>();

function chaveDeCache(escritorioId: string, tribunal: string, termos: string[]): string {
  return `${escritorioId}::${tribunal}::${termos.join(' ')}`;
}

function cacheGet(escritorioId: string, tribunal: string, termos: string[]): unknown[] | null {
  const chave = chaveDeCache(escritorioId, tribunal, termos);
  const entry = cache.get(chave);
  if (!entry) return null;
  if (Date.now() > entry.expiraEm) {
    cache.delete(chave);
    return null;
  }
  return entry.decisoes;
}

function cacheSet(escritorioId: string, tribunal: string, termos: string[], decisoes: unknown[]): void {
  const chave = chaveDeCache(escritorioId, tribunal, termos);
  cache.set(chave, { chave, escritorioId, decisoes, expiraEm: Date.now() + CACHE_TTL_MS });
  // Limpeza simples: descarta entradas expiradas quando o cache cresce.
  if (cache.size > 200) {
    for (const [k, e] of cache) {
      if (Date.now() > e.expiraEm) cache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Formatação do bloco de jurisprudência (fonte rastreável)
// ---------------------------------------------------------------------------

interface DecisaoFormatada {
  tribunal?: string;
  relator?: string;
  orgao?: string;
  numero?: string;
  data?: string;
  texto?: string;
}

function formatarDecisao(d: Record<string, unknown>): DecisaoFormatada | null {
  const texto = (d.excerpt as string) || (d.summary as string) || '';
  if (!texto) return null;
  return {
    tribunal: (d.court as string) || undefined,
    relator: (d.rapporteur as string) || undefined,
    orgao: (d.adjudicating_body as string) || undefined,
    numero: (d.process_number as string) || undefined,
    data: (d.publication_date as string) || (d.trial_date as string) || undefined,
    texto,
  };
}

const MAX_DECISOES = 5;
const MAX_BLOCO_CHARS = 6000;

/** Monta o bloco de jurisprudência formatado (fonte rastreável). */
export function montarBlocoJurisprudencia(decisoes: unknown[]): string {
  const formatadas = decisoes
    .map((d) => formatarDecisao(d as Record<string, unknown>))
    .filter((d): d is DecisaoFormatada => d !== null)
    .slice(0, MAX_DECISOES);

  if (formatadas.length === 0) return '';

  const partes: string[] = ['JURISPRUDÊNCIAS RELEVANTES (fontes rastreáveis):'];
  for (const d of formatadas) {
    const ref = [
      d.tribunal ? `Tribunal: ${d.tribunal}` : '',
      d.relator ? `Relator: ${d.relator}` : '',
      d.orgao ? `Órgão: ${d.orgao}` : '',
      d.numero ? `Processo: ${d.numero}` : '',
      d.data ? `Data: ${d.data}` : '',
    ].filter(Boolean).join(' · ');
    partes.push(`- ${d.texto!.trim()}${ref ? ` (${ref})` : ''}`);
  }
  const bloco = partes.join('\n');
  return bloco.length > MAX_BLOCO_CHARS ? bloco.slice(0, MAX_BLOCO_CHARS) : bloco;
}

// ---------------------------------------------------------------------------
// Orquestração principal (best-effort)
// ---------------------------------------------------------------------------

export interface BuscarJurisprudenciaInput {
  includeJurisprudence?: boolean;
  sectionReview?: boolean;
  area?: string | null;
  fatos: string;
  escritorioId: string;
  /** Injetável para testes (mock). Se ausente, usa a API real. */
  searchOverride?: typeof searchDecisions;
  log?: (msg: string) => void;
}

/**
 * Busca jurisprudência AO VIVO quando includeJurisprudence=true (e não
 * SECTION_REVIEW). Retorna o bloco formatado, ou '' em qualquer falha
 * (best-effort — a geração continua só com RAG). Nunca lança para fora.
 */
export async function buscarJurisprudenciaSeNecessario(input: BuscarJurisprudenciaInput): Promise<string> {
  if (input.includeJurisprudence !== true || input.sectionReview === true) {
    return '';
  }
  const tribunal = tribunalParaArea(input.area);
  const termos = extrairTermosDeBusca(input.fatos);
  if (termos.length === 0) return '';

  // 1) Cache por escritório: evita chamada paga repetida dentro do TTL.
  const cached = cacheGet(input.escritorioId, tribunal, termos);
  if (cached) {
    input.log?.('[jurisprudenciaRag] cache hit — sem chamada à API');
    return montarBlocoJurisprudencia(cached);
  }

  // 2) Busca ao vivo (com fallback best-effort).
  try {
    const buscar = input.searchOverride ?? searchDecisions;
    const query = termos.slice(0, 6).join(' ');
    const resultado = await buscar(tribunal, query, {});
    const decisoes = resultado.data ?? [];
    if (decisoes.length === 0) return '';
    cacheSet(input.escritorioId, tribunal, termos, decisoes);
    input.log?.(`[jurisprudenciaRag] ${decisoes.length} decisão(ões) de ${tribunal} usada(s) na geração`);
    return montarBlocoJurisprudencia(decisoes);
  } catch (err) {
    // Best-effort: sem chave, indisponível, rate limit... segue só com RAG.
    input.log?.(`[jurisprudenciaRag] busca ao vivo indisponível (fallback RAG): ${err instanceof Error ? err.message : String(err)}`);
    return '';
  }
}

/** Contador de entradas em cache (para testes e telemetria). */
export function cacheSize(): number {
  return cache.size;
}

/** Limpa o cache (testes). */
export function limparCache(): void {
  cache.clear();
}
