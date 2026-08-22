// ===========================================================================
// Fase 4B — Testes unitários da camada de piloto controlado (config, limites e
// alerta de custo). Banco real + cleanup completo (padrão das suítes 2E/3A).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql, eq, inArray } from 'drizzle-orm';

await import('../config.js');
const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { configPiloto, contarEscritoriosAtivos, excedeLimiteEscritoriosPiloto, excedeLimiteDocumentosPiloto } = await import('./pilotMode.js');
const { checarAlertaCustoPiloto, custoConsumidoCiclo, custoDoCicloVsLimiar } = await import('./pilotObservability.js');

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

// Env original para restauração (arquivos compartilham o processo).
const envOrig = {
  PILOTO_ATIVO: process.env.PILOTO_ATIVO,
  PILOTO_MAX_ESCRITORIOS: process.env.PILOTO_MAX_ESCRITORIOS,
  PILOTO_MAX_USUARIOS: process.env.PILOTO_MAX_USUARIOS,
  PILOTO_MAX_DOCUMENTOS: process.env.PILOTO_MAX_DOCUMENTOS,
  PILOTO_ALERTA_CUSTO_CENTS: process.env.PILOTO_ALERTA_CUSTO_CENTS,
};
function restaurarEnv() {
  for (const [k, v] of Object.entries(envOrig)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

after(async () => {
  restaurarEnv();
  if (dbDisponivel) {
    await db.delete(s.auditLog).where(inArray(s.auditLog.actorId, userIds)).catch(() => {});
    for (const id of opIds) await db.delete(s.aiOperations).where(eq(s.aiOperations.id, id)).catch(() => {});
    await db.delete(s.documentos).where(inArray(s.documentos.escritorioId, escIds)).catch(() => {});
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  await client.end({ timeout: 5 });
});

describe('4B — piloto controlado (config e limites)', { skip: !dbDisponivel }, () => {
  test('configPiloto: DESLIGADO por padrão (produção intocada); ligado só com PILOTO_ATIVO=true', () => {
    delete process.env.PILOTO_ATIVO;
    delete process.env.PILOTO_MAX_ESCRITORIOS;
    const cfg = configPiloto();
    assert.equal(cfg.ativo, false, 'piloto desligado sem flag explícita');
    assert.equal(cfg.maxEscritorios, 10, 'default de teto de escritórios');

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = '3';
    process.env.PILOTO_MAX_DOCUMENTOS = '50';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '50000';
    const cfg2 = configPiloto();
    assert.equal(cfg2.ativo, true);
    assert.equal(cfg2.maxEscritorios, 3);
    assert.equal(cfg2.maxDocumentosPorEscritorio, 50);
    assert.equal(cfg2.alertaCustoCents, '50000', 'limiar preservado como string de dígitos (bigint-safe)');
  });

  test('configPiloto: valores INVÁLIDOS/parciais de limites são rejeitados estritamente', () => {
    process.env.PILOTO_ATIVO = 'true';
    // Sufixos, decimais, sinais, espaços internos e não seguros → REJEITADOS
    // (nunca interpretados parcialmente): maxEscritorios cai no default 10;
    // os demais caem em null (limite não se aplica).
    const casos = [
      ['PILOTO_MAX_ESCRITORIOS', '1abc', 10],
      ['PILOTO_MAX_ESCRITORIOS', '1.9', 10],
      ['PILOTO_MAX_ESCRITORIOS', '-1', 10],
      ['PILOTO_MAX_ESCRITORIOS', '1 0', 10],
      ['PILOTO_MAX_ESCRITORIOS', '9007199254740993', 10], // > MAX_SAFE_INTEGER
      ['PILOTO_MAX_DOCUMENTOS', 'abc', null],
      ['PILOTO_ALERTA_CUSTO_CENTS', '50.5', null],
      ['PILOTO_ALERTA_CUSTO_CENTS', '-50000', null],
      ['PILOTO_ALERTA_CUSTO_CENTS', '1abc', null],
    ] as const;
    for (const [chave, valor, esperado] of casos) {
      process.env[chave] = valor;
      const cfg = configPiloto();
      const campo = chave === 'PILOTO_MAX_ESCRITORIOS' ? 'maxEscritorios'
        : chave === 'PILOTO_MAX_DOCUMENTOS' ? 'maxDocumentosPorEscritorio'
        : 'alertaCustoCents';
      assert.equal(cfg[campo], esperado, `${chave}=${JSON.stringify(valor)} → ${campo}=${esperado} (rejeitado sem interpretação parcial)`);
    }
    // Espaços periféricos são aparados e '0' é VÁLIDO (bloqueia tudo).
    process.env.PILOTO_MAX_ESCRITORIOS = ' 7 ';
    assert.equal(configPiloto().maxEscritorios, 7, 'espaços periféricos aparados');
    process.env.PILOTO_MAX_DOCUMENTOS = '0';
    assert.equal(configPiloto().maxDocumentosPorEscritorio, 0, '0 é limite válido');
  });

  test('excedeLimiteEscritoriosPiloto: bloqueia quando o teto de ativos é atingido; ignora com piloto desligado', async () => {
    const rows = await db.insert(s.escritorios).values([
      { nome: `Pilot A ${suffix}`, plano: 'basico', ativo: true, limiteTokensMes: null },
      { nome: `Pilot B ${suffix}`, plano: 'basico', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(rows[0].id, rows[1].id);

    delete process.env.PILOTO_ATIVO;
    assert.equal(await excedeLimiteEscritoriosPiloto(), false, 'piloto desligado → nunca bloqueia');

    // Comparação por DELTA (o banco compartilhado tem seeds): teto = contagem
    // atual + 1 → libera; teto = contagem atual → bloqueia (>= no limite).
    const atual = await contarEscritoriosAtivos();
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_ESCRITORIOS = String(atual + 1);
    assert.equal(await excedeLimiteEscritoriosPiloto(), false, 'teto acima da contagem atual → libera');
    process.env.PILOTO_MAX_ESCRITORIOS = String(atual);
    assert.equal(await excedeLimiteEscritoriosPiloto(), true, 'teto = contagem atual → bloqueia');
  });

  test('excedeLimiteDocumentosPiloto: teto por escritório no upload', async () => {
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot Docs ${suffix}`, plano: 'basico', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);
    await db.insert(s.documentos).values([
      { nome: 'a.pdf', colecao: 'piloto', tamanho: '0.01 MB', indexado: new Date(), chunks: 1, escritorioId: esc.id },
      { nome: 'b.pdf', colecao: 'piloto', tamanho: '0.01 MB', indexado: new Date(), chunks: 1, escritorioId: esc.id },
    ]);

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_MAX_DOCUMENTOS = '2';
    assert.equal(await excedeLimiteDocumentosPiloto(esc.id), true, '2 docs >= teto 2 → bloqueia');
    process.env.PILOTO_MAX_DOCUMENTOS = '3';
    assert.equal(await excedeLimiteDocumentosPiloto(esc.id), false, 'teto 3 → libera');
    delete process.env.PILOTO_ATIVO;
    assert.equal(await excedeLimiteDocumentosPiloto(esc.id), false, 'piloto desligado → nunca bloqueia');
  });
});

describe('4B — observabilidade (alerta de custo por escritório)', { skip: !dbDisponivel }, () => {
  test('checarAlertaCustoPiloto: emite UMA auditoria por escritório/ciclo ao ultrapassar o limiar', async () => {
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot Alerta ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);

    // Operação liquidada com custo real acima do limiar.
    const [op] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-alerta-${suffix}`,
      escritorioId: esc.id,
      operationType: 'STANDARD_PETITION',
      status: 'succeeded',
      model: 'flash',
      costCentsActual: 60_000,
      tokensIn: 1000,
      tokensOut: 2000,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(op.id);

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '50000'; // 60.000 > 50.000
    assert.ok((await custoConsumidoCiclo(esc.id)) >= 60_000, 'custo consumido do ciclo refletido');

    await checarAlertaCustoPiloto(esc.id);
    const ciclo = new Date().toISOString().slice(0, 7);
    const alerts = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alerts.length, 1, 'alerta emitido uma vez');

    // Idempotência: nova chamada com o mesmo ciclo NÃO duplica o alerta.
    await checarAlertaCustoPiloto(esc.id);
    const alerts2 = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alerts2.length, 1, 'sem alerta duplicado no mesmo ciclo');

    // Abaixo do limiar → nenhum alerta.
    const [esc2] = await db.insert(s.escritorios).values([
      { nome: `Pilot SemAlerta ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc2.id);
    await checarAlertaCustoPiloto(esc2.id); // custo 0 < limiar
    const alerts3 = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc2.id));
    assert.equal(alerts3.length, 0, 'sem alerta abaixo do limiar');
  });

  test('checarAlertaCustoPiloto CONCORRENTE: liquidações simultâneas emitem UM ÚNICO alerta por escritório/ciclo', async () => {
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot AlertaConc ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);
    const [op] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-alerta-conc-${suffix}`,
      escritorioId: esc.id,
      operationType: 'STANDARD_PETITION',
      status: 'succeeded',
      model: 'flash',
      costCentsActual: 70_000,
      tokensIn: 1000,
      tokensOut: 2000,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(op.id);

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '50000';
    // 5 chamadas simultâneas — o advisory lock garante UMA auditoria.
    await Promise.all([
      checarAlertaCustoPiloto(esc.id),
      checarAlertaCustoPiloto(esc.id),
      checarAlertaCustoPiloto(esc.id),
      checarAlertaCustoPiloto(esc.id),
      checarAlertaCustoPiloto(esc.id),
    ]);
    const ciclo = new Date().toISOString().slice(0, 7);
    const alerts = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alerts.length, 1, 'UM único alerta sob concorrência');
    const logs = await db.select().from(s.appLogs).where(eq(s.appLogs.escritorioId, esc.id));
    assert.equal(logs.length, 1, 'UM único log sob concorrência');
  });

  test('fronteira: custo IGUAL ao limiar NÃO dispara alerta; custo acima de INT_MAX é somado sem overflow', async () => {
    // (a) Igualdade: custo == limiar → SEM alerta (requisito "ultrapassar").
    const [escIgual] = await db.insert(s.escritorios).values([
      { nome: `Pilot Igual ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escIgual.id);
    const [opIgual] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-igual-${suffix}`,
      escritorioId: escIgual.id,
      operationType: 'STANDARD_PETITION',
      status: 'succeeded',
      model: 'flash',
      costCentsActual: 50_000,
      tokensIn: 1,
      tokensOut: 1,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(opIgual.id);
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '50000';
    await checarAlertaCustoPiloto(escIgual.id);
    const ciclo = new Date().toISOString().slice(0, 7);
    const alertasIgual = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === escIgual.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alertasIgual.length, 0, 'igualdade ao limiar NÃO alerta');

    // (b) Agregado acima de INT_MAX (2.147.483.647) — soma bigint SEM overflow.
    const [escBig] = await db.insert(s.escritorios).values([
      { nome: `Pilot Big ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escBig.id);
    const big = 1_500_000_000;
    const [op1] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-big1-${suffix}`,
      escritorioId: escBig.id,
      operationType: 'APPEAL',
      status: 'succeeded',
      model: 'pro',
      costCentsActual: big,
      tokensIn: 1,
      tokensOut: 1,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(op1.id);
    const [op2] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-big2-${suffix}`,
      escritorioId: escBig.id,
      operationType: 'APPEAL',
      status: 'succeeded',
      model: 'pro',
      costCentsActual: big,
      tokensIn: 1,
      tokensOut: 1,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(op2.id);
    const soma = await custoConsumidoCiclo(escBig.id);
    assert.equal(soma, big * 2, `soma bigint correta acima de INT_MAX (${soma})`);
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '1000000';
    await checarAlertaCustoPiloto(escBig.id);
    const alertasBig = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === escBig.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alertasBig.length, 1, 'alerta emitido com soma acima de INT_MAX (sem overflow silencioso)');
  });

  test('fronteira bigint: limiar ACIMA de Number.MAX_SAFE_INTEGER comparado EXATAMENTE no Postgres', async () => {
    const [escBig] = await db.insert(s.escritorios).values([
      { nome: `Pilot BigSafe ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escBig.id);
    // 3 operações de 1 cent: soma = 3 cents (representável no int4 do banco;
    // o LIMIAR é o valor que excede a precisão do Number — 2^60+1).
    for (let i = 0; i < 3; i++) {
      const [o] = await db.insert(s.aiOperations).values({
        idempotencyKey: `piloto-safe-${i}-${suffix}`,
        escritorioId: escBig.id,
        operationType: 'APPEAL',
        status: 'succeeded',
        model: 'pro',
        costCentsActual: 1,
        tokensIn: 1,
        tokensOut: 1,
        finishedAt: new Date(),
      }).returning({ id: s.aiOperations.id });
      opIds.push(o.id);
    }

    const limiarHuge = 1152921504606846977n; // 2^60 + 1 (> MAX_SAFE_INTEGER)
    const { excede, totalTexto } = await custoDoCicloVsLimiar(escBig.id, limiarHuge);
    assert.equal(excede, false, '3 < 2^60+1 → comparação bigint exata (Number(2^60+1) arredondaria)');
    assert.equal(totalTexto, '3', 'total serializado exato');
    const { excede: excedePequeno } = await custoDoCicloVsLimiar(escBig.id, 2n);
    assert.equal(excedePequeno, true, '3 > 2 → excede (estrito)');
    const { excede: excedeIgual } = await custoDoCicloVsLimiar(escBig.id, 3n);
    assert.equal(excedeIgual, false, '3 == 3 → NÃO excede (fronteira estrita)');

    // Alerta end-to-end com o limiar gigante: soma 3 < 2^60+1 → SEM alerta.
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '1152921504606846977';
    await checarAlertaCustoPiloto(escBig.id);
    const ciclo = new Date().toISOString().slice(0, 7);
    const alertas = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === escBig.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alertas.length, 0, 'limiar gigante sem alerta (soma pequena, comparação exata)');

    // Alerta com limiar pequeno (2) → soma 3 > 2 → alerta com custo exato.
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '2';
    await checarAlertaCustoPiloto(escBig.id);
    const alertas2 = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === escBig.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alertas2.length, 1, 'alerta emitido com limiar pequeno');
    assert.equal((alertas2[0].detalhes as any).custoCents, '3', 'custo serializado exato (texto)');
  });

  test('settleAiUsage ACIMA do limiar: liquidação ok + UMA auditoria de alerta; limiar inválido não falha o settle', async () => {
    const { settleAiUsage } = await import('./usage.js');
    // Esc A: operação reservada cujo custo real (tokens) excede o limiar.
    const [escA] = await db.insert(s.escritorios).values([
      { nome: `Pilot SettleA ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escA.id);
    const [opA] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-settle-a-${suffix}`,
      escritorioId: escA.id,
      operationType: 'STANDARD_PETITION',
      status: 'reserved',
      model: 'flash',
      creditsReserved: 2,
      costCentsReserved: 5000,
      maxInputTokens: 5000,
      maxOutputTokens: 3500,
    }).returning({ id: s.aiOperations.id });
    opIds.push(opA.id);

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '100'; // custo real do settle (~R$5) > R$1
    const r1 = await settleAiUsage({
      operationId: opA.id,
      modelUsed: 'deepseek-v4-flash',
      inputTokens: 2_000_000,
      outputTokens: 100_000,
    });
    assert.ok(r1.ok, 'liquidação NÃO falha com alerta de custo (observabilidade não bloqueia)');
    const ciclo = new Date().toISOString().slice(0, 7);
    const alertasA = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === escA.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alertasA.length, 1, 'UMA auditoria de alerta disparada pela liquidação real');

    // Esc B: limiar INVÁLIDO (regex rejeita) → sem alerta e settle continua ok.
    const [escB] = await db.insert(s.escritorios).values([
      { nome: `Pilot SettleB ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escB.id);
    const [opB] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-settle-b-${suffix}`,
      escritorioId: escB.id,
      operationType: 'STANDARD_PETITION',
      status: 'reserved',
      model: 'flash',
      creditsReserved: 2,
      costCentsReserved: 5000,
      maxInputTokens: 5000,
      maxOutputTokens: 3500,
    }).returning({ id: s.aiOperations.id });
    opIds.push(opB.id);
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '1abc'; // inválido → observabilidade desligada
    const r2 = await settleAiUsage({
      operationId: opB.id,
      modelUsed: 'deepseek-v4-flash',
      inputTokens: 2_000_000,
      outputTokens: 100_000,
    });
    assert.ok(r2.ok, 'settle continua ok com limiar inválido (falha de observabilidade não falha liquidação)');
  });

  test('SATURAÇÃO de pool: 20 checarAlertaCustoPiloto concorrentes concluem sem deadlock e emitem UM alerta', async () => {
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot Pool ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);
    const [op] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-pool-${suffix}`,
      escritorioId: esc.id,
      operationType: 'STANDARD_PETITION',
      status: 'succeeded',
      model: 'flash',
      costCentsActual: 100_000,
      tokensIn: 1000,
      tokensOut: 1000,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(op.id);

    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '50000';
    const comTimeout = async (p: Promise<unknown>, ms: number) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: deadlock ou espera indefinida')), ms))]);
    await comTimeout(
      Promise.all(Array.from({ length: 20 }, () => checarAlertaCustoPiloto(esc.id))),
      20_000,
    );
    const ciclo = new Date().toISOString().slice(0, 7);
    const alerts = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alerts.length, 1, 'UM único alerta sob saturação de pool (sem deadlock)');
  });

  test('settleAiUsage sob concorrência de alertas: liquidações concluem e a observabilidade não bloqueia', async () => {
    const { settleAiUsage } = await import('./usage.js');
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot SettleConc ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);
    const opIdsLocais: string[] = [];
    for (let i = 0; i < 6; i++) {
      const [o] = await db.insert(s.aiOperations).values({
        idempotencyKey: `piloto-settle-conc-${i}-${suffix}`,
        escritorioId: esc.id,
        operationType: 'STANDARD_PETITION',
        status: 'reserved',
        model: 'flash',
        creditsReserved: 2,
        costCentsReserved: 5000,
        maxInputTokens: 5000,
        maxOutputTokens: 3500,
      }).returning({ id: s.aiOperations.id });
      opIdsLocais.push(o.id);
      opIds.push(o.id);
    }
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '100';
    const resultados = await Promise.all(
      opIdsLocais.map((id) =>
        settleAiUsage({ operationId: id, modelUsed: 'deepseek-v4-flash', inputTokens: 2_000_000, outputTokens: 100_000 }),
      ),
    );
    assert.equal(resultados.length, 6, 'todas as liquidações concluíram (nenhuma bloqueada pela observabilidade)');
    assert.ok(resultados.every((r) => r.ok || r.alreadySettled), 'todas ok/alreadySettled');
    const ciclo = new Date().toISOString().slice(0, 7);
    const alerts = await db.select().from(s.auditLog)
      .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
      .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc.id && (r.detalhes as any)?.ciclo === ciclo));
    assert.equal(alerts.length, 1, 'UM único alerta para todas as liquidações concorrentes');
  });

  test('notificação PÓS-COMMIT: enviada uma única vez; retry NÃO reenvia; falha do e-mail não propaga nem falha o settle', async () => {
    // (a) Outbox: com ROOT_NOTIFICATION_EMAIL configurado, a notificação injetada
    // é chamada UMA vez após o commit; a segunda chamada (retry) não reenvia.
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot Notif ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);
    const [op] = await db.insert(s.aiOperations).values({
      idempotencyKey: `piloto-notif-${suffix}`,
      escritorioId: esc.id,
      operationType: 'STANDARD_PETITION',
      status: 'succeeded',
      model: 'flash',
      costCentsActual: 60_000,
      tokensIn: 1,
      tokensOut: 1,
      finishedAt: new Date(),
    }).returning({ id: s.aiOperations.id });
    opIds.push(op.id);
    process.env.PILOTO_ATIVO = 'true';
    process.env.PILOTO_ALERTA_CUSTO_CENTS = '50000';
    process.env.ROOT_NOTIFICATION_EMAIL = 'root@piloto.test';
    const envNotifOriginal = process.env.ROOT_NOTIFICATION_EMAIL;
    try {
      let chamadas = 0;
      const notificar = async () => { chamadas += 1 };
      await checarAlertaCustoPiloto(esc.id, null, notificar);
      await checarAlertaCustoPiloto(esc.id, null, notificar); // retry (alerta já emitido)
      assert.equal(chamadas, 1, 'notificação pós-commit enviada UMA única vez (retry não reenvia)');

      // (b) E-mail que LANÇA erro → best-effort: checarAlertaCustoPiloto NÃO propaga.
      const [esc2] = await db.insert(s.escritorios).values([
        { nome: `Pilot NotifFail ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null },
      ]).returning({ id: s.escritorios.id });
      escIds.push(esc2.id);
      const [op2] = await db.insert(s.aiOperations).values({
        idempotencyKey: `piloto-notif2-${suffix}`,
        escritorioId: esc2.id,
        operationType: 'STANDARD_PETITION',
        status: 'succeeded',
        model: 'flash',
        costCentsActual: 60_000,
        tokensIn: 1,
        tokensOut: 1,
        finishedAt: new Date(),
      }).returning({ id: s.aiOperations.id });
      opIds.push(op2.id);
      const notificarFalha = async () => { throw new Error('provedor de e-mail fora do ar') };
      await checarAlertaCustoPiloto(esc2.id, null, notificarFalha); // NÃO deve lançar
      // O alerta em si foi persistido mesmo com e-mail falhando.
      const ciclo = new Date().toISOString().slice(0, 7);
      const alertas = await db.select().from(s.auditLog)
        .where(eq(s.auditLog.acao, 'AI_ALERTA_CUSTO_PILOTO'))
        .then((rows) => rows.filter((r) => (r.detalhes as any)?.escritorioId === esc2.id && (r.detalhes as any)?.ciclo === ciclo));
      assert.equal(alertas.length, 1, 'alerta persistido mesmo com notificação falhando (não reverte o evento)');
    } finally {
      delete process.env.PILOTO_ATIVO;
      delete process.env.PILOTO_ALERTA_CUSTO_CENTS;
      if (envNotifOriginal === undefined) delete process.env.ROOT_NOTIFICATION_EMAIL;
      else process.env.ROOT_NOTIFICATION_EMAIL = envNotifOriginal;
    }
  });

  test('slot de usuário: falha APÓS o insert → rollback integral (sem usuário, vaga LIBERADA para retry)', async () => {
    const { comSlotPiloto } = await import('./pilotMode.js');
    const [esc] = await db.insert(s.escritorios).values([
      { nome: `Pilot SlotRb ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, limiteUsuarios: 100 },
    ]).returning({ id: s.escritorios.id });
    escIds.push(esc.id);
    const chave = `piloto:usuarios:${esc.id}`;
    const hash = await bcrypt.hash('SlotSenha#2026', 10);

    // 1ª tentativa: insere o usuário e FALHA numa etapa posterior (simula a
    // inserção de permissões quebrando) — a transação do slot deve reverter.
    await assert.rejects(
      () => comSlotPiloto(chave, async (tx) => {
        await tx.insert(s.usuarios).values({
          nome: 'Slot Rb',
          email: `slot.rb.${suffix}@teste.local`,
          senha: hash,
          role: 'user',
          escritorioId: esc.id,
          precisaTrocarSenha: true,
        });
        throw new Error('falha posterior à criação do usuário');
      }),
      'falha na etapa posterior deve propagar',
    );
    const [usuarios] = (await db.execute(sql`SELECT count(*)::int AS n FROM usuarios WHERE email LIKE ${`slot.rb.${suffix}%`}`)) as any[];
    assert.equal(usuarios.n, 0, 'rollback: usuário NÃO persistido (vaga não consumida)');

    // Retry: a MESMA vaga está livre e a criação completa com sucesso.
    await comSlotPiloto(chave, async (tx) => {
      await tx.insert(s.usuarios).values({
        nome: 'Slot Rb Ok',
        email: `slot.rb.${suffix}@teste.local`,
        senha: hash,
        role: 'user',
        escritorioId: esc.id,
        precisaTrocarSenha: true,
      });
      return null;
    });
    const [usuariosOk] = (await db.execute(sql`SELECT count(*)::int AS n FROM usuarios WHERE email LIKE ${`slot.rb.${suffix}%`}`)) as any[];
    assert.equal(usuariosOk.n, 1, 'retry usa a vaga liberada com sucesso');
    await db.delete(s.usuarios).where(sql`email LIKE ${`slot.rb.${suffix}%`}`).catch(() => {});
  });
});
