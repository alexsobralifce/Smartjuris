// ===========================================================================
// Testes do controle de entrada de requisitos: estruturação (contrato Zod),
// geração do roadmap e dos prompts das fases (upsert idempotente), aplicação.
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseRequirements, structureRequirements, renderRoadmapWithPhases, renderPromptsWithPhases, nextPhaseId, buildStructureInput, renderRequirementsList, assertRequirementTextLength, DEFAULT_MAX_REQUIREMENT_CHARS } from '../src/requirements.js';
import { parseRoadmap } from '../src/roadmap.js';
import { extractPhasePrompts } from '../src/prompts.js';
import type { LlmClient } from '../src/llm.js';

const ROADMAP = `# SmartJuris — Roadmap de Implementação

## Roadmap geral

| Fase | Descrição | Dependências | Estado | Implementador | Revisor |
|---|---|---|---|---|---|
| 2A | Segurança documental | — | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Luna |
| 4B | Piloto controlado | 4A | \`AUDIT_APPROVED\` | DeepSeek | GPT-5.6 Luna |

## Fases detalhadas

### 2A — Segurança documental

**Estado:** \`AUDIT_APPROVED\`

**Objetivo:**

Isolar documentos.

## Histórico de auditoria

| Data | Fase | Implementador | Revisor | Veredito | Avanço permitido | Observações |
|---|---|---|---|---|---|---|
| 2026-01-01 | 2A | DeepSeek | GPT-5.6 Luna | APPROVE | Sim | ok |
`;

const PROMPTS = `# SmartJuris — Prompts por Fase

# 2A — Segurança documental

## DeepSeek — implementação

\`\`\`text
Fase atual: 2A.
\`\`\`

## GPT-5.6 Luna — revisão

\`\`\`text
Fase: 2A.
\`\`\`
`;

const FASES = [
  {
    id: '5A',
    titulo: 'Faturamento mensal',
    descricao: 'Gerar relatório mensal de faturamento por escritório.',
    dependencias: ['4B'],
    escopo: 'Criar rota e relatório PDF.',
    foraDoEscopo: 'Não alterar créditos nem planos.',
    testesObrigatorios: ['Teste do PDF gerado', 'Teste de tenancy por escritório'],
    criteriosAceite: ['PDF gerado com valores corretos', 'Escritórios isolados'],
  },
];

describe('parseRequirements (contrato Zod)', () => {
  test('aceita JSON válido com fases enumeradas', () => {
    const doc = parseRequirements(JSON.stringify({ fases: FASES }));
    assert.equal(doc.fases.length, 1);
    assert.equal(doc.fases[0].id, '5A');
    assert.equal(doc.fases[0].criteriosAceite.length, 2);
  });

  test('rejeita campos extras (schema estrito)', () => {
    assert.throws(
      () => parseRequirements(JSON.stringify({ fases: [{ ...FASES[0], extra: 1 }] })),
      /Contrato de requisitos inválido/,
    );
  });

  test('rejeita fase sem critérios de aceite', () => {
    assert.throws(
      () => parseRequirements(JSON.stringify({ fases: [{ ...FASES[0], criteriosAceite: [] }] })),
      /criteriosAceite|mínimo|ao menos/,
    );
  });
});

describe('renderRoadmapWithPhases (upsert idempotente)', () => {
  test('adiciona linha na tabela geral e seção detalhada', () => {
    const out = renderRoadmapWithPhases(ROADMAP, FASES);
    const { phases } = parseRoadmap(out);
    assert.ok(phases.some((p) => p.id === '5A'), '5A presente no roadmap');
    assert.ok(out.includes('### 5A — Faturamento mensal'), 'seção detalhada criada');
    assert.ok(out.includes('**Dependência:** 4B aprovada(s).'), 'dependência na seção');
    // Fases antigas preservadas.
    assert.ok(phases.some((p) => p.id === '2A'));
    assert.ok(phases.some((p) => p.id === '4B'));
  });

  test('aplicar duas vezes NÃO duplica a fase (idempotência)', () => {
    const once = renderRoadmapWithPhases(ROADMAP, FASES);
    const twice = renderRoadmapWithPhases(once, FASES);
    const { phases } = parseRoadmap(twice);
    assert.equal(phases.filter((p) => p.id === '5A').length, 1, '5A única após segunda aplicação');
    assert.equal(twice.split('### 5A —').length - 1, 1, 'uma única seção detalhada');
  });
});

describe('renderPromptsWithPhases (upsert idempotente)', () => {
  test('adiciona blocos de implementação e revisão', () => {
    const out = renderPromptsWithPhases(PROMPTS, FASES);
    assert.ok(out.includes('# 5A — Faturamento mensal'), 'seção da fase criada');
    assert.ok(out.includes('## DeepSeek — implementação'), 'bloco implementador');
    assert.ok(out.includes('## GPT-5.6 Luna — revisão'), 'bloco revisor');
    // O parser consegue extrair os prompts da fase 5A.
    const p = extractPhasePrompts(out, '5A');
    assert.equal(p.name, 'Faturamento mensal');
    assert.match(p.implementer, /Faturamento mensal/);
    assert.match(p.reviewer, /Critérios de aceite/);
  });

  test('aplicar duas vezes NÃO duplica a seção (idempotência)', () => {
    const once = renderPromptsWithPhases(PROMPTS, FASES);
    const twice = renderPromptsWithPhases(once, FASES);
    assert.equal(twice.split('# 5A —').length - 1, 1, 'seção única');
  });
});

describe('structureRequirements (fluxo com LLM fake)', () => {
  const fakeLlm: LlmClient = {
    async implementer(_prompt: string, _opts?: { complex?: boolean }) {
      return {
        content: JSON.stringify({ fases: FASES }),
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
    async reviewer() {
      return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
    async structurer() {
      return { content: JSON.stringify({ fases: FASES }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
  };

  test('estrutura requisitos via structurer e retorna fases do contrato', async () => {
    let structurerCalls = 0;
    const spy: LlmClient = {
      ...fakeLlm,
      async structurer() {
        structurerCalls += 1;
        return { content: JSON.stringify({ fases: FASES }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      },
    };
    const doc = await structureRequirements(spy, 'Criar faturamento mensal');
    assert.equal(doc.fases.length, 1);
    assert.equal(doc.fases[0].id, '5A');
    assert.equal(structurerCalls, 1, 'usa o método structurer (uma chamada no sucesso)');
  });
});

describe('nextPhaseId / buildStructureInput / renderRequirementsList', () => {
  test('próximo id após 4B é 4C (incrementa letra)', () => {
    assert.equal(nextPhaseId(['2A', '4B']), '4C');
    assert.equal(nextPhaseId(['4Z']), '5A', 'letra Z → incrementa número');
    assert.equal(nextPhaseId([]), '1A');
  });

  test('buildStructureInput inclui ids existentes', () => {
    const input = buildStructureInput('requisito x', ['4B']);
    assert.ok(input.includes('4B'));
    assert.ok(input.includes('4C'));
  });

  test('renderRequirementsList enumera fases', () => {
    const out = renderRequirementsList({ fases: FASES });
    assert.ok(out.includes('1. 5A — Faturamento mensal'));
    assert.ok(out.includes('Critérios de aceite:'));
  });
});

describe('assertRequirementTextLength (limite de caracteres)', () => {
  test('aceita texto dentro do limite', () => {
    assert.doesNotThrow(() => assertRequirementTextLength('x'.repeat(1000)));
    assert.doesNotThrow(() => assertRequirementTextLength('x'.repeat(DEFAULT_MAX_REQUIREMENT_CHARS)));
  });

  test('rejeita texto acima do limite com mensagem clara', () => {
    assert.throws(
      () => assertRequirementTextLength('x'.repeat(DEFAULT_MAX_REQUIREMENT_CHARS + 1)),
      /muito longo|limite|20000/,
    );
  });

  test('aceita limite customizado', () => {
    assert.doesNotThrow(() => assertRequirementTextLength('x'.repeat(500), 1000));
    assert.throws(() => assertRequirementTextLength('x'.repeat(1500), 1000), /limite: 1000/);
  });
});
