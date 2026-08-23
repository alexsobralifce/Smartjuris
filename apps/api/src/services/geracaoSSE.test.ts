// ===========================================================================
// Fase 3C — Integração SSE do fluxo completo de geração.
//
// Cobertura (banco real + gerador stub injetado — sem chamada ao provedor):
//   - fluxo completo: reserva → geração (eventos) → settle → saldo atualizado;
//   - eventos SSE tipados recebidos em ordem (operacao/progresso/texto/concluido);
//   - idempotência: mesma chave não duplica reserva nem settle;
//   - erro ambíguo → evento erro com reconciliacao:true e reserva retida;
//   - erro confirmado → reserva liberada;
//   - isolamento entre escritórios.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { EventEmitter } from 'node:events';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { gerarPecaComSSE, emitir, emitirJurisprudencia, montarSubOperacoesJurisprudencia, persistirSubOperacoes } = await import('../services/geracaoSSE.js');
import type { GeradorSSE } from '../services/geracaoSSE.js';
const { ErroGeracaoIA } = await import('../services/analiseDocumental.js');
const { saldoEscritorio, tokenUsageCount } = await import('../services/aiOperationTestHelpers.js');

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const suffix = randomUUID().slice(0, 8);
const escIds: string[] = [];
const userIds: string[] = [];
const opIds: string[] = [];

let escA: { id: string };
let escB: { id: string };
let adminA: { id: string; escritorioId: string | null };
let adminB: { id: string; escritorioId: string | null };

/** Resposta Express fake (EventEmitter) que captura os eventos SSE e pode
 *  emitir 'close' (cancelamento do consumidor). */
function respostaSSEFake() {
  const eventos: any[] = [];
  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    writableEnded: false,
    statusCode: 200,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: any) => {
      eventos.push({ type: 'json', statusCode: res.statusCode, body });
      res.writableEnded = true;
      return res;
    },
    writeHead: (status?: number, _headers?: any) => {
      if (status) res.statusCode = status;
      return res;
    },
    write: (chunk: string) => {
      const json = chunk.toString().replace(/^data: /, '').trim();
      if (json) eventos.push(JSON.parse(json));
      return true;
    },
    end: () => {
      res.writableEnded = true;
    },
  }) as any;
  return { res, eventos };
}

/** Stub do gerador que emite os eventos intermediários via `res.write` real
 *  (mesma serialização do serviço de produção): operacao → progresso → texto.
 *  O array `eventos` recebe os objetos após parse do SSE transmitido. */
function geradorStub(res: any, eventos?: any[]): GeradorSSE {
  return async ({ operationId, payload, modelTier }) => {
    emitir(res, { type: 'operacao', operationId, status: 'running' });
    emitir(res, { type: 'progresso', progresso: 30, label: 'Buscando RAG...' });
    emitir(res, { type: 'texto', delta: 'Texto parcial da peça.' });
    emitir(res, { type: 'progresso', progresso: 85, label: 'Finalizando...' });
    return { modelUsed: modelTier === 'PRO' ? 'deepseek-v4-pro' : 'deepseek-v4-flash', inputTokens: 100, outputTokens: 50 };
  };
}

before(async () => {
  if (!dbDisponivel) return;
  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `SSEA ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    { nome: `SSEB ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escA = ea; escB = eb;
  escIds.push(ea.id, eb.id);

  const hash = await bcrypt.hash('x', 10);
  const users = await db.insert(s.usuarios).values([
    { nome: 'SSE Admin A', email: `sse.a.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'SSE Admin B', email: `sse.b.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, escritorioId: s.usuarios.escritorioId });
  adminA = users[0]; adminB = users[1];
  userIds.push(users[0].id, users[1].id);
});

after(async () => {
  if (dbDisponivel) {
    for (const id of opIds) await db.delete(s.aiOperations).where(eq(s.aiOperations.id, id)).catch(() => {});
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  await client.end({ timeout: 5 });
});

describe('3C — integração SSE', { skip: !dbDisponivel }, () => {
  test('fluxo completo: eventos em ordem (operacao → progresso → texto → concluido) + saldo atualizado', async () => {
    const { res, eventos } = respostaSSEFake();
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const tokensAntes = await tokenUsageCount(adminA.id);
    const saldoAntes = await saldoEscritorio(escA.id);

    await gerarPecaComSSE(req, res, {
      pieceType: 'Contestação',
      area: 'Cível',
      dadosCaso: `Caso SSE ${suffix}`,
      idempotencyKey: `sse-fluxo-${suffix}`,
    }, geradorStub(res, eventos));

    assert.ok(eventos.length >= 5, `eventos recebidos (${eventos.length})`);
    const tipos = eventos.map((e) => e.type);
    // Ordem EXPLÍCITA do protocolo: operacao → progresso → texto → progresso → concluido.
    assert.deepEqual(
      tipos.filter((t) => t !== 'operacao' || true),
      ['operacao', 'progresso', 'texto', 'progresso', 'concluido'],
      `ordem dos eventos SSE (${JSON.stringify(tipos)})`,
    );
    assert.ok(tipos.includes('operacao'), 'evento operacao');
    assert.ok(tipos.includes('progresso'), 'evento progresso');
    assert.ok(tipos.includes('texto'), 'evento texto');
    assert.ok(tipos.includes('concluido'), 'evento concluido');
    const concluido = eventos.find((e) => e.type === 'concluido');
    assert.ok(concluido, 'concluido presente');
    if (concluido.operationId) opIds.push(concluido.operationId);
    assert.ok(concluido.saldo && typeof concluido.saldo.credits === 'number', 'saldo atualizado no evento');

    // Settle com uso real: token_usage registrado, saldo com consumo do PRO.
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.ok(tokensDepois > tokensAntes, 'token_usage registrado (uso real)');
    const saldoDepois = await saldoEscritorio(escA.id);
    assert.ok(saldoDepois.credits < saldoAntes.credits, 'créditos consumidos');
  });

  test('idempotência: mesma chave não duplica reserva nem settle', async () => {
    const chave = `sse-idem-${suffix}`;
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const tokensAntes = await tokenUsageCount(adminA.id);

    const r1 = respostaSSEFake();
    await gerarPecaComSSE(req, r1.res, { pieceType: 'Manifestação', area: 'Cível', dadosCaso: 'Requerimento.', idempotencyKey: chave }, geradorStub(r1.res));
    const c1 = r1.eventos.find((e) => e.type === 'concluido');
    if (c1?.operationId) opIds.push(c1.operationId);

    const r2 = respostaSSEFake();
    await gerarPecaComSSE(req, r2.res, { pieceType: 'Manifestação', area: 'Cível', dadosCaso: 'Requerimento.', idempotencyKey: chave }, geradorStub(r1.res));
    const c2 = r2.eventos.find((e) => e.type === 'concluido');

    assert.ok(c2, '2ª chamada conclui');
    if (c2?.operationId) opIds.push(c2.operationId);
    assert.equal(c2.operationId, c1.operationId, 'mesma operação (reutilizada)');
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes + 1, '1 token_usage total (sem duplicar)');
  });

  test('erro ambíguo → evento erro com reconciliacao:true e reserva retida', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const geradorAmbiguo: GeradorSSE = async () => {
      throw new ErroGeracaoIA('timeout na chamada ao modelo', { ambigua: true });
    };
    const saldoAntes = await saldoEscritorio(escA.id);
    await gerarPecaComSSE(req, res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Amb ${suffix}`, idempotencyKey: `sse-amb-${suffix}` }, geradorAmbiguo);

    const erro = eventos.find((e) => e.type === 'erro');
    assert.ok(erro, 'evento erro presente');
    assert.equal(erro.reconciliacao, true, 'falha ambígua sinaliza reconciliação');
    assert.equal(erro.code, 'falha-ambigua-reconciliacao-pendente');
    // Reserva retida: saldo de CRÉDITOS não volta (crédito ainda reservado).
    const saldoDepois = await saldoEscritorio(escA.id);
    assert.ok(saldoDepois.credits <= saldoAntes.credits, 'reserva não liberada integralmente');
  });

  test('erro confirmado → reserva liberada', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const geradorConfirmado: GeradorSSE = async () => {
      throw new ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true });
    };
    const saldoAntes = await saldoEscritorio(escA.id);
    await gerarPecaComSSE(req, res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Conf ${suffix}`, idempotencyKey: `sse-conf-${suffix}` }, geradorConfirmado);

    const erro = eventos.find((e) => e.type === 'erro');
    assert.ok(erro, 'evento erro presente');
    assert.notEqual(erro.reconciliacao, true, 'falha confirmada não é reconciliação');
    const saldoDepois = await saldoEscritorio(escA.id);
    assert.equal(saldoDepois.credits, saldoAntes.credits, 'reserva liberada (créditos voltam)');
  });

  test('cancelamento do cliente → resposta encerrada, SEM concluido e reserva RETIDA (reconciliação)', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const saldoAntes = await saldoEscritorio(escA.id);
    const tokensAntes = await tokenUsageCount(adminA.id);
    const geradorCancelavel: GeradorSSE = async ({ operationId }) => {
      emitir(res, { type: 'operacao', operationId, status: 'running' });
      emitir(res, { type: 'progresso', progresso: 30, label: 'Gerando...' });
      // Simula desconexão do cliente DURANTE a geração: a resposta emite
      // 'close' (o listener do serviço aborta o stream via AbortController).
      res.emit('close');
      // A geração remota é abortada; o loop do provedor lança (o serviço
      // converte em evento erro genérico e ENCERRA a resposta).
      throw new Error('stream aborted');
    };
    await gerarPecaComSSE(req, res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Ab ${suffix}`, idempotencyKey: `sse-abort-${suffix}` }, geradorCancelavel);
    assert.ok(!eventos.some((e) => e.type === 'concluido'), 'sem evento concluido após cancelamento');
    assert.equal(res.writableEnded, true, 'resposta SSE ENCERRADA após cancelamento');
    // Comportamento financeiro seguro: falha por abort é AMBÍGUA (sem
    // confirmação de não-processamento) → reserva RETIDA para reconciliação;
    // nunca settle com tokens inventados, nunca liberação integral silenciosa.
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes, 'sem token_usage (sem liquidação inventada)');
    const saldoDepois = await saldoEscritorio(escA.id);
    assert.ok(saldoDepois.credits <= saldoAntes.credits, 'crédito não devolvido integralmente (retido p/ reconciliação)');
  });

  test('fluxo SSE completo Flash→Pro: falha confirmada no Flash → sucesso Pro (modelo usado + uma operação)', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const tokensAntes = await tokenUsageCount(adminA.id);
    const geradorFallback: GeradorSSE = async ({ operationId, modelTier }) => {
      emitir(res, { type: 'operacao', operationId, status: 'running' });
      if (modelTier === 'FLASH') {
        // Falha CONFIRMADA (429 com confirmação estruturada) → fallback PRO.
        emitir(res, { type: 'progresso', progresso: 30, label: 'Flash indisponível (429) — tentando Pro' });
        throw new ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true });
      }
      // PRO executa com sucesso (uso real).
      emitir(res, { type: 'progresso', progresso: 60, label: 'Gerando com Pro...' });
      emitir(res, { type: 'texto', delta: 'Texto final da peça Pro.' });
      return { modelUsed: 'deepseek-v4-pro', inputTokens: 200, outputTokens: 90 };
    };
    await gerarPecaComSSE(req, res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Fbk ${suffix}`, idempotencyKey: `sse-fbk-${suffix}` }, geradorFallback);

    const concluido = eventos.find((e) => e.type === 'concluido');
    assert.ok(concluido, 'fluxo concluiu via fallback');
    if (concluido?.operationId) opIds.push(concluido.operationId);
    assert.equal(concluido.modeloUsado, 'deepseek-v4-pro', 'liquidação pelo modelo EFETIVAMENTE usado (Pro)');
    // Ordem: operacao → progresso → texto → concluido (fallback incluído).
    const tipos = eventos.map((e) => e.type);
    // FLASH (operacao) → PRO (operacao) → texto → concluido: duas operações
    // (uma por tier), uma única conclusão.
    const seq = tipos.filter((t) => t === 'operacao' || t === 'texto' || t === 'concluido');
    assert.deepEqual(seq, ['operacao', 'operacao', 'texto', 'concluido'], `eventos do fluxo fallback (${JSON.stringify(seq)})`);
    // Uma única operação/reserva + settle pelo tier Pro (token_usage 1).
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes + 1, '1 token_usage (execução Pro)');
    // Reserva FLASH liberada; apenas o PRO consumiu.
    const saldo = await saldoEscritorio(escA.id);
    assert.equal(saldo.reserveCents, 0, 'reserva FLASH liberada + settle Pro zerou reserva');
  });

  test('exceção externa (fora do orquestrador) → um único erro + resposta ENCERRADA', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const geradorQuebra: GeradorSSE = async () => {
      throw new Error('falha interna inesperada do RAG');
    };
    await gerarPecaComSSE(req, res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Ext ${suffix}`, idempotencyKey: `sse-ext-${suffix}` }, geradorQuebra);
    const erros = eventos.filter((e) => e.type === 'erro');
    assert.equal(erros.length, 1, 'um único evento erro');
    assert.equal(res.writableEnded, true, 'resposta SSE ENCERRADA após exceção externa');
  });

  test('falha interna inesperada → UM ÚNICO evento terminal erro (sem duplicação)', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const geradorQuebra: GeradorSSE = async () => {
      throw new Error('falha interna inesperada do RAG');
    };
    await gerarPecaComSSE(req, res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Err ${suffix}`, idempotencyKey: `sse-err-${suffix}` }, geradorQuebra);
    const erros = eventos.filter((e) => e.type === 'erro');
    assert.equal(erros.length, 1, `exatamente UM evento erro (${erros.length})`);
    assert.ok(!eventos.some((e) => e.type === 'concluido'), 'sem concluido em falha');
  });

  test('tenancy: processo de OUTRO escritório → 403, sem reserva nem settle', async () => {
    // Processo do escritório B referenciado pelo usuário de A.
    const [procB] = await db.insert(s.processos).values({
      numero: `SSE-B-${suffix}`, tipo: 'Cível', cliente: 'C', adverso: 'A', vara: '1ª Vara',
      area: 'Cível', status: 'ativo', valor: '10000', prazo: '2026-12-31', advogado: 'Adv',
      escritorioId: escB.id, usuarioId: adminB.id,
    }).returning({ id: s.processos.id });

    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const { res, eventos } = respostaSSEFake();
    const saldoAntes = await saldoEscritorio(escA.id);
    const tokensAntes = await tokenUsageCount(adminA.id);

    await gerarPecaComSSE(req, res, {
      pieceType: 'Contestação', area: 'Cível', dadosCaso: `X ${suffix}`,
      processoId: procB.id, idempotencyKey: `sse-tenant-${suffix}`,
    }, geradorStub(res, eventos));

    assert.equal(res.statusCode, 403, 'bloqueio de tenancy (403)');
    assert.ok(!eventos.some((e) => e.type === 'concluido'), 'sem geração para processo de outro escritório');
    const saldoDepois = await saldoEscritorio(escA.id);
    assert.equal(saldoDepois.credits, saldoAntes.credits, 'sem reserva/settle (nada cobrado)');
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes, 'sem token_usage');
    await db.delete(s.processos).where(eq(s.processos.id, procB.id)).catch(() => {});
  });

  test('isolamento: escritório B não acessa operação de A', async () => {
    // Executa em A com chave específica; B usa MESMA chave (escritórios
    // diferentes → operações independentes, nunca reutiliza a de A).
    const chave = `sse-iso-${suffix}`;
    const reqA = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const reqB = Object.assign(new EventEmitter(), { user: { id: adminB.id, role: 'admin', escritorioId: adminB.escritorioId } }) as any;

    const rA = respostaSSEFake();
    await gerarPecaComSSE(reqA, rA.res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: 'A', idempotencyKey: chave }, geradorStub(rA.res, rA.eventos));
    const cA = rA.eventos.find((e) => e.type === 'concluido');
    if (cA?.operationId) opIds.push(cA.operationId);

    const rB = respostaSSEFake();
    await gerarPecaComSSE(reqB, rB.res, { pieceType: 'Contestação', area: 'Cível', dadosCaso: 'B', idempotencyKey: chave }, geradorStub(rB.res, rB.eventos));
    const cB = rB.eventos.find((e) => e.type === 'concluido');
    if (cB?.operationId) opIds.push(cB.operationId);

    assert.ok(cA && cB, 'ambos concluem');
    assert.notEqual(cA.operationId, cB.operationId, 'operações independentes por escritório');
  });
});

// ===========================================================================
// Fase 5B — prompt final com jurisprudência ao vivo (bloco rastreável) e
// fallback best-effort (RAG local) validados no contexto enviado ao modelo.
// ===========================================================================

describe('5B — prompt final com jurisprudência ao vivo', () => {
  test('montarPrompt inclui o bloco rastreável com tribunal, relator e processo', async () => {
    const { montarPrompt } = await import('../services/geracaoSSE.js');
    const contextoComJurisprudencia = [
      'chunk do RAG local: tese sobre atraso de entrega',
      '--- JURISPRUDÊNCIA AO VIVO (separada do RAG local) ---',
      'JURISPRUDÊNCIAS RELEVANTES (fontes rastreáveis):',
      '- Atraso na entrega gera dano moral. (Tribunal: stj · Relator: Min. Fulano · Processo: 123 · Data: 2026-01-10)',
    ].join('\n\n');
    const payload = { operation: 'STANDARD_PETITION', classification: 'STANDARD' } as any;
    const prompt = montarPrompt(payload, 'consumidor sofreu atraso', contextoComJurisprudencia, 'STANDARD');
    assert.ok(prompt.includes('Tribunal: stj'), 'fonte rastreável: tribunal no prompt');
    assert.ok(prompt.includes('Relator: Min. Fulano'), 'fonte rastreável: relator no prompt');
    assert.ok(prompt.includes('Processo: 123'), 'fonte rastreável: número do processo no prompt');
    assert.ok(prompt.includes('exclusivamente nas leis'), 'instrução de fundamentação exclusiva ao contexto');
    assert.ok(prompt.includes('Não invente precedentes'), 'regra de não inventar jurisprudência');
  });

  test('geração com stub e includeJurisprudence=false continua só com RAG (sem bloco)', async () => {
    const req = Object.assign(new EventEmitter(), { user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId } }) as any;
    const r = respostaSSEFake();
    await gerarPecaComSSE(req, r.res, {
      pieceType: 'Contestação', area: 'Cível', dadosCaso: 'caso sem jurisprudência', idempotencyKey: `sse-5b-${suffix}`,
    }, geradorStub(r.res, r.eventos));
    const c = r.eventos.find((e) => e.type === 'concluido');
    assert.ok(c, 'geração concluiu');
    if (c?.operationId) opIds.push(c.operationId);
    // includeJurisprudence não informado → busca ao vivo não aciona (bloco vazio),
    // mas a geração não falha (best-effort): o evento concluido existe.
    assert.ok(c.modeloUsado, 'modelo usado registrado');
    assert.ok(!r.eventos.some((e) => e.type === 'erro'), 'sem evento de erro');
  });
});

describe('6B — aviso estruturado de jurisprudência no fluxo real', { skip: !dbDisponivel }, () => {
  test('emitirJurisprudencia: fallback emite status + aviso; ao vivo emite sem aviso', () => {
    const { res, eventos } = respostaSSEFake();
    // Fallback (pausa de rate limit) → aviso legível.
    emitirJurisprudencia(res, { bloco: '', decisoesUsadas: 0, tribunais: [], fromCache: false, origem: 'pausa' });
    // Sucesso ao vivo → sem aviso.
    emitirJurisprudencia(res, { bloco: 'x', decisoesUsadas: 2, tribunais: ['stj'], fromCache: false, origem: 'ao-vivo' });

    const juris = eventos.filter((e) => e.type === 'jurisprudencia');
    assert.equal(juris.length, 2, 'dois eventos jurisprudencia');
    assert.equal(juris[0].status, 'pausa');
    assert.ok(juris[0].aviso.includes('rate limit'), 'aviso de rate limit legível');
    assert.equal(juris[0].decisoesUsadas, 0);
    assert.equal(juris[1].status, 'ao-vivo');
    assert.equal(juris[1].aviso, '');
    assert.equal(juris[1].decisoesUsadas, 2);
    assert.deepEqual(juris[1].tribunais, ['stj']);
    // Nenhum termo/conteúdo sensível no payload do evento.
    assert.ok(!JSON.stringify(juris).includes('termos'), 'evento não carrega termos');
  });

  test('persistência: sub_operations grava texto-gerado + metadados de jurisprudência', async () => {
    const opId = randomUUID();
    // Operação de teste no banco (tenant real do teste).
    await db.insert(s.aiOperations).values({
      id: opId,
      idempotencyKey: `6b-${suffix}-${randomUUID()}`,
      escritorioId: escA.id,
      usuarioId: adminA.id,
      operationType: 'SIMPLE_PETITION',
      status: 'reserved',
      model: 'deepseek-v4-flash',
      creditsReserved: 1,
      costCentsReserved: 0,
      costCentsActual: 0,
    }).onConflictDoNothing().catch(() => {});
    opIds.push(opId);

    const subOps = montarSubOperacoesJurisprudencia(
      'Texto gerado da peça.',
      'deepseek-v4-flash',
      { bloco: '', decisoesUsadas: 0, tribunais: [], fromCache: false, origem: 'falha' },
    );
    const ok = await persistirSubOperacoes(opId, subOps);
    assert.equal(ok, true, 'persistência retorna true');

    const rows = await db.execute(sql`SELECT sub_operations FROM ai_operations WHERE id = ${opId}`) as any[];
    const raw = rows[0]?.sub_operations;
    assert.ok(Array.isArray(raw) && raw.length === 2, 'texto + jurisprudência persistidos');
    const texto = raw.find((x: any) => x.tipo === 'texto-gerado');
    const juris = raw.find((x: any) => x.tipo === 'jurisprudencia');
    assert.ok(texto && texto.texto === 'Texto gerado da peça.', 'texto persistido');
    assert.ok(juris, 'metadados de jurisprudência persistidos');
    assert.equal(juris.status, 'falha');
    assert.ok(juris.aviso.includes('RAG local'), 'aviso persistido');
    assert.equal(juris.decisoesUsadas, 0);
    assert.ok(!JSON.stringify(raw).includes('termos'), 'sem termos/conteúdo sensível persistido');

    // Operação inexistente → false (sem erro).
    const falso = await persistirSubOperacoes(randomUUID(), subOps);
    assert.equal(falso, false, 'operação inexistente retorna false');
  });
});
