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

export interface ResultadoJurisprudencia {
  /** Bloco formatado para anexar ao contexto ('' se não houver jurisprudência). */
  bloco: string;
  /** Quantidade de decisões ao vivo usadas (0 se fallback/cache). */
  decisoesUsadas: number;
  /** Tribunais de origem das decisões usadas. */
  tribunais: string[];
  /** true se veio do cache (sem chamada à API). */
  fromCache: boolean;
}

// --- Rate limit por escritório (fase 5C) ---

interface RateLimitEstado {
  pausadoAte: number;
  restantes: number | null;
}

const rateLimitPorEscritorio = new Map<string, RateLimitEstado>();

/** Limiar mínimo de requisições restantes: abaixo disso, pausa buscas ao vivo. */
const RATE_LIMIT_MIN_REMAINING = 2;
/** Janela de pausa quando o rate limit está baixo (ms). */
const RATE_LIMIT_PAUSA_MS = 60 * 1000;

/**
 * Normaliza o campo `reset` do rate limit para a DURAÇÃO da pausa em ms.
 * O header X-RateLimit-Reset pode vir em formatos diferentes:
 *  - relativo em SEGUNDOS (ex.: "60" = pausar 60s) ou MILISSEGUNDOS ("60000");
 *  - timestamp epoch em segundos (ex.: "1728000000") ou ms;
 *  - data ISO (ex.: "2026-08-23T12:00:00Z").
 * Retorna a duração em ms (não o instante absoluto). null se indeterminado.
 */
export function normalizarResetMs(reset: string | number | null | undefined): number | null {
  if (reset == null || String(reset).trim() === '') return null;
  const raw = String(reset).trim();

  // NÚMERO primeiro: `Date.parse` aceita strings numéricas como datas (ex.:
  // '60' → 1960-01-01), o que confundiria reset relativo com timestamp.
  //  - número "pequeno" (< 100k) → RELATIVO em segundos (padrão de headers).
  //  - 10 dígitos → timestamp epoch em SEGUNDOS → duração até o instante.
  //  - grande (≥ 11 dígitos) → milissegundos (absoluto) → duração até o instante.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isNaN(num) && num > 0) {
      if (num < 100_000) return num * 1000; // relativo em segundos
      if (num < 100_000_000_000) return Math.max(num * 1000 - Date.now(), 1_000); // epoch seg
      return Math.max(num - Date.now(), 1_000); // ms absoluto
    }
    return null;
  }

  // Data ISO (ex.: "2026-08-23T12:00:00Z") → duração até o instante.
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) {
    return Math.max(iso - Date.now(), 1_000);
  }
  return null;
}

/**
 * Extrai o status HTTP de um erro, aceitando mensagem com "429" OU objeto com
 * `status`/`statusCode` (ex.: erro do fetch/axios). Retorna null se não houver.
 */
function statusDoErro(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; statusCode?: unknown };
    for (const campo of ['status', 'statusCode'] as const) {
      const v = e[campo];
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && !Number.isNaN(Number(v))) return Number(v);
    }
  }
  return null;
}

/** true se o erro representa rate limit do provedor (429). */
export function ehRateLimit(err: unknown): boolean {
  const status = statusDoErro(err);
  if (status !== null) return status === 429;
  const msg = err instanceof Error ? err.message : String(err);
  return /429|too many requests|rate limit/i.test(msg);
}

/** Interpreta os headers de rate limit e atualiza o estado do escritório. */
export function registrarRateLimit(escritorioId: string, rateLimit: { remaining?: string | null; reset?: string | null } | undefined): void {
  if (!rateLimit) return;
  const remaining = rateLimit.remaining != null ? Number(rateLimit.remaining) : null;
  if (remaining != null && !Number.isNaN(remaining) && remaining <= RATE_LIMIT_MIN_REMAINING) {
    const resetMs = normalizarResetMs(rateLimit.reset);
    const pausa = resetMs != null
      ? Math.max(resetMs - Date.now(), 1_000) // até o reset; mínimo 1s
      : RATE_LIMIT_PAUSA_MS;
    rateLimitPorEscritorio.set(escritorioId, { pausadoAte: Date.now() + pausa, restantes: remaining });
  } else {
    rateLimitPorEscritorio.delete(escritorioId);
  }
}

/** true se o escritório está em pausa de rate limit (não chama a API ao vivo). */
export function rateLimitPausado(escritorioId: string): boolean {
  const estado = rateLimitPorEscritorio.get(escritorioId);
  if (!estado) return false;
  if (Date.now() > estado.pausadoAte) {
    rateLimitPorEscritorio.delete(escritorioId);
    return false;
  }
  return true;
}

/** Limpa o estado de rate limit (testes). */
export function limparRateLimit(): void {
  rateLimitPorEscritorio.clear();
}

/** Instrução de fundamentação (fase 5B): vale para RAG local E bloco injetado. */
export const INSTRUCAO_FUNDAMENTACAO = [
  'Fundamente todos os pedidos e alegações EXCLUSIVAMENTE nas leis, doutrinas e',
  'jurisprudências fornecidas no contexto abaixo. NÃO invente precedentes, números',
  'de processo ou artigos de lei fora do contexto fornecido.',
].join('\n');

/** Anexa o bloco de jurisprudência ao contexto RAG com separação clara (5B). */
export function anexarBlocoAoContexto(ragContexto: string, blocoJurisprudencia: string): string {
  if (!blocoJurisprudencia.trim()) return ragContexto;
  const rag = ragContexto.trim();
  return [
    rag ? rag : '(sem contexto RAG local)',
    '--- JURISPRUDÊNCIA AO VIVO (separada do RAG local) ---',
    blocoJurisprudencia.trim(),
    INSTRUCAO_FUNDAMENTACAO,
  ].join('\n\n');
}

/**
 * Busca jurisprudência AO VIVO quando includeJurisprudence=true (e não
 * SECTION_REVIEW). Retorna o bloco formatado + rastreabilidade, ou bloco vazio
 * em qualquer falha (best-effort — a geração continua só com RAG). Nunca lança
 * para fora e nunca expõe detalhes internos do provedor no retorno.
 */
export async function buscarJurisprudenciaSeNecessario(input: BuscarJurisprudenciaInput): Promise<ResultadoJurisprudencia> {
  const vazio: ResultadoJurisprudencia = { bloco: '', decisoesUsadas: 0, tribunais: [], fromCache: false };
  if (input.includeJurisprudence !== true || input.sectionReview === true) {
    return vazio;
  }
  const tribunal = tribunalParaArea(input.area);
  const termos = extrairTermosDeBusca(input.fatos);
  if (termos.length === 0) return vazio;

  // 1) CACHE PRIMEIRO: mesmo durante pausa de rate limit, reutiliza resultados
  //    já disponíveis por escritório (não desperdiça cache válido).
  const cached = cacheGet(input.escritorioId, tribunal, termos);
  if (cached) {
    input.log?.('[jurisprudenciaRag] cache hit — sem chamada à API');
    return {
      bloco: montarBlocoJurisprudencia(cached),
      decisoesUsadas: cached.length,
      tribunais: [tribunal],
      fromCache: true,
    };
  }

  // Rate limit: SÓ pausa NOVAS buscas ao vivo (cache já foi consultado acima).
  if (rateLimitPausado(input.escritorioId)) {
    input.log?.('[jurisprudenciaRag] rate limit baixo — busca ao vivo pausada (fallback RAG)');
    return vazio;
  }

  // 2) Busca ao vivo (com fallback best-effort). Erros viram mensagem GENÉRICA
  //    no log — o retorno nunca carrega detalhes internos do provedor (5D).
  try {
    const buscar = input.searchOverride ?? searchDecisions;
    const query = termos.slice(0, 6).join(' ');
    const resultado = await buscar(tribunal, query, {});
    // 5C: interpreta headers de rate limit (pausa futuras buscas se baixo).
    registrarRateLimit(input.escritorioId, resultado.rateLimit);
    const decisoes = resultado.data ?? [];
    if (decisoes.length === 0) return vazio;
    cacheSet(input.escritorioId, tribunal, termos, decisoes);
    input.log?.(`[jurisprudenciaRag] ${decisoes.length} decisão(ões) de ${tribunal} usada(s) na geração`);
    return {
      bloco: montarBlocoJurisprudencia(decisoes),
      decisoesUsadas: decisoes.length,
      tribunais: [tribunal],
      fromCache: false,
    };
  } catch (err) {
    // 5C: provedor retornou rate limit (429) → registra pausa para as próximas
    //    buscas ao vivo, mas segue com RAG local (best-effort, nunca falha).
    if (ehRateLimit(err)) {
      registrarRateLimit(input.escritorioId, { remaining: '0', reset: undefined });
      input.log?.('[jurisprudenciaRag] rate limit (429) do provedor — pausa novas buscas ao vivo');
    } else {
      // Best-effort: sem chave, indisponível... segue só com RAG.
      // Mensagem GENÉRICA no log; detalhes internos NÃO são repassados (5D).
      input.log?.('[jurisprudenciaRag] busca ao vivo indisponível — fallback para RAG local');
    }
    return vazio;
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
