export function redactPII(text: string): string {
  if (!text) return text;
  return String(text)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP]')
    .replace(/(?:\(\d{2}\)\s?)?\d{4,5}-\d{4}\b/g, '[TEL]');
}
