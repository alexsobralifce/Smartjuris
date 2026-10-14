// Capa do artigo gerada por IA (OpenAI Images) e convertida para webp. Falha de imagem nunca bloqueia o artigo.
export interface ImagemGerada {
  buffer: Buffer;
  mime: string;
}

export const CREDITO_IMAGEM = 'Imagem ilustrativa gerada por IA';

export function promptDaImagem(cena: string, titulo: string): string {
  return `Realistic editorial photograph for a legal-industry news blog, 3:2 landscape. Scene: ${cena || titulo}. Brazilian law office or courthouse context, natural light, modern, professional, shallow depth of field. Strictly NO text, NO letters, NO numbers, NO logos, NO watermarks, NO recognizable real people; avoid close-up faces.`;
}

export async function paraWebp(png: Buffer): Promise<ImagemGerada> {
  try {
    const { default: sharp } = await import('sharp');
    const buffer = await sharp(png).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { buffer, mime: 'image/webp' };
  } catch {
    // sem sharp disponível, mantém o PNG original
    return { buffer: png, mime: 'image/png' };
  }
}

export async function gerarImagem(
  cena: string,
  titulo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImagemGerada | null> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) return null;
  try {
    const resp = await fetchImpl('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: process.env.BLOG_MODELO_IMAGEM || 'gpt-image-1-mini',
        prompt: promptDaImagem(cena, titulo),
        size: '1536x1024',
        quality: process.env.BLOG_IMAGEM_QUALIDADE || 'medium',
        n: 1,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      console.error('[Blog] Falha ao gerar imagem:', resp.status);
      return null;
    }
    const json = (await resp.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return null;
    return await paraWebp(Buffer.from(b64, 'base64'));
  } catch (e) {
    console.error('[Blog] Erro ao gerar imagem:', e instanceof Error ? e.message : e);
    return null;
  }
}
