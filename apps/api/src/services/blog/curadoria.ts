// Orquestra a curadoria semanal: feeds → ranking → redação (Qwen) → imagem → rascunhos no banco.
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { blogArtigos, blogCuradoriaExecucoes } from '../../db/schema.js';
import { deepseekClient, deepseekModel, opcoesQwen } from '../ai.js';
import { trackTokenUsage } from '../usage.js';
import { CONFIG_CURADORIA, type ConfigCuradoria } from './fontes.js';
import { lerRss, type ItemRss } from './rss.js';
import { rankear, veiculoDe, type Candidato } from './selecao.js';
import { montarArtigo, redigir, slugificar, type ClienteIA } from './redator.js';
import { CREDITO_IMAGEM, gerarImagem } from './imagem.js';

const TIMEOUT_FEED_MS = 20_000;
const EXECUCAO_TRAVADA_MIN = 20;

export type OrigemExecucao = 'AGENDADA' | 'MANUAL';

/** Cliente de IA para o redator: Qwen (Token Plan) em modo JSON, temperatura baixa. */
export function clienteQwen(modelo = deepseekModel): ClienteIA {
  return {
    async gerar({ modelo: m, sistema, usuario }) {
      const model = m ?? modelo;
      const r = await deepseekClient.chat.completions.create({
        model,
        ...opcoesQwen(model),
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
      } as any);
      return { texto: r.choices?.[0]?.message?.content ?? null, usage: r.usage ?? undefined };
    },
  };
}

async function buscarFeed(url: string, fetchImpl: typeof fetch): Promise<ItemRss[]> {
  const resp = await fetchImpl(url, {
    headers: { 'User-Agent': 'SmartJurisBot/1.0 (+https://www.smartjuris.com.br)', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(TIMEOUT_FEED_MS),
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return lerRss(await resp.text());
}

export async function linksJaCuradorados(): Promise<string[]> {
  const rows = await db.select({ origem: blogArtigos.origem }).from(blogArtigos);
  return rows.map((r) => r.origem?.url).filter((u): u is string => Boolean(u));
}

async function slugLivre(base: string): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10);
  const tentativas = [base, `${base}-${hoje}`, ...[2, 3, 4, 5, 6].map((n) => `${base}-${hoje}-${n}`)];
  for (const slug of tentativas) {
    const [existe] = await db.select({ id: blogArtigos.id }).from(blogArtigos).where(eq(blogArtigos.slug, slug)).limit(1);
    if (!existe) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** Marca como ERRO as execuções presas e informa se há outra em andamento. */
async function limparTravadas(): Promise<void> {
  await db
    .update(blogCuradoriaExecucoes)
    .set({ status: 'ERRO', erro: 'Execução travada (timeout)', concluidoEm: new Date() })
    .where(
      and(
        eq(blogCuradoriaExecucoes.status, 'EXECUTANDO'),
        sql`${blogCuradoriaExecucoes.iniciadoEm} < now() - make_interval(mins => ${EXECUCAO_TRAVADA_MIN})`,
      ),
    );
}

export async function jaRodouNaSemana(): Promise<boolean> {
  await limparTravadas();
  const [r] = await db
    .select({ id: blogCuradoriaExecucoes.id })
    .from(blogCuradoriaExecucoes)
    .where(
      and(
        gte(blogCuradoriaExecucoes.iniciadoEm, sql`now() - interval '5 days'`),
        sql`(${blogCuradoriaExecucoes.status} = 'EXECUTANDO' OR (${blogCuradoriaExecucoes.status} = 'OK' AND ${blogCuradoriaExecucoes.geradas} > 0))`,
      ),
    )
    .limit(1);
  return Boolean(r);
}

/** Cria a execução (única por vez). Devolve null se já houver uma em andamento. */
export async function criarExecucao(origem: OrigemExecucao, quantidade: number): Promise<string | null> {
  await limparTravadas();
  const [emAndamento] = await db
    .select({ id: blogCuradoriaExecucoes.id })
    .from(blogCuradoriaExecucoes)
    .where(eq(blogCuradoriaExecucoes.status, 'EXECUTANDO'))
    .limit(1);
  if (emAndamento) return null;
  const [row] = await db.insert(blogCuradoriaExecucoes).values({ origem, quantidade }).returning({ id: blogCuradoriaExecucoes.id });
  return row.id;
}

export interface DepsCuradoria {
  config?: ConfigCuradoria;
  fetchImpl?: typeof fetch;
  cliente?: ClienteIA;
  gerarImagem?: typeof gerarImagem;
}

export async function processarExecucao(execucaoId: string, quantidade: number, deps: DepsCuradoria = {}): Promise<void> {
  const config = deps.config ?? CONFIG_CURADORIA;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cliente = deps.cliente ?? clienteQwen();
  const imagem = deps.gerarImagem ?? gerarImagem;
  const utilidadeMinima = Number(process.env.CURADORIA_UTILIDADE_MIN ?? '3');
  const relatorio: { feeds: unknown[]; candidatos: number; geradas: unknown[]; descartadas: unknown[] } = {
    feeds: [], candidatos: 0, geradas: [], descartadas: [],
  };
  let geradas = 0;
  try {
    const itensPorFonte = (
      await Promise.allSettled(config.fontes.map(async (fonte) => ({ fonte, itens: await buscarFeed(fonte.feed, fetchImpl) })))
    ).map((r, i) => {
      const fonte = config.fontes[i];
      if (r.status === 'fulfilled') {
        relatorio.feeds.push({ fonte: fonte.id, itens: r.value.itens.length });
        return r.value;
      }
      relatorio.feeds.push({ fonte: fonte.id, erro: String(r.reason?.message ?? r.reason) });
      return { fonte, itens: [] as ItemRss[] };
    });

    const ranking: Candidato[] = rankear(itensPorFonte, config, await linksJaCuradorados());
    relatorio.candidatos = ranking.length;
    const veiculosUsados = new Set<string>();
    let tentativas = 0;

    for (const candidato of ranking) {
      if (geradas >= quantidade || tentativas >= quantidade * 4) break;
      if (veiculosUsados.has(veiculoDe(candidato))) continue;
      tentativas++;
      const r = await redigir(candidato, { cliente, utilidadeMinima, auditar: true });
      for (const uso of r.tokens) await trackTokenUsage(undefined, 'plataforma_blog', deepseekModel, uso);
      if (!r.ok) {
        relatorio.descartadas.push({ titulo: candidato.item.titulo, motivo: r.motivo });
        continue;
      }
      const artigo = montarArtigo(candidato, r.gerado);
      const img = await imagem(artigo.promptImagem, artigo.titulo);
      const slug = await slugLivre(slugificar(artigo.titulo));
      await db.insert(blogArtigos).values({
        slug,
        tipo: 'CURADORIA',
        status: 'RASCUNHO',
        titulo: artigo.titulo,
        descricao: artigo.descricao,
        categoria: artigo.categoria,
        resumo: artigo.resumo,
        secoes: artigo.secoes,
        faq: artigo.faq,
        fontes: artigo.fontes,
        origem: artigo.origem,
        imagem: img?.buffer ?? null,
        imagemMime: img?.mime ?? null,
        imagemAlt: artigo.imagemAlt,
        imagemCredito: img ? CREDITO_IMAGEM : null,
      });
      veiculosUsados.add(veiculoDe(candidato));
      geradas++;
      relatorio.geradas.push({ slug, titulo: artigo.titulo, comImagem: Boolean(img) });
    }
    await db
      .update(blogCuradoriaExecucoes)
      .set({ status: 'OK', geradas, relatorio, concluidoEm: new Date() })
      .where(eq(blogCuradoriaExecucoes.id, execucaoId));
  } catch (e) {
    await db
      .update(blogCuradoriaExecucoes)
      .set({ status: 'ERRO', geradas, relatorio, erro: e instanceof Error ? e.message : String(e), concluidoEm: new Date() })
      .where(eq(blogCuradoriaExecucoes.id, execucaoId));
  }
}

export async function listarExecucoes(limite = 10) {
  return db.select().from(blogCuradoriaExecucoes).orderBy(desc(blogCuradoriaExecucoes.iniciadoEm)).limit(limite);
}
