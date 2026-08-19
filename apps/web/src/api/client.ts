export const api = {
  processos: {
    list: () => fetch('/api/processos').then(r => r.json()),
    create: (p: any) => fetch('/api/processos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).then(r => r.json()),
    update: (id: string, patch: any) => fetch(`/api/processos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(r => r.json()),
    delete: (id: string) => fetch(`/api/processos/${id}`, { method: 'DELETE' }),
  },
  pecas: {
    list: () => fetch('/api/pecas').then(r => r.json()),
    create: (p: any) => fetch('/api/pecas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).then(r => r.json()),
    update: (id: string, patch: any) => fetch(`/api/pecas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(r => r.json()),
  },
  documentos: {
    list: () => fetch('/api/documentos').then(r => r.json()),
    upload: (formData: FormData) => fetch('/api/documentos/upload', {
      method: 'POST',
      body: formData
    }).then(r => r.json()),
  },
  jurimetria: {
    stats: () => fetch('/api/jurimetria/stats').then(r => r.json()),
  }
};
