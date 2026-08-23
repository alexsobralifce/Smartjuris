// ===========================================================================
// Loaders de requisitos — no estilo do LangChain: um loader por formato de
// entrada, todos retornando o MESMO tipo (RequirementsDocType = fases
// estruturadas). O pipeline a jusante (roadmap, prompts, execução) é agnóstico
// do formato de origem.
//
//   Formato de entrada → Loader → RequirementsDocType
//   -------------------------------------------------
//   texto livre (.txt/.md)  → LanguageRequirementLoader  → estrutura via LLM
//   JSON estruturado (.json)→ JsonRequirementLoader      → valida e normaliza
//   (desconhecido)          → dispatcher lança erro claro
//
// Uso:
//   const doc = await loadRequirementsFromFile('req.txt', { llm, existingIds, maxChars });
// ===========================================================================

import { basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { RequirementsDoc, type RequirementsDoc as RequirementsDocType, type RequirementPhase } from './contracts.js';
import { extractJson, type LlmClient } from './llm.js';
import { parseRequirements } from './requirements.js';

export interface LoaderContext {
  /** Cliente LLM (necessário para estruturação de linguagem natural). */
  llm?: LlmClient;
  /** Ids de fases já existentes (o LLM não deve repetir). */
  existingIds?: string[];
  /** Limite de caracteres do texto de entrada. */
  maxChars?: number;
}

/** Contrato comum de todos os loaders (equivalente ao `DocumentLoader` do LangChain). */
export interface RequirementLoader {
  readonly label: string;
  load(input: string, ctx: LoaderContext): Promise<RequirementsDocType>;
}

// ---------------------------------------------------------------------------
// Loader 1: linguagem natural (txt/md) → estruturação por LLM
// ---------------------------------------------------------------------------

export const LANGUAGE_LOADER_PROMPT = [
  'Estruture o texto acima em fases de implementação conforme o contrato do orquestrador.',
  'USE EXATAMENTE os campos: id, titulo, descricao, dependencias, escopo, foraDoEscopo,',
  'testesObrigatorios, criteriosAceite. NÃO renomeie os campos.',
  'id: String, use a próxima faixa livre sugerida. Retorne SOMENTE o JSON, sem cercas de código.',
].join('\n');

export const languageRequirementLoader: RequirementLoader = {
  label: 'linguagem natural (txt/md)',
  async load(input, ctx) {
    if (!ctx.llm) {
      throw new Error('Formato de linguagem natural exige um cliente LLM para estruturar (ctx.llm).');
    }
    const maxChars = ctx.maxChars ?? 20000;
    if (input.length > maxChars) {
      throw new Error(
        `Texto de requisitos muito longo: ${input.length} caracteres (limite: ${maxChars}). ` +
          'Divida em blocos menores ou resuma os requisitos.',
      );
    }
    const user = [
      'Requisitos do usuário (linguagem natural):',
      '',
      input.trim(),
      '',
      ctx.existingIds && ctx.existingIds.length > 0
        ? `Ids de fases já existentes (NÃO repita; use a próxima faixa livre, ex.: ${ctx.existingIds.join(', ')} → próxima):`
        : '',
      ctx.existingIds && ctx.existingIds.length > 0 ? ctx.existingIds.join(', ') : '',
      '',
      LANGUAGE_LOADER_PROMPT,
    ].filter((l) => l !== '').join('\n');

    // Até 3 tentativas (a 1ª + correções guiadas pelo erro de validação).
    let hint: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const prompt = hint
        ? `${user}\n\nA resposta anterior não seguiu o contrato. Corrija seguindo o formato EXATO.\nErro: ${hint}\nResponda somente com o JSON válido.`
        : user;
      const raw = await ctx.llm.structurer(prompt);
      try {
        return parseRequirements(raw.content);
      } catch (err) {
        hint = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(
      `Não foi possível estruturar os requisitos no formato esperado após 3 tentativas do modelo. ` +
        `Último erro: ${hint}. Verifique o texto ou tente novamente.`,
    );
  },
};

// ---------------------------------------------------------------------------
// Loader 2: JSON estruturado (RequirementsDoc / array de fases)
// ---------------------------------------------------------------------------

function normalizeJsonDoc(raw: unknown): RequirementsDocType {
  // Aceita { "fases": [...] } ou um array direto [...] de fases.
  const candidate = Array.isArray(raw) ? { fases: raw } : raw;
  const parsed = RequirementsDoc.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Contrato de requisitos inválido: ${issues}`);
  }
  return parsed.data;
}

export const jsonRequirementLoader: RequirementLoader = {
  label: 'JSON estruturado',
  async load(input) {
    let raw: unknown;
    // Arquivo JSON: tenta parse direto (aceita array no topo ou objeto com fases);
    // fallback para extractJson caso tenha texto/cercas ao redor (ex.: copia da UI).
    try {
      raw = JSON.parse(input.trim());
    } catch {
      try {
        raw = extractJson(input);
      } catch {
        throw new Error('Arquivo JSON de requisitos sem objeto/array válido.');
      }
    }
    return normalizeJsonDoc(raw);
  },
};

// ---------------------------------------------------------------------------
// Dispatcher por extensão (equivalente ao `DirectoryLoader`/auto-detect)
// ---------------------------------------------------------------------------

export const LOADERS_BY_EXTENSION: Record<string, RequirementLoader> = {
  '.txt': languageRequirementLoader,
  '.md': languageRequirementLoader,
  '.json': jsonRequirementLoader,
};

export const SUPPORTED_EXTENSIONS = Object.keys(LOADERS_BY_EXTENSION).join(', ');

/**
 * Carrega requisitos de um arquivo, escolhendo o loader pela extensão.
 * Todos os loaders retornam o MESMO tipo (RequirementsDocType).
 */
export async function loadRequirementsFromFile(file: string, ctx: LoaderContext = {}): Promise<RequirementsDocType> {
  const ext = extname(file).toLowerCase();
  const loader = LOADERS_BY_EXTENSION[ext];
  if (!loader) {
    throw new Error(
      `Formato não suportado para entrada de requisitos: "${ext}" (arquivo ${basename(file)}). ` +
        `Suportados: ${SUPPORTED_EXTENSIONS}.`,
    );
  }
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    throw new Error(`Arquivo de requisitos não encontrado ou ilegível: ${file}`);
  }
  return loader.load(content, ctx);
}

/** Exemplo de JSON estruturado (para usuários que preferem escrever direto no contrato). */
export const JSON_REQUIREMENTS_EXAMPLE: RequirementsDocType = {
  fases: [
    {
      id: '5A',
      titulo: 'Exemplo de fase',
      descricao: 'Descreva o objetivo da fase.',
      dependencias: ['4B'],
      escopo: 'O que deve ser implementado nesta fase.',
      foraDoEscopo: 'O que não deve ser tocado.',
      testesObrigatorios: ['Teste de ...'],
      criteriosAceite: ['Critério verificável 1', 'Critério verificável 2'],
    },
  ],
};

// Re-export para uso externo consistente.
export type { RequirementPhase };
