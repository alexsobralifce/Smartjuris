import { getApiBaseUrl } from './config';

export type User = {
  id: string;
  name: string;
  role: 'root' | 'admin' | 'user';
  email: string;
  escritorioId: string | null;
  permissoes: string[];
  precisaTrocarSenha: boolean;
  tokensMes?: number | null;
  limiteTokensMes?: number | null;
};

export type Court = {
  id: string;
  name: string;
  abbreviation: string;
  decisions_count: number;
};

export type Decision = {
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
};

export type SearchDecisionsResult = {
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
};

export type AgendaItem = {
  id: string
  titulo: string
  tipo: 'audiencia' | 'prazo_processo' | 'prazo_peca' | 'financeiro' | 'aniversario' | 'evento'
  inicio: string
  fim?: string
  diaInteiro: boolean
  cor: string
  processoId?: string
  clienteId?: string
  cliente?: string
  origem: 'processo' | 'andamento' | 'peca' | 'financeiro' | 'cliente' | 'manual'
}

const qs = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&') : '';
};

const RELOAD_GUARD_KEY = 'smartjuris_auth_reloading';
let isReloading = false;

const authFetch = (url: string, options: RequestInit = {}) => {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const baseUrl = getApiBaseUrl();
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${normalizedPath}`;

  return fetch(fullUrl, { ...options, headers, credentials: 'include' }).then(async r => {
    if (r.status === 401) {
      localStorage.removeItem('smartjuris_user');
      // Guarda contra loops infinitos de reload: só recarrega uma vez por sessão
      // (o App chama /me no mount, que retorna 401 para visitantes sem cookie).
      if (!isReloading && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        isReloading = true;
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        window.location.reload();
      }
    }
    return r;
  });
};

/**
 * Extrai a mensagem de erro do corpo de uma resposta (formato
 * `{ error: "campo: mensagem; ..." }`) retornada pelo backend em 400/422.
 * Usa `clone()` para não consumir o corpo caso o chamador precise lê-lo depois.
 */
export async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.clone().json();
    return typeof data?.error === 'string' && data.error ? data.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Baixa um arquivo autenticado e dispara o download no navegador
 * (blob + object URL + anchor com atributo `download`).
 */
async function downloadApiFile(url: string, filename: string): Promise<void> {
  const res = await authFetch(url);
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Falha ao baixar arquivo.'));
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Bufferiza o corpo de uma Response para permitir múltiplas leituras
 * (ex.: chamar res.json() e depois getErrorMessage(res)). Sem isso, o
 * clone() interno de getErrorMessage lança "body already used" e o toast
 * cai no fallback genérico, escondendo a mensagem real do backend.
 */
async function bufferedResponse(res: Response): Promise<Response> {
  const body = await res.text().catch(() => '');
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export const api = {
  auth: {
    login: (email: string, password: string) => {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
      return authFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    },
    registro: (data: { nome: string; email: string; senha: string; oab: string; oabUf: string; escritorioNome: string; cnpj?: string; telefone?: string }) =>
      authFetch('/api/auth/registro', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => authFetch('/api/auth/logout', { method: 'POST' }),
    trocarSenha: (senhaAtual: string, novaSenha: string) =>
      authFetch('/api/auth/trocar-senha', { method: 'POST', body: JSON.stringify({ senhaAtual, novaSenha }) }),
    me: () => {
      // Sondagem de sessão: NÃO deve disparar reload em 401 (visitante sem cookie é normal).
      const baseUrl = getApiBaseUrl();
      return fetch(`${baseUrl}/api/auth/me`, { credentials: 'include' });
    },
  },
  processos: {
    list: () => authFetch('/api/processos').then(r => r.json()),
    create: (p: any) => authFetch('/api/processos', {
      method: 'POST',
      body: JSON.stringify(p)
    }),
    update: (id: string, patch: any) => authFetch(`/api/processos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
    delete: (id: string) => authFetch(`/api/processos/${id}`, { method: 'DELETE' }),
  },
  pecas: {
    list: () => authFetch('/api/pecas').then(r => r.json()),
    create: (p: any) => authFetch('/api/pecas', {
      method: 'POST',
      body: JSON.stringify(p)
    }),
    update: (id: string, patch: any) => authFetch(`/api/pecas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
    export: (id: string, format: 'pdf' | 'docx') => downloadApiFile(`/api/pecas/${id}/export?format=${format}`, `peca-${id}.${format}`),
  },
  documentos: {
    list: () => authFetch('/api/documentos').then(r => r.json()),
    upload: (formData: FormData) => authFetch('/api/documentos/upload', {
      method: 'POST',
      body: formData
    }),
  },
  jurimetria: {
    stats: () => authFetch('/api/jurimetria/stats').then(r => r.json()),
  },
  rag: {
    modelos: () => authFetch('/api/rag/modelos').then(r => r.json()),
  },
  financeiro: {
    listLancamentos: () => authFetch('/api/financeiro/lancamentos').then(r => r.json()),
    createLancamento: (data: any) => authFetch('/api/financeiro/lancamentos', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    updateLancamento: (id: string, patch: any) => authFetch(`/api/financeiro/lancamentos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
    listTimesheet: () => authFetch('/api/financeiro/timesheet').then(r => r.json()),
    createTimesheet: (data: any) => authFetch('/api/financeiro/timesheet', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  },
  andamentos: {
    listByProcesso: (processoId: string) => authFetch(`/api/andamentos/processo/${processoId}`).then(r => r.json()),
    create: (data: any) => authFetch('/api/andamentos', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  },
  clientes: {
    list: () => authFetch('/api/clientes').then(r => r.json()),
    create: (data: any) => authFetch('/api/clientes', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id: string, patch: any) => authFetch(`/api/clientes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
    delete: (id: string) => authFetch(`/api/clientes/${id}`, { method: 'DELETE' }),
  },
  agenda: {
    getMes: (mes: string) => authFetch(`/api/agenda?mes=${mes}`).then(r => r.json()),
    criarEvento: (data: unknown) => authFetch('/api/agenda/eventos', { method: 'POST', body: JSON.stringify(data) }),
    atualizarEvento: (id: string, data: unknown) => authFetch(`/api/agenda/eventos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletarEvento: (id: string) => authFetch(`/api/agenda/eventos/${id}`, { method: 'DELETE' }),
  },
  escritorio: {
    getInfo: () => authFetch('/api/admin/escritorio/info').then(r => r.json()),
    saveIdentity: (patch: Record<string, string>) =>
      authFetch('/api/admin/escritorio/info', { method: 'PATCH', body: JSON.stringify(patch) }).then(r => r.json()),
    listUsers: () => authFetch('/api/admin/escritorio/usuarios').then(r => r.json()),
    criarUsuario: (data: { nome: string; email: string; permissoes: string[] }) =>
      authFetch('/api/admin/escritorio/usuarios', { method: 'POST', body: JSON.stringify({ nome: data.nome, email: data.email, modulos: data.permissoes }) }).then(r => r.json()),
    updateUsuario: (id: string, patch: any) =>
      authFetch(`/api/admin/escritorio/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then(r => r.json()),
    resetarSenha: (id: string) =>
      authFetch(`/api/admin/escritorio/usuarios/${id}/reset-password`, { method: 'POST' }).then(r => r.json()),
    desativarUsuario: (id: string) =>
      authFetch(`/api/admin/escritorio/usuarios/${id}`, { method: 'DELETE' }),
    salvarPermissoes: (id: string, permissoes: { modulo: string; ativo: boolean }[]) =>
      authFetch(`/api/admin/escritorio/permissoes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ permissoes }),
      }).then(r => r.json()),
    getPermissoes: (id: string) => authFetch(`/api/admin/escritorio/permissoes/${id}`).then(r => r.json()),
    getMetricas: () => authFetch('/api/admin/escritorio/metricas').then(r => r.json()),
  },
  raiz: {
    listEscritorios: () => authFetch('/api/root/escritorios').then(r => r.json()),
    criarEscritorio: async (data: { nome: string; adminNome: string; adminEmail: string }) =>
      bufferedResponse(await authFetch('/api/root/escritorios', { method: 'POST', body: JSON.stringify(data) })),
    editarEscritorio: async (id: string, patch: any) =>
      bufferedResponse(await authFetch(`/api/root/escritorios/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })),
    ativarEscritorio: async (id: string) =>
      bufferedResponse(await authFetch(`/api/root/escritorios/${id}`, { method: 'PATCH', body: JSON.stringify({ ativo: true }) })),
    desativarEscritorio: async (id: string) =>
      bufferedResponse(await authFetch(`/api/root/escritorios/${id}`, { method: 'DELETE' })),
    excluirEscritorioPermanente: async (id: string) =>
      bufferedResponse(await authFetch(`/api/root/escritorios/${id}/permanente`, { method: 'DELETE' })),
    getMetricasAgregadas: () => authFetch('/api/root/metricas').then(r => r.json()),
    getAuditoria: () => authFetch('/api/root/auditoria').then(r => r.json()),
    getCreditos: () => authFetch('/api/root/creditos').then(r => r.json()),
    adicionarCreditosEscritorio: async (id: string, quantidade: number) =>
      bufferedResponse(await authFetch(`/api/root/escritorios/${id}/creditos`, { method: 'POST', body: JSON.stringify({ quantidade }) })),
    adicionarCreditosUsuario: async (id: string, quantidade: number) =>
      bufferedResponse(await authFetch(`/api/root/usuarios/${id}/creditos`, { method: 'POST', body: JSON.stringify({ quantidade }) })),
  },
  jurisprudencias: {
    listCourts: (): Promise<{ data: Court[] }> =>
      authFetch('/api/jurisprudencias/courts').then(r => r.json()),
    search: (params: {
      court?: string;
      q: string;
      page?: number;
      pub_from?: string;
      pub_to?: string;
      trial_from?: string;
      trial_to?: string;
    }): Promise<SearchDecisionsResult> => {
      const query = qs({
        court: params.court,
        q: params.q,
        page: params.page !== undefined ? String(params.page) : undefined,
        pub_from: params.pub_from,
        pub_to: params.pub_to,
        trial_from: params.trial_from,
        trial_to: params.trial_to,
      });
      return authFetch(`/api/jurisprudencias/search${query}`).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: 'Falha na busca de jurisprudência.' }));
          throw new Error(err.error || 'Falha na busca de jurisprudência.');
        }
        return r.json();
      });
    },
    lookup: (court: string, processNumber: string): Promise<{ data: Decision }> => {
      const query = qs({ court, n: processNumber });
      return authFetch(`/api/jurisprudencias/lookup${query}`).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: 'Decisão não encontrada.' }));
          throw new Error(err.error || 'Decisão não encontrada.');
        }
        return r.json();
      });
    },
  },
};

