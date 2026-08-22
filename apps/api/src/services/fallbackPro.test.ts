// ===========================================================================
// Fase 3B — Fallback Flash → Pro.
//
// Cobertura (banco real):
//   - falha RECUPERÁVEL do FLASH → reexecução PRO registrada (motivo + modelo),
//     token_usage da execução PRO sem duplicar o da FLASH;
//   - falha recuperável SEM orçamento para PRO → REQUIRES_ADDITIONAL_CREDITS,
//     nenhuma chamada PRO;
//   - falha NÃO recuperável (recusa/validação) → sem fallback, operação failed;
//   - decisão de servidor: env desligando o fallback → falha FLASH permanece;
//   - isolamento entre escritórios (fallback nunca cruza tenants);
//   - idempotência por tenant preservada (chave ':pro' própria).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { runAiOperation } = await import('./aiOperation.js');
const { settleAiUsage } = await import('./usage.js');
const { ErroGeracaoIA } = await import('./analiseDocumental.js');
import type { AiOperationInput } from './aiOperation.js';
const { saldoEscritorio, tokenUsageCount } = await import('./aiOperationTestHelpers.js');

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

type GeneratorFn = NonNullable<AiOperationInput['generate']>;
type GenParam = Parameters<GeneratorFn>[0];

/** Gerador que falha no FLASH e funciona no PRO, com contador por tier. */
function geradorComFallback() {
  const chamadas = { flash: 0, pro: 0 };
  const gerar: GeneratorFn = async (op: GenParam) => {
    if (op.modelTier === 'FLASH') {
      chamadas.flash += 1;
      throw new ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true });
    }
    chamadas.pro += 1;
    return { modelUsed: 'deepseek-v4-pro', inputTokens: 500, outputTokens: 300 };
  };
  return { gerar, chamadas };
}

/** Gerador que falha SEMPRE (flash e pro) com erro recuperável. */
function geradorFalhaSempre() {
  const gerar: GeneratorFn = async () => {
    throw new ErroGeracaoIA('timeout na chamada ao modelo', { ambigua: true });
  };
  return { gerar };
}

/** Gerador que falha no FLASH com erro NÃO recuperável (recusa). */
function geradorRecusa() {
  const chamadas = { flash: 0, pro: 0 };
  const gerar: GeneratorFn = async (op: GenParam) => {
    chamadas[op.modelTier.toLowerCase() as 'flash' | 'pro'] += 1;
    // Resposta do provedor com erro 400 (recusa de conteúdo): NÃO é retryable
    // (não casa ehErroRetryable) nem ambígua — sem fallback, operação failed.
    throw new ErroGeracaoIA('400 bad request: recusa de conteúdo por contexto insuficiente', { confirmadoSemProcessamento: true });
  };
  return { gerar, chamadas };
}

/** Gerador que falha no FLASH com erro recuperável e NÃO tem orçamento. */
function geradorOkPro() {
  const gerar: GeneratorFn = async (op: GenParam) => {
    if (op.modelTier === 'FLASH') throw new ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true });
    return { modelUsed: 'deepseek-v4-pro', inputTokens: 100, outputTokens: 50 };
  };
  return { gerar };
}

function inputBasico(): NonNullable<AiOperationInput['input']> {
  return {
    pieceType: 'Contestação',
    area: 'Cível',
    dadosCaso: `Caso de teste fallback ${suffix}`,
  };
}

before(async () => {
  if (!dbDisponivel) return;
  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `FbkA ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    { nome: `FbkB ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escA = ea; escB = eb;
  escIds.push(ea.id, eb.id);

  const hash = await bcrypt.hash('x', 10);
  const users = await db.insert(s.usuarios).values([
    { nome: 'Fbk Admin A', email: `fbk.a.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Fbk Admin B', email: `fbk.b.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
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

describe('3B — fallback Flash/Pro', { skip: !dbDisponivel }, () => {
  test('falha recuperável FLASH → reexecução PRO registrada (motivo + modelo)', async () => {
    const { gerar, chamadas } = geradorComFallback();
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const tokensAntes = await tokenUsageCount(adminA.id);
    const saldoAntes = await saldoEscritorio(escA.id);

    const res = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: `fbk-ok-${suffix}`,
      generate: gerar,
    });
    assert.ok(res.ok, JSON.stringify(res));
    if (!res.ok) return;
    assert.equal(chamadas.flash, 1, 'FLASH tentado 1x');
    assert.equal(chamadas.pro, 1, 'PRO executado 1x');
    assert.equal(res.modelUsed, 'deepseek-v4-pro', 'modelo usado = PRO');
    if (res.operationId) opIds.push(res.operationId);
    assert.ok(
      res.warnings.some((w) => w.includes('Fallback automático')),
      'warning registra o fallback',
    );

    // token_usage: 1 (PRO) — a FLASH falhou e não gerou uso; sem duplicação.
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes + 1, '1 token_usage (execução PRO)');

    // A reserva FLASH foi LIBERADA pelo fallback: o saldo final = inicial
    // apenas com o consumo do PRO (créditosReserved), sem o débito da FLASH.
    const depois = await saldoEscritorio(escA.id);
    assert.equal(
      depois.credits,
      saldoAntes.credits - (res.creditsReserved ?? 0),
      'FLASH liberada; apenas o PRO consumiu créditos (sem dupla cobrança)',
    );
    assert.equal(depois.reserveCents, 0, 'reserva FLASH liberada (reserve_cents_used zera após settle PRO)');
  });

  test('falha recuperável SEM orçamento para PRO → REQUIRES_ADDITIONAL_CREDITS (sem chamada PRO)', async () => {
    // Gera um custo estimado > 0 com processo + documento (páginas reais).
    // Escritório com reserveCentsUsed perto do teto (12_500): o custo FLASH
    // cabe, mas o custo PRO (3x) estoura maxReserveCents → REQUIRES.
    const [escPobre] = await db.insert(s.escritorios).values([
      { nome: `FbkPobre ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 12_481, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escPobre.id);
    const [userPobre] = await db.insert(s.usuarios).values([
      { nome: 'Fbk Pobre', email: `fbk.pobre.${suffix}@teste.local`, senha: await bcrypt.hash('x', 10), role: 'admin', escritorioId: escPobre.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(userPobre.id);

    const [proc] = await db.insert(s.processos).values({
      numero: `FBK-${suffix}`,
      tipo: 'Cível',
      cliente: 'Cliente',
      adverso: 'Adverso',
      vara: '1ª Vara Cível',
      area: 'Cível',
      status: 'ativo',
      valor: '10000',
      prazo: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      advogado: 'Advogado',
      escritorioId: escPobre.id,
      usuarioId: userPobre.id,
    }).returning({ id: s.processos.id });
    await db.insert(s.documentos).values({
      nome: `pobre-${suffix}.pdf`,
      colecao: 'teste',
      tamanho: '1 MB',
      chunks: 1,
      totalPages: 10,
      indexedStatus: 'indexed',
      escritorioId: escPobre.id,
      processoId: proc.id,
    });

    const { gerar, chamadas } = geradorComFallback();
    const res = await runAiOperation({
      user: { id: userPobre.id, role: 'admin', escritorioId: escPobre.id },
      input: { pieceType: 'Contestação', area: 'Cível', dadosCaso: `Caso pobre ${suffix}`, processoId: proc.id },
      idempotencyKey: `fbk-sem-orc-${suffix}`,
      generate: gerar,
    });
    assert.ok(!res.ok);
    if (res.ok) return;
    assert.equal(res.code, 'REQUIRES_ADDITIONAL_CREDITS', 'sem orçamento para PRO (code=' + res.code + ')');
    assert.equal(chamadas.pro, 0, 'PRO NUNCA chamado sem orçamento');
    // A reserva FLASH (tentativa original) foi liberada — sem crédito preso.
    const saldo = await saldoEscritorio(escPobre.id);
    assert.equal(saldo.credits, 100, 'FLASH liberada (créditos voltam ao saldo original)');
    await db.delete(s.documentos).where(eq(s.documentos.processoId, proc.id)).catch(() => {});
    await db.delete(s.processos).where(eq(s.processos.id, proc.id)).catch(() => {});
  });

  test('falha AMBÍGUA (timeout): PRO NÃO chamado + operação marcada para reconciliação', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    let chamadasPro = 0;
    const gerar: GeneratorFn = async (op: GenParam) => {
      if (op.modelTier === 'PRO') chamadasPro += 1;
      throw new Error('timeout na chamada ao modelo'); // ambígua (sem resposta)
    };
    const res = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: `fbk-amb-${suffix}`,
      generate: gerar,
    });
    assert.ok(!res.ok, JSON.stringify(res));
    if (res.ok) return;
    assert.equal(res.code, 'falha-ambigua-reconciliacao-pendente', 'timeout não dispara fallback; sinaliza reconciliação');
    assert.equal(chamadasPro, 0, 'PRO NUNCA chamado para falha ambígua');
    // A operação FLASH NÃO foi liberada integralmente: permanece marcada como
    // uso ambíguo (persistente) para reconciliação financeira — reserva retida.
    const rows = (await db.execute(sql`
      SELECT fallback_reason, status FROM ai_operations
      WHERE idempotency_key = ${`fbk-amb-${suffix}`} AND escritorio_id = ${escA.id} LIMIT 1
    `)) as any[];
    assert.equal(String(rows[0]?.fallback_reason ?? ''), 'uso-ambiguo-pendente-reconciliacao', 'marcado para reconciliação');
    assert.ok(['running', 'reserved'].includes(String(rows[0]?.status ?? '')), 'reserva RETIDA (não liberada) até reconciliação');
  });

  test('erro de transporte NÃO classificado pelas regex → tratado como AMBÍGUO (fail-closed)', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    let chamadasPro = 0;
    const gerar: GeneratorFn = async (op: GenParam) => {
      if (op.modelTier === 'PRO') chamadasPro += 1;
      // Erro sem texto previsto (aborto): sem evidência de resposta → ambíguo.
      throw new Error('AbortError: The operation was aborted');
    };
    const res = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: `fbk-abort-${suffix}`,
      generate: gerar,
    });
    assert.ok(!res.ok, JSON.stringify(res));
    if (res.ok) return;
    assert.equal(chamadasPro, 0, 'PRO NUNCA chamado para erro não classificado (fail-closed)');
    assert.equal(res.code, 'falha-ambigua-reconciliacao-pendente', 'tratado como ambíguo');
  });

  test('retry após PRO reservado (não liquidado) → não regera e não reutiliza como sucesso', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const chave = `fbk-pro-reservado-${suffix}`;
    const { gerar, chamadas } = geradorComFallback();
    // 1ª execução: FLASH falha (429) → PRO reservado; forçamos a geração PRO a
    // falhar de forma CONFIRMADA para deixar a operação PRO `failed`.
    const gerarComFalhaPro: GeneratorFn = async (op: GenParam) => {
      if (op.modelTier === 'FLASH') throw new ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true });
      throw new ErroGeracaoIA('400 bad request', { confirmadoSemProcessamento: true }); // PRO falha confirmada
    };
    const r1 = await runAiOperation({ user, input: inputBasico(), idempotencyKey: chave, generate: gerarComFalhaPro });
    assert.ok(!r1.ok);
    if (r1.ok) return;
    // Retry: FLASH failed → busca PRO `:pro` liquidado (não há → ja-reservado);
    // NENHUMA nova geração em qualquer tier.
    const r2 = await runAiOperation({ user, input: inputBasico(), idempotencyKey: chave, generate: gerar });
    assert.ok(r2.ok, JSON.stringify(r2));
    if (!r2.ok) return;
    assert.equal(chamadas.flash, 0, 'FLASH NÃO regerado no retry');
    assert.equal(chamadas.pro, 0, 'PRO NÃO regerado no retry');
    assert.equal(r2.phase, 'ja-reservado', 'sem PRO liquidado → estado já-reservado (sem falso sucesso)');
  });

  test('falha NÃO recuperável (recusa) → sem fallback, operação failed', async () => {
    const { gerar, chamadas } = geradorRecusa();
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const res = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: `fbk-recusa-${suffix}`,
      generate: gerar,
    });
    assert.ok(!res.ok);
    if (res.ok) return;
    assert.equal(res.code, 'geracao-falhou', 'sem fallback para recusa');
    assert.equal(chamadas.flash, 1, 'FLASH tentado 1x');
    assert.equal(chamadas.pro, 0, 'PRO NUNCA chamado para falha não recuperável');
  });

  test('env canônico DEEPSEEK_FALLBACK_TO_PRO=false desliga o fallback', async () => {
    const { gerar, chamadas } = geradorComFallback();
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const envOriginal = process.env.DEEPSEEK_FALLBACK_TO_PRO;
    process.env.DEEPSEEK_FALLBACK_TO_PRO = 'false';
    try {
      const res = await runAiOperation({
        user,
        input: inputBasico(),
        idempotencyKey: `fbk-off-env-${suffix}`,
        generate: gerar,
      });
      assert.ok(!res.ok);
      if (res.ok) return;
      assert.equal(res.code, 'geracao-falhou', 'fallback desligado pelo env canônico');
      assert.equal(chamadas.flash, 1);
      assert.equal(chamadas.pro, 0, 'PRO NUNCA chamado com DEEPSEEK_FALLBACK_TO_PRO=false');
    } finally {
      if (envOriginal === undefined) delete process.env.DEEPSEEK_FALLBACK_TO_PRO;
      else process.env.DEEPSEEK_FALLBACK_TO_PRO = envOriginal;
    }
  });

  test('compensação determinística: falha do release FLASH → compensacao-pendente', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    // Gerador que, na tentativa FLASH, LIQUIDA a própria operação antes de
    // lançar erro CONFIRMADO (429 — resposta do provedor): a FLASH já liquidada
    // não é liberada de novo; o fallback PRO tenta liberá-la e recebe
    // operacao-ja-liquidada → compensacao-pendente (nunca silenciar).
    const gerar: GeneratorFn = async (op: GenParam) => {
      if (op.modelTier === 'FLASH') {
        await settleAiUsage({ operationId: op.operationId, modelUsed: 'deepseek-v4-flash', inputTokens: 10, outputTokens: 5 });
        throw new ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true });
      }
      throw new Error('PRO não deve ser chamado');
    };
    const res = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: `fbk-comp-det-${suffix}`,
      generate: gerar,
    });
    assert.ok(!res.ok, JSON.stringify(res));
    if (res.ok) return;
    // A liberação da FLASH liquidada falha (operacao-ja-liquidada) → o fluxo
    // sinaliza compensação pendente OU retorna o estado de falha controlado.
    assert.ok(['compensacao-pendente', 'fallback-pro-indisponivel'].includes(res.code), `código controlado (${res.code})`);
    // A operação FLASH ficou liquidada (uso real) — sem perda silenciosa.
    const rows = (await db.execute(sql`
      SELECT status FROM ai_operations WHERE idempotency_key = ${`fbk-comp-det-${suffix}`} AND escritorio_id = ${escA.id} LIMIT 1
    `)) as any[];
    assert.equal(String(rows[0]?.status ?? ''), 'succeeded', 'FLASH liquidada (uso real preservado)');
  });

  test('idempotência do fallback PRO: retry da MESMA chave reutiliza o PRO liquidado (sem regerar)', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const chave = `fbk-idem-${suffix}`;
    const tokensAntes = await tokenUsageCount(adminA.id);
    const saldoAntes = await saldoEscritorio(escA.id);

    // 1ª execução: FLASH falha (recuperável) → PRO executado e liquidado.
    const { gerar, chamadas } = geradorComFallback();
    const r1 = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: chave,
      generate: gerar,
    });
    assert.ok(r1.ok, JSON.stringify(r1));
    if (!r1.ok) return;
    assert.equal(chamadas.flash, 1);
    assert.equal(chamadas.pro, 1);
    if (r1.operationId) opIds.push(r1.operationId);

    // 2ª execução (retry da MESMA chave lógica): a reserva FLASH existe
    // (ja-reservado) e o fallback PRO reutiliza a chave ':pro' já liquidada —
    // NENHUMA nova geração, nenhum débito duplicado.
    const r2 = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: chave,
      generate: gerar,
    });
    assert.ok(r2.ok, JSON.stringify(r2));
    if (!r2.ok) return;
    assert.equal(chamadas.flash, 1, 'FLASH NÃO regerado no retry');
    assert.equal(chamadas.pro, 1, 'PRO NÃO regerado no retry');
    // O retry devolve o RESULTADO do PRO liquidado (não o estado da FLASH
    // falha): operationId = operação ':pro', modelUsed = PRO.
    assert.equal(r2.phase, 'ja-liquidado', 'retry reutiliza o PRO liquidado');
    assert.equal(r2.operationId, r1.operationId, 'mesma operação PRO no retry');
    assert.equal(r2.modelUsed, 'deepseek-v4-pro', 'modelUsed reflete o fallback PRO');
    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes + 1, '1 token_usage total (sem duplicar no retry)');
    const saldoDepois = await saldoEscritorio(escA.id);
    assert.equal(saldoDepois.credits, saldoAntes.credits - (r1.creditsReserved ?? 0), 'sem débito duplicado');
  });

  test('prefixo reservado: chave normal do cliente com sufixo ":pro" NÃO é reutilizada como fallback', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const chaveBase = `fbk-colisao-${suffix}`;
    const chaveCliente = `${chaveBase}:pro`;

    // 1. O cliente usa 'foo:pro' como chave NORMAL (sem fallback) com sucesso.
    const rNormal = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: chaveCliente,
      generate: async () => ({ modelUsed: 'deepseek-v4-flash', inputTokens: 10, outputTokens: 5 }),
    });
    assert.ok(rNormal.ok, JSON.stringify(rNormal));
    if (!rNormal.ok) return;
    if (rNormal.operationId) opIds.push(rNormal.operationId);

    // 2. Uma operação com a chave base 'foo' sofre falha recuperável → o
    // fallback deriva 'smartjuris:fallback:foo:pro' (prefixo interno), NUNCA
    // colidindo com a operação normal 'foo:pro' do passo 1.
    const { gerar } = geradorComFallback();
    const rFallback = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: chaveBase,
      generate: gerar,
    });
    assert.ok(rFallback.ok, JSON.stringify(rFallback));
    if (!rFallback.ok) return;
    if (rFallback.operationId) opIds.push(rFallback.operationId);
    assert.notEqual(rFallback.operationId, rNormal.operationId, 'chaves isoladas (sem colisão)');
    assert.equal(rFallback.modelUsed, 'deepseek-v4-pro', 'fallback executou PRO próprio');
  });

  test('prefixo reservado: cliente que envia chave com prefixo interno é REJEITADO', async () => {
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const res = await runAiOperation({
      user,
      input: inputBasico(),
      idempotencyKey: `smartjuris:fallback:qualquer`,
      generate: async () => ({ modelUsed: 'deepseek-v4-flash', inputTokens: 1, outputTokens: 1 }),
    });
    assert.ok(!res.ok);
    if (res.ok) return;
    assert.equal(res.code, 'idempotency-reservada', 'prefixo interno reservado ao servidor');
  });

  test('isolamento: fallback do escritório A nunca usa operação/chave de B', async () => {
    const { gerar: gerarA } = geradorOkPro();
    const { gerar: gerarB } = geradorOkPro();
    const resA = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId },
      input: inputBasico(),
      idempotencyKey: `fbk-isoA-${suffix}`,
      generate: gerarA,
    });
    assert.ok(resA.ok, JSON.stringify(resA));
    if (resA.ok) {
      if (resA.operationId) opIds.push(resA.operationId);
      assert.equal(resA.modelUsed, 'deepseek-v4-pro');
    }
    const resB = await runAiOperation({
      user: { id: adminB.id, role: 'admin', escritorioId: adminB.escritorioId },
      input: inputBasico(),
      idempotencyKey: `fbk-isoB-${suffix}`,
      generate: gerarB,
    });
    assert.ok(resB.ok, JSON.stringify(resB));
    if (resB.ok && resB.operationId) opIds.push(resB.operationId);
    // Chaves distintas por escritório (mesma chave base, escritórios diferentes).
    assert.notEqual(resA.ok ? resA.operationId : null, resB.ok ? resB.operationId : null);
  });
});
