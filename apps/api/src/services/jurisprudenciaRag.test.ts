// ===========================================================================
// Fases 5A–5D — testes da busca ao vivo de jurisprudência (jurisprudenciaRag):
// tribunal mapeado, includeJurisprudence=false não chama, fallback best-effort,
// limite de decisões/tamanho, cache por escritório, rate limit, bloco rastreável
// separado do RAG e erros genéricos.
// ===========================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarJurisprudenciaSeNecessario,
  tribunalParaArea,
  extrairTermosDeBusca,
  montarBlocoJurisprudencia,
  anexarBlocoAoContexto,
  INSTRUCAO_FUNDAMENTACAO,
  registrarRateLimit,
  rateLimitPausado,
  normalizarResetMs,
  limparRateLimit,
  limparCache,
  cacheSize,
  type RastreabilidadeJurisprudencia,
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
  limparRateLimit();
  logs.length = 0;
});
after(() => {
  limparCache();
  limparRateLimit();
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

describe('montarBlocoJurisprudencia (fase 5B)', () => {
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

describe('anexarBlocoAoContexto (fase 5B)', () => {
  test('separa o bloco do RAG local com marcador claro', () => {
    const contexto = anexarBlocoAoContexto('chunk do RAG local', 'JURISPRUDÊNCIAS RELEVANTES (fontes rastreáveis):\n- ementa');
    assert.ok(contexto.includes('chunk do RAG local'));
    assert.ok(contexto.includes('--- JURISPRUDÊNCIA AO VIVO (separada do RAG local) ---'), 'separador claro');
    assert.ok(contexto.includes('ementa'));
  });

  test('mantém a instrução de fundamentação exclusiva ao contexto', () => {
    const contexto = anexarBlocoAoContexto('rag', 'bloco');
    assert.ok(contexto.includes(INSTRUCAO_FUNDAMENTACAO), 'instrução presente');
    assert.ok(contexto.includes('EXCLUSIVAMENTE'), 'fundamentação exclusiva');
  });

  test('sem bloco retorna só o RAG (sem separador nem instrução duplicada)', () => {
    const contexto = anexarBlocoAoContexto('só rag', '');
    assert.equal(contexto, 'só rag');
  });
});

describe('rate limit (fase 5C)', () => {
  test('headers com poucas requisições restantes pausam NOVAS buscas, mas cache continua servido', async () => {
    limparRateLimit();
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [decisao('1', 'Ementa RL.')], meta: { page: 0, per_page: 10, has_next_page: false }, rateLimit: { limit: '10', remaining: '1', reset: '60' } };
    };
    const input = {
      includeJurisprudence: true,
      fatos: 'rate limit baixo testa pausa de busca ao vivo',
      escritorioId: 'esc-rl',
      searchOverride: mock as never,
    };
    // 1ª chamada: registra rate limit baixo (remaining=1) e retorna bloco.
    const r1 = await buscarJurisprudenciaSeNecessario(input);
    assert.ok(r1.bloco.includes('JURISPRUDÊNCIAS'), '1ª chamada retorna bloco');
    assert.equal(chamadas, 1);
    // 2ª chamada (mesmo tenant/tribunal/termos): cache ANTES da pausa → bloco servido SEM chamada.
    const r2 = await buscarJurisprudenciaSeNecessario(input);
    assert.equal(chamadas, 1, 'cache servido mesmo durante pausa de rate limit');
    assert.ok(r2.bloco.includes('JURISPRUDÊNCIAS'), 'cache reutilizado durante pausa');
    assert.equal(r2.fromCache, true, 'veio do cache');
    assert.ok(rateLimitPausado('esc-rl'), 'estado de pausa registrado');
    // 3ª chamada com termos DIFERENTES (cache miss) → pausa bloqueia nova busca.
    const r3 = await buscarJurisprudenciaSeNecessario({ ...input, fatos: 'termos totalmente diferentes de busca ao vivo' });
    assert.equal(chamadas, 1, 'pausa bloqueia nova busca ao vivo (cache miss)');
    assert.equal(r3.bloco, '', 'cache miss durante pausa → fallback RAG');
  });

  test('provedor retorna 429 → registra pausa e NÃO falha a geração', async () => {
    limparRateLimit();
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      throw new Error('HTTP 429 too many requests');
    };
    const r1 = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'cenario de rate limit 429 do provedor',
      escritorioId: 'esc-429',
      searchOverride: mock as never,
    });
    assert.equal(r1.bloco, '', '429 → fallback RAG (não falha)');
    assert.ok(rateLimitPausado('esc-429'), '429 registra pausa para novas buscas');
    // Segunda tentativa com termos diferentes → pausada (sem nova chamada).
    await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'outra busca diferente para confirmar pausa apos 429',
      escritorioId: 'esc-429',
      searchOverride: mock as never,
    });
    assert.equal(chamadas, 1, 'após 429, novas buscas pausadas (sem chamada)');
  });

  test('escritórios diferentes não compartilham pausa de rate limit', () => {
    limparRateLimit();
    registrarRateLimit('esc-A', { remaining: '1', reset: '60' });
    assert.equal(rateLimitPausado('esc-A'), true, 'A pausado');
    assert.equal(rateLimitPausado('esc-B'), false, 'B não pausado (isolado por tenant)');
  });

  test('rate limit com remaining alto não pausa', () => {
    limparRateLimit();
    registrarRateLimit('esc-C', { remaining: '50', reset: '60' });
    assert.equal(rateLimitPausado('esc-C'), false);
  });

  test('normalizarResetMs: relativo em segundos, epoch e ISO viram duração ms', () => {
    // Relativo em segundos (padrão X-RateLimit-Reset): "60" = pausar ~60s.
    const rel = normalizarResetMs('60');
    assert.ok(rel != null && rel >= 59_000 && rel <= 61_000, `reset relativo "60" ≈ 60s (veio ${rel})`);
    // "60000" = 60.000 SEGUNDOS relativos (16,6h) — consistente com o padrão.
    const relS = normalizarResetMs('60000');
    assert.ok(relS != null && relS >= 59_999_000 && relS <= 60_001_000, `"60000" ≈ 60.000s (veio ${relS})`);
    // Epoch em segundos → duração até o instante (não pode ser negativo).
    const epoch = normalizarResetMs(String(Math.floor(Date.now() / 1000) + 120));
    assert.ok(epoch != null && epoch >= 100_000, `epoch futuro ≈ 120s (veio ${epoch})`);
    // ISO futuro → duração positiva.
    const iso = normalizarResetMs(new Date(Date.now() + 60_000).toISOString());
    assert.ok(iso != null && iso >= 50_000 && iso <= 70_000, `ISO ≈ 60s (veio ${iso})`);
    // Indeterminados.
    assert.equal(normalizarResetMs(null), null);
    assert.equal(normalizarResetMs(''), null);
  });

  test('rate limit 429 representado por objeto com statusCode (sem "429" na mensagem)', async () => {
    limparRateLimit();
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      const err = new Error('provedor recusou a requisição');
      (err as { statusCode?: number }).statusCode = 429;
      throw err;
    };
    const r1 = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'rate limit via statusCode 429 sem texto',
      escritorioId: 'esc-429obj',
      searchOverride: mock as never,
    });
    assert.equal(r1.bloco, '', '429 por objeto → fallback RAG');
    assert.ok(rateLimitPausado('esc-429obj'), '429 por objeto registra pausa');
    // Segunda busca com termos diferentes → pausada (sem nova chamada).
    await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'outros termos para confirmar pausa apos 429 por objeto',
      escritorioId: 'esc-429obj',
      searchOverride: mock as never,
    });
    assert.equal(chamadas, 1, 'após 429 (objeto), novas buscas pausadas');
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
    const r = await buscarJurisprudenciaSeNecessario({
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
    assert.ok(r.bloco.includes('JURISPRUDÊNCIAS RELEVANTES'), 'bloco injetado');
    assert.equal(r.decisoesUsadas, 1, 'rastreabilidade: 1 decisão usada (5D)');
    assert.deepEqual(r.tribunais, ['tst'], 'rastreabilidade: tribunal de origem (5D)');
  });

  test('includeJurisprudence=false NÃO chama a API', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const r = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: false,
      fatos: 'qualquer coisa',
      escritorioId: 'esc-1',
      searchOverride: mock as never,
    });
    assert.equal(chamadas, 0, 'zero chamadas');
    assert.equal(r.bloco, '');
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

  test('fallback best-effort: API indisponível → retorna vazio e loga mensagem GENÉRICA (5D)', async () => {
    const mock = async () => {
      throw new Error('detalhe interno do provedor: api-key-12345 inválida');
    };
    const r = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'teste de fallback com termos suficientes',
      escritorioId: 'esc-1',
      searchOverride: mock as never,
      log: logFn,
    });
    assert.equal(r.bloco, '', 'best-effort: segue só com RAG');
    assert.ok(!r.bloco.includes('api-key'), 'detalhe interno NÃO vaza no retorno');
    assert.ok(logs.some((l) => l.includes('indisponível') && !l.includes('api-key')), 'log genérico sem detalhe interno');
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
    assert.ok(b1.bloco && b2.bloco, 'ambos os blocos preenchidos');
    assert.equal(b2.fromCache, true, 'segunda veio do cache (rastreabilidade)');
    assert.ok(cacheSize() >= 1, 'cache populado');
  });

  test('cache é isolado por escritório (tenancy)', async () => {
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [decisao('7', 'Ementa tenancy.')], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const base = { includeJurisprudence: true, area: 'Cível', fatos: 'violação contratual gera reparação ao consumidor', searchOverride: mock as never };
    await buscarJurisprudenciaSeNecessario({ ...base, escritorioId: 'esc-T1' });
    await buscarJurisprudenciaSeNecessario({ ...base, escritorioId: 'esc-T2' });
    assert.equal(chamadas, 2, 'escritórios diferentes não compartilham cache');
  });
});

// ---------------------------------------------------------------------------
// Fase 6A — Rastreabilidade persistida (metadados de auditoria em cada caminho)
// ---------------------------------------------------------------------------

describe('rastreabilidade persistida (fase 6A)', () => {
  let metas: RastreabilidadeJurisprudencia[] = [];
  function coletor(meta: RastreabilidadeJurisprudencia): void {
    metas.push(meta);
  }

  before(() => {
    limparCache();
    limparRateLimit();
  });
  after(() => {
    limparCache();
    limparRateLimit();
    metas = [];
  });

  test('busca ao vivo registra origem, tribunal, termos, decisões e tenant', async () => {
    metas = [];
    const mock = async () => ({ data: [decisao('11', 'Ementa rastreável.')], meta: { page: 0, per_page: 10, has_next_page: false }, rateLimit: { limit: '5', remaining: '4', reset: '60' } });
    const r = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      area: 'Cível',
      fatos: 'negativa indevida de cobertura gera dano moral ao consumidor',
      escritorioId: 'esc-6a',
      usuarioId: 'user-1',
      operationId: 'op-1',
      operation: 'SIMPLE_PETITION',
      searchOverride: mock as never,
      rastreabilidade: coletor,
    });
    assert.equal(r.origem, 'ao-vivo');
    assert.equal(metas.length, 1, 'um registro de auditoria por geração');
    const m = metas[0];
    assert.equal(m.escritorioId, 'esc-6a');
    assert.equal(m.usuarioId, 'user-1');
    assert.equal(m.operationId, 'op-1');
    assert.equal(m.operation, 'SIMPLE_PETITION');
    assert.equal(m.tribunal, 'stj');
    assert.equal(m.origem, 'ao-vivo');
    assert.ok((m.termos as string[]).length > 0, 'termos de busca presentes');
    assert.equal(m.decisoesUsadas, 1);
    assert.equal(m.rateLimitRestante, 4, 'rate limit restante observado');
  });

  test('cache registra origem cache (sem chamada à API)', async () => {
    metas = [];
    let chamadas = 0;
    const mock = async () => {
      chamadas += 1;
      return { data: [decisao('12', 'Ementa de cache.')], meta: { page: 0, per_page: 10, has_next_page: false } };
    };
    const input = {
      includeJurisprudence: true,
      area: 'Cível',
      fatos: 'rescisão contratual abusiva gera indenização ao consumidor',
      escritorioId: 'esc-6a-cache',
      searchOverride: mock as never,
      rastreabilidade: coletor,
    };
    await buscarJurisprudenciaSeNecessario(input);
    metas = [];
    const r2 = await buscarJurisprudenciaSeNecessario(input);
    assert.equal(r2.origem, 'cache');
    assert.equal(chamadas, 1, 'segunda veio do cache');
    assert.equal(metas.length, 1);
    assert.equal(metas[0].origem, 'cache');
    assert.equal(metas[0].decisoesUsadas, 1);
  });

  test('falha do provedor registra origem falha sem vazar detalhe interno', async () => {
    metas = [];
    const mock = async () => { throw new Error('chave inválida abc123'); };
    const r = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'falha controlada testa rastreabilidade de erro',
      escritorioId: 'esc-6a-falha',
      searchOverride: mock as never,
      rastreabilidade: coletor,
    });
    assert.equal(r.origem, 'falha');
    assert.equal(r.bloco, '');
    assert.equal(metas.length, 1);
    assert.equal(metas[0].origem, 'falha');
    assert.equal(metas[0].decisoesUsadas, 0);
    assert.ok(!JSON.stringify(metas[0]).includes('abc123'), 'detalhe interno do provedor não persiste');
  });

  test('sem termos, sem inclusão e section review registram motivos correspondentes', async () => {
    metas = [];
    // Sem termos (fatos só com stopwords/palavras curtas).
    await buscarJurisprudenciaSeNecessario({ includeJurisprudence: true, fatos: 'o e de um a', escritorioId: 'esc-6a-termos', rastreabilidade: coletor });
    assert.equal(metas[0].origem, 'sem-termos');

    metas = [];
    await buscarJurisprudenciaSeNecessario({ includeJurisprudence: false, fatos: 'qualquer coisa relevante aqui', escritorioId: 'esc-6a-inc', rastreabilidade: coletor });
    assert.equal(metas[0].origem, 'sem-inclusao');

    metas = [];
    await buscarJurisprudenciaSeNecessario({ includeJurisprudence: true, sectionReview: true, fatos: 'qualquer coisa relevante aqui', escritorioId: 'esc-6a-sr', rastreabilidade: coletor });
    assert.equal(metas[0].origem, 'section-review');
  });

  test('pausa de rate limit registra origem pausa', async () => {
    metas = [];
    limparRateLimit();
    registrarRateLimit('esc-6a-pausa', { remaining: '1', reset: '60' });
    const r = await buscarJurisprudenciaSeNecessario({
      includeJurisprudence: true,
      fatos: 'nova busca durante pausa de rate limit registra motivo',
      escritorioId: 'esc-6a-pausa',
      rastreabilidade: coletor,
    });
    assert.equal(r.origem, 'pausa');
    assert.equal(metas[0].origem, 'pausa');
  });
});
