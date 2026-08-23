interface Court {
  id: string;
  name: string;
  abbreviation: string;
  decisions_count: number;
}

interface Decision {
  process_number: string;
  process_type: string;
  rapporteur: string;
  adjudicating_body: string;
  publication_date: string;
  trial_date: string;
  excerpt?: string;
  summary?: string;
  url: string;
  court?: string;
}

interface SearchResponse {
  data: Decision[];
  meta: {
    page: number;
    per_page: number;
    has_next_page: boolean;
  };
  links?: {
    self: string;
    first: string;
    next?: string;
  };
  rateLimit?: {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
  };
}

const BASE_URL = 'https://jurisprudencias.ai/api/v1';

/** Hosts aprovados para a URL da API (fase 6F) — evita exfiltração da chave
 *  para destinos arbitrários (SSRF de credenciais). */
export function hostJurisprudenciasPermitido(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'jurisprudencias.ai' || h.endsWith('.jurisprudencias.ai');
}

/**
 * Fase 6F — valida a URL configurada em JURISPRUDENCIAS_API_URL antes de usá-la
 * em chamadas AUTENTICADAS (Bearer). Exige:
 *   - URL parseável (new URL());
 *   - protocolo HTTPS (a chave nunca trafega em texto puro);
 *   - host na allowlist (jurisprudencias.ai ou subdomínio);
 *   - sem userinfo (usuário/senha embutidos na URL).
 * Retorna a URL normalizada (sem barra final) ou null se inválida.
 */
export function validarUrlJurisprudencias(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!hostJurisprudenciasPermitido(u.hostname)) return null;
    if (u.username || u.password) return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Fase 6F — URL base da API configurável via env. Default:
 * https://jurisprudencias.ai/api/v1. Se a env estiver presente mas INVÁLIDA,
 * LANÇA erro (a chave nunca é enviada a um destino não aprovado; a geração é
 * best-effort e trata a falha com fallback RAG).
 */
export function apiUrlJurisprudencias(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.JURISPRUDENCIAS_API_URL;
  if (raw == null || String(raw).trim() === '') return BASE_URL;
  const valida = validarUrlJurisprudencias(String(raw).trim());
  if (!valida) {
    throw new Error('JURISPRUDENCIAS_API_URL inválida: use HTTPS em host aprovado (jurisprudencias.ai ou subdomínio).');
  }
  return valida;
}

/** Fase 6F — URL pública do portal do provedor (gestão de conta/planos). */
export function portalUrlJurisprudencias(): string {
  return 'https://jurisprudencias.ai/';
}

let courtsCache: { data: Court[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function getApiKey(): string {
  const key = process.env.JURISPRUDENCIAS_API_KEY;
  if (!key) {
    throw new Error('JURISPRUDENCIAS_API_KEY não configurada no ambiente.');
  }
  return key;
}

export async function listCourts(): Promise<{ data: Court[]; rateLimit?: any }> {
  if (courtsCache && Date.now() - courtsCache.timestamp < CACHE_TTL_MS) {
    return { data: courtsCache.data };
  }

  const apiKey = getApiKey();
  const res = await fetch(`${apiUrlJurisprudencias()}/courts`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Erro ao listar tribunais (${res.status}): ${errorText || res.statusText}`);
  }

  const json = await res.json();
  const courts: Court[] = json.data || [];
  courtsCache = { data: courts, timestamp: Date.now() };

  return {
    data: courts,
    rateLimit: {
      limit: res.headers.get('X-RateLimit-Limit'),
      remaining: res.headers.get('X-RateLimit-Remaining'),
      reset: res.headers.get('X-RateLimit-Reset'),
    },
  };
}

export interface SearchOptions {
  page?: number;
  pub_from?: string;
  pub_to?: string;
  trial_from?: string;
  trial_to?: string;
}

export async function searchDecisions(
  courtId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const apiKey = getApiKey();
  const params = new URLSearchParams();
  params.set('q', query);

  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.pub_from) params.set('pub_from', options.pub_from);
  if (options.pub_to) params.set('pub_to', options.pub_to);
  if (options.trial_from) params.set('trial_from', options.trial_from);
  if (options.trial_to) params.set('trial_to', options.trial_to);

  const url = `${apiUrlJurisprudencias()}/courts/${encodeURIComponent(courtId)}/decisions?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    let msg = `Erro na busca (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        msg = errJson.error.message;
      }
    } catch {
      const txt = await res.text().catch(() => '');
      if (txt) msg = txt;
    }
    throw new Error(msg);
  }

  const json = await res.json();
  return {
    data: json.data || [],
    meta: json.meta || { page: 0, per_page: 10, has_next_page: false },
    links: json.links,
    rateLimit: {
      limit: res.headers.get('X-RateLimit-Limit'),
      remaining: res.headers.get('X-RateLimit-Remaining'),
      reset: res.headers.get('X-RateLimit-Reset'),
    },
  };
}

export async function lookupDecision(
  courtId: string,
  processNumber: string
): Promise<{ data: Decision; rateLimit?: any }> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ n: processNumber });
  const url = `${apiUrlJurisprudencias()}/courts/${encodeURIComponent(courtId)}/decisions/lookup?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    let msg = `Decisão não encontrada (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        msg = errJson.error.message;
      }
    } catch {
      const txt = await res.text().catch(() => '');
      if (txt) msg = txt;
    }
    throw new Error(msg);
  }

  const json = await res.json();
  return {
    data: json.data,
    rateLimit: {
      limit: res.headers.get('X-RateLimit-Limit'),
      remaining: res.headers.get('X-RateLimit-Remaining'),
      reset: res.headers.get('X-RateLimit-Reset'),
    },
  };
}
