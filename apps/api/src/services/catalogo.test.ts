// ===========================================================================
// Fase 2B — Catálogo compartilhado: @lexia/shared é a FONTE ÚNICA; classifier
// e usage derivam da mesma fonte (nenhum catálogo duplicado nos consumidores).
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATION_CATALOG,
  PLAN_LIMITS,
  PLAN_CODES,
  PLAN_ALIASES,
  normalizePlan,
  ANALYSIS_BLOCK_SIZE_PAGES,
  type AiOperation,
} from '@lexia/shared';
import { OPERATION_CATALOG as CLASSIFIER_CATALOG, AI_OPERATIONS } from './classifier.js';
import { OPERATION_LIMITS, PLANS, planoDoEscritorio } from './usage.js';

const OPS = AI_OPERATIONS;

describe('Fonte única (@lexia/shared) — valores do contrato 2B', () => {
  test('as 7 operações existem com o contrato exato', () => {
    assert.deepEqual(OPS, [
      'SIMPLE_PETITION',
      'SECTION_REVIEW',
      'STANDARD_PETITION',
      'DOCUMENT_ANALYSIS_20_PAGES',
      'JURISPRUDENCE_RESEARCH',
      'APPEAL',
      'COMPLEX_DOCUMENT',
    ]);

    const simples = OPERATION_CATALOG.SIMPLE_PETITION;
    assert.equal(simples.classification, 'SIMPLE');
    assert.equal(simples.model, 'FLASH');
    assert.equal(simples.credits, 1);
    assert.equal(simples.maxInputTokens, 8_000);
    assert.equal(simples.maxOutputTokens, 2_500);
    assert.equal(simples.maxOutputPages, 3);
    assert.equal(simples.maxAttachmentPages, 10);
    assert.equal(simples.isDraftingOperation, true);
    assert.equal(simples.requiresHumanReview, true);
    assert.equal(simples.isAnalysisOperation, false);

    const revisao = OPERATION_CATALOG.SECTION_REVIEW;
    assert.equal(revisao.credits, 1);
    assert.equal(revisao.maxInputTokens, 8_000);
    assert.equal(revisao.maxOutputTokens, 2_000);

    const padrao = OPERATION_CATALOG.STANDARD_PETITION;
    assert.equal(padrao.classification, 'STANDARD');
    assert.equal(padrao.credits, 1);
    assert.equal(padrao.maxInputTokens, 25_000);
    assert.equal(padrao.maxOutputTokens, 10_000);
    assert.equal(padrao.maxOutputPages, 12);
    assert.equal(padrao.maxAttachmentPages, 20);

    const analise = OPERATION_CATALOG.DOCUMENT_ANALYSIS_20_PAGES;
    assert.equal(analise.classification, 'STANDARD');
    assert.equal(analise.model, 'FLASH');
    assert.equal(analise.credits, 1);
    assert.equal(analise.maxInputTokens, 25_000);
    assert.equal(analise.maxOutputTokens, 4_000);
    assert.equal(analise.blockSizePages, ANALYSIS_BLOCK_SIZE_PAGES);
    assert.equal(analise.isAnalysisOperation, true);
    assert.equal(analise.isDraftingOperation, false);
    assert.equal(analise.isStandaloneSearch, false);

    const pesquisa = OPERATION_CATALOG.JURISPRUDENCE_RESEARCH;
    assert.equal(pesquisa.credits, 1);
    assert.equal(pesquisa.maxInputTokens, 12_000);
    assert.equal(pesquisa.maxOutputTokens, 3_000);
    assert.equal(pesquisa.resultLimit, 8);
    assert.equal(pesquisa.isStandaloneSearch, true);
    assert.equal(pesquisa.isAnalysisOperation, false);

    const recurso = OPERATION_CATALOG.APPEAL;
    assert.equal(recurso.classification, 'COMPLEX');
    assert.equal(recurso.model, 'PRO');
    assert.equal(recurso.credits, 1);
    assert.equal(recurso.maxInputTokens, 35_000);
    assert.equal(recurso.maxOutputTokens, 13_000);
    assert.equal(recurso.maxOutputPages, 15);
    assert.equal(recurso.maxAttachmentPages, 40);

    const complexo = OPERATION_CATALOG.COMPLEX_DOCUMENT;
    assert.equal(complexo.classification, 'COMPLEX');
    assert.equal(complexo.model, 'PRO');
    assert.equal(complexo.credits, 1);
    assert.equal(complexo.maxInputTokens, 45_000);
    assert.equal(complexo.maxOutputTokens, 18_000);
    assert.equal(complexo.maxOutputPages, 20);
    assert.equal(complexo.maxAttachmentPages, 60);
  });

  test('planos canônicos e aliases (sem alterar dados)', () => {
    assert.deepEqual(Object.keys(PLAN_LIMITS).sort(), ['ESSENTIAL', 'OFFICE', 'PROFESSIONAL']);
    assert.equal(normalizePlan('basico'), 'ESSENTIAL');
    assert.equal(normalizePlan('starter'), 'ESSENTIAL');
    assert.equal(normalizePlan('pro'), 'PROFESSIONAL');
    assert.equal(normalizePlan('profissional'), 'PROFESSIONAL');
    assert.equal(normalizePlan('professional'), 'PROFESSIONAL');
    assert.equal(normalizePlan('office'), 'OFFICE');
    assert.equal(normalizePlan('enterprise'), 'OFFICE');
    assert.equal(normalizePlan('ESSENTIAL'), 'ESSENTIAL');
    assert.equal(normalizePlan(null), null);
    assert.equal(normalizePlan('plano-invalido'), null);
    assert.equal(PLAN_ALIASES.basico, 'ESSENTIAL');
  });
});

describe('Equivalência classifier ← shared (mesma fonte)', () => {
  test('cada operação do classificador deriva do catálogo compartilhado', () => {
    for (const op of OPS) {
      const shared = OPERATION_CATALOG[op];
      const policy = CLASSIFIER_CATALOG[op];
      assert.equal(policy.operation, shared.operation);
      assert.equal(policy.modelTier, shared.model);
      assert.equal(policy.credits, shared.credits);
      assert.equal(policy.maxInputTokens, shared.maxInputTokens);
      assert.equal(policy.maxOutputTokens, shared.maxOutputTokens);
      assert.equal(policy.maxOutputPages, shared.maxOutputPages);
      assert.equal(policy.maxAnnexPages, shared.maxAttachmentPages);
      assert.equal(policy.classification, shared.classification);
      assert.equal(policy.producesText, shared.isDraftingOperation);
      assert.equal(policy.isAnalysis, shared.isAnalysisOperation);
      assert.equal(policy.creditsArePerBlock, shared.isAnalysisOperation && shared.blockSizePages != null);
    }
  });

  test('análise documental usa crédito por bloco de 20 páginas', () => {
    const shared = OPERATION_CATALOG.DOCUMENT_ANALYSIS_20_PAGES;
    const policy = CLASSIFIER_CATALOG.DOCUMENT_ANALYSIS_20_PAGES;
    assert.equal(shared.blockSizePages, 20);
    assert.equal(policy.creditsArePerBlock, true);
  });

  test('pesquisa jurisprudencial passa a ter limites do contrato (12k/3k) e é standalone', () => {
    const shared = OPERATION_CATALOG.JURISPRUDENCE_RESEARCH;
    const policy = CLASSIFIER_CATALOG.JURISPRUDENCE_RESEARCH;
    assert.equal(shared.isStandaloneSearch, true);
    assert.equal(shared.resultLimit, 8);
    assert.equal(policy.maxInputTokens, 12_000);
    assert.equal(policy.maxOutputTokens, 3_000);
  });
});

describe('Equivalência usage ← shared (mesma fonte)', () => {
  test('limites de operação do usage derivam do catálogo compartilhado', () => {
    for (const op of OPS) {
      const shared = OPERATION_CATALOG[op];
      const limits = OPERATION_LIMITS[op as AiOperation];
      assert.equal(limits.model, shared.model.toLowerCase());
      assert.equal(limits.credits, shared.credits);
      assert.equal(limits.maxInputTokens, shared.maxInputTokens ?? 0);
      assert.equal(limits.maxOutputTokens, shared.maxOutputTokens ?? 0);
      assert.equal(limits.maxOutputPages, shared.maxOutputPages ?? 0);
      assert.equal(limits.maxAnnexPages, shared.maxAttachmentPages ?? 0);
    }
  });

  test('planos do usage derivam de PLAN_LIMITS compartilhado', () => {
    for (const plan of ['ESSENTIAL', 'PROFESSIONAL', 'OFFICE'] as const) {
      const shared = PLAN_LIMITS[plan];
      const config = PLANS[plan];
      assert.equal(config.creditsPerCycle, shared.creditsMonthly);
      assert.equal(config.maxReserveCents, shared.maxReserveCents);
      assert.equal(config.maxOpCostCents, shared.maxOpCostCents);
    }
    assert.equal(planoDoEscritorio('pro'), 'PROFESSIONAL');
    assert.equal(planoDoEscritorio('profissional'), 'PROFESSIONAL');
    assert.equal(planoDoEscritorio('office'), 'OFFICE');
    assert.equal(planoDoEscritorio('basico'), 'ESSENTIAL');
    assert.equal(planoDoEscritorio('inexistente'), 'ESSENTIAL');
  });
});

describe('Garantias da fonte única (2B)', () => {
  test('todos os PLAN_CODES do shared possuem entrada em PLANS (usage)', () => {
    assert.deepEqual(Object.keys(PLANS).sort(), [...PLAN_CODES].sort());
  });

  test('dist do @lexia/shared existe (garantia de build antes dos consumidores)', () => {
    const sharedDist = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'packages',
      'shared',
      'dist',
    );
    assert.ok(existsSync(join(sharedDist, 'index.js')), 'dist/index.js presente');
    assert.ok(existsSync(join(sharedDist, 'index.d.ts')), 'dist/index.d.ts presente');
    assert.ok(existsSync(join(sharedDist, 'catalog.js')), 'dist/catalog.js presente');
  });

  test('consumidores de @lexia/shared têm prebuild/predev do shared (build limpo)', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
    for (const app of ['api', 'web']) {
      const pkgPath = join(repoRoot, 'apps', app, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      if (!pkg.dependencies?.['@lexia/shared']) continue; // não consome o shared
      const scripts = pkg.scripts ?? {};
      assert.match(
        scripts.predev ?? '',
        /pnpm --filter @lexia\/shared build/,
        `apps/${app} deve ter predev que constrói o shared`,
      );
      assert.match(
        scripts.prebuild ?? '',
        /pnpm --filter @lexia\/shared build/,
        `apps/${app} deve ter prebuild que constrói o shared`,
      );
      // pretest só é exigido se o app tiver suíte de testes própria.
      if (scripts.test) {
        assert.match(
          scripts.pretest ?? '',
          /pnpm --filter @lexia\/shared build/,
          `apps/${app} deve ter pretest que constrói o shared`,
        );
      }
    }
  });
});
