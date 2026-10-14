// Filtro, pontuação e escolha dos itens (funções puras, testadas em curadoria.test.ts).
import type { ConfigCuradoria, FonteFeed } from './fontes.js';
import type { ItemRss } from './rss.js';

export interface Candidato {
  fonte: FonteFeed;
  item: ItemRss;
  pontos: number;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const conta = (texto: string, lista: string[]) => lista.filter((p) => texto.includes(norm(p))).length;

export function pontuar(
  item: Pick<ItemRss, 'titulo' | 'trecho' | 'categorias'>,
  config: ConfigCuradoria,
  peso = 1,
): number {
  const titulo = ` ${norm(item.titulo)} `;
  const corpo = ` ${norm(`${item.trecho} ${item.categorias.join(' ')}`)} `;
  if (conta(`${titulo} ${corpo}`, config.negativas) > 0) return 0;
  const pontos = conta(titulo, config.positivas) * 2 + conta(corpo, config.positivas);
  if (pontos < 2) return 0;
  const bonus = conta(`${titulo} ${corpo}`, config.praticas) > 0 ? 1.5 : 1;
  return pontos * peso * bonus;
}

export function ehRecente(item: { data: Date | null }, janelaDias: number, agora = new Date()): boolean {
  return Boolean(item.data && agora.getTime() - item.data.getTime() <= janelaDias * 86_400_000 && item.data <= agora);
}

export function canonicalizarLink(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) u.searchParams.delete(p);
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Ordena candidatos por pontuação, sem repetir links já usados. */
export function rankear(
  itensPorFonte: Array<{ fonte: FonteFeed; itens: ItemRss[] }>,
  config: ConfigCuradoria,
  historico: string[],
  agora = new Date(),
): Candidato[] {
  const jaUsados = new Set(historico.map(canonicalizarLink));
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];
  for (const { fonte, itens } of itensPorFonte) {
    for (const item of itens) {
      const link = canonicalizarLink(item.link);
      if (jaUsados.has(link) || vistos.has(link) || !ehRecente(item, config.janelaDias, agora)) continue;
      vistos.add(link);
      const pontos = pontuar(item, config, fonte.peso);
      if (pontos > 0) candidatos.push({ fonte, item: { ...item, link }, pontos });
    }
  }
  return candidatos.sort((a, b) => b.pontos - a.pontos);
}

/** Veículo da fonte (Conjur e Conjur-Advocacia contam como um só). */
export const veiculoDe = (c: Pick<Candidato, 'fonte'>): string => c.fonte.id.split('-')[0];

/** Variedade: no máximo um candidato por veículo. */
export function escolher(candidatos: Candidato[], quantidade = 3): Candidato[] {
  const escolhidos: Candidato[] = [];
  for (const c of candidatos) {
    if (escolhidos.length >= quantidade) break;
    if (escolhidos.some((e) => veiculoDe(e) === veiculoDe(c))) continue;
    escolhidos.push(c);
  }
  return escolhidos;
}
