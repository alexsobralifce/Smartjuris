// ===========================================================================
// Testes das BALIZAS ANTI-LOOP do orquestrador (guardrails.ts).
//
// Compilado de orquestradores conhecidos (OpenRouter doom-loop, TokenFuse
// budget, AgentPatterns circuit breakers). As funções são DETERMINÍSTICAS
// (runtime, não instrução ao modelo) — estas suites provam cada baliza.
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checarOrcamentoFase,
  hashSaidaComando,
  verificarDoomLoopComando,
  normalizarRequirement,
  mesmosRequisitos,
  convergenciaFalhouV2,
  deveEscalarRevisor,
  custoAcumuladoDaFase,
} from '../src/guardrails.js';

// ---------------------------------------------------------------------------
// B1 — Orçamento de custo por fase
// ---------------------------------------------------------------------------

describe('B1 — orçamento de custo por fase (maxUsdPorFase)', () => {
  const config = (maxUsdPorFase: number) => ({
    limits: { maxUsdPorFase, maxCorrectionAttempts: 4, requireTests: true, requireBuild: true, requireDiff: true, blockOnHigh: true, blockOnBlocker: true },
  }) as any;

  test('dentro do orçamento → ok', () => {
    const r = checarOrcamentoFase(config(0.4), [{ runId: 'r1', costUsd: 0.05 }], 0.02);
    assert.equal(r.ok, true);
    assert.equal(r.acumuladoUsd, 0.07);
  });

  test('acima do orçamento → abre circuito com motivo', () => {
    const r = checarOrcamentoFase(config(0.4), [{ runId: 'r1', costUsd: 0.30 }, { runId: 'r2', costUsd: 0.15 }], 0.01);
    assert.equal(r.ok, false);
    assert.match(r.motivo ?? '', /Orçamento da fase ultrapassado/);
    assert.ok(r.acumuladoUsd > r.limiteUsd);
  });

  test('custo acumulado real lido de runs/ (custo por papel somado)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baliza-b1-'));
    const runs = join(dir, 'runs');
    mkdirSync(runs, { recursive: true });
    const r1 = join(runs, '20260106T000000Z-7X');
    mkdirSync(r1, { recursive: true });
    writeFileSync(join(r1, 'run.json'), JSON.stringify({
      runId: '20260106T000000Z-7X', implementerUsage: { costUsd: 0.10 }, reviewerUsage: { costUsd: 0.05 },
    }), 'utf8');
    const r2 = join(runs, '20260106T010000Z-7X');
    mkdirSync(r2, { recursive: true });
    writeFileSync(join(r2, 'run.json'), JSON.stringify({
      runId: '20260106T010000Z-7X', implementerUsage: { costUsd: 0.02 }, reviewerUsage: { costUsd: 0.01 },
    }), 'utf8');
    const rodadas = await custoAcumuladoDaFase(dir, '7X', '20260106T010000Z-7X');
    assert.equal(rodadas.length, 1);
    assert.ok(Math.abs((rodadas[0].costUsd ?? 0) - 0.15) < 1e-9, '0.10 + 0.05 = 0.15 (tolerância float)');
  });
});

// ---------------------------------------------------------------------------
// B2 — Doom-loop de comando (mesma saída N vezes)
// ---------------------------------------------------------------------------

describe('B2 — doom-loop de comando', () => {
  test('hash estável: mesma saída → mesmo hash', () => {
    assert.equal(hashSaidaComando('falhou: teste X'), hashSaidaComando('falhou: teste X'));
    assert.notEqual(hashSaidaComando('falhou: teste X'), hashSaidaComando('passou: teste X'));
  });

  test('mesma saída 3× seguidas → doom-loop', () => {
    const h = hashSaidaComando('falhou: teste X');
    const hist = [{ comando: 'pnpm test', hashes: [h, h] }];
    const r = verificarDoomLoopComando(hist, 'pnpm test', 'falhou: teste X', 3);
    assert.equal(r.repetido, true);
    assert.equal(r.sequencia, 3);
  });

  test('saída diferente → não é doom-loop (sequencia reinicia)', () => {
    const h = hashSaidaComando('falhou: teste X');
    const hist = [{ comando: 'pnpm test', hashes: [h, h] }];
    const r = verificarDoomLoopComando(hist, 'pnpm test', 'falhou: teste Y', 3);
    assert.equal(r.repetido, false);
    assert.equal(r.sequencia, 1);
  });

  test('comando distinto → não conta no histórico do outro', () => {
    const r = verificarDoomLoopComando([], 'pnpm build', 'qualquer', 3);
    assert.equal(r.repetido, false);
    assert.equal(r.sequencia, 1);
  });
});

// ---------------------------------------------------------------------------
// B3 — Loopgain v2 (chave normalizada + custo crescente)
// ---------------------------------------------------------------------------

describe('B3 — loopgain v2 (convergência por conteúdo)', () => {
  test('normalizarRequirement ignora caixa, pontuação e acentos', () => {
    assert.equal(normalizarRequirement('A criação deve ser IDEMPOTENTE!'), normalizarRequirement('a criacao deve ser idempotente'));
    assert.equal(normalizarRequirement('Plano — Básico'), 'plano basico');
  });

  test('mesmosRequisitos: reescrita do texto é o MESMO achado', () => {
    const a1 = 'Webhooks devem impedir replay e processar cada evento de forma idempotente e ordenada.';
    const a2 = 'Webhooks de pagamento devem impedir replay e processar cada evento de forma idempotente e ordenada.';
    assert.equal(mesmosRequisitos(a1, a2), true, 'inserção de "de pagamento" não pode contar como resolvido');
    assert.equal(mesmosRequisitos(a1, 'replay deve ser impedido'), false, 'requisitos distintos não são o mesmo achado');
  });


  test('sem redução de graves + custo crescente → abre circuito', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baliza-b3-'));
    const runs = join(dir, 'runs');
    mkdirSync(runs, { recursive: true });
    const prevRun = '20260106T000000Z-7A';
    mkdirSync(join(runs, prevRun), { recursive: true });
    writeFileSync(join(runs, prevRun, 'run.json'), JSON.stringify({
      runId: prevRun, status: 'AUDIT_FAILED',
      audit: { findings: [
        { severity: 'HIGH', file: 'billing.ts', requirement: 'Webhooks devem impedir replay e processar cada evento de forma idempotente e ordenada' },
      ] },
      implementerUsage: { costUsd: 0.02 }, reviewerUsage: { costUsd: 0.01 },
    }), 'utf8');

    // Atual: MESMO achado (reescrita) + custo MAIOR → sem convergência.
    const r = await convergenciaFalhouV2(dir, '7A', '20260106T010000Z-7A', {
      findings: [
        { severity: 'HIGH', file: 'billing.ts', requirement: 'Webhooks de pagamento devem impedir replay e processar cada evento de forma idempotente e ordenada' },
      ],
    }, 0.10);
    assert.ok(r, 'reescrita + custo crescente = sem convergência');
    assert.equal(r!.resolvidos, 0);
    assert.equal(r!.custoCrescenteSemResolucao, true);
  });

  test('achado resolvido → convergindo (não abre circuito)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baliza-b3b-'));
    const runs = join(dir, 'runs');
    mkdirSync(runs, { recursive: true });
    const prevRun = '20260106T000000Z-7A';
    mkdirSync(join(runs, prevRun), { recursive: true });
    writeFileSync(join(runs, prevRun, 'run.json'), JSON.stringify({
      runId: prevRun, status: 'AUDIT_FAILED',
      audit: { findings: [
        { severity: 'HIGH', file: 'billing.ts', requirement: 'Webhooks devem impedir replay' },
      ] },
      implementerUsage: { costUsd: 0.02 }, reviewerUsage: { costUsd: 0.01 },
    }), 'utf8');

    // Atual: achado GRAVE resolvido (sem HIGH) → convergiu.
    const r = await convergenciaFalhouV2(dir, '7A', '20260106T010000Z-7A', {
      findings: [{ severity: 'MEDIUM', file: 'billing.ts', requirement: 'melhoria opcional' }],
    }, 0.10);
    assert.equal(r, null, 'sem achados graves = convergiu');
  });
});

// ---------------------------------------------------------------------------
// B4 — Escalada do revisor
// ---------------------------------------------------------------------------

describe('B4 — escalada do revisor (anti-loop de revisão)', () => {
  const config = (escalateAfterAttempts: number, maxEscalations: number) => ({
    reviewer: { escalateAfterAttempts, maxEscalations, model: 'gpt-5.6-luna' },
    limits: { maxCorrectionAttempts: 4, requireTests: true, requireBuild: true, requireDiff: true, blockOnHigh: true, blockOnBlocker: true },
  }) as any;

  test('abaixo do limiar → não escala', () => {
    const r = deveEscalarRevisor(config(2, 1), 1, 0);
    assert.equal(r.escalar, false);
    assert.equal(r.exigirHumano, false);
  });

  test('no limiar com escalação disponível → escala', () => {
    const r = deveEscalarRevisor(config(2, 1), 2, 0);
    assert.equal(r.escalar, true);
    assert.equal(r.exigirHumano, false);
  });

  test('após o teto de escalações → exige humano (para de gastar)', () => {
    const r = deveEscalarRevisor(config(2, 1), 3, 1);
    assert.equal(r.escalar, false);
    assert.equal(r.exigirHumano, true);
    assert.match(r.motivo ?? '', /decisão humana/i);
  });
});

// ---------------------------------------------------------------------------
// B5 — Timeout de LLM por rodada (maxMinutesPorRodada)
// ---------------------------------------------------------------------------

describe('B5 — timeout de chamada LLM', () => {
  test('chatCompletion aborta com timeout curto e lança erro de limite', async () => {
    const { chatCompletion } = await import('../src/llm.js');
    // Servidor HTTP local que NUNCA responde (fica preso) → timeout dispara.
    const http = await import('node:http');
    const server = http.createServer(() => { /* nunca responde */ });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    try {
      await assert.rejects(
        chatCompletion({
          baseUrl: `http://127.0.0.1:${port}`,
          apiKey: 'teste',
          model: 'x',
          system: 's',
          user: 'u',
          timeoutMs: 300, // 300ms → aborta rápido
        }),
        /tempo limite|LLM/,
        'chamada travada deve ser abortada pelo timeout',
      );
    } finally {
      server.close();
    }
  });
});
