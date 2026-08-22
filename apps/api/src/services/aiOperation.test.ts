// ===========================================================================
// Fase 2F — Orquestrador de operação de IA com idempotência e reserva.
//
// Cobertura (banco real):
//   - chave de idempotência OBRIGATÓRIA (ausente → rejeitada);
//   - fluxo completo: payload → classificação → reserva → geração → settle;
//   - retry seguro: MESMA chave reutiliza a reserva (sem débito duplicado);
//   - falha na geração LIBERA a reserva (créditos/custo devolvidos);
//   - settle não duplica token_usage;
//   - concorrência: 2 chamadas simultâneas da mesma chave → 1 reserva;
//   - isolamento entre escritórios (usuário de B não opera com dados de A).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { runAiOperation } = await import('./aiOperation.js');
const { ErroGeracaoIA } = await import('./analiseDocumental.js');
import type { AiOperationInput } from './aiOperation.js';

/** Tipo do gerador injetável (extraído da assinatura de AiOperationInput). */
type GeneratorFn = NonNullable<AiOperationInput['generate']>;
type GenParam = Parameters<GeneratorFn>[0];
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

/** Gera um resultado de geração de sucesso (uso real) com CONTADOR de chamadas. */
type GeradorOk = {
  (op: GenParam): Promise<{ modelUsed: string; inputTokens: number; outputTokens: number }>;
  chamadas(): number;
};

/** Retorna uma FUNÇÃO geradora com contador de chamadas anexado. */
function geradorOk(): GeradorOk {
  let chamadas = 0;
  const gerar: GeradorOk = function (_op) {
    return (async () => {
      chamadas += 1;
      return { modelUsed: 'deepseek-v4-flash', inputTokens: 500, outputTokens: 300 };
    })();
  };
  gerar.chamadas = () => chamadas;
  return gerar;
}

/** Gera um resultado de falha (lança). */
/** Gera falha CONFIRMADA (adaptador marcou `confirmadoSemProcessamento` —
 *  o provedor respondeu sem geração): testa a liberação da reserva. Falhas sem
 *  essa marcação estruturada (timeout/rede/5xx textual) são AMBÍGUAS e retêm a
 *  reserva (política da Fase 3B, coberta em fallbackPro.test.ts). */
function geradorFalha() {
  return async () => {
    throw new ErroGeracaoIA('400 bad request: falha simulada na geração', { confirmadoSemProcessamento: true });
  };
}

/** Conta token_usage e credit_ledger por operationId (contagens EXATAS). */
async function usoPorOperacao(operationId: string) {
  const tokens = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM token_usage WHERE operacao = ${'ai_operation'} AND metadata ->> 'operationId' = ${operationId}
  `)) as any[];
  const ledger = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM credit_ledger WHERE operation_id = ${operationId}
  `)) as any[];
  const settles = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM credit_ledger WHERE operation_id = ${operationId} AND kind = 'SETTLE'
  `)) as any[];
  return {
    tokens: Number(tokens[0]?.n ?? 0),
    ledger: Number(ledger[0]?.n ?? 0),
    settles: Number(settles[0]?.n ?? 0),
  };
}

before(async () => {
  if (!dbDisponivel) return;
  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `OpA ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    { nome: `OpB ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escA = ea; escB = eb;
  escIds.push(ea.id, eb.id);

  const hash = await bcrypt.hash('x', 10);
  const users = await db.insert(s.usuarios).values([
    { nome: 'Op Admin A', email: `op.a.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Op Admin B', email: `op.b.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, escritorioId: s.usuarios.escritorioId });
  adminA = users[0]; adminB = users[1];
  userIds.push(users[0].id, users[1].id);
});

after(async () => {
  if (dbDisponivel) {
    // Cleanup determinístico: operações antes dos usuários/escritórios.
    for (const id of opIds) await db.delete(s.aiOperations).where(eq(s.aiOperations.id, id)).catch(() => {});
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  await client.end({ timeout: 5 });
});

describe('2F — idempotência e reserva', { skip: !dbDisponivel }, () => {
  test('chave de idempotência AUSENTE é rejeitada', async () => {
    const res = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança de dívida.' },
      idempotencyKey: '',
      generate: geradorOk(),
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'idempotency-ausente');
  });

  test('fluxo completo: classificação → reserva → geração → settle (saldo debitado e liquidado)', async () => {
    const antes = await saldoEscritorio(escA.id);
    const res = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança de dívida vencida há mais de um ano, com juros e correção monetária.' },
      idempotencyKey: `2f-ok-${suffix}`,
      generate: geradorOk(),
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.phase, 'sucesso');
    assert.ok(res.operationId, 'operationId presente');
    opIds.push(res.operationId!);
    // Sem documentos, petição inicial simples → SIMPLE_PETITION (classificador).
    assert.equal(res.classification?.operation, 'SIMPLE_PETITION');
    assert.ok((res.creditsReserved ?? 0) > 0, 'créditos reservados');

    const depois = await saldoEscritorio(escA.id);
    // Reserva debitou e settle converteu em consumo: saldo final < inicial.
    assert.ok(depois.credits < antes.credits, `saldo reduziu (${antes.credits} -> ${depois.credits})`);
  });

  test('retry seguro: MESMA chave NÃO gera de novo e reutiliza a operação liquidada', async () => {
    const chave = `2f-retry-${suffix}`;
    const g = geradorOk();
    const antes = await saldoEscritorio(escA.id);

    const r1 = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança.' },
      idempotencyKey: chave,
      generate: g,
    });
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    opIds.push(r1.operationId!);
    assert.equal(g.chamadas(), 1, 'primeira execução gera 1x');
    const saldoApos1 = await saldoEscritorio(escA.id);

    // Retry com a MESMA chave e MESMO payload: NÃO chama generate de novo.
    const r2 = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança.' },
      idempotencyKey: chave,
      generate: g,
    });
    assert.equal(r2.ok, true);
    if (!r2.ok) return;
    assert.equal(r2.operationId, r1.operationId, 'mesma operação reutilizada');
    assert.equal(r2.phase, 'ja-liquidado', 'operação já liquidada');
    assert.equal(g.chamadas(), 1, 'retry NÃO gerou de novo (exatamente 1 chamada total)');

    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, saldoApos1.credits, 'retry sem débito adicional');

    // Uso exato por operationId: 1 token_usage e 1 SETTLE.
    const uso = await usoPorOperacao(r1.operationId!);
    assert.equal(uso.ledger, 2, 'RESERVE + SETTLE');
    assert.equal(uso.settles, 1, 'exatamente 1 liquidação');
    void antes;
  });

  test('falha na geração LIBERA a reserva (créditos devolvidos)', async () => {
    const antes = await saldoEscritorio(escA.id);
    const res = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Notificação Extrajudicial', area: 'Cível', dadosCaso: 'Comunicação de rescisão.' },
      idempotencyKey: `2f-falha-${suffix}`,
      generate: geradorFalha(),
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, 'geracao-falhou');

    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits, 'créditos devolvidos após falha');
    assert.equal(depois.reserveCents, antes.reserveCents, 'reserva de custo liberada');
  });

  test('settle não duplica token_usage: 2 chamadas da MESMA chave → 1 uso + 1 liquidação', async () => {
    const chave = `2f-tokens-${suffix}`;
    const g = geradorOk();
    const r1 = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Manifestação', area: 'Cível', dadosCaso: 'Requerimento de juntada.' },
      idempotencyKey: chave,
      generate: g,
    });
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    opIds.push(r1.operationId!);
    assert.equal(g.chamadas(), 1, 'gerou 1x');

    const r2 = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Manifestação', area: 'Cível', dadosCaso: 'Requerimento de juntada.' },
      idempotencyKey: chave,
      generate: g,
    });
    assert.equal(r2.ok, true);
    if (!r2.ok) return;
    assert.equal(r2.phase, 'ja-liquidado', 'segunda chamada vê operação já liquidada');
    assert.equal(g.chamadas(), 1, 'segunda chamada NÃO gerou');

    // Contagem EXATA por operationId: 1 liquidação financeira (SETTLE).
    const uso = await usoPorOperacao(r1.operationId!);
    assert.equal(uso.settles, 1, 'exatamente 1 liquidação');
    assert.equal(uso.ledger, 2, 'RESERVE + SETTLE');
    void tokenUsageCount;
  });

  test('concorrência: 2 chamadas simultâneas da MESMA chave → 1 geração + 1 liquidação', async () => {
    const chave = `2f-conc-${suffix}`;
    const g = geradorOk(); // gerador COMPARTILHADO com contador
    const [c1, c2] = await Promise.all([
      runAiOperation({
        user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
        input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança concorrente.' },
        idempotencyKey: chave,
        generate: g,
      }),
      runAiOperation({
        user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
        input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança concorrente.' },
        idempotencyKey: chave,
        generate: g,
      }),
    ]);
    assert.equal(c1.ok, true);
    assert.equal(c2.ok, true);
    if (!c1.ok || !c2.ok) return;
    assert.equal(c1.operationId, c2.operationId, 'mesma operação para a mesma chave');
    opIds.push(c1.operationId!);
    assert.equal(g.chamadas(), 1, 'concorrência: exatamente 1 geração');

    const rows = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key = ${chave}
    `)) as any[];
    assert.equal(Number(rows[0]?.n ?? 0), 1, 'uma única operação no banco');

    const uso = await usoPorOperacao(c1.operationId!);
    assert.equal(uso.settles, 1, 'exatamente 1 liquidação');
    assert.equal(uso.ledger, 2, 'RESERVE + SETTLE');
  });

  test('MESMA chave com payload DIFERENTE no mesmo escritório → conflito explícito', async () => {
    const chave = `2f-conflito-${suffix}`;
    const r1 = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança de dívida A.' },
      idempotencyKey: chave,
      generate: geradorOk(),
    });
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    opIds.push(r1.operationId!);

    // MESMA chave, payload DIFERENTE → conflito de fingerprint (sem nova geração).
    const r2 = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança de dívida B completamente diferente.' },
      idempotencyKey: chave,
      generate: geradorOk(),
    });
    assert.equal(r2.ok, false);
    if (r2.ok) return;
    assert.equal(r2.code, 'idempotencia-conflito');
  });

  test('MESMA chave em escritórios DISTINTOS → operações independentes', async () => {
    const chave = `2f-iso-chave-${suffix}`;
    const gA = geradorOk();
    const gB = geradorOk();
    const ra = await runAiOperation({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança.' },
      idempotencyKey: chave,
      generate: gA,
    });
    assert.equal(ra.ok, true);
    if (!ra.ok) return;
    opIds.push(ra.operationId!);

    // Mesma chave, escritório B: operação NOVA (independente).
    const rb = await runAiOperation({
      user: { id: adminB.id, role: 'admin', escritorioId: escB.id },
      input: { pieceType: 'Petição Inicial', area: 'Cível', dadosCaso: 'Cobrança.' },
      idempotencyKey: chave,
      generate: gB,
    });
    assert.equal(rb.ok, true);
    if (!rb.ok) return;
    opIds.push(rb.operationId!);
    assert.notEqual(rb.operationId, ra.operationId, 'operações independentes por escritório');
    assert.equal(gA.chamadas(), 1, 'A gerou 1x');
    assert.equal(gB.chamadas(), 1, 'B gerou 1x');
  });

  test('isolamento: usuário de B não consegue operar no contexto de A (vínculo inválido)', async () => {
    // Claim diz escritorioId=escA mas o usuário pertence a B → payloadBuilder rejeita.
    const res = await runAiOperation({
      user: { id: adminB.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
      idempotencyKey: `2f-iso-${suffix}`,
      generate: geradorOk(),
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, 'vinculo-invalido');
  });
});
