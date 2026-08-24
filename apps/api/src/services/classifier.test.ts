// ===========================================================================
// Testes do classificador determinístico de operações de IA (Contrato v3)
// Cobre os 26 cenários obrigatórios + 20 testes adicionais oficiais (Q1–Q5)
// + helpers puros + validação de entrada.
// ===========================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAiOperation,
  classifierOutputSchema,
  OPERATION_CATALOG,
  AI_OPERATIONS,
  getOperationPolicy,
  getClassificationForOperation,
  calculateAnalysisBlocks,
  calculatePagesToAnalyze,
  getFixedCredits,
  isDraftingOperation,
  isAnalysisOperation,
  isValidSectionReviewTarget,
  type ClassifierOutput,
} from './classifier.js';

// ---------------------------------------------------------------------------
// Helpers de cenário
// ---------------------------------------------------------------------------

type Overrides = Record<string, unknown>;

const casoPadrao = {
  processNumber: '0001234-56.2026.5.02.0001',
  clientName: 'Maria Silva',
  adverseParty: 'Banco X S.A.',
  facts: 'Contrato de empréstimo consignado com juros abusivos e retenção indevida de margem.',
};

const documentosPadrao = {
  count: 1,
  totalPages: 6,
  relevantPages: 6,
  indexedCount: 1,
  processableCount: 1,
  failedCount: 0,
  summariesAvailable: true,
  structuredFactsAvailable: true,
};

function baseInput(overrides: Overrides = {}): Overrides {
  return {
    workspace: { planCode: 'OFFICE', creditsAvailable: 100, aiBudgetAvailableCents: 12_500 },
    case: {
      processNumber: '0001234-56.2026.5.02.0001',
      clientName: 'Maria Silva',
      adverseParty: 'Banco X S.A.',
      facts: 'Contrato de empréstimo consignado com juros abusivos e retenção indevida de margem.',
    },
    documents: { ...documentosPadrao },
    rag: { available: true, relevantChunks: 4, hasVerifiableSources: true, retrievalConfidence: 0.9 },
    ...overrides,
  };
}

function classify(overrides: Overrides = {}): ClassifierOutput {
  return classifyAiOperation(baseInput(overrides));
}

function validaSaida(out: ClassifierOutput): void {
  const parsed = classifierOutputSchema.safeParse(out);
  if (!parsed.success) {
    assert.fail(`saída fora do contrato: ${JSON.stringify(parsed.error.issues)}`);
  }
}

// ---------------------------------------------------------------------------
// 1–6. Operações de redação
// ---------------------------------------------------------------------------

test('01. Manifestação simples → SIMPLE_PETITION (Flash, 1 crédito, READY)', () => {
  const out = classify({
    request: { operationRequested: 'manifestação simples', desiredOutput: 'manifestação requerendo diligência' },
  });
  assert.equal(out.status, 'READY');
  assert.equal(out.operation, 'SIMPLE_PETITION');
  assert.equal(out.classification, 'SIMPLE');
  assert.equal(out.recommendedModelTier, 'FLASH');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.canStartDrafting, true);
  validaSaida(out);
});

test('02. Petição inicial simples → SIMPLE_PETITION', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial', userInstruction: 'elaborar petição inicial simples' },
    case: {
      processNumber: '0001234-56.2026.5.02.0001',
      clientName: 'Maria Silva',
      adverseParty: 'Banco X',
      facts: 'Atraso na entrega de produto adquirido em loja.',
    },
  });
  assert.equal(out.operation, 'SIMPLE_PETITION');
  assert.equal(out.classification, 'SIMPLE');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.status, 'READY');
  validaSaida(out);
});

test('03. Petição padrão (fatos extensos) → STANDARD_PETITION', () => {
  const fatosLongos = 'Fato relevante narrado em detalhe com datas, valores e cláusulas contratuais. '.repeat(40);
  const out = classify({
    request: { pieceType: 'Petição Inicial' },
    case: {
      processNumber: '0001234-56.2026.5.02.0001',
      clientName: 'Maria Silva',
      adverseParty: 'Banco X',
      facts: fatosLongos,
    },
  });
  assert.equal(out.operation, 'STANDARD_PETITION');
  assert.equal(out.classification, 'STANDARD');
  assert.equal(out.requiredCredits, 1);
  validaSaida(out);
});

test('04. Contestação → STANDARD_PETITION (Flash, 1 crédito)', () => {
  const out = classify({ request: { pieceType: 'Contestação' } });
  assert.equal(out.operation, 'STANDARD_PETITION');
  assert.equal(out.recommendedModelTier, 'FLASH');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.needsHumanReview, true);
  validaSaida(out);
});

test('05. Apelação → APPEAL (Pro, 1 crédito, enfrenta sentença)', () => {
  const out = classify({
    request: { pieceType: 'Recurso de Apelação' },
    case: { ...casoPadrao, hasJudgmentToAddress: true, riskLevel: 'HIGH' },
  });
  assert.equal(out.operation, 'APPEAL');
  assert.equal(out.classification, 'COMPLEX');
  assert.equal(out.recommendedModelTier, 'PRO');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.status, 'READY');
  assert.equal(out.canStartDrafting, true);
  validaSaida(out);
});

test('06. Parecer completo → COMPLEX_DOCUMENT (Pro, 1 crédito)', () => {
  const out = classify({ request: { pieceType: 'Parecer' } });
  assert.equal(out.operation, 'COMPLEX_DOCUMENT');
  assert.equal(out.classification, 'COMPLEX');
  assert.equal(out.recommendedModelTier, 'PRO');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.status, 'READY');
  validaSaida(out);
});

// ---------------------------------------------------------------------------
// 7–10. Revisão, análise e pesquisa
// ---------------------------------------------------------------------------

test('07. Revisão de cláusula → SECTION_REVIEW (Flash, 1 crédito)', () => {
  const out = classify({
    request: { reviewTarget: 'CLAUSE', desiredOutput: 'Cláusula 5.2 — Juros: taxa de 8% ao mês...' },
  });
  assert.equal(out.operation, 'SECTION_REVIEW');
  assert.equal(out.classification, 'SIMPLE');
  assert.equal(out.recommendedModelTier, 'FLASH');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.status, 'READY');
  assert.equal(out.canStartDrafting, true);
  validaSaida(out);
});

test('08. Análise de contrato inteiro → DOCUMENT_ANALYSIS_20_PAGES (blocos de 20)', () => {
  const out = classify({
    request: { reviewTarget: 'FULL_DOCUMENT', userInstruction: 'analisar contrato integralmente' },
    documents: { ...documentosPadrao, relevantPages: 30, pagesAlreadyAnalyzed: 0 },
  });
  assert.equal(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  assert.equal(out.status, 'NEEDS_DOCUMENT_ANALYSIS');
  assert.equal(out.pagesToAnalyze, 30);
  assert.equal(out.analysisBlocks, 2);
  assert.equal(out.requiredCredits, 2);
  assert.equal(out.canStartAnalysis, true);
  assert.equal(out.canStartDrafting, false);
  assert.equal(out.needsDocumentAnalysis, true);
  validaSaida(out);
});

test('09. Pesquisa jurisprudencial standalone → JURISPRUDENCE_RESEARCH (não é peça)', () => {
  const out = classify({
    request: { operationRequested: 'pesquisa de jurisprudência sobre dano moral' },
  });
  assert.equal(out.operation, 'JURISPRUDENCE_RESEARCH');
  assert.equal(out.recommendedModelTier, 'FLASH');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.needsHumanReview, false);
  assert.equal(out.canStartDrafting, false);
  assert.equal(out.canStartAnalysis, false);
  assert.equal(out.status, 'READY');
  validaSaida(out);
});

test('10. Pesquisa como suboperação de apelação → APPEAL preservado', () => {
  const out = classify({
    request: { operationRequested: 'apelação', includeJurisprudence: true },
    case: { ...casoPadrao, hasJudgmentToAddress: true },
  });
  assert.equal(out.operation, 'APPEAL');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.needsJurisprudenceResearch, true);
  assert.equal(out.subOperations.length, 0); // Fase 1: só representação conceitual
  assert.ok(out.warnings.some(w => w.includes('etapa interna da operação principal')));
  assert.equal(out.canStartDrafting, true);
  validaSaida(out);
});

// ---------------------------------------------------------------------------
// 11–13. Análise documental: blocos e páginas desconhecidas
// ---------------------------------------------------------------------------

test('11. 120 páginas sem análise → 6 blocos, 6 créditos', () => {
  const out = classify({
    request: { operationRequested: 'análise de autos' },
    documents: { ...documentosPadrao, relevantPages: 120, pagesAlreadyAnalyzed: 0 },
  });
  assert.equal(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  assert.equal(out.pagesToAnalyze, 120);
  assert.equal(out.analysisBlocks, 6);
  assert.equal(out.requiredCredits, 6);
  assert.equal(out.canStartAnalysis, true);
  assert.equal(out.status, 'NEEDS_DOCUMENT_ANALYSIS');
  validaSaida(out);
});

test('12. 120 páginas com 40 analisadas → 80 páginas, 4 blocos, 4 créditos', () => {
  const out = classify({
    request: { operationRequested: 'análise de autos' },
    documents: { ...documentosPadrao, relevantPages: 120, pagesAlreadyAnalyzed: 40 },
  });
  assert.equal(out.pagesToAnalyze, 80);
  assert.equal(out.analysisBlocks, 4);
  assert.equal(out.requiredCredits, 4);
  assert.equal(out.canStartAnalysis, true);
  validaSaida(out);
});

test('13. Páginas desconhecidas → nulls + canStartAnalysis=false + revalidação (Q2)', () => {
  const out = classify({
    request: { operationRequested: 'análise de autos' },
    documents: { count: 1, totalPages: 0, indexedCount: 1, processableCount: 0, failedCount: 0 },
  });
  assert.equal(out.status, 'NEEDS_DOCUMENT_ANALYSIS');
  assert.equal(out.classification, 'STANDARD');
  assert.equal(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  assert.equal(out.recommendedModelTier, 'FLASH');
  assert.equal(out.pagesToAnalyze, null);
  assert.equal(out.analysisBlocks, null);
  assert.equal(out.requiredCredits, null);
  assert.equal(out.estimatedInputTokens, null);
  assert.equal(out.estimatedOutputTokens, null);
  assert.equal(out.estimatedCostCents, null);
  assert.equal(out.requiresBackendEstimation, true);
  assert.equal(out.needsDocumentAnalysis, true);
  assert.equal(out.canStartAnalysis, false);
  assert.equal(out.canStartDrafting, false);
  assert.equal(out.backendMustRevalidate, true);
  assert.ok(out.warnings.some(w => w.includes('backend deve contar as páginas reais')));
  assert.notEqual(out.status, 'READY');
  validaSaida(out);
});

// ---------------------------------------------------------------------------
// 14–20. Dados ausentes, ambiguidade e bloqueio
// ---------------------------------------------------------------------------

test('14. Processo não vinculado → STANDALONE_REQUEST com warning, mas redação liberada', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial' },
    case: {
      clientName: 'Maria Silva',
      adverseParty: 'Banco X',
      facts: 'Cobrança indevida em fatura de cartão de crédito.',
    },
  });
  assert.equal(out.caseContext, 'STANDALONE_REQUEST');
  assert.equal(out.missingInformation.length, 0);
  assert.ok(out.warnings.some(w => w.includes('Vincule a peça a um processo')));
  assert.equal(out.status, 'READY_WITH_WARNINGS');
  assert.equal(out.canStartDrafting, true);
  validaSaida(out);
});

test('15. Intenção ambígua → NEEDS_CLARIFICATION', () => {
  const out = classify({
    request: { userInstruction: 'preciso de ajuda com o processo' },
    case: {},
    documents: { count: 0, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 },
  });
  assert.equal(out.status, 'NEEDS_CLARIFICATION');
  validaSaida(out);
});

test('16. Payload sem dados → INSUFFICIENT_DATA (e null/undefined → BLOCKED)', () => {
  const vazio = classifyAiOperation({});
  assert.equal(vazio.status, 'INSUFFICIENT_DATA');

  const indefinido = classifyAiOperation(undefined);
  assert.equal(indefinido.status, 'BLOCKED');
  assert.ok(indefinido.reasons.includes('conteudo-invalido'));

  const nulo = classifyAiOperation(null);
  assert.equal(nulo.status, 'BLOCKED');
  validaSaida(vazio);
  validaSaida(indefinido);
  validaSaida(nulo);
});

test('17. Documento ilegível (failedCount>0 + OCR) → BLOCKED', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial' },
    documents: {
      count: 2, totalPages: 10, indexedCount: 0, processableCount: 0,
      failedCount: 2, hasOcrRequired: true,
    },
  });
  assert.equal(out.status, 'BLOCKED');
  assert.ok(out.reasons.includes('documento-ilegivel'));
  assert.equal(out.canStartDrafting, false);
  validaSaida(out);
});

test('18. Saldo insuficiente (APPEAL 1 crédito, saldo 0) → REQUIRES_ADDITIONAL_CREDITS', () => {
  const out = classify({
    workspace: { planCode: 'OFFICE', creditsAvailable: 0 },
    request: { operationRequested: 'apelação' },
    case: { ...casoPadrao, hasJudgmentToAddress: true },
  });
  assert.equal(out.status, 'REQUIRES_ADDITIONAL_CREDITS');
  assert.equal(out.operation, 'APPEAL');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.canStartDrafting, false);
  assert.ok(out.warnings.some(w => w.includes('Saldo de créditos insuficiente')));
  validaSaida(out);
});

test('18b. Análise 120 páginas com saldo 4 → REQUIRES + pagesExceedingLimit=40', () => {
  const out = classify({
    workspace: { planCode: 'OFFICE', creditsAvailable: 4 },
    request: { operationRequested: 'análise de autos' },
    documents: { ...documentosPadrao, relevantPages: 120, pagesAlreadyAnalyzed: 0 },
  });
  assert.equal(out.status, 'REQUIRES_ADDITIONAL_CREDITS');
  assert.equal(out.requiredCredits, 6);
  assert.equal(out.pagesExceedingLimit, 40);
  assert.equal(out.canStartAnalysis, false);
  validaSaida(out);
});

test('19. Revisão sem reviewTarget e sem alvo → NEEDS_CLARIFICATION', () => {
  const out = classify({
    request: { operationRequested: 'revisão' },
    case: {},
  });
  assert.equal(out.status, 'NEEDS_CLARIFICATION');
  assert.ok(out.reasons.includes('revisao-sem-alvo'));
  validaSaida(out);
});

test('20. Regeneração sem previousGenerationId → NEEDS_CLARIFICATION (Q1)', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial', isRegeneration: true },
  });
  assert.equal(out.status, 'NEEDS_CLARIFICATION');
  assert.equal(out.classification, '');
  assert.equal(out.operation, '');
  assert.equal(out.recommendedModelTier, 'NONE');
  assert.equal(out.canStartDrafting, false);
  assert.equal(out.canStartAnalysis, false);
  assert.equal(out.requiredCredits, null);
  assert.ok(out.warnings.includes('A regeneração exige previousGenerationId válido.'));
  assert.ok(out.missingInformation.includes('previousGenerationId'));
  validaSaida(out);
});

// ---------------------------------------------------------------------------
// 21–22. Escopo e campos de análise
// ---------------------------------------------------------------------------

test('21. SECTION_REVIEW nunca classifica parecer completo', () => {
  const out = classify({
    request: { pieceType: 'Parecer', userInstruction: 'revisar o parecer completo' },
  });
  assert.equal(out.operation, 'COMPLEX_DOCUMENT');
  assert.notEqual(out.operation, 'SECTION_REVIEW');
  assert.equal(out.classification, 'COMPLEX');
  validaSaida(out);
});

test('22. pagesToAnalyze=0 para operações não documentais', () => {
  const cenarios: Overrides[] = [
    { request: { pieceType: 'Petição Inicial' }, case: { ...casoPadrao, facts: 'Fato curto.' } },
    { request: { pieceType: 'Recurso de Apelação' }, case: { ...casoPadrao, hasJudgmentToAddress: true } },
    { request: { operationRequested: 'pesquisa de jurisprudência' } },
    { request: { reviewTarget: 'CLAUSE', desiredOutput: 'Cláusula 1.' } },
  ];
  for (const cenario of cenarios) {
    const out = classify(cenario);
    assert.equal(out.pagesToAnalyze, 0, `pagesToAnalyze deve ser 0 para ${out.operation}`);
    assert.equal(out.pagesAlreadyAnalyzed, 0);
    assert.equal(out.analysisBlocks, 0);
    assert.equal(out.pagesExceedingLimit, 0);
  }
});

// ---------------------------------------------------------------------------
// 23–26. Invariantes em todos os cenários
// ---------------------------------------------------------------------------

test('23–26. Invariantes: cost null, revalidação, sem exportação, sem subops', () => {
  const cenarios: Overrides[] = [
    { request: { operationRequested: 'manifestação' } },
    { request: { pieceType: 'Petição Inicial' }, case: { ...casoPadrao, facts: 'Fato curto.' } },
    { request: { pieceType: 'Contestação' } },
    { request: { operationRequested: 'apelação' }, case: { ...casoPadrao, hasJudgmentToAddress: true } },
    { request: { pieceType: 'Parecer' } },
    { request: { reviewTarget: 'CLAUSE', desiredOutput: 'Cláusula 3.' } },
    { request: { operationRequested: 'análise de autos' }, documents: { ...documentosPadrao, relevantPages: 120, pagesAlreadyAnalyzed: 0 } },
    { request: { operationRequested: 'pesquisa de jurisprudência' } },
    {},
    { request: { userInstruction: 'ajuda' }, case: {}, documents: { count: 0, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 } },
    { workspace: { planCode: 'OFFICE', creditsAvailable: 1 }, request: { operationRequested: 'apelação' }, case: { ...casoPadrao, hasJudgmentToAddress: true } },
    { request: { pieceType: 'Petição Inicial' }, documents: { count: 2, totalPages: 10, indexedCount: 0, processableCount: 0, failedCount: 2, hasOcrRequired: true } },
  ];
  for (const cenario of cenarios) {
    const out = classify(cenario);
    assert.equal(out.estimatedCostCents, null, `cost deve ser null em ${out.status}`);
    assert.equal(out.requiresBackendEstimation, true);
    assert.equal(out.canExportAfterReview, false);
    assert.equal(out.backendMustRevalidate, true);
    assert.equal(out.parentOperationId, null);
    assert.equal(out.isSubOperation, false);
    assert.deepEqual(out.subOperations, []);
    validaSaida(out);
  }
});

test('Cobertura: todos os 7 estados aparecem nos cenários', () => {
  const resultados = [
    classify({ request: { operationRequested: 'manifestação' } }),                                  // READY
    classify({ request: { operationRequested: 'apelação', includeJurisprudence: true }, case: { ...casoPadrao, hasJudgmentToAddress: true } }), // READY_WITH_WARNINGS
    classify({ request: { operationRequested: 'análise de autos' }, documents: { ...documentosPadrao, relevantPages: 120, pagesAlreadyAnalyzed: 0 } }), // NEEDS_DOCUMENT_ANALYSIS
    classify({ request: { userInstruction: 'ajuda' }, case: {}, documents: { count: 0, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 } }), // NEEDS_CLARIFICATION
    classifyAiOperation({}),                                                                        // INSUFFICIENT_DATA
    classify({ workspace: { planCode: 'OFFICE', creditsAvailable: 0 }, request: { operationRequested: 'apelação' }, case: { ...casoPadrao, hasJudgmentToAddress: true } }), // REQUIRES_ADDITIONAL_CREDITS
    classify({ request: { pieceType: 'Petição Inicial' }, documents: { count: 2, totalPages: 10, indexedCount: 0, processableCount: 0, failedCount: 2, hasOcrRequired: true } }), // BLOCKED
  ];
  const statuses = new Set(resultados.map(r => r.status));
  assert.deepEqual([...statuses].sort(), [
    'BLOCKED',
    'INSUFFICIENT_DATA',
    'NEEDS_CLARIFICATION',
    'NEEDS_DOCUMENT_ANALYSIS',
    'READY',
    'READY_WITH_WARNINGS',
    'REQUIRES_ADDITIONAL_CREDITS',
  ]);
});

// ---------------------------------------------------------------------------
// Testes adicionais oficiais (Q1–Q5)
// ---------------------------------------------------------------------------

test('A1. Regeneração COM previousGenerationId → operação normal + regra regeneracao (Q1)', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial', isRegeneration: true, previousGenerationId: 'gen-abc-123' },
  });
  assert.equal(out.status, 'READY');
  assert.equal(out.operation, 'SIMPLE_PETITION');
  assert.equal(out.canStartDrafting, true);
  assert.ok(out.decision.rulesApplied.includes('regeneracao'));
  assert.ok(out.reasons.includes('regeneracao'));
  validaSaida(out);
});

test('A2. Regeneração=false ignora previousGenerationId (Q1)', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial', isRegeneration: false, previousGenerationId: 'gen-abc-123' },
  });
  assert.equal(out.status, 'READY');
  assert.equal(out.operation, 'SIMPLE_PETITION');
  assert.ok(!out.decision.rulesApplied.includes('regeneracao'));
  validaSaida(out);
});

test('A3. FULL_DOCUMENT com objetivo de leitura/resumo → DOCUMENT_ANALYSIS (Q3)', () => {
  const out = classify({
    request: { reviewTarget: 'FULL_DOCUMENT', userInstruction: 'leitura e resumo dos autos' },
    documents: { ...documentosPadrao, relevantPages: 6, pagesAlreadyAnalyzed: 0 },
  });
  assert.equal(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  assert.equal(out.status, 'NEEDS_DOCUMENT_ANALYSIS');
  assert.equal(out.pagesToAnalyze, 6);
  assert.equal(out.requiredCredits, 1);
  validaSaida(out);
});

test('A4. FULL_DOCUMENT + parecer completo com contexto processado → COMPLEX_DOCUMENT (Q3)', () => {
  const out = classify({
    request: { reviewTarget: 'FULL_DOCUMENT', userInstruction: 'elaborar parecer completo' },
    documents: { ...documentosPadrao, relevantPages: 30, summariesAvailable: true, structuredFactsAvailable: true },
  });
  assert.equal(out.operation, 'COMPLEX_DOCUMENT');
  assert.equal(out.status, 'READY');
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.canStartDrafting, true);
  validaSaida(out);
});

test('A5. FULL_DOCUMENT sem objetivo claro → NEEDS_CLARIFICATION (Q3)', () => {
  const out = classify({ request: { reviewTarget: 'FULL_DOCUMENT' } });
  assert.equal(out.status, 'NEEDS_CLARIFICATION');
  assert.ok(out.reasons.includes('full-document-sem-objetivo'));
  validaSaida(out);
});

test('A6. 21 páginas sem resumo/fatos estruturados → NEEDS_DOCUMENT_ANALYSIS (Q5)', () => {
  const out = classify({
    request: { pieceType: 'Contestação' },
    documents: {
      count: 1, totalPages: 21, relevantPages: 21, pagesAlreadyAnalyzed: 0,
      indexedCount: 1, processableCount: 1, failedCount: 0,
      summariesAvailable: false, structuredFactsAvailable: false,
    },
  });
  assert.equal(out.status, 'NEEDS_DOCUMENT_ANALYSIS');
  assert.equal(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  assert.equal(out.pagesToAnalyze, 21);
  assert.equal(out.analysisBlocks, 2);
  assert.equal(out.requiredCredits, 2);
  assert.equal(out.canStartDrafting, false);
  assert.ok(out.warnings.some(w => w.includes('A redação (STANDARD_PETITION) será classificada após a análise documental')));
  validaSaida(out);
});

test('A7. 21 páginas com resumo/fatos estruturados → operação final (Q5)', () => {
  const out = classify({
    request: { pieceType: 'Contestação' },
    documents: {
      count: 1, totalPages: 21, relevantPages: 21, indexedCount: 1, processableCount: 1, failedCount: 0,
      summariesAvailable: true, structuredFactsAvailable: true,
    },
  });
  assert.equal(out.operation, 'STANDARD_PETITION');
  assert.equal(out.status, 'READY');
  assert.equal(out.canStartDrafting, true);
  assert.equal(out.needsDocumentAnalysis, false);
  validaSaida(out);
});

test('A8. 10 páginas com solicitação explícita de análise → DOCUMENT_ANALYSIS (Q5)', () => {
  const out = classify({
    request: { operationRequested: 'análise de autos' },
    documents: { ...documentosPadrao, relevantPages: 10, pagesAlreadyAnalyzed: 0 },
  });
  assert.equal(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  assert.equal(out.pagesToAnalyze, 10);
  assert.equal(out.analysisBlocks, 1);
  assert.equal(out.requiredCredits, 1);
  assert.equal(out.canStartAnalysis, true);
  validaSaida(out);
});

test('A9–A11. reviewTarget CLAUSE/SECTION/SNIPPET → SECTION_REVIEW', () => {
  for (const alvo of ['CLAUSE', 'SECTION', 'SNIPPET'] as const) {
    const out = classify({ request: { reviewTarget: alvo, desiredOutput: `Trecho do ${alvo}.` } });
    assert.equal(out.operation, 'SECTION_REVIEW', `reviewTarget=${alvo}`);
    assert.equal(out.requiredCredits, 1);
    assert.equal(out.canStartDrafting, true);
    validaSaida(out);
  }
});

test('A12. reviewTarget FULL_DOCUMENT → decisão por objetivo (Q3)', () => {
  const semObjetivo = classify({ request: { reviewTarget: 'FULL_DOCUMENT' } });
  assert.equal(semObjetivo.status, 'NEEDS_CLARIFICATION');

  const analise = classify({
    request: { reviewTarget: 'FULL_DOCUMENT', operationRequested: 'indexar documentos' },
  });
  assert.equal(analise.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
  validaSaida(semObjetivo);
  validaSaida(analise);
});

test('A13. Pesquisa jurisprudencial standalone → JURISPRUDENCE_RESEARCH', () => {
  const out = classify({ request: { operationRequested: 'pesquisa de precedentes por tribunal' } });
  assert.equal(out.operation, 'JURISPRUDENCE_RESEARCH');
  assert.equal(out.needsHumanReview, false);
  assert.equal(out.canStartDrafting, false);
  validaSaida(out);
});

test('A14. Pesquisa jurisprudencial dentro de apelação → APPEAL + etapa interna', () => {
  const out = classify({
    request: { operationRequested: 'apelação', includeJurisprudence: true },
    case: { ...casoPadrao, hasJudgmentToAddress: true },
  });
  assert.equal(out.operation, 'APPEAL');
  assert.equal(out.needsJurisprudenceResearch, true);
  assert.ok(out.warnings.some(w => w.includes('etapa interna da operação principal')));
  assert.deepEqual(out.subOperations, []);
  validaSaida(out);
});

test('A15. Saldo inferior aos créditos fixos → REQUIRES_ADDITIONAL_CREDITS', () => {
  const out = classify({
    workspace: { planCode: 'OFFICE', creditsAvailable: 0 },
    request: { pieceType: 'Parecer' }, // COMPLEX_DOCUMENT = 1 crédito
  });
  assert.equal(out.status, 'REQUIRES_ADDITIONAL_CREDITS');
  assert.equal(out.canStartDrafting, false);
  assert.equal(out.estimatedCostCents, null);
  validaSaida(out);
});

test('A16. Páginas desconhecidas na análise → nulls (Q2)', () => {
  const out = classify({
    request: { operationRequested: 'análise de autos' },
    documents: { count: 1, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 },
  });
  assert.equal(out.pagesToAnalyze, null);
  assert.equal(out.analysisBlocks, null);
  assert.equal(out.requiredCredits, null);
  assert.equal(out.estimatedInputTokens, null);
  assert.equal(out.estimatedInputTokensWithSafetyMargin, null);
  assert.equal(out.estimatedOutputTokens, null);
  assert.equal(out.canStartAnalysis, false);
  assert.equal(out.status, 'NEEDS_DOCUMENT_ANALYSIS');
  validaSaida(out);
});

test('A17. Confidence HIGH (explícito), MEDIUM (instrução), LOW (ambiguidade)', () => {
  const alto = classify({ request: { pieceType: 'Contestação' } });
  assert.equal(alto.classificationConfidence, 'HIGH');

  const medio = classify({
    request: { userInstruction: 'elaborar petição inicial de cobrança' },
    case: { ...casoPadrao, facts: 'Fato curto.' },
  });
  assert.equal(medio.classificationConfidence, 'MEDIUM');

  const baixo = classify({
    request: { userInstruction: 'ajuda' },
    case: {},
    documents: { count: 0, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 },
  });
  assert.equal(baixo.status, 'NEEDS_CLARIFICATION');
  assert.equal(baixo.classificationConfidence, 'LOW');
  validaSaida(alto);
  validaSaida(medio);
  validaSaida(baixo);
});

test('A18. estimatedCostCents é sempre null', () => {
  const statuses: ClassifierOutput[] = [
    classify({ request: { operationRequested: 'manifestação' } }),
    classify({ request: { operationRequested: 'análise de autos' } }),
    classify({ request: { operationRequested: 'apelação' }, case: { ...casoPadrao, hasJudgmentToAddress: true } }),
    classify({}),
    classify({ request: { userInstruction: 'ajuda' }, case: {}, documents: { count: 0, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 } }),
    classify({ request: { pieceType: 'Petição Inicial' }, documents: { count: 2, totalPages: 10, indexedCount: 0, processableCount: 0, failedCount: 2, hasOcrRequired: true } }),
  ];
  for (const out of statuses) {
    assert.equal(out.estimatedCostCents, null);
    assert.equal(out.requiresBackendEstimation, true);
  }
});

test('A19. subOperations sempre vazio na Fase 1', () => {
  const outputs = [
    classify({ request: { operationRequested: 'apelação', includeJurisprudence: true }, case: { ...casoPadrao, hasJudgmentToAddress: true } }),
    classify({ request: { operationRequested: 'análise de autos' } }),
    classify({ request: { pieceType: 'Contestação' } }),
  ];
  for (const out of outputs) {
    assert.equal(out.parentOperationId, null);
    assert.equal(out.isSubOperation, false);
    assert.deepEqual(out.subOperations, []);
  }
});

test('A20. Campos de análise sempre zero fora de DOCUMENT_ANALYSIS_20_PAGES', () => {
  const naoDocumentais = [
    classify({ request: { pieceType: 'Petição Inicial' } }),
    classify({ request: { pieceType: 'Recurso de Apelação' }, case: { ...casoPadrao, hasJudgmentToAddress: true } }),
    classify({ request: { pieceType: 'Parecer' } }),
    classify({ request: { operationRequested: 'pesquisa de jurisprudência' } }),
    classify({ request: { reviewTarget: 'CLAUSE', desiredOutput: 'Cláusula 1.' } }),
  ];
  for (const out of naoDocumentais) {
    assert.notEqual(out.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
    assert.equal(out.pagesToAnalyze, 0);
    assert.equal(out.pagesAlreadyAnalyzed, 0);
    assert.equal(out.analysisBlocks, 0);
    assert.equal(out.pagesExceedingLimit, 0);
  }
});

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

test('helpers — catálogo com exatamente as 7 operações do contrato', () => {
  assert.deepEqual(Object.keys(OPERATION_CATALOG).sort(), [...AI_OPERATIONS].sort());
  assert.equal(getOperationPolicy('SIMPLE_PETITION').credits, 1);
  assert.equal(getOperationPolicy('SECTION_REVIEW').credits, 1);
  assert.equal(getOperationPolicy('STANDARD_PETITION').credits, 1);
  assert.equal(getOperationPolicy('APPEAL').credits, 1);
  assert.equal(getOperationPolicy('COMPLEX_DOCUMENT').credits, 1);
  assert.equal(getOperationPolicy('JURISPRUDENCE_RESEARCH').credits, 1);
  assert.equal(getOperationPolicy('DOCUMENT_ANALYSIS_20_PAGES').credits, 1); // por bloco
  assert.equal(getOperationPolicy('DOCUMENT_ANALYSIS_20_PAGES').creditsArePerBlock, true);
  assert.equal(getOperationPolicy('APPEAL').modelTier, 'PRO');
  assert.equal(getOperationPolicy('SIMPLE_PETITION').modelTier, 'FLASH');
});

test('helpers — blocos de 20 páginas', () => {
  assert.equal(calculateAnalysisBlocks(1), 1);
  assert.equal(calculateAnalysisBlocks(20), 1);
  assert.equal(calculateAnalysisBlocks(21), 2);
  assert.equal(calculateAnalysisBlocks(120), 6);
  assert.equal(calculateAnalysisBlocks(0), 0);
  assert.equal(calculateAnalysisBlocks(null), null);
});

test('helpers — páginas a analisar', () => {
  assert.equal(calculatePagesToAnalyze(120, 0), 120);
  assert.equal(calculatePagesToAnalyze(120, 40), 80);
  assert.equal(calculatePagesToAnalyze(100, 200), 0);
  assert.equal(calculatePagesToAnalyze(null, 0), null);
  assert.equal(calculatePagesToAnalyze(120, undefined), null);
});

test('helpers — créditos fixos por operação', () => {
  assert.equal(getFixedCredits('SIMPLE_PETITION', null), 1);
  assert.equal(getFixedCredits('APPEAL', null), 1);
  assert.equal(getFixedCredits('COMPLEX_DOCUMENT', null), 1);
  assert.equal(getFixedCredits('DOCUMENT_ANALYSIS_20_PAGES', 120), 6);
  assert.equal(getFixedCredits('DOCUMENT_ANALYSIS_20_PAGES', 80), 4);
  assert.equal(getFixedCredits('DOCUMENT_ANALYSIS_20_PAGES', 0), 0);
  assert.equal(getFixedCredits('DOCUMENT_ANALYSIS_20_PAGES', null), null);
});

test('helpers — classificação derivada da operação', () => {
  assert.equal(getClassificationForOperation('SIMPLE_PETITION'), 'SIMPLE');
  assert.equal(getClassificationForOperation('SECTION_REVIEW'), 'SIMPLE');
  assert.equal(getClassificationForOperation('STANDARD_PETITION'), 'STANDARD');
  assert.equal(getClassificationForOperation('DOCUMENT_ANALYSIS_20_PAGES'), 'STANDARD');
  assert.equal(getClassificationForOperation('JURISPRUDENCE_RESEARCH'), 'SIMPLE');
  assert.equal(getClassificationForOperation('APPEAL'), 'COMPLEX');
  assert.equal(getClassificationForOperation('COMPLEX_DOCUMENT'), 'COMPLEX');
  assert.equal(getClassificationForOperation(''), '');
});

test('helpers — redação, análise e alvos de revisão', () => {
  assert.equal(isDraftingOperation('SIMPLE_PETITION'), true);
  assert.equal(isDraftingOperation('SECTION_REVIEW'), true);
  assert.equal(isDraftingOperation('STANDARD_PETITION'), true);
  assert.equal(isDraftingOperation('APPEAL'), true);
  assert.equal(isDraftingOperation('COMPLEX_DOCUMENT'), true);
  assert.equal(isDraftingOperation('DOCUMENT_ANALYSIS_20_PAGES'), false);
  assert.equal(isDraftingOperation('JURISPRUDENCE_RESEARCH'), false);

  assert.equal(isAnalysisOperation('DOCUMENT_ANALYSIS_20_PAGES'), true);
  assert.equal(isAnalysisOperation('APPEAL'), false);

  assert.equal(isValidSectionReviewTarget('CLAUSE'), true);
  assert.equal(isValidSectionReviewTarget('SECTION'), true);
  assert.equal(isValidSectionReviewTarget('SNIPPET'), true);
  assert.equal(isValidSectionReviewTarget('PIECE_SECTION'), true);
  assert.equal(isValidSectionReviewTarget('FULL_DOCUMENT'), false);
  assert.equal(isValidSectionReviewTarget(undefined), false);
});

// ---------------------------------------------------------------------------
// Validação de entrada (números negativos, contagens inválidas, confiança)
// ---------------------------------------------------------------------------

test('entrada inválida — créditos negativos → BLOCKED', () => {
  const out = classify({ workspace: { planCode: 'OFFICE', creditsAvailable: -5 } });
  assert.equal(out.status, 'BLOCKED');
  assert.ok(out.reasons.includes('conteudo-invalido'));
  validaSaida(out);
});

test('entrada inválida — retrievalConfidence fora de 0–1 → BLOCKED', () => {
  const out = classify({ rag: { available: true, retrievalConfidence: 1.5 } });
  assert.equal(out.status, 'BLOCKED');
  validaSaida(out);
});

test('entrada inválida — contagens inválidas (failedCount > count) → BLOCKED', () => {
  const out = classify({
    documents: { count: 1, totalPages: 2, indexedCount: 0, processableCount: 0, failedCount: 3 },
  });
  assert.equal(out.status, 'BLOCKED');
  assert.ok(out.missingInformation.some(m => m.includes('failedCount')));
  validaSaida(out);
});

test('entrada inválida — planCode desconhecido → BLOCKED', () => {
  const out = classify({ workspace: { planCode: 'PLATINUM', creditsAvailable: 10 } });
  assert.equal(out.status, 'BLOCKED');
  validaSaida(out);
});

// ---------------------------------------------------------------------------
// Estimativas preliminares (configuração backend)
// ---------------------------------------------------------------------------

test('estimativa — outputSize STANDARD → estimatedOutputTokens = 800×1.5', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial', outputSize: 'STANDARD' },
  });
  assert.equal(out.estimatedOutputTokens, Math.ceil(800 * 1.5));
  validaSaida(out);
});

test('estimativa — entrada derivada de páginas conhecidas (350 palavras × 1.5 tok)', () => {
  const out = classify({
    request: { pieceType: 'Petição Inicial' },
    documents: { ...documentosPadrao, relevantPages: 6, estimatedInputTokens: undefined },
  });
  assert.equal(out.estimatedInputTokens, Math.ceil(6 * 350 * 1.5));
  assert.equal(out.estimatedInputTokensWithSafetyMargin, Math.ceil(Math.ceil(6 * 350 * 1.5) * 1.15));
  validaSaida(out);
});

test('estimativa — sem base (sem páginas, sem outputSize) → nulls', () => {
  const out = classify({
    request: { operationRequested: 'manifestação' },
    case: {},
    documents: { count: 0, totalPages: 0, indexedCount: 0, processableCount: 0, failedCount: 0 },
  });
  assert.equal(out.estimatedInputTokens, null);
  assert.equal(out.estimatedInputTokensWithSafetyMargin, null);
  assert.equal(out.estimatedOutputTokens, null);
  assert.equal(out.requiresBackendEstimation, true);
  validaSaida(out);
});
