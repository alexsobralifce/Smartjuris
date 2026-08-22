// ===========================================================================
// Fábrica de dependências reais. A validação de chaves de API é LAZY: ocorre
// apenas no momento da chamada LLM, para que `ai:status`, `ai:approve` e
// `ai:dry-run` funcionem offline.
// ===========================================================================

import { SafeExecutor } from './executor.js';
import { createGitOps } from './git.js';
import { chatCompletion, type LlmClient } from './llm.js';
import { loadEnv } from './config.js';
import type { AutomationConfig } from './contracts.js';
import { createLogger, type Logger } from './io.js';
import { type Env } from './paths.js';
import { type RunDeps } from './run.js';

export function createRealDeps(opts: {
  env: Env;
  config: AutomationConfig;
  repoRoot: string;
  aiDevDir: string;
  log?: Logger;
}): RunDeps {
  const log = opts.log ?? createLogger(opts.env);
  const exec = new SafeExecutor();

  const llm: LlmClient = {
    async implementer(prompt: string): Promise<string> {
      const eff = loadEnv(opts.env, opts.config);
      return chatCompletion({
        baseUrl: eff.deepseekBaseUrl,
        apiKey: eff.deepseekApiKey,
        model: eff.deepseekModel,
        system:
          'Você é o implementador do SmartJuris. Implemente apenas a fase solicitada, execute testes e build e reporte evidências. Não invente dados nem altere arquivos fora do escopo.',
        user: prompt,
        temperature: 0.3,
        maxTokens: 8000,
      });
    },
    async reviewer(context: string, correctionHint?: string): Promise<string> {
      const eff = loadEnv(opts.env, opts.config);
      const user = correctionHint
        ? `${context}\n\nA resposta anterior não seguiu o contrato. Erro: ${correctionHint}\nResponda novamente somente com o JSON válido do contrato.`
        : context;
      return chatCompletion({
        baseUrl: eff.openaiBaseUrl,
        apiKey: eff.openaiApiKey,
        model: eff.openaiReviewModel,
        system: [
          'Você é um revisor técnico independente de uma implementação de software.',
          'Analise o resultado enviado e responda SOMENTE com um objeto JSON válido,',
          'sem texto fora do JSON e sem cercas de código. O JSON deve seguir EXATAMENTE',
          'este contrato (sem campos extras):',
          '{ "phase": string, "verdict": "APPROVE"|"APPROVE_WITH_CONDITIONS"|"REJECT",',
          '  "advanceAllowed": boolean,',
          '  "findings": [{ "severity": "BLOCKER"|"HIGH"|"MEDIUM"|"LOW"|"PASS", "file": string|null,',
          '                 "line": number|null, "requirement": string, "evidence": string,',
          '                 "impact": string, "action": string }],',
          '  "requiredFixes": string[], "missingTests": string[], "scopeViolations": string[],',
          '  "migrationRisks": string[], "securityRisks": string[], "financialRisks": string[],',
          '  "rollbackRisks": string[], "nextPhase": string|null }',
        ].join('\n'),
        user,
        temperature: 0,
        maxTokens: 4000,
      });
    },
  };

  return {
    exec,
    git: createGitOps(exec, opts.repoRoot),
    llm,
    repoRoot: opts.repoRoot,
    aiDevDir: opts.aiDevDir,
    config: opts.config,
    env: opts.env,
    log,
  };
}
