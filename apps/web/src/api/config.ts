export const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }

  // Em produção no Railway
  if (typeof window !== 'undefined' && window.location.hostname.includes('railway.app')) {
    return 'https://smartjuris-api-production.up.railway.app';
  }

  // Em desenvolvimento local
  return 'http://localhost:3001';
};
