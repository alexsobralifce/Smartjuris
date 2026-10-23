// Curadoria do blog: parser RSS/Atom, seleção, validação do redator e fluxo com cliente de IA simulado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lerRss } from './rss.js';
import { CONFIG_CURADORIA } from './fontes.js';
import { canonicalizarLink, ehRecente, escolher, pontuar, rankear, type Candidato } from './selecao.js';
import { ArtigoGerado, extrairJson, montarArtigo, redigir, slugificar, trechosCopiados, validar, type ClienteIA } from './redator.js';
import { promptDaImagem } from './imagem.js';

const agora = new Date('2026-10-14T12:00:00Z');
const fonte = { id: 'conjur', nome: 'Consultor Jurídico', feed: 'https://x/feed', peso: 1 };

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Novo prazo para recurso no CPC muda a rotina dos advogados]]></title>
<link>https://exemplo.com/a?utm_source=x</link><pubDate>Tue, 13 Oct 2026 10:00:00 GMT</pubDate>
<category>Advocacia</category><description><![CDATA[<p>O tribunal definiu que o <b>prazo</b> para recurso passa a contar em dias úteis &amp; digitais.</p>]]></description></item>
<item><title>Sem link válido</title><link>nao-e-url</link></item></channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Entrada Atom</title>
<link href="https://exemplo.com/atom-1"/><updated>2026-10-12T10:00:00Z</updated><summary>Resumo da entrada</summary></entry></feed>`;

describe('rss', () => {
  test('lê RSS 2.0 com CDATA, entidades e descarta item sem link http', () => {
    const itens = lerRss(RSS);
    assert.equal(itens.length, 1);
    assert.equal(itens[0].titulo, 'Novo prazo para recurso no CPC muda a rotina dos advogados');
    assert.equal(itens[0].trecho, 'O tribunal definiu que o prazo para recurso passa a contar em dias úteis & digitais.');
    assert.deepEqual(itens[0].categorias, ['Advocacia']);
    assert.ok(itens[0].data);
  });
  test('lê Atom (entry/link href/summary)', () => {
    const [i] = lerRss(ATOM);
    assert.equal(i.link, 'https://exemplo.com/atom-1');
    assert.equal(i.trecho, 'Resumo da entrada');
  });
});

describe('seleção', () => {
  const item = lerRss(RSS)[0];
  test('pontua tema jurídico útil e zera tema negativo', () => {
    assert.ok(pontuar(item, CONFIG_CURADORIA) > 0);
    assert.equal(pontuar({ titulo: 'Candidato denuncia eleição', trecho: 'prazo advogado', categorias: [] }, CONFIG_CURADORIA), 0);
    assert.equal(pontuar({ titulo: 'Receita de bolo', trecho: 'farinha', categorias: [] }, CONFIG_CURADORIA), 0);
  });
  test('janela de dias e canonicalização de link', () => {
    assert.ok(ehRecente({ data: new Date('2026-10-10T00:00:00Z') }, 14, agora));
    assert.ok(!ehRecente({ data: new Date('2026-09-01T00:00:00Z') }, 14, agora));
    assert.ok(!ehRecente({ data: new Date('2026-10-20T00:00:00Z') }, 14, agora));
    assert.equal(canonicalizarLink('https://a.com/p/?utm_source=x#h'), 'https://a.com/p');
  });
  test('rankear exclui links já curados e duplicados entre fontes', () => {
    const itens = lerRss(RSS);
    const r1 = rankear([{ fonte, itens }, { fonte: { ...fonte, id: 'jota' }, itens }], CONFIG_CURADORIA, [], agora);
    assert.equal(r1.length, 1);
    const r2 = rankear([{ fonte, itens }], CONFIG_CURADORIA, ['https://exemplo.com/a'], agora);
    assert.equal(r2.length, 0);
  });
  test('escolher mantém um candidato por veículo', () => {
    const c = (id: string, pontos: number): Candidato => ({ fonte: { ...fonte, id }, item: lerRss(RSS)[0], pontos });
    const e = escolher([c('conjur', 9), c('conjur-advocacia', 8), c('jota', 7), c('oab', 6)], 3);
    assert.deepEqual(e.map((x) => x.fonte.id), ['conjur', 'jota', 'oab']);
  });
});

const palavras = (n: number, base = 'palavra') => Array.from({ length: n }, (_, i) => `${base}${i}`).join(' ');

function artigoValido(over: Partial<Record<string, unknown>> = {}) {
  return ArtigoGerado.parse({
    relevante: true,
    utilidade: 4,
    motivo: 'ok',
    titulo: 'Prazo recursal em dias úteis exige ajuste de agenda',
    descricao: 'Entenda o que muda na contagem do prazo para recurso e como ajustar a agenda do escritório com segurança, passo a passo.',
    alt_imagem: 'Advogado confere prazos em um notebook sobre a mesa de um escritório de advocacia iluminado',
    prompt_imagem: 'A lawyer reviewing deadlines on a laptop in a bright Brazilian law office',
    categoria: 'Prazos e processos',
    resumo: 'A contagem passa a ser em dias úteis. Revise a agenda do escritório.',
    secoes: [
      { titulo: 'O que aconteceu', paragrafos: [palavras(90, 'fato'), palavras(90, 'fato2')] },
      { titulo: 'Impacto para o escritório', paragrafos: [palavras(90, 'impacto'), palavras(90, 'impacto2')], lista: ['a', 'b'] },
      { titulo: 'Checklist prático', paragrafos: [palavras(90, 'passo')], lista: ['c', 'd'] },
    ],
    faq: [{ q: 'Muda o prazo?', a: 'Sim, conforme a matéria.' }],
    ...over,
  });
}
const candidato = (): Candidato => ({ fonte, item: lerRss(RSS)[0], pontos: 5 });

describe('redator', () => {
  test('artigo válido passa na validação', () => {
    assert.deepEqual(validar(artigoValido(), candidato()), []);
  });
  test('rejeita promessa vedada pela OAB, clichê, título igual e tamanho', () => {
    const c = candidato();
    assert.ok(validar(artigoValido({ resumo: 'Resultado garantido e causa ganha.' }), c).some((e) => e.includes('OAB')));
    assert.ok(validar(artigoValido({ resumo: 'É fundamental revisar a agenda.' }), c).some((e) => e.includes('clichês')));
    assert.ok(validar(artigoValido({ titulo: c.item.titulo }), c).length > 0);
    assert.ok(validar(artigoValido({ descricao: 'curta' }), c).some((e) => e.includes('descricao')));
    assert.ok(validar(artigoValido({ secoes: [{ titulo: 'x', paragrafos: ['y'], lista: [] }] }), c).length > 0);
  });
  test('detecta cópia de 7 palavras seguidas do original', () => {
    const orig = 'o tribunal definiu que o prazo para recurso passa a contar';
    assert.ok(trechosCopiados(orig, 'xx o tribunal definiu que o prazo para recurso yy').length >= 1);
    assert.equal(trechosCopiados(orig, 'texto totalmente diferente aqui').length, 0);
  });
  test('extrairJson aceita cerca ```json', () => {
    assert.deepEqual(extrairJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.throws(() => extrairJson('sem json'));
  });
  test('redigir: aprova na 1ª tentativa e acumula tokens', async () => {
    const respostas = [JSON.stringify(artigoValido()), JSON.stringify({ aprovado: true, experiencia: 5, confianca: 5, intencao: 5, correcoes: [] })];
    const cliente: ClienteIA = { gerar: async () => ({ texto: respostas.shift() ?? null, usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    const r = await redigir(candidato(), { cliente });
    assert.ok(r.ok);
    assert.equal(r.tokens.length, 2);
  });
  test('redigir: reescreve uma vez com feedback e depois reprova', async () => {
    let chamadas = 0;
    const ruim = JSON.stringify(artigoValido({ resumo: 'Sucesso garantido.' }));
    const cliente: ClienteIA = { gerar: async () => ({ texto: (chamadas++, ruim) }) };
    const r = await redigir(candidato(), { cliente, auditar: false });
    assert.ok(!r.ok);
    assert.equal(chamadas, 2);
  });
  test('redigir: descarta irrelevante, utilidade baixa e JSON inválido', async () => {
    const mk = (texto: string): ClienteIA => ({ gerar: async () => ({ texto }) });
    const irrelevante = await redigir(candidato(), { cliente: mk(JSON.stringify(artigoValido({ relevante: false, motivo: 'fora do tema' }))) });
    assert.ok(!irrelevante.ok && irrelevante.motivo.includes('fora do tema'));
    const baixa = await redigir(candidato(), { cliente: mk(JSON.stringify(artigoValido({ utilidade: 2 }))) });
    assert.ok(!baixa.ok && baixa.motivo.includes('utilidade'));
    const invalido = await redigir(candidato(), { cliente: mk('não é json') });
    assert.ok(!invalido.ok && invalido.motivo.includes('JSON'));
  });
  test('slug e montarArtigo preservam a fonte citada', () => {
    assert.equal(slugificar('Prazo Recursal: Ação & Cálculo!'), 'prazo-recursal-acao-calculo');
    const a = montarArtigo(candidato(), artigoValido());
    assert.equal(a.origem.url, candidato().item.link);
    assert.equal(a.fontes[0].url, candidato().item.link);
    assert.equal(a.origem.veiculo, 'Consultor Jurídico');
  });
});

describe('imagem', () => {
  test('prompt proíbe texto e rostos', () => {
    const p = promptDaImagem('A lawyer at a desk', 'Título');
    assert.match(p, /NO text/);
    assert.match(p, /A lawyer at a desk/);
  });
});
