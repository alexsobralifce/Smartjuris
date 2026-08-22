// ===========================================================================
// Configuração: carrega e valida automation-config.json + variáveis de ambiente.
// ===========================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AutomationConfig, type AutomationConfig as AutomationConfigType } from './contracts.js';
import { type Env, safeJoin } from './paths.js';

const CANONICAL_PREFIX = 'docs/ai-development/';

/**
 * Carrega `<repoRoot>/.env` (formato KEY=VALUE, comentários com `#`) e aplica
 * em `env` SOMENTE para variáveis ainda não definidas (sem override; valores
 * nunca são logados). O `.env` é gitignored.
 */
export function applyRepoDotEnv(repoRoot: string, env: Env): void {
  let raw: string;
  try {
    raw = readFileSync(join(repoRoot, '.env'), 'utf8');
  } catch {
    return; // sem .env: nada a carregar
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (key === '#') continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
    }
  }
}

/**
 * Alias legado: a aplicação usa `DEEP_SEEK_API`; o orquestrador usa
 * `DEEPSEEK_API_KEY`. Aceita o nome antigo como fallback (sem logar valores).
 */
export function applyLegacyAliases(env: Env): void {
  if ((env.DEEPSEEK_API_KEY === undefined || env.DEEPSEEK_API_KEY === '') && env.DEEP_SEEK_API) {
    env.DEEPSEEK_API_KEY = env.DEEP_SEEK_API;
  }
}

/** Caminhos internos do config DEVEM usar o prefixo canônico `docs/ai-development/`. */
export function validateConfigPaths(config: AutomationConfigType): void {
  const fields: Array<keyof Pick<AutomationConfigType, 'roadmap' | 'phasePrompts' | 'templates' | 'governance'>> = [
    'roadmap',
    'phasePrompts',
    'templates',
    'governance',
  ];
  for (const field of fields) {
    const value = config[field];
    if (value.includes('doc/ai-development')) {
      throw new Error(
        `automation-config.json: "${field}" usa "doc/ai-development" (singular). ` +
          'O caminho oficial e obrigatório é "docs/ai-development".',
      );
    }
    if (!value.startsWith(CANONICAL_PREFIX)) {
      throw new Error(
        `automation-config.json: "${field}" aponta para fora do caminho oficial: ${value}. ` +
          `Esperado prefixo "${CANONICAL_PREFIX}".`,
      );
    }
  }
}

export function loadAutomationConfig(aiDevDir: string): AutomationConfigType {
  const path = safeJoin(aiDevDir, 'automation-config.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`automation-config.json não encontrado em ${aiDevDir}.`);
  }
  const parsed = AutomationConfig.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`automation-config.json inválido: ${formatZodError(parsed.error)}`);
  }
  validateConfigPaths(parsed.data);
  return parsed.data;
}

export function formatZodError(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues ?? [];
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('; ');
}

/** Chave de ambiente obrigatória. */
export function requireEnv(env: Env, key: string): string {
  const value = env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value.trim();
}

export interface EffectiveEnv {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekModelPro: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiReviewModel: string;
  repoRootEnv?: string;
}

export function loadEnv(env: Env, config: AutomationConfigType): EffectiveEnv {
  return {
    deepseekApiKey: requireEnv(env, 'DEEPSEEK_API_KEY'),
    deepseekBaseUrl: (env.DEEPSEEK_BASE_URL ?? '').trim() || 'https://api.deepseek.com/v1',
    deepseekModel: (env.DEEPSEEK_MODEL ?? '').trim() || config.implementer.model,
    deepseekModelPro: (env.DEEPSEEK_MODEL_PRO ?? '').trim() || config.implementer.complexModel,
    openaiApiKey: requireEnv(env, 'OPENAI_API_KEY'),
    openaiBaseUrl: (env.OPENAI_BASE_URL ?? '').trim() || 'https://api.openai.com/v1',
    openaiReviewModel: (env.OPENAI_REVIEW_MODEL ?? '').trim() || config.reviewer.model,
    repoRootEnv: env.SMARTJURIS_REPO_ROOT,
  };
}
