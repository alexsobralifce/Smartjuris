// Testes do parser/updater do roadmap (tabela, seções detalhadas, histórico,
// máquina de estados e seleção da próxima fase).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  parseRoadmap,
  parsePhaseRow,
  renderRoadmap,
  buildHistoryRow,
  findNextPlannable,
  findPhase,
  getBlockingDependencies,
  canTransition,
  assertTransition,
  isValidPhaseId,
} from '../src/roadmap.js';

const FIXTURE = `# Roadmap

## Objetivo

Teste.

## Estados

- \`PLANNED\`: planejada.

## Roadmap geral

| Fase | Descrição | Dependências | Estado | Implementador | Revisor |
|---|---|---|---|---|---|
| 2A | Segurança documental | — | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Terra |
| 2A.1 | Testes HTTP de tenancy | 2A | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |
| 2B | Catálogo compartilhado | 2A.1 | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |
| 2F | Reserva | 2B, 2C | \`PLANNED\` | DeepSeek | GPT-5.6 Terra |

## Fases detalhadas

### 2A.1 — Testes HTTP de tenancy

**Estado:** \`PLANNED\`

**Dependência:** 2A aprovada.

**Objetivo:**

Testar tenancy por HTTP.

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |
|---|---|---|---|---|---|---|
| — | 2A | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | Segurança documental aprovada |
`;

describe('roadmap parser', () => {
  test('parseia a tabela "Roadmap geral" preservando ordem e dependências', () => {
    const { phases } = parseRoadmap(FIXTURE);
    assert.equal(phases.length, 4);
    assert.deepEqual(phases.map((p) => p.id), ['2A', '2A.1', '2B', '2F']);
    assert.deepEqual(phases[0].dependencies, []);
    assert.deepEqual(phases[1].dependencies, ['2A']);
    assert.deepEqual(phases[3].dependencies, ['2B', '2C']);
    assert.equal(phases[1].status, 'PLANNED');
    assert.equal(phases[1].implementer, 'DeepSeek');
    assert.equal(phases[1].reviewer, 'GPT-5.6 Terra');
  });

  test('parsePhaseRow ignora cabeçalho, separador e linhas não relacionadas', () => {
    assert.equal(parsePhaseRow('| Fase | Descrição | Dependências | Estado | Implementador | Revisor |'), null);
    assert.equal(parsePhaseRow('|---|---|---|---|---|---|'), null);
    assert.equal(parsePhaseRow('texto livre'), null);
  });

  test('findNextPlannable retorna 2A.1 (2A aprovada) e não 2B/2F', () => {
    const { phases } = parseRoadmap(FIXTURE);
    const next = findNextPlannable(phases);
    assert.equal(next?.id, '2A.1');
  });

  test('getBlockingDependencies identifica dependências não aprovadas', () => {
    const { phases } = parseRoadmap(FIXTURE);
    const b = findPhase(phases, '2B')!;
    assert.deepEqual(getBlockingDependencies(phases, b), ['2A.1']);
    const f = findPhase(phases, '2F')!;
    assert.deepEqual(getBlockingDependencies(phases, f), ['2B', '2C']);
  });
});

describe('roadmap render (conservador)', () => {
  test('atualiza célula de estado na tabela e na seção detalhada, preservando o resto', () => {
    const out = renderRoadmap(FIXTURE, { '2A.1': 'IMPLEMENTING' });
    assert.match(out, /^\| 2A\.1 \| Testes HTTP de tenancy \| 2A \| `IMPLEMENTING` \| DeepSeek \| GPT-5\.6 Terra \|$/m);
    assert.match(out, /^### 2A\.1 — Testes HTTP de tenancy$/m);
    assert.ok(out.includes('**Estado:** `IMPLEMENTING`'));
    // demais linhas intactas
    assert.ok(out.includes('## Objetivo'));
    assert.ok(out.includes('- `PLANNED`: planejada.'));
    assert.match(out, /^\| 2A \| Segurança documental \| — \| `AUDIT_APPROVED` \| DeepSeek \| GPT-5\.6 Terra \|$/m);
  });

  test('não altera nada quando não há atualizações', () => {
    assert.equal(renderRoadmap(FIXTURE), FIXTURE);
  });

  test('anexa linha ao Histórico de auditoria após a última linha de dados', () => {
    const row = buildHistoryRow({
      date: '2026-01-01',
      phase: '2A.1',
      implementer: 'DeepSeek',
      reviewer: 'GPT-5.6 Terra',
      verdict: 'APPROVE',
      advanceAllowed: true,
      note: 'gate ok',
    });
    const out = renderRoadmap(FIXTURE, { '2A.1': 'AUDIT_APPROVED' }, [row]);
    const idx = out.indexOf('| — | 2A | DeepSeek |');
    const rowIdx = out.indexOf('| 2026-01-01 | 2A.1 | DeepSeek |');
    assert.ok(idx >= 0 && rowIdx > idx, 'nova linha vem depois da última existente');
    assert.match(out, /^\| 2026-01-01 \| 2A\.1 \| DeepSeek \| GPT-5\.6 Terra \| APPROVE \| Sim \| gate ok \|$/m);
  });

  test('lança erro se pedir histórico sem seção correspondente', () => {
    const noHistory = FIXTURE.split('\n').filter((l) => !l.includes('Histórico de auditoria')).join('\n');
    assert.throws(
      () => renderRoadmap(noHistory, {}, ['| x |']),
      /Histórico de auditoria/,
    );
  });

  test('regressão: histórico seguido de outra seção "##" não perde a posição', () => {
    // O arquivo real tem "## Critério final" DEPOIS do histórico; o contador
    // não pode ser resetado por títulos posteriores.
    const md = [
      '## Roadmap geral',
      '| Fase | Descrição | Dependências | Estado | Implementador | Revisor |',
      '|---|---|---|---|---|---|',
      '| 2A.1 | Testes | 2A | `PLANNED` | DeepSeek | GPT-5.6 Terra |',
      '',
      '## Histórico de auditoria',
      '',
      '| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |',
      '|---|---|---|---|---|---|---|',
      '| — | 2A | DeepSeek | GPT-5.6 Terra | APPROVE | Sim | aprovada |',
      '',
      '## Critério final',
      '',
      'Quando todas as fases estiverem aprovadas.',
    ].join('\n');
    const row = buildHistoryRow({
      date: '2026-08-22',
      phase: '2A.1',
      implementer: 'DeepSeek',
      reviewer: 'GPT-5.6 Terra',
      verdict: 'APPROVE',
      advanceAllowed: true,
      note: 'gate ok',
    });
    const out = renderRoadmap(md, { '2A.1': 'AUDIT_APPROVED' }, [row]);
    const histIdx = out.indexOf('## Histórico de auditoria');
    const rowIdx = out.indexOf('| 2026-08-22 | 2A.1 | DeepSeek |');
    const critIdx = out.indexOf('## Critério final');
    assert.ok(histIdx >= 0 && rowIdx > histIdx && rowIdx < critIdx, 'linha inserida entre histórico e Critério final');
    assert.ok(out.includes('## Critério final'));
  });
});

describe('máquina de estados', () => {
  test('transições válidas do fluxo', () => {
    assert.ok(canTransition('PLANNED', 'IMPLEMENTING'));
    assert.ok(canTransition('IMPLEMENTING', 'IMPLEMENTED'));
    assert.ok(canTransition('IMPLEMENTED', 'AUDIT_PENDING'));
    assert.ok(canTransition('AUDIT_PENDING', 'AUDIT_APPROVED'));
    assert.ok(canTransition('AUDIT_PENDING', 'CORRECTION_PENDING'));
    assert.ok(canTransition('AUDIT_PENDING', 'AUDIT_FAILED'));
    assert.ok(canTransition('CORRECTION_PENDING', 'IMPLEMENTING'));
    assert.ok(canTransition('AUDIT_FAILED', 'IMPLEMENTING'));
    assert.ok(canTransition('BLOCKED', 'PLANNED'));
  });

  test('transições inválidas lançam', () => {
    assert.ok(!canTransition('AUDIT_APPROVED', 'IMPLEMENTING'));
    assert.ok(!canTransition('PLANNED', 'AUDIT_APPROVED'));
    assert.throws(() => assertTransition('PLANNED', 'AUDIT_APPROVED'), /Transição de estado inválida/);
  });

  test('isValidPhaseId aceita 2A.1 e rejeita valores perigosos', () => {
    assert.ok(isValidPhaseId('2A.1'));
    assert.ok(isValidPhaseId('2B'));
    assert.ok(!isValidPhaseId('../x'));
    assert.ok(!isValidPhaseId('a b'));
    assert.ok(!isValidPhaseId(''));
  });
});

// Evidência de leitura: arquivo real do repositório (se presente).
const here = dirname(fileURLToPath(import.meta.url));
const realRoadmap = join(here, '..', '..', '..', 'docs', 'ai-development', 'implementation-roadmap.md');

describe('roadmap real do repositório (leitura)', { skip: !existsSync(realRoadmap) }, () => {
  test('parseia o arquivo real; dependências coerentes; próxima elegível tem deps aprovadas', () => {
    const md = readFileSync(realRoadmap, 'utf8');
    const { phases } = parseRoadmap(md);
    assert.ok(phases.length >= 10, `fases encontradas: ${phases.length}`);
    const a = findPhase(phases, '2A');
    assert.equal(a?.status, 'AUDIT_APPROVED');
    const a2 = findPhase(phases, '2A.2');
    assert.ok(a2, 'fase 2A.2 presente');
    assert.deepEqual(a2?.dependencies, ['2A.1']);
    // A próxima fase elegível (se houver) deve ter TODAS as dependências aprovadas.
    const next = findNextPlannable(phases);
    if (next) {
      for (const dep of next.dependencies) {
        assert.equal(findPhase(phases, dep)?.status, 'AUDIT_APPROVED', `dep ${dep} aprovada`);
      }
    }
    // render com update preserva o arquivo (sem erro de histórico).
    const out = renderRoadmap(md, { '2A.1': 'IMPLEMENTING' });
    assert.ok(out.includes('## Histórico de auditoria'));
  });
});
