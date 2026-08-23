// ===========================================================================
// Fase 5A — testes da busca ao vivo de jurisprudência (jurisprudenciaRag):
// chamada com tribunal mapeado, includeJurisprudence=false não chama, fallback
// best-effort, limite de decisões/tamanho, cache por escritório.
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarJurisprudenciaSeNecessario,
  tribunalParaArea,
  extrairTermosDeBusca,
  montarBlocoJurisprudencia,
  limparCache,
  cacheSize,
} from '../services/jurisprudenciaRag.js';

function decisao(numero: string, texto: string): Record<string, unknown> {
  return {
    process_number: numero,
    rapporteur: 'Min. Fulano',
    adjudicating_body: 'T1',
    publication_date: '2026-01-10',
    court: 'stj',
    excerpt: texto,
  };
}

const logs: string[] = [];
function logFn(msg: string): void {
  logs.push(msg);
}

before(() => {
  limparCache();
  logs.length = 0;
});
after(() => {
  limparCache();
});

describe('tribunalParaArea', () => {
  test('mapeia áreas canônicas para tribunais', () => {
    assert.equal(tribunalParaArea('Trabalhista'), 'tst');
    assert.equal(tribunalParaArea('Cível'), 'stj');
    assert.equal(tribunalParaArea('Tributário'), 'stj');
    assert.equal(tribunalParaArea('DIREITO_CIVIL'), 'stj');
  });

  test('usa STJ como padrão para área desconhecida ou vazia', () => {
    assert.equal(tribunalParaArea('Espacial'), 'stj');
    assert.equal(tribunalParaArea(null), 'stj');
    assert.equal(tribunalParaArea(undefined), 'stj');
    assert.equal(tribunalParaArea(''), 'stj');
  });
});

describe('extrairTermosDeBusca', () => {
  test('extrai termos significativos dos fatos', () => {
    const termos = extrairTermosDeBusca('O consumidor pediu danos morais por atraso na entrega do produto');
    assert.ok(termos.includes('consumidor'));
    assert.ok(termos.includes('danos'));
    assert.ok(termos.includes('morais'));
    assert.ok(termos.length <= 8);
  });

  test('remove stopwords e palavras curtas', () => {
    const termos = extrairTermosDeBusca('O e de um para no na com sem as os');
    assert.equal(termos.length, 0);
  });

  test('limita ao máximo de termos', () => {
    const termos = extrairTermosDeBusca('primeiro segundo terceiro quarto quinto sexto setimo oitavo nono decimo undecimo', 4);
    assert.equal(termos.length, 4);
  });
});

describe('montarBlocoJurisprudencia', () => {
  test('formata com fonte rastreável (tribunal, relator, processo, data)', () => {
    const bloco = montarBlocoJurisprudencia([decisao('123', 'Atraso na entrega gera dano moral.')]);
    assert.ok(bloco.includes('JURISPRUDÊNCIAS RELEVANTES'));
    assert.ok(bloco.includes('Tribunal: stj'));
    assert.ok(bloco.includes('Relator: Min. Fulano'));
    assert.ok(bloco.includes('Processo: 123'));
    assert.ok(bloco.includes('Data: 2026-01-10'));
  });

  test('limita a 5 decisões', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => decisao(String(i), `Decisão ${i}.`));
    const bloco = montarBlocoJurisprudencia(muitas);
    const ocorrencias = (bloco.match(/Decisão \d/g) ?? []).length;
    assert.ok(ocorrencias <= 5, `máximo 5 decisões (veio ${ocorrencias})`);
  });

  test('retorna vazio quando não há decisões formatáveis', () => {
    assert.equal(montarBlocoJurisprudencia([]), '');
    assert.equal(montarBlocoJurisprudencia([{ process_number: 'x' }]), '');
  });
});

describe('buscarJurisprudenciaSeNecessario (fluxo)', () => {
  test('includeJurisprudence=true chama a API com tribunal mapeado e termos extraídos', async () => {
    let chamadas = 0;
    let args: { court?: string; q?: string } = {};
    const mock = async (court: string, query: string) => {
      chamadas += 1;
      args = { court, q: query };
      return { data: [decisao('1', 'Atraso na entrega gera dano moral.')], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const bloco = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      area: 'Trabalhista',
      fatos: 'Atraso na entrega causou danos morais ao consumidor',
      escritorioId: 'esc-1',
      searchOverride: mock as never,
      log: logFn,
    });
    assert.equal(chamadas, 1, 'chamou a API uma vez');
    assert.equal(args.court, 'tst', 'tribunal mapeado da área trabalhista');
    assert.ok((args.q ?? '').includes('atraso'), 'termos extraídos na query');
    assert.ok(bloco.includes('JURISPRUDÊNCIAS RELEVANTES'), 'bloco injetado');
  });

  test('includeJurisprudence=false NÃO chama a API', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const bloco = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: false,
      fatos: 'qualquer coisa',
      escritorioId: 'esc-1',
      searchOverride: mock as never,
    });
    assert.equal(chamadas, 0, 'zero chamadas');
    assert.equal(bloco, '');
  });

  test('SECTION_REVIEW não busca ao vivo mesmo com includeJurisprudence=true', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      sectionReview: true,
      fatos: 'x',
      escritorioId: 'esc-1',
      searchOverride: mock as never,
    });
    assert.equal(chamadas, 0);
  });

  test('fallback best-effort: API indisponível → retorna vazio e registra aviso', async () => {
    const mock = async () => {
      throw new Error('API fora do ar');
    };
    const bloco = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'teste de fallback com termos suficientes',
      escritorioId: 'esc-1',
      searchOverride: mock as never,
      log: logFn,
    });
    assert.equal(bloco, '', 'best-effort: segue só com RAG');
    assert.ok(logs.some((l) => l.includes('indisponível')), 'registrou aviso no log');
  });

  test('cache por escritório: segunda busca igual não chama a API', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [decisao('9', 'Ementa cacheada.')], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const input = {
      includeJurisprudence: true,
      area: 'Cível',
      fatos: 'Vício oculto em produto gera dano ao consumidor',
      escritorioId: 'esc-cache',
      searchOverride: mock as never,
    };
    const b1 = await buscarJurisprudenciaSeNecessario(input);
    const b2 = await buscarJurisprudenciaSeNecessario(input);
    assert.equal(chamadas, 1, 'segunda busca veio do cache (zero chamadas novas)');
    assert.ok(b1 && b2, 'ambos os blocos preenchidos');
    assert.ok(cacheSize() >= 1, 'cache populado');
  });
});
