// ===========================================================================
// Fase 6A — Integração: rastreabilidade persistida em app_logs (produção).
//
// Chama rastreabilidadePadrao (o caminho REAL usado na geração) e verifica no
// banco que o registro foi criado com os metadados de auditoria (tenant,
// usuário, operação, origem, tribunal, decisões) e que NENHUM termo bruto é
// persistido — apenas hash não reversível + contagem (LGPD): nomes, CPF e
// números de processo nunca aparecem.
// ===========================================================================

import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

const { db, client } = await import('../db/client.js');
const { flushLogs } = await import('./logger.js');
const { rastreabilidadePadrao, hashTermosAuditoria } = await import('./jurisprudenciaRag.js');

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

after(async () => {
  await flushLogs().catch(() => {});
  await client.end({ timeout: 5 });
});

const escId = randomUUID();
const usrId = randomUUID();
const suffix = randomUUID().slice(0, 8);

before(async () => {
  if (!dbDisponivel) return;
  // Remove registros de execuções anteriores do mesmo teste (idempotência).
  await db.execute(sql`DELETE FROM app_logs WHERE context->>'operationId' = ${`op-6a-${suffix}`}`).catch(() => {});
  await db.execute(sql`DELETE FROM app_logs WHERE context->>'operationId' = ${`op-6a-pii-${suffix}`}`).catch(() => {});
});

describe('rastreabilidade persistida em app_logs (fase 6A)', { skip: !dbDisponivel }, () => {
  test('busca ao vivo grava tenant, usuário, operação, origem e decisões', async () => {
    rastreabilidadePadrao({
      escritorioId: escId,
      usuarioId: usrId,
      operationId: `op-6a-${suffix}`,
      operation: 'SIMPLE_PETITION',
      tribunal: 'stj',
      termos: ['consumidor', 'negativa', 'cobertura'],
      decisoesUsadas: 3,
      origem: 'ao-vivo',
      rateLimitRestante: 4,
      timestamp: new Date().toISOString(),
    });
    await flushLogs();

    const rows = await db.execute(sql`
      SELECT level, message, escritorio_id, usuario_id, context
      FROM app_logs WHERE context->>'operationId' = ${`op-6a-${suffix}`} LIMIT 1
    `) as any[];
    const reg = rows[0];
    assert.ok(reg, 'registro criado em app_logs');
    assert.equal(reg.escritorio_id, escId, 'tenant persistido');
    assert.equal(reg.usuario_id, usrId, 'usuário persistido');
    assert.equal(reg.message, '[jurisprudenciaRag] rastreabilidade');
    const ctx = reg.context ?? {};
    assert.equal(ctx.origem, 'ao-vivo');
    assert.equal(ctx.tribunal, 'stj');
    assert.equal(ctx.decisoesUsadas, 3);
    assert.equal(ctx.operation, 'SIMPLE_PETITION');
    assert.equal(ctx.rateLimitRestante, 4, 'rate limit restante observado');
    assert.equal(ctx.termosContagem, 3, 'contagem de termos persistida');
    assert.equal(ctx.termosHash, hashTermosAuditoria(['consumidor', 'negativa', 'cobertura']), 'hash determinístico dos termos');
    assert.equal(ctx.termos, undefined, 'termos brutos NÃO são persistidos');
    await db.execute(sql`DELETE FROM app_logs WHERE id = ${reg.id}`).catch(() => {});
  });

  test('nomes, CPF e números de processo NUNCA são persistidos (LGPD)', async () => {
    const opId = `op-6a-pii-${suffix}`;
    rastreabilidadePadrao({
      escritorioId: escId,
      usuarioId: usrId,
      operationId: opId,
      operation: 'SIMPLE_PETITION',
      tribunal: 'stj',
      termos: ['maria', '12345678901', 'processo0001234', 'indenizacao'],
      decisoesUsadas: 0,
      origem: 'sem-termos',
      rateLimitRestante: null,
      timestamp: new Date().toISOString(),
    });
    await flushLogs();

    const rows = await db.execute(sql`
      SELECT context FROM app_logs WHERE context->>'operationId' = ${opId} LIMIT 1
    `) as any[];
    const ctx = rows[0]?.context ?? {};
    const textoContexto = JSON.stringify(ctx);
    assert.ok(!/maria/i.test(textoContexto), 'nome próprio não persistido');
    assert.ok(!/12345678901/.test(textoContexto), 'CPF não persistido');
    assert.ok(!/processo0001234/.test(textoContexto), 'número de processo não persistido');
    assert.ok(!('termos' in ctx), 'campo termos ausente na persistência');
    assert.ok(typeof ctx.termosHash === 'string' && ctx.termosHash.startsWith('h:'), 'apenas hash não reversível');
    assert.equal(ctx.termosContagem, 4, 'contagem reflete os termos usados na busca');
    await db.execute(sql`DELETE FROM app_logs WHERE context->>'operationId' = ${opId}`).catch(() => {});
  });

  test('hashTermosAuditoria é determinístico, ordena-invariante e sensível ao conteúdo', () => {
    assert.equal(hashTermosAuditoria(['consumidor', 'negativa']), hashTermosAuditoria(['negativa', 'consumidor']), 'ordem não importa');
    assert.equal(hashTermosAuditoria(['Consumidor', 'NEGATIVA']), hashTermosAuditoria(['consumidor', 'negativa']), 'normalização de caixa/acento');
    assert.notEqual(hashTermosAuditoria(['consumidor', 'negativa']), hashTermosAuditoria(['consumidor', 'cobertura']), 'conteúdo diferente → hash diferente');
    assert.ok(hashTermosAuditoria([]).startsWith('h:'), 'vazio → hash válido');
  });
});
