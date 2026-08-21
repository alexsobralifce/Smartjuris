export const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }

  // Em produção (seja no domínio *.railway.app ou no domínio personalizado)
  if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'https://smartjuris-api-production.up.railway.app';
  }

  // Em desenvolvimento local
  return 'http://localhost:3001';
};
