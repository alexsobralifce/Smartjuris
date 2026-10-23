import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Extração de texto de documentos enviados para a base (RAG).
// Formatos: PDF, DOCX, HTML, Markdown e TXT. Retorna texto puro.

export const EXTENSOES_TEXTO = ['.pdf', '.docx', '.html', '.htm', '.md', '.markdown', '.txt'] as const;

export interface TextoExtraido {
  texto: string;
  paginas: number | null;
}

export function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i === -1 ? '' : nome.slice(i).toLowerCase();
}

export function formatoSuportado(nome: string): boolean {
  return (EXTENSOES_TEXTO as readonly string[]).includes(extensaoDe(nome));
}

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** HTML → texto: remove scripts/estilos, quebra blocos em parágrafos, tira tags
 *  e decodifica entidades. Não depende de DOM (roda no servidor). */
export function htmlParaTexto(html: string): string {
  let t = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|blockquote|pre)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[code.toLowerCase()] ?? m;
  });
  return t.replace(/[ \t\xa0]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Extrai o texto do arquivo conforme a extensão. Lança erro para formato não suportado. */
export async function extrairTexto(buffer: Buffer, nome: string): Promise<TextoExtraido> {
  const ext = extensaoDe(nome);
  switch (ext) {
    case '.pdf': {
      const data = await pdfParse(buffer);
      return { texto: data.text, paginas: Number((data as any).numpages) || null };
    }
    case '.docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return { texto: value, paginas: null };
    }
    case '.html':
    case '.htm':
      return { texto: htmlParaTexto(buffer.toString('utf8')), paginas: null };
    case '.md':
    case '.markdown':
    case '.txt':
      return { texto: buffer.toString('utf8').replace(/\r\n/g, '\n'), paginas: null };
    default:
      throw new Error(`Formato não suportado: ${ext || 'sem extensão'}`);
  }
}
