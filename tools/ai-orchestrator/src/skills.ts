// ===========================================================================
// skills.ts — Busca de DICAS em skills do orquestrador.
//
// O orquestrador tem uma pasta `skills/` com guias de boas práticas
// (debug.md, clean code, frontend, auditoria, testes, design patterns, etc.).
// A CADA ACIONAMENTO, esta busca faz matching por PALAVRAS-CHAVE entre o
// contexto da fase (objetivo + escopo) e os arquivos de skills, e anexa ao
// prompt as dicas das skills mais relevantes — SEM encher o contexto
// (limite de bytes por skill e nº máximo de skills).
// ===========================================================================

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SkillMatch {
  arquivo: string;
  nome: string;
  score: number;
  /** Conteúdo truncado da skill (dicas úteis para o modelo). */
  dicas: string;
}

/** Palavras-chave de interesse (termos de contexto, em minúsculas). */
const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'em', 'para', 'com', 'que', 'se', 'na',
  'no', 'um', 'uma', 'os', 'as', 'dos', 'das', 'ao', 'aos', 'à', 'é', 'não',
  'ser', 'ter', 'esta', 'este', 'fase', 'deve', 'devem', 'via', 'usar', 'usando',
]);

function tokenizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Diretório de skills do orquestrador (skills/ ao lado de src/). */
export function dirSkills(): string {
  const aqui = fileURLToPath(import.meta.url);
  // guardrails.ts fica em src/ → skills fica em ../skills
  return join(process.cwd(), 'skills');
}

/** Lista os arquivos de skill (md) disponíveis. */
export async function listarSkills(dir: string = dirSkills()): Promise<string[]> {
  try {
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
}

/**
 * Busca as skills MAIS RELEVANTES para o contexto da fase (objetivo + escopo).
 * Score = nº de tokens do contexto que aparecem no nome + primeiras 60 linhas
 * da skill (termos raros pesam mais). Retorna no máx. `maxSkills`, cada uma com
 * conteúdo truncado a `maxBytesPorSkill` — lista simples, não infla o contexto.
 */
export async function buscarSkillsRelevantes(
  consulta: string,
  opts: { maxSkills?: number; maxBytesPorSkill?: number; dir?: string } = {},
): Promise<SkillMatch[]> {
  const maxSkills = opts.maxSkills ?? 2;
  const maxBytes = opts.maxBytesPorSkill ?? 2500;
  const dir = opts.dir ?? dirSkills();
  const arquivos = await listarSkills(dir);
  if (arquivos.length === 0 || !consulta.trim()) return [];

  const termos = tokenizar(consulta);
  if (termos.length === 0) return [];
  const pesos = new Map<string, number>();
  for (const t of termos) pesos.set(t, (pesos.get(t) ?? 0) + 1);

  const matches: SkillMatch[] = [];
  for (const arquivo of arquivos) {
    let conteudo: string;
    try {
      conteudo = await readFile(join(dir, arquivo), 'utf8');
    } catch {
      continue;
    }
    const amostra = `${arquivo}\n${conteudo.split('\n').slice(0, 60).join('\n')}`;
    const amostraTokens = new Set(tokenizar(amostra));
    let score = 0;
    for (const [termo, peso] of pesos) {
      if (amostraTokens.has(termo)) score += peso;
      // Palavra no NOME do arquivo pesa mais (indica especialização).
      if (arquivo.toLowerCase().includes(termo)) score += 3;
    }
    if (score > 0) {
      matches.push({
        arquivo,
        nome: arquivo.replace(/\.md$/, ''),
        score,
        dicas: conteudo.slice(0, maxBytes),
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxSkills);
}

/** Monta o bloco de DICAS DE SKILLS para injeção no prompt (ou string vazia). */
export function formatarDicasSkills(matches: SkillMatch[]): string {
  if (matches.length === 0) return '';
  const blocos = matches.map(
    (m) => `### Skill: ${m.nome}\n${m.dicas.trim()}`,
  );
  return [
    'DICAS DE SKILLS (busca automática por relevância à fase — siga quando aplicar):',
    '',
    ...blocos,
    '',
  ].join('\n');
}
