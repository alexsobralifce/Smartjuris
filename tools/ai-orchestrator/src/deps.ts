// ===========================================================================
// Fábrica de dependências reais. A validação de chaves de API é LAZY: ocorre
// apenas no momento da chamada LLM, para que `ai:status`, `ai:approve` e
// `ai:dry-run` funcionem offline.
// ===========================================================================

import { SafeExecutor } from './executor.js';
import { createGitOps } from './git.js';
import { chatCompletion, STRUCTURE_SYSTEM_PROMPT, type LlmClient } from './llm.js';
import { loadEnv, applyRepoDotEnv, applyLegacyAliases } from './config.js';
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
  // Carrega o .env da raiz (sem override) e aceita o alias legado DEEP_SEEK_API.
  applyRepoDotEnv(opts.repoRoot, opts.env);
  applyLegacyAliases(opts.env);
  const log = opts.log ?? createLogger(opts.env);
  const exec = new SafeExecutor();

  const llm: LlmClient = {
    async implementer(prompt: string, implOpts?: { complex?: boolean }) {
      const eff = loadEnv(opts.env, opts.config);
      return chatCompletion({
        baseUrl: eff.deepseekBaseUrl,
        apiKey: eff.deepseekApiKey,
        model: implOpts?.complex ? eff.deepseekModelPro : eff.deepseekModel,
        system:
          'Você é o implementador do SmartJuris. Implemente apenas a fase solicitada, execute testes e build e reporte evidências. Não invente dados nem altere arquivos fora do escopo. IMPORTANTE: VOCÊ NÃO TEM FERRAMENTAS — não emita <tool_call>, function calls, nem peça permissão para executar comandos. Escreva DIRETAMENTE os arquivos de código na sua resposta (patch completo dos arquivos alterados) e relate o que fez em texto. Use comandos de shell apenas citando-os no relatório, nunca como tool_call.',
        user: prompt,
        temperature: 0.3,
        // Modelos de raciocínio gastam tokens no reasoning_content antes de
        // produzir o diff; 8000 truncava → implementador só "pensava" sem
        // escrever arquivos. 12000 garante raciocínio + código real.
        maxTokens: 12000,
        completionTokensField: 'max_tokens', // DeepSeek
        timeoutMs: (opts.config.limits.maxMinutesPorRodada ?? 10) * 60_000,
      });
    },
    async reviewer(context: string, correctionHint?: string, modelOverride?: string) {
      const eff = loadEnv(opts.env, opts.config);
      const user = correctionHint
        ? `${context}\n\nA resposta anterior não seguiu o contrato. Erro: ${correctionHint}\nResponda novamente somente com o JSON válido do contrato.`
        : context;
      return chatCompletion({
        baseUrl: eff.openaiBaseUrl,
        apiKey: eff.openaiApiKey,
        model: modelOverride ?? eff.openaiReviewModel,
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
        maxTokens: 4000,
        completionTokensField: 'max_completion_tokens', // OpenAI (modelos novos)
        timeoutMs: (opts.config.limits.maxMinutesPorRodada ?? 10) * 60_000,
      });
    },
    async structurer(prompt: string) {
      const eff = loadEnv(opts.env, opts.config);
      return chatCompletion({
        baseUrl: eff.deepseekBaseUrl,
        apiKey: eff.deepseekApiKey,
        model: eff.deepseekModel, // DeepSeek Flash
        system: STRUCTURE_SYSTEM_PROMPT,
        user: prompt,
        temperature: 0.3,
        // Modelos de raciocínio (deepseek-v4-flash) gastam tokens no
        // reasoning_content antes de emitir o JSON; 4000 truncava o contrato.
        maxTokens: 12000,
        completionTokensField: 'max_tokens', // DeepSeek
        timeoutMs: (opts.config.limits.maxMinutesPorRodada ?? 10) * 60_000,
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
