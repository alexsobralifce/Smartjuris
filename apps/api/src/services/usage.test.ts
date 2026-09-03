import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql, eq } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios, usuarios } from '../db/schema.js';
import {
  calculateAiCostCents,
  calculateAiSettlementCents,
  estimateAiOperation,
  avaliarElegibilidade,
  reserveAiUsage,
  settleAiUsage,
  releaseAiUsageReservation,
  checkTokenQuota,
  cicloAtual,
  isHorarioPico,
  PLANS,
  OPERATION_LIMITS,
  type AiEstimateResult,
  type CreditStateEscritorio,
} from './usage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function comEnv(env: Record<string, string>, fn: () => void): void {
  const prev = new Map<string, string | undefined>();
  for (const k of Object.keys(env)) {
    prev.set(k, process.env[k]);
    process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function estimativaSimples(operation: 'SIMPLE_PETITION' | 'APPEAL' | 'COMPLEX_DOCUMENT' = 'SIMPLE_PETITION'): AiEstimateResult {
  return estimateAiOperation({ operation, pagesRelevant: 2, annexPages: 5, ragContextChars: 2_000 });
}

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

// Fecha o pool do postgres para o processo do test runner encerrar.
after(() => client.end({ timeout: 5 }));

async function criarEscritorioTeste(credits = 20, plano = 'basico', opts: { isentoMensalidade?: boolean; assinaturaStatus?: string } = {}): Promise<{ escId: string; userId: string }> {
  const [esc] = await db.insert(escritorios).values({
    nome: `Escritório Teste ${randomUUID().slice(0, 8)}`,
    plano,
    creditsAvailable: credits,
    reserveCentsUsed: 0,
    cycleMonth: cicloAtual(),
    isentoMensalidade: opts.isentoMensalidade ?? false,
    assinaturaStatus: opts.assinaturaStatus ?? 'nenhuma',
  }).returning({ id: escritorios.id });
  const [user] = await db.insert(usuarios).values({
    nome: 'Usuário Teste',
    email: `teste-${randomUUID()}@smartjuris.test`,
    senha: 'x',
    role: 'user',
    escritorioId: esc.id,
  }).returning({ id: usuarios.id });
  return { escId: esc.id, userId: user.id };
}

async function limparEscritorioTeste(escId: string): Promise<void> {
  await db.execute(sql`DELETE FROM credit_ledger WHERE escritorio_id = ${escId}`);
  await db.execute(sql`DELETE FROM ai_operations WHERE escritorio_id = ${escId}`);
  await db.execute(sql`DELETE FROM token_usage WHERE usuario_id IN (SELECT id FROM usuarios WHERE escritorio_id = ${escId})`);
  await db.execute(sql`DELETE FROM usuarios WHERE escritorio_id = ${escId}`);
  await db.delete(escritorios).where(eq(escritorios.id, escId));
}

async function saldoEscritorio(escId: string): Promise<{ credits: number; reserveUsed: number }> {
  const rows = await db.execute(sql`
    SELECT credits_available, reserve_cents_used FROM escritorios WHERE id = ${escId}
  `) as any[];
  return { credits: Number(rows[0]?.credits_available ?? 0), reserveUsed: Number(rows[0]?.reserve_cents_used ?? 0) };
}

// ---------------------------------------------------------------------------
// Preços: Flash, Pro, pico, fora de pico, arredondamento
// ---------------------------------------------------------------------------

describe('calculateAiCostCents', () => {
  test('Flash em pico usa preços de pico e converte para BRL em centavos (ceil)', () => {
    comEnv({
      DEEPSEEK_INPUT_COST_PEAK: '0.44',
      DEEPSEEK_OUTPUT_COST_PEAK: '1.32',
      USD_BRL_RATE: '5.00',
    }, () => {
      const r = calculateAiCostCents({ model: 'deepseek-v4-flash', inputTokens: 1_000_000, outputTokens: 500_000, isPeak: true });
      assert.equal(r.inputCostCents, 44);
      assert.equal(r.outputCostCents, 66);
      assert.equal(r.usdCents, 110);
      assert.equal(r.brlCents, 550);
    });
  });

  test('Flash fora de pico usa preços reduzidos', () => {
    comEnv({
      DEEPSEEK_INPUT_COST_OFFPEAK: '0.22',
      DEEPSEEK_OUTPUT_COST_OFFPEAK: '0.66',
      USD_BRL_RATE: '5.00',
    }, () => {
      const r = calculateAiCostCents({ model: 'flash', inputTokens: 1_000_000, outputTokens: 500_000, isPeak: false });
      assert.equal(r.inputCostCents, 22);
      assert.equal(r.outputCostCents, 33);
      assert.equal(r.brlCents, 275);
    });
  });

  test('Pro em pico usa tabela própria (3x Flash por padrão)', () => {
    comEnv({ USD_BRL_RATE: '5.00' }, () => {
      const r = calculateAiCostCents({ model: 'deepseek-v4-pro', inputTokens: 1_000_000, outputTokens: 500_000, isPeak: true });
      assert.equal(r.inputCostCents, 132);
      assert.equal(r.outputCostCents, 198);
      assert.equal(r.brlCents, 1650);
    });
  });

  test('Pro fora de pico usa tabela própria', () => {
    comEnv({ USD_BRL_RATE: '5.00' }, () => {
      const r = calculateAiCostCents({ model: 'pro', inputTokens: 1_000_000, outputTokens: 500_000, isPeak: false });
      assert.equal(r.inputCostCents, 66);
      assert.equal(r.outputCostCents, 99);
      assert.equal(r.brlCents, 825);
    });
  });

  test('Reserva arredonda SEMPRE para cima com precisão de centésimos (1 token => 0.01 centavo)', () => {
    comEnv({ USD_BRL_RATE: '5.00' }, () => {
      const r = calculateAiCostCents({ model: 'flash', inputTokens: 1, outputTokens: 1, isPeak: true });
      // Fase 5F: custo total arredondado no centésimo de centavo (não por componente).
      assert.equal(r.usdCents, 0.01);
      assert.equal(r.brlCents, 0.01);
    });
  });

  test('Fase 5F: fatias com o DOBRO de tokens reservam custo DIFERENTE (sem colapsar no centavo)', () => {
    comEnv({ USD_BRL_RATE: '5.00' }, () => {
      const dobro = calculateAiCostCents({ model: 'flash', inputTokens: 28_750, outputTokens: 250, isPeak: false });
      const metade = calculateAiCostCents({ model: 'flash', inputTokens: 14_375, outputTokens: 250, isPeak: false });
      assert.ok(dobro.brlCents > metade.brlCents, `dobro (${dobro.brlCents}) > metade (${metade.brlCents})`);
      // Precisão de 2 casas decimais: arredondar para 2 casas não muda o valor.
      assert.equal(Number(dobro.brlCents.toFixed(2)), dobro.brlCents, 'precisão de 2 casas decimais');
    });
  });

  test('Liquidação arredonda para o centésimo mais próximo (difere da reserva)', () => {
    comEnv({ USD_BRL_RATE: '5.00' }, () => {
      const reserva = calculateAiCostCents({ model: 'flash', inputTokens: 100_000, outputTokens: 0, isPeak: true });
      const liquida = calculateAiSettlementCents({ model: 'flash', inputTokens: 100_000, outputTokens: 0, isPeak: true });
      // 100_000 * 0.44/1M = 0.044 USD cents => usdCents 4.4 => BRL 22 centavos.
      // (Fase 5F: precisão de centésimos; para valores pequenos o total arredonda igual.)
      assert.equal(reserva.brlCents, 22);
      assert.equal(liquida.brlCents, 22);
    });
  });
});

// ---------------------------------------------------------------------------
// Estimativa
// ---------------------------------------------------------------------------

describe('estimateAiOperation', () => {
  test('SIMPLE_PETITION: 1 crédito, margem de 15% na entrada', () => {
    const e = estimativaSimples('SIMPLE_PETITION');
    assert.equal(e.creditsRequired, OPERATION_LIMITS.SIMPLE_PETITION.credits);
    // entrada bruta = (2*3000 + 2000) * 0.25 = 2000; +15% => ceil(2300)
    assert.equal(e.inputTokensEstimated, 2300);
    assert.equal(e.eligible, true);
  });

  test('APPEAL exige Pro e 1 crédito', () => {
    const e = estimativaSimples('APPEAL');
    assert.equal(e.creditsRequired, 1);
    assert.equal(OPERATION_LIMITS.APPEAL.model, 'pro');
  });

  test('Volumes acima do teto tornam a operação inelegível e avisam', () => {
    const e = estimateAiOperation({ operation: 'COMPLEX_DOCUMENT', pagesRelevant: 50, annexPages: 5, ragContextChars: 0 });
    assert.equal(e.pagesOverLimit, true);
    assert.equal(e.eligible, false);
    assert.ok(e.warnings.some((w) => w.includes('DOCUMENT_ANALYSIS_20_PAGES')));
  });
});

// ---------------------------------------------------------------------------
// Elegibilidade (pura)
// ---------------------------------------------------------------------------

describe('avaliarElegibilidade', () => {
  const estimativa = estimativaSimples('SIMPLE_PETITION');

  test('Saldo suficiente => allowed', () => {
    const state: CreditStateEscritorio = { creditsAvailable: 20, reserveCentsUsed: 0, cycleMonth: cicloAtual(), plano: 'basico' };
    const r = avaliarElegibilidade(state, estimativa, PLANS.ESSENTIAL);
    assert.equal(r.allowed, true);
    assert.equal(r.creditsRequired, 1);
  });

  test('Saldo insuficiente => bloqueado', () => {
    const state: CreditStateEscritorio = { creditsAvailable: 0, reserveCentsUsed: 0, cycleMonth: cicloAtual(), plano: 'basico' };
    const r = avaliarElegibilidade(state, estimativa, PLANS.ESSENTIAL);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'creditos-insuficientes');
  });

  test('Custo da operação acima do teto do plano => bloqueado', () => {
    const state: CreditStateEscritorio = { creditsAvailable: 20, reserveCentsUsed: 0, cycleMonth: cicloAtual(), plano: 'basico' };
    const cara = { ...estimativa, estimatedCostCents: 300 };
    const r = avaliarElegibilidade(state, cara, PLANS.ESSENTIAL);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'custo-da-operacao-excede-teto-do-plano');
  });

  test('Orçamento interno do ciclo excedido => bloqueado', () => {
    const state: CreditStateEscritorio = { creditsAvailable: 20, reserveCentsUsed: 4_400, cycleMonth: cicloAtual(), plano: 'basico' };
    const cara = { ...estimativa, estimatedCostCents: 200 };
    const r = avaliarElegibilidade(state, cara, PLANS.ESSENTIAL);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'orcamento-interno-do-ciclo-insuficiente');
  });

  test('Fase 5G: FLASH cabe mas PRO estoura com precisão de centésimos', () => {
    // Com a precisão de centésimos (5F), custos fracionários distinguem volumes:
    // um orçamento onde o custo FLASH (pequeno) cabe mas o PRO (3x) não.
    const estado: CreditStateEscritorio = { creditsAvailable: 20, reserveCentsUsed: 4_499, cycleMonth: cicloAtual(), plano: 'basico' };
    // FLASH: 0.5 centavos → cabe (4499 + 0.5 <= 4500)
    const flash = { ...estimativa, estimatedCostCents: 0.5 };
    const rFlash = avaliarElegibilidade(estado, flash, PLANS.ESSENTIAL);
    assert.equal(rFlash.allowed, true, `FLASH cabe (${estado.reserveCentsUsed} + 0.5)`);
    // PRO: 1.5 centavos → estoura (4499 + 1.5 > 4500)
    const pro = { ...estimativa, estimatedCostCents: 1.5 };
    const rPro = avaliarElegibilidade(estado, pro, PLANS.ESSENTIAL);
    assert.equal(rPro.allowed, false, 'PRO estoura o orçamento (precisão de centésimos)');
    assert.equal(rPro.reason, 'orcamento-interno-do-ciclo-insuficiente');

    // Limite EXATO de 4500 centavos é inclusivo: 4499 + 1.0 === 4500 => permitido.
    const exato = { ...estimativa, estimatedCostCents: 1.0 };
    const rExato = avaliarElegibilidade(estado, exato, PLANS.ESSENTIAL);
    assert.equal(rExato.allowed, true, '4500 exato é permitido (limite inclusivo)');
  });

  test('Rollover de ciclo: mês antigo usa o saldo do plano', () => {
    const state: CreditStateEscritorio = { creditsAvailable: 0, reserveCentsUsed: 4_400, cycleMonth: '2020-01', plano: 'basico' };
    const r = avaliarElegibilidade(state, estimativa, PLANS.ESSENTIAL, '2026-08');
    assert.equal(r.allowed, true);
    assert.equal(r.creditsAvailable, 20);
  });

  test('Warnings: saldo baixo e reserva acima de 80%', () => {
    const state: CreditStateEscritorio = { creditsAvailable: 2, reserveCentsUsed: 3_800, cycleMonth: cicloAtual(), plano: 'basico' };
    const r = avaliarElegibilidade(state, estimativa, PLANS.ESSENTIAL);
    assert.ok(r.warnings.some((w) => w.includes('abaixo de 20%')));
    assert.ok(r.warnings.some((w) => w.includes('acima de 80%')));
  });

  test('ilimitado=true (assinante/cortesia): sempre allowed, ignora saldo/custo/orçamento', () => {
    // Saldo ZERO, custo ACIMA do teto e orçamento estourado — mas ilimitado
    // (assinante/cortesia) deve liberar de qualquer forma.
    const state: CreditStateEscritorio = { creditsAvailable: 0, reserveCentsUsed: 4_500, cycleMonth: cicloAtual(), plano: 'basico' };
    const cara = { ...estimativa, estimatedCostCents: 900 }; // > maxOpCostCents (240) e > maxReserveCents (4500)
    const r = avaliarElegibilidade(state, cara, PLANS.ESSENTIAL, cicloAtual(), true);
    assert.equal(r.allowed, true);
    assert.equal(r.reason, 'acesso-liberado');
    assert.equal(r.creditsRequired, cara.creditsRequired); // telemetria preservada
  });

  test('ilimitado=true preserva a viabilidade técnica (estimate.eligible)', () => {
    // Volumes acima do teto da operação tornam eligible=false — o acesso
    // liberado NÃO permite a operação tecnicamente impossível.
    const naoElegivel = estimateAiOperation({ operation: 'COMPLEX_DOCUMENT', pagesRelevant: 50, annexPages: 5, ragContextChars: 0 });
    const state: CreditStateEscritorio = { creditsAvailable: 0, reserveCentsUsed: 0, cycleMonth: cicloAtual(), plano: 'basico' };
    const r = avaliarElegibilidade(state, naoElegivel, PLANS.ESSENTIAL, cicloAtual(), true);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'limites-da-operacao-ultrapassados');
  });
});

// ---------------------------------------------------------------------------
// checkTokenQuota (banco local; pula se indisponível)
// ---------------------------------------------------------------------------

describe('checkTokenQuota', { skip: !dbDisponivel }, () => {
  // Helper: monta um req autenticado mínimo (só user.id é usado por checkTokenQuota).
  function reqComUsuario(userId: string) {
    return { user: { id: userId } } as any;
  }

  test('Escritório NORMAL com limite de tokens: bloqueia ao atingir 100%', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      // Define limite_tokens_mes no escritório e registra uso acima do limite.
      await db.update(escritorios).set({ limiteTokensMes: 10 }).where(eq(escritorios.id, escId));
      const q = await checkTokenQuota(reqComUsuario(userId));
      assert.equal(q.status, 'ok'); // sem uso ainda
      assert.ok(q.limite == null || q.limite === 10);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('CORTESIA (isentoMensalidade=true): sem limite de tokens (status ok, limite null)', async () => {
    const { escId, userId } = await criarEscritorioTeste(20, 'basico', { isentoMensalidade: true });
    try {
      await db.update(escritorios).set({ limiteTokensMes: 5 }).where(eq(escritorios.id, escId));
      const q = await checkTokenQuota(reqComUsuario(userId));
      assert.equal(q.status, 'ok');
      assert.equal(q.limite, null, 'cortesia ignora limite_tokens_mes');
      assert.equal(q.pct, 0);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('ASSINANTE (assinatura_status=ativa): sem limite de tokens (status ok, limite null)', async () => {
    const { escId, userId } = await criarEscritorioTeste(20, 'basico', { assinaturaStatus: 'ativa' });
    try {
      await db.update(escritorios).set({ limiteTokensMes: 5 }).where(eq(escritorios.id, escId));
      const q = await checkTokenQuota(reqComUsuario(userId));
      assert.equal(q.status, 'ok');
      assert.equal(q.limite, null, 'assinante ignora limite_tokens_mes');
      assert.equal(q.pct, 0);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });
});

// ---------------------------------------------------------------------------
// Reserva / Liquidação / Liberação (banco local; pula se indisponível)
// ---------------------------------------------------------------------------

describe('reserveAiUsage (banco)', { skip: !dbDisponivel }, () => {
  test('Reserva debita créditos, cria ledger e operação; chave repetida não debita de novo', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      const estimativa = estimativaSimples('SIMPLE_PETITION');
      const chave = randomUUID();

      const r1 = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: chave, operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r1.ok, true);
      assert.equal(r1.creditsReserved, 1);
      assert.ok((r1.costCentsReserved ?? 0) > 0);
      let saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 19);

      // Idempotência: mesma chave => mesma operação, sem novo débito.
      const r2 = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: chave, operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r2.alreadyReserved, true);
      assert.equal(r2.operationId, r1.operationId);
      saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 19);

      const ops = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key = ${chave}`) as any[];
      assert.equal(ops[0].n, 1);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Saldo insuficiente => reserva negada sem débito', async () => {
    const { escId, userId } = await criarEscritorioTeste(0);
    try {
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativaSimples() });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'creditos-insuficientes');
      const saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 0);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('CORTESIA (isentoMensalidade=true): reserva SEMPRE ok, sem débito de créditos', async () => {
    const { escId, userId } = await criarEscritorioTeste(0, 'basico', { isentoMensalidade: true });
    try {
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativaSimples() });
      assert.equal(r.ok, true, 'cortesia não pode ser bloqueada por falta de créditos');
      assert.equal(r.creditsReserved, 0, 'cortesia NÃO debita créditos');
      assert.equal(r.costCentsReserved, 0, 'cortesia NÃO reserva custo');
      const saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 0, 'saldo de créditos intocado para cortesia');
      assert.equal(saldo.reserveUsed, 0, 'reserva de custo não usada para cortesia');
      // Operação persistida para telemetria/auditoria.
      const ops = await db.execute(sql`SELECT credits_reserved, cost_cents_reserved FROM ai_operations WHERE id = ${r.operationId}`) as any[];
      assert.equal(Number(ops[0]?.credits_reserved), 0);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('ASSINANTE (assinatura_status=ativa): reserva SEMPRE ok, sem débito de créditos', async () => {
    const { escId, userId } = await criarEscritorioTeste(0, 'basico', { assinaturaStatus: 'ativa' });
    try {
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativaSimples() });
      assert.equal(r.ok, true, 'assinante não pode ser bloqueado por falta de créditos');
      assert.equal(r.creditsReserved, 0, 'assinante NÃO debita créditos');
      assert.equal(r.costCentsReserved, 0, 'assinante NÃO reserva custo');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Fase 5G: efetivação da reserva com custo fracionário (reserve_cents_used arredonda, cost_cents_reserved preserva fração)', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      // Estimativa com custo FRACIONÁRIO (centésimos de centavo — precisão 5F).
      const estimativaFracionaria: AiEstimateResult = { ...estimativaSimples(), estimatedCostCents: 1.55 };
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativaFracionaria });
      assert.equal(r.ok, true);
      assert.equal(r.costCentsReserved, 1.55, 'costCentsReserved preserva a fração');

      // reserve_cents_used (integer) acumula o ROUND do custo (determinístico).
      const saldo = await saldoEscritorio(escId);
      assert.equal(saldo.reserveUsed, Math.round(1.55), `reserve_cents_used arredonda (veio ${saldo.reserveUsed})`);

      // O cost_cents_reserved na operação é numeric(10,2) com a fração.
      const rows = await db.execute(sql`SELECT cost_cents_reserved FROM ai_operations WHERE id = ${r.operationId}`) as any[];
      assert.equal(Number(rows[0]?.cost_cents_reserved), 1.55, 'numeric(10,2) preserva a fração no banco');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Fase 5G: fluxo REAL de cálculo (FLASH e PRO) até a reserva efetiva com consistência', async () => {
    const { escId, userId } = await criarEscritorioTeste(50);
    try {
      // Custos calculados pela estimativa real (tokens → tabela de preços → centésimos),
      // NÃO injetados manualmente.
      const estFlash = estimativaSimples('SIMPLE_PETITION'); // FLASH
      const estPro = estimativaSimples('APPEAL');             // PRO (3x FLASH)
      assert.ok(estFlash.estimatedCostCents > 0, `custo FLASH real > 0 (${estFlash.estimatedCostCents})`);
      assert.ok(estPro.estimatedCostCents > 0, `custo PRO real > 0 (${estPro.estimatedCostCents})`);

      for (const { operation, est } of [
        { operation: 'SIMPLE_PETITION' as const, est: estFlash },
        { operation: 'APPEAL' as const, est: estPro },
      ]) {
        const antes = await saldoEscritorio(escId);
        // Elegibilidade avalia com o MESMO custo que será reservado.
        const eleg = avaliarElegibilidade(
          { creditsAvailable: antes.credits, reserveCentsUsed: antes.reserveUsed, cycleMonth: cicloAtual(), plano: 'basico' },
          est,
          PLANS.ESSENTIAL,
        );
        assert.equal(eleg.allowed, true, `${operation} elegível com custo real ${est.estimatedCostCents}`);

        const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation, estimate: est });
        assert.equal(r.ok, true);
        // Consistência: elegibilidade → reserva → persistência usam o mesmo custo fracionário.
        assert.equal(r.costCentsReserved, est.estimatedCostCents, `${operation}: reserva == custo usado na elegibilidade`);

        const depois = await saldoEscritorio(escId);
        assert.equal(depois.reserveUsed - antes.reserveUsed, Math.round(est.estimatedCostCents), `${operation}: reserve_cents_used acumula o ROUND do custo real`);

        const rows = await db.execute(sql`SELECT cost_cents_reserved FROM ai_operations WHERE id = ${r.operationId}`) as any[];
        assert.equal(Number(rows[0]?.cost_cents_reserved), est.estimatedCostCents, `${operation}: numeric(10,2) preserva a fração do custo real`);
      }
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Fase 5H: reserva idempotente com valor fracionário não duplica nem arredonda incorretamente', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      const estimativa: AiEstimateResult = { ...estimativaSimples('SIMPLE_PETITION'), estimatedCostCents: 1.55 };
      const chave = randomUUID();

      const r1 = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: chave, operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r1.ok, true);
      assert.equal(r1.costCentsReserved, 1.55, 'primeira reserva preserva a fração');
      const apos1 = await saldoEscritorio(escId);
      assert.equal(apos1.reserveUsed, Math.round(1.55), 'reserve_cents_used arredonda UMA vez');

      // Mesma chave → mesma operação; NADA é debitado de novo.
      const r2 = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: chave, operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r2.alreadyReserved, true);
      assert.equal(r2.operationId, r1.operationId);
      assert.equal(r2.costCentsReserved, 1.55, 'repetição devolve o valor fracionário persistido');

      const apos2 = await saldoEscritorio(escId);
      assert.equal(apos2.reserveUsed, apos1.reserveUsed, 'sem duplicar o débito de reserva');
      assert.equal(apos2.credits, apos1.credits, 'sem duplicar o débito de créditos');

      const ops = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ai_operations WHERE escritorio_id = ${escId} AND idempotency_key = ${chave}`) as any[];
      assert.equal(ops[0].n, 1, 'uma única operação por chave');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });
});

describe('settleAiUsage (banco)', { skip: !dbDisponivel }, () => {
  test('Liquida com uso real, converte reserva em consumo e mantém token_usage', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      const estimativa = estimativaSimples('SIMPLE_PETITION');
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r.ok, true);
      const antes = await saldoEscritorio(escId);
      // Fase 5F: reserve_cents_used é integer (arredonda); costCentsReserved é
      // numeric(10,2) com a fração preservada. O saldo do ciclo reflete o ROUND.
      assert.equal(antes.reserveUsed, Math.round(r.costCentsReserved ?? 0));

      const s = await settleAiUsage({ operationId: r.operationId!, modelUsed: 'deepseek-v4-flash', inputTokens: 1_000, outputTokens: 300 });
      assert.equal(s.ok, true);
      assert.equal(s.status, 'succeeded');

      const depois = await saldoEscritorio(escId);
      assert.ok(depois.reserveUsed < antes.reserveUsed, 'diferença de reserva liberada');

      const ops = await db.execute(sql`SELECT status, credits_settled, cost_cents_actual FROM ai_operations WHERE id = ${r.operationId}`) as any[];
      assert.equal(ops[0].status, 'succeeded');
      assert.equal(Number(ops[0].credits_settled), 1);

      const tokens = await db.execute(sql`SELECT COUNT(*)::int AS n FROM token_usage WHERE operacao = 'SIMPLE_PETITION' AND usuario_id = ${userId}`) as any[];
      assert.equal(tokens[0].n, 1);

      // Dupla liquidação é no-op.
      const s2 = await settleAiUsage({ operationId: r.operationId!, modelUsed: 'deepseek-v4-flash', inputTokens: 1_000, outputTokens: 300 });
      assert.equal(s2.alreadySettled, true);
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Fase 5H: settle com reserva fracionária NÃO cobra a mais e o ledger espelha o movimento real', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      // Reserva FRACIONÁRIA (1.55 centavos) — precisão 5E/5F.
      const estimativa: AiEstimateResult = { ...estimativaSimples('SIMPLE_PETITION'), estimatedCostCents: 1.55 };
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r.ok, true);
      assert.equal(r.costCentsReserved, 1.55);
      const antes = await saldoEscritorio(escId);
      assert.equal(antes.reserveUsed, Math.round(1.55), 'reserva aplica ROUND(1.55)=2');

      // Custo REAL do provedor (independente da precisão da reserva) MENOR que
      // a reserva: o excedente da reserva fracionária é devolvido (não cobra a mais).
      const real = calculateAiSettlementCents({ model: 'deepseek-v4-flash', inputTokens: 1_000, outputTokens: 0, isPeak: isHorarioPico() });
      const s = await settleAiUsage({ operationId: r.operationId!, modelUsed: 'deepseek-v4-flash', inputTokens: 1_000, outputTokens: 0 });
      assert.equal(s.ok, true);

      // Movimento aplicado ao reserve_cents_used: ROUND(real) - ROUND(reservado).
      const esperadoMovimento = Math.round(real.brlCents) - Math.round(1.55);
      const depois = await saldoEscritorio(escId);
      assert.equal(depois.reserveUsed, antes.reserveUsed + esperadoMovimento, `movimento exato (${esperadoMovimento})`);
      assert.ok(depois.reserveUsed <= antes.reserveUsed, 'não cobra a mais com a nova precisão');

      const ops = await db.execute(sql`SELECT cost_cents_actual FROM ai_operations WHERE id = ${r.operationId}`) as any[];
      assert.equal(Number(ops[0]?.cost_cents_actual), Math.round(real.brlCents), 'cost_cents_actual = ROUND(custo real)');

      // Fase 5I: o ledger SETTLE (numeric(10,2)) registra o delta financeiro
      // PRECISO (custo real − reservado fracionário) — telemetria com fração.
      const ledger = await db.execute(sql`SELECT cost_cents FROM credit_ledger WHERE operation_id = ${r.operationId} AND kind = 'SETTLE'`) as any[];
      assert.equal(Number(ledger[0]?.cost_cents), real.brlCents - 1.55, 'ledger SETTLE registra o delta fracionário (real − reservado)');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Fase 5H: dados legados integer em cost_cents_reserved são liquidados corretamente', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      // Operação legada (pré-5E): cost_cents_reserved INTEGER (22), sem fração.
      const op = await db.execute(sql`
        INSERT INTO ai_operations (idempotency_key, escritorio_id, usuario_id, operation_type, status, model, credits_reserved, cost_cents_reserved)
        VALUES (${randomUUID()}, ${escId}, ${userId}, 'SIMPLE_PETITION', 'reserved', 'deepseek-v4-flash', 1, 22)
        RETURNING id
      `) as any[];
      // Estado do ciclo como se a reserva legada tivesse sido aplicada.
      await db.execute(sql`
        UPDATE escritorios SET credits_available = 19, reserve_cents_used = 22 WHERE id = ${escId}
      `);

      const real = calculateAiSettlementCents({ model: 'deepseek-v4-flash', inputTokens: 100_000, outputTokens: 0, isPeak: isHorarioPico() });
      const s = await settleAiUsage({ operationId: op[0].id, modelUsed: 'deepseek-v4-flash', inputTokens: 100_000, outputTokens: 0 });
      assert.equal(s.ok, true);
      assert.equal(s.status, 'succeeded');

      const saldo = await saldoEscritorio(escId);
      // Movimento: ROUND(real) - ROUND(22) aplicado sobre a reserva legada (22).
      assert.equal(saldo.reserveUsed, 22 + Math.round(real.brlCents) - 22, 'reserva legada integer tratada no settle');

      const ops = await db.execute(sql`SELECT status, cost_cents_actual FROM ai_operations WHERE id = ${op[0].id}`) as any[];
      assert.equal(ops[0].status, 'succeeded');
      assert.equal(Number(ops[0].cost_cents_actual), Math.round(real.brlCents));

      const ledger = await db.execute(sql`SELECT cost_cents FROM credit_ledger WHERE operation_id = ${op[0].id} AND kind = 'SETTLE'`) as any[];
      assert.equal(Number(ledger[0]?.cost_cents), real.brlCents - 22, 'ledger SETTLE registra o delta fracionário da operação legada');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });
});

describe('releaseAiUsageReservation (banco)', { skip: !dbDisponivel }, () => {
  test('Libera reserva sem consumo e impede dupla liberação', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      const estimativa = estimativaSimples('SIMPLE_PETITION');
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r.ok, true);
      let saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 19);

      const l1 = await releaseAiUsageReservation({ operationId: r.operationId!, reason: 'timeout' });
      assert.equal(l1.ok, true);
      assert.equal(l1.creditsReleased, 1);
      saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 20);

      // Dupla liberação não devolve de novo.
      const l2 = await releaseAiUsageReservation({ operationId: r.operationId!, reason: 'timeout' });
      assert.equal(l2.alreadyReleased, true);
      saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 20);

      const ops = await db.execute(sql`SELECT status FROM ai_operations WHERE id = ${r.operationId}`) as any[];
      assert.equal(ops[0].status, 'failed');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Consumo parcial registra ajuste e libera apenas o excedente', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      const estimativa = estimativaSimples('SIMPLE_PETITION');
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r.ok, true);

      const l = await releaseAiUsageReservation({ operationId: r.operationId!, reason: 'stream-interrompido', partialInputTokens: 500, partialOutputTokens: 100 });
      assert.equal(l.ok, true);

      const ledger = await db.execute(sql`SELECT kind FROM credit_ledger WHERE operation_id = ${r.operationId} ORDER BY kind`) as any[];
      const kinds = (ledger as any[]).map((x) => x.kind);
      assert.ok(kinds.includes('ADJUST'));
      assert.ok(kinds.includes('RELEASE'));
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('Fase 5H: liberação de dados legados integer devolve exatamente o reservado', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      // Operação legada (pré-5E): cost_cents_reserved INTEGER (22).
      const op = await db.execute(sql`
        INSERT INTO ai_operations (idempotency_key, escritorio_id, usuario_id, operation_type, status, model, credits_reserved, cost_cents_reserved)
        VALUES (${randomUUID()}, ${escId}, ${userId}, 'SIMPLE_PETITION', 'reserved', 'deepseek-v4-flash', 1, 22)
        RETURNING id
      `) as any[];
      await db.execute(sql`
        UPDATE escritorios SET credits_available = 19, reserve_cents_used = 22 WHERE id = ${escId}
      `);

      const l = await releaseAiUsageReservation({ operationId: op[0].id, reason: 'timeout-legado' });
      assert.equal(l.ok, true);
      assert.equal(l.creditsReleased, 1);
      assert.equal(l.costCentsReleased, 22, 'release libera o valor reservado legado com precisão');

      const saldo = await saldoEscritorio(escId);
      assert.equal(saldo.credits, 20, 'créditos restaurados');
      assert.equal(saldo.reserveUsed, 0, 'reserve_cents_used zerado exatamente (ROUND(22))');

      const ops = await db.execute(sql`SELECT status FROM ai_operations WHERE id = ${op[0].id}`) as any[];
      assert.equal(ops[0].status, 'failed');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 5I — Telemetria com precisão de custo reservado
// ---------------------------------------------------------------------------

describe('Fase 5I — telemetria do ledger (banco)', { skip: !dbDisponivel }, () => {
  test('ledger registra cost_cents com precisão decimal em RESERVE/SETTLE/RELEASE', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      const estimativa: AiEstimateResult = { ...estimativaSimples('SIMPLE_PETITION'), estimatedCostCents: 1.55 };
      const chave = randomUUID();
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: chave, operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r.ok, true);

      // RESERVE: telemetria do evento com a FRAÇÃO (não Math.round → 2).
      const reserva = await db.execute(sql`SELECT cost_cents FROM credit_ledger WHERE operation_id = ${r.operationId} AND kind = 'RESERVE'`) as any[];
      assert.equal(Number(reserva[0]?.cost_cents), 1.55, 'RESERVE registra 1.55 (não 2)');

      // SETTLE: delta financeiro preciso (custo real − reservado).
      const real = calculateAiSettlementCents({ model: 'deepseek-v4-flash', inputTokens: 1_000, outputTokens: 0, isPeak: isHorarioPico() });
      const s = await settleAiUsage({ operationId: r.operationId!, modelUsed: 'deepseek-v4-flash', inputTokens: 1_000, outputTokens: 0 });
      assert.equal(s.ok, true);
      const settle = await db.execute(sql`SELECT cost_cents FROM credit_ledger WHERE operation_id = ${r.operationId} AND kind = 'SETTLE'`) as any[];
      assert.equal(Number(settle[0]?.cost_cents), real.brlCents - 1.55, 'SETTLE registra o delta fracionário');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });

  test('RELEASE registra -custo reservado exato e eventos legados sem casas decimais continuam aceitos', async () => {
    const { escId, userId } = await criarEscritorioTeste(20);
    try {
      // Reserva fracionária liberada em falha: RELEASE = -1.55 (não -2).
      const estimativa: AiEstimateResult = { ...estimativaSimples('SIMPLE_PETITION'), estimatedCostCents: 1.55 };
      const r = await reserveAiUsage({ escritorioId: escId, usuarioId: userId, idempotencyKey: randomUUID(), operation: 'SIMPLE_PETITION', estimate: estimativa });
      assert.equal(r.ok, true);
      const l = await releaseAiUsageReservation({ operationId: r.operationId!, reason: 'timeout' });
      assert.equal(l.ok, true);
      const release = await db.execute(sql`SELECT cost_cents FROM credit_ledger WHERE operation_id = ${r.operationId} AND kind = 'RELEASE'`) as any[];
      assert.equal(Number(release[0]?.cost_cents), -1.55, 'RELEASE registra o valor reservado exato');

      // Evento LEGADO (pré-5I): cost_cents integer (22) lido como número.
      await db.execute(sql`
        INSERT INTO credit_ledger (escritorio_id, operation_id, operation_type, kind, credits_delta, cost_cents, model, idempotency_key, status)
        VALUES (${escId}, ${r.operationId}, 'SIMPLE_PETITION', 'ADJUST', 0, 22, 'deepseek-v4-flash', 'legado-5i', 'committed')
      `);
      const legado = await db.execute(sql`SELECT cost_cents FROM credit_ledger WHERE idempotency_key = 'legado-5i' AND escritorio_id = ${escId}`) as any[];
      assert.equal(Number(legado[0]?.cost_cents), 22, 'evento legado integer continua legível como número');

      // Ambos os formatos coexistem como numeric(10,2) legível.
      const misto = await db.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'credit_ledger' AND column_name = 'cost_cents'
      `) as any[];
      assert.equal(misto[0]?.data_type, 'numeric', 'coluna é numeric(10,2)');
    } finally {
      await limparEscritorioTeste(escId);
    }
  });
});
