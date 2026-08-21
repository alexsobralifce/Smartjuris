export const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }

  // Em produção, frontend e API ficam na MESMA origem: o serviço web serve o
  // frontend e faz proxy de /api (nginx) para a API. Assim o cookie de sessão é
  // first-party — evita bloqueio de cookies de terceiros (logout em produção).
  if (import.meta.env.PROD) {
    return '';
  }

  // Em desenvolvimento local
  return 'http://localhost:3001';
};
