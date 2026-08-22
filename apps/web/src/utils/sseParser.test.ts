// ===========================================================================
// Fase 3D — Testes unitários do parser SSE e montagem do body (sem servidor).
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventosSSE, montarBodyGeracao, chaveIdempotenciaPeca } from './sseParser.js';

describe('3D — sseParser', () => {
  test('parseia eventos tipados do protocolo SSE (operacao/progresso/texto/concluido)', () => {
    const chunk = [
      'data: {"type":"operacao","operationId":"op-1","status":"running"}',
      'data: {"type":"progresso","progresso":30,"label":"Buscando RAG..."}',
      'data: {"type":"texto","delta":"Texto parcial."}',
      'data: {"type":"progresso","progresso":85,"label":"Finalizando..."}',
      'data: {"type":"concluido","operationId":"op-1","saldo":{"credits":98}}',
    ].join('\n');
    const eventos = parseEventosSSE(chunk);
    assert.deepEqual(eventos.map((e) => e.type), ['operacao', 'progresso', 'texto', 'progresso', 'concluido']);
    assert.equal(eventos[0].type, 'operacao');
    if (eventos[0].type === 'operacao') assert.equal(eventos[0].operationId, 'op-1');
    if (eventos[2].type === 'texto') assert.equal(eventos[2].delta, 'Texto parcial.');
    const conc = eventos[4];
    if (conc.type === 'concluido') assert.equal(conc.saldo?.credits, 98);
  });

  test('parseia evento erro com reconciliacao (falha ambígua)', () => {
    const eventos = parseEventosSSE('data: {"type":"erro","code":"falha-ambigua-reconciliacao-pendente","reconciliacao":true}');
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].type, 'erro');
    if (eventos[0].type === 'erro') assert.equal(eventos[0].reconciliacao, true);
  });

  test('ignora linhas malformadas e não-data', () => {
    const chunk = [
      ': keep-alive',
      'event: foo',
      'data: {not-json',
      'data: {"type":"texto","delta":"ok"}',
    ].join('\n');
    const eventos = parseEventosSSE(chunk);
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].type, 'texto');
  });

  test('montarBodyGeracao inclui pieceType e NUNCA dados financeiros/modelo', () => {
    const body = montarBodyGeracao({
      pieceType: 'Contestação',
      area: 'Cível',
      processoId: 'proc-1',
      outputSize: 'COMPLETE',
      idempotencyKey: 'peca:x:y:z',
      dadosCaso: 'caso',
    });
    assert.equal(body.pieceType, 'Contestação');
    assert.equal(body.area, 'Cível');
    assert.equal(body.processoId, 'proc-1');
    assert.equal(body.outputSize, 'COMPLETE');
    assert.equal(body.idempotencyKey, 'peca:x:y:z');
    const chaves = Object.keys(body);
    for (const proibido of ['credits', 'cost', 'model', 'modelTier', 'maxInputTokens', 'maxOutputTokens', 'limits']) {
      assert.ok(!chaves.some((k) => k.toLowerCase().includes(proibido.toLowerCase())), `sem campo ${proibido}`);
    }
  });

  test('chaveIdempotenciaPeca: estável p/ reconexão, NOVA quando QUALQUER dado do payload muda', async () => {
    const base = {
      tipo: 'Contestação', area: 'Cível', processoId: 'p1',
      dadosCaso: '[DADOS PROCESSUAIS]: Autor: A, Réu: R, Vara: V, Valor: 1000',
      outputSize: 'STANDARD' as const,
      nomeCliente: 'A', parteAdversa: 'R', varaTribunal: 'V', valorCausa: '1000',
    };
    const k1 = await chaveIdempotenciaPeca(base);
    const k2 = await chaveIdempotenciaPeca({ ...base }); // reconexão (mesmos dados)
    const k3 = await chaveIdempotenciaPeca({ ...base, dadosCaso: 'caso B' }); // novo texto
    const k4 = await chaveIdempotenciaPeca({ ...base, outputSize: 'COMPLETE' as const }); // nova extensão
    const k5 = await chaveIdempotenciaPeca({ ...base, processoId: undefined }); // avulso
    const k6 = await chaveIdempotenciaPeca({ ...base, parteAdversa: 'R2' }); // réu mudou
    const k7 = await chaveIdempotenciaPeca({ ...base, valorCausa: '5000' }); // valor mudou
    assert.equal(k1, k2, 'estável para reconexão da MESMA geração');
    assert.notEqual(k1, k3, 'nova geração quando dadosCaso muda');
    assert.notEqual(k1, k4, 'nova geração quando outputSize muda');
    assert.notEqual(k1, k5, 'distingue processo de avulso');
    assert.notEqual(k1, k6, 'nova geração quando parte adversa muda');
    assert.notEqual(k1, k7, 'nova geração quando valor muda');
    // Hash SHA-256: chave longa (64 hex), resistente a colisões práticas.
    assert.match(k1, /^peca:[^:]+:[^:]+:[^:]+:[0-9a-f]{64}$/, 'hash SHA-256 de 64 hex');
  });

  test('parseEventosSSE aceita delimitadores CRLF (\r\n\r\n)', () => {
    const chunk = [
      'data: {"type":"progresso","progresso":30}',
      '',
      'data: {"type":"texto","delta":"CRLF ok"}',
    ].join('\r\n');
    const eventos = parseEventosSSE(chunk);
    assert.equal(eventos.length, 2);
    assert.equal(eventos[0].type, 'progresso');
    assert.equal(eventos[1].type, 'texto');
  });

  test('montarBodyGeracao reflete o payload REAL do componente (3D)', async () => {
    const dadosCasoFinal = `caso\n\n[DADOS PROCESSUAIS]: Autor: A, Réu: R, Vara: V, Valor: 1000.`;
    const body = montarBodyGeracao({
      pieceType: 'Contestação',
      area: 'Cível',
      processoId: 'p1',
      outputSize: 'STANDARD',
      includeJurisprudence: true,
      idempotencyKey: await chaveIdempotenciaPeca({
        tipo: 'Contestação', area: 'Cível', processoId: 'p1',
        dadosCaso: dadosCasoFinal, outputSize: 'STANDARD',
        nomeCliente: 'A', parteAdversa: 'R', varaTribunal: 'V', valorCausa: '1000',
      }),
      dadosCaso: dadosCasoFinal,
    });
    assert.equal(body.pieceType, 'Contestação');
    assert.equal(body.outputSize, 'STANDARD');
    assert.equal(body.includeJurisprudence, true);
    assert.equal(body.dadosCaso, dadosCasoFinal);
    assert.ok(typeof body.idempotencyKey === 'string' && body.idempotencyKey.startsWith('peca:'));
  });
});
