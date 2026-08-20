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
  const res = await fetch(`${BASE_URL}/courts`, {
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

  const url = `${BASE_URL}/courts/${encodeURIComponent(courtId)}/decisions?${params.toString()}`;

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
  const url = `${BASE_URL}/courts/${encodeURIComponent(courtId)}/decisions/lookup?${params.toString()}`;

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
