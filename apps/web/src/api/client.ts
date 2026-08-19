import { getApiBaseUrl } from './config';

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

export const api = {
  auth: {
    login: (email: string, password: string) => {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
      return authFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    },
    logout: () => authFetch('/api/auth/logout', { method: 'POST' }),
    me: () => authFetch('/api/auth/me'),
  },
  processos: {
    list: () => authFetch('/api/processos').then(r => r.json()),
    create: (p: any) => authFetch('/api/processos', {
      method: 'POST',
      body: JSON.stringify(p)
    }).then(r => r.json()),
    update: (id: string, patch: any) => authFetch(`/api/processos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }).then(r => r.json()),
    delete: (id: string) => authFetch(`/api/processos/${id}`, { method: 'DELETE' }),
  },
  pecas: {
    list: () => authFetch('/api/pecas').then(r => r.json()),
    create: (p: any) => authFetch('/api/pecas', {
      method: 'POST',
      body: JSON.stringify(p)
    }).then(r => r.json()),
    update: (id: string, patch: any) => authFetch(`/api/pecas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }).then(r => r.json()),
  },
  documentos: {
    list: () => authFetch('/api/documentos').then(r => r.json()),
    upload: (formData: FormData) => authFetch('/api/documentos/upload', {
      method: 'POST',
      body: formData
    }).then(r => r.json()),
  },
  jurimetria: {
    stats: () => authFetch('/api/jurimetria/stats').then(r => r.json()),
  },
  financeiro: {
    listLancamentos: () => authFetch('/api/financeiro/lancamentos').then(r => r.json()),
    createLancamento: (data: any) => authFetch('/api/financeiro/lancamentos', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateLancamento: (id: string, patch: any) => authFetch(`/api/financeiro/lancamentos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }).then(r => r.json()),
    listTimesheet: () => authFetch('/api/financeiro/timesheet').then(r => r.json()),
    createTimesheet: (data: any) => authFetch('/api/financeiro/timesheet', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
  },
  andamentos: {
    listByProcesso: (processoId: string) => authFetch(`/api/andamentos/processo/${processoId}`).then(r => r.json()),
    create: (data: any) => authFetch('/api/andamentos', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
  },
  clientes: {
    list: () => authFetch('/api/clientes').then(r => r.json()),
    create: (data: any) => authFetch('/api/clientes', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    update: (id: string, patch: any) => authFetch(`/api/clientes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }).then(r => r.json()),
    delete: (id: string) => authFetch(`/api/clientes/${id}`, { method: 'DELETE' }),
  },
  admin: {
    listUsers: () => authFetch('/api/admin/users').then(r => r.json()),
    createUser: (data: any) => authFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    updateUser: (id: string, patch: any) => authFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then(r => r.json()),
    deleteUser: (id: string) => authFetch(`/api/admin/users/${id}`, { method: 'DELETE' }).then(r => r.json()),
    resetPassword: (id: string, senha: string) => authFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ senha }) }).then(r => r.json()),
    getGlobalStats: (from?: string, to?: string) => authFetch('/api/admin/stats/global' + qs({ from, to })).then(r => r.json()),
    getFinancialStats: (from?: string, to?: string) => authFetch('/api/admin/stats/financial' + qs({ from, to })).then(r => r.json()),
    getLoginLogs: (from?: string, to?: string, sucesso?: string) => authFetch('/api/admin/logs/logins' + qs({ from, to, sucesso })).then(r => r.json()),
    getTokenLogs: (from?: string, to?: string) => authFetch('/api/admin/logs/tokens' + qs({ from, to })).then(r => r.json()),
    getAuditLogs: (from?: string, to?: string) => authFetch('/api/admin/logs/audit' + qs({ from, to })).then(r => r.json()),
  }
};
