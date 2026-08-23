// ===========================================================================
// Entrada de requisitos: o usuário entrega requisitos em linguagem natural; o
// orquestrador (via LLM estruturador) converte em fases ENUMERADAS seguindo o
// contrato RequirementsDoc, e gera/atualiza o roadmap e os prompts das fases.
//
// Fluxo:
//   1. `pnpm ai:req --file requisitos.txt` lê o texto;
//   2. `structureRequirements()` chama o LLM (DeepSeek Flash) que retorna JSON
//      no contrato RequirementsDoc (id, titulo, descricao, dependencias,
//      escopo, foraDoEscopo, testesObrigatorios, criteriosAceite);
//   3. valida com Zod (contrato estrito — campos extras rejeitados);
//   4. `applyRequirements()` grava o requisito em requirements/<id>.json e
//      regenera roadmap + prompts (idempotente: upsert por id de fase).
// ===========================================================================

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { RequirementsDoc, type RequirementsDoc as RequirementsDocType, type RequirementPhase, type AutomationConfig } from './contracts.js';
import type { LlmClient } from './llm.js';
import { extractJson } from './llm.js';
import { safeJoin } from './paths.js';
import { writeTextAtomic } from './io.js';
import { isValidPhaseId, parsePhaseRow, parseRoadmap } from './roadmap.js';

const REQUIREMENTS_DIR = 'requirements';

// ---------------------------------------------------------------------------
// 1) Estruturação por LLM
// ---------------------------------------------------------------------------

export const STRUCTURE_SYSTEM_PROMPT = [
  'Você é o analista de requisitos do orquestrador do SmartJuris.',
  'Receba requisitos em linguagem natural e transforme em fases de implementação',
  'ENUMERADAS, pequenas, verificáveis e ordenadas por dependência.',
  '',
  'REGRAS:',
  '- Quebre em fases pequenas (cada uma com escopo e critérios de aceite claros).',
  '- id: use sequência da próxima faixa livre (ex.: 5A, 5B, 5C) — nunca repita existente.',
  '- dependencias: liste os ids de fases anteriores que esta fase exige aprovadas.',
  '- escopo: o que DEVE ser implementado nesta fase.',
  '- foraDoEscopo: o que NÃO deve ser tocado (para evitar alterações fora do escopo).',
  '- testesObrigatorios: testes que o implementador deve entregar (migration, concorrência, etc.).',
  '- criteriosAceite: itens objetivos que o revisor usará para aprovar (verificáveis, não vagos).',
  '- Não invente requisitos: use apenas o que o usuário pediu, desdobrando em etapas.',
  '',
  'Responda SOMENTE com um objeto JSON válido, sem texto fora e sem cercas de código,',
  'neste formato EXATO (sem campos extras):',
  '{',
  '  "fases": [',
  '    { "id": "5A", "titulo": "...", "descricao": "...",',
  '      "dependencias": ["4B"],',
  '      "escopo": "...", "foraDoEscopo": "...",',
  '      "testesObrigatorios": ["..."],',
  '      "criteriosAceite": ["..."] }',
  '  ]',
  '}',
].join('\n');

/** Estrutura requisitos em linguagem natural → fases enumeradas (contrato Zod). */
export async function structureRequirements(
  llm: LlmClient,
  texto: string,
): Promise<RequirementsDocType> {
  const user = [
    'Requisitos do usuário (linguagem natural):',
    '',
    texto.trim(),
    '',
    'Estruture em fases conforme o contrato. Retorne SOMENTE o JSON.',
  ].join('\n');

  // Uma tentativa + uma correção guiada pelo erro de validação (como na auditoria).
  const raw1 = await llm.implementer(user, { complex: false });
  try {
    return parseRequirements(raw1.content);
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err);
    const raw2 = await llm.implementer(
      `${user}\n\nA resposta anterior não seguiu o contrato. Erro: ${hint}\nResponda novamente somente com o JSON válido.`,
      { complex: false },
    );
    return parseRequirements(raw2.content);
  }
}

export function parseRequirements(jsonText: string): RequirementsDocType {
  let raw: unknown;
  try {
    raw = extractJson(jsonText);
  } catch {
    throw new Error('Resposta do estruturador sem objeto JSON.');
  }
  const parsed = RequirementsDoc.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Contrato de requisitos inválido: ${issues}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// 2) Geração do roadmap (tabela geral + seções detalhadas)
// ---------------------------------------------------------------------------

function buildRoadmapRow(phase: RequirementPhase, status = 'PLANNED'): string {
  const deps = phase.dependencias.length > 0 ? phase.dependencias.join(', ') : '—';
  return `| ${phase.id} | ${phase.titulo} | ${deps} | \`${status}\` | DeepSeek | GPT-5.6 Luna |`;
}

function buildRoadmapSection(phase: RequirementPhase): string {
  const lines = [
    `### ${phase.id} — ${phase.titulo}`,
    '',
    '**Estado:** `PLANNED`',
    '',
    phase.dependencias.length > 0
      ? `**Dependência:** ${phase.dependencias.join(', ')} aprovada(s).`
      : '**Dependência:** nenhuma (fase raiz).',
    '',
    '**Objetivo:**',
    '',
    phase.descricao.trim(),
    '',
    '**Critérios de aceite:**',
    '',
    ...phase.criteriosAceite.map((c) => `- ${c}`),
  ];
  return lines.join('\n');
}

/**
 * Insere/atualiza fases no roadmap (idempotente): linha na tabela "Roadmap
 * geral" + seção em "Fases detalhadas", antes do "## Histórico de auditoria".
 * Fases já existentes são ATUALIZADAS (upsert); as demais linhas são preservadas.
 */
export function renderRoadmapWithPhases(md: string, phases: RequirementPhase[]): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inGeneralTable = false;
  let inDetailed = false;
  let inHistory = false;
  let tableLastDataRow = -1;
  let historyIndex = -1;
  let insertedSections = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## Roadmap geral/.test(line)) inGeneralTable = true;
    else if (/^## Fases detalhadas/.test(line)) {
      inGeneralTable = false;
      inDetailed = true;
    } else if (/^## Histórico de auditoria/.test(line)) {
      inDetailed = false;
      inHistory = true;
      historyIndex = out.length;
    } else if (/^##\s+/.test(line)) {
      inGeneralTable = false;
      inDetailed = false;
    }

    if (inGeneralTable) {
      const row = parsePhaseRow(line);
      if (row) {
        tableLastDataRow = out.length;
        const upd = phases.find((p) => p.id === row.id);
        if (upd) {
          out.push(buildRoadmapRow(upd, row.status));
          continue;
        }
      }
    }

    if (inDetailed) {
      const sec = line.match(/^###\s+([A-Za-z0-9._-]+)\s*—/);
      if (sec) {
        const upd = phases.find((p) => p.id === sec[1]);
        if (upd) {
          out.push(buildRoadmapSection(upd));
          // Pula o bloco da seção antiga até a próxima `###` ou `##`.
          let j = i + 1;
          while (j < lines.length && !/^(###|##)\s+/.test(lines[j])) j += 1;
          i = j - 1;
          continue;
        }
      }
    }

    out.push(line);
  }

  // Insere novas linhas da tabela após a última linha de dados da tabela geral.
  const novasLinhas = phases
    .filter((p) => !md.split(/\r?\n/).some((l) => parsePhaseRow(l)?.id === p.id))
    .map((p) => buildRoadmapRow(p));

  // Insere seções novas antes do histórico (ou no fim).
  const novasSecoes = phases
    .filter((p) => !new RegExp(`^###\\s+${p.id}\\s*—`, 'm').test(md))
    .map(buildRoadmapSection);

  if (novasLinhas.length > 0) {
    if (tableLastDataRow < 0) throw new Error('Tabela "## Roadmap geral" não encontrada no roadmap.');
    out.splice(tableLastDataRow + 1, 0, ...novasLinhas);
  }
  if (novasSecoes.length > 0) {
    const block = ['', ...novasSecoes.flatMap((s) => s.split('\n'))].join('\n');
    if (historyIndex >= 0) {
      out.splice(historyIndex, 0, block);
    } else {
      out.push('', '## Fases detalhadas', block);
    }
    insertedSections = true;
  }
  void insertedSections;

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 3) Geração dos prompts das fases
// ---------------------------------------------------------------------------

function buildPhasePrompt(phase: RequirementPhase): string {
  const lines = [
    `# ${phase.id} — ${phase.titulo}`,
    '',
    '## DeepSeek — implementação',
    '',
    '```text',
    `Fase atual: ${phase.id} — ${phase.titulo}.`,
    '',
    phase.descricao.trim(),
    '',
    'Escopo:',
    phase.escopo.trim(),
    '',
    phase.foraDoEscopo.trim()
      ? `Fora do escopo:\n${phase.foraDoEscopo.trim()}`
      : 'Fora do escopo: nada além do descrito acima.',
    '',
    phase.testesObrigatorios.length > 0
      ? ['Testes obrigatórios:', ...phase.testesObrigatorios.map((t) => `- ${t}`)].join('\n')
      : 'Testes obrigatórios: cubra o comportamento descrito com testes.',
    '',
    'Execute a suíte de testes e o build. Entregue arquivos alterados, comandos, resultados, diff, limitações e riscos. Pare para revisão.',
    '```',
    '',
    '## GPT-5.6 Luna — revisão',
    '',
    '```text',
    `Fase: ${phase.id} — ${phase.titulo}.`,
    '',
    'Analise o diff, os testes e os resultados executados.',
    '',
    'Critérios de aceite (avaliar APENAS estes, sem criar novos):',
    ...phase.criteriosAceite.map((c) => `- ${c}`),
    '',
    'Responda somente no formato JSON do contrato de auditoria.',
    '```',
  ];
  return lines.join('\n');
}

/**
 * Insere/atualiza os prompts das fases (idempotente). Fases já existentes têm
 * seu bloco `# <id> —` substituído; as novas são adicionadas antes do marcador
 * `# Formato de passagem para o Terra` (se existir) ou no fim do arquivo.
 */
export function renderPromptsWithPhases(md: string, phases: RequirementPhase[]): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let replacedIds = new Set<string>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const heading = line.match(/^#\s+([A-Za-z0-9._-]+)\s*—/);
    if (heading) {
      const phase = phases.find((p) => p.id === heading[1]);
      if (phase) {
        replacedIds.add(phase.id);
        out.push(...buildPhasePrompt(phase).split('\n'));
        // Pula o bloco antigo até a próxima linha `# ` (seção de fase).
        let j = i + 1;
        while (j < lines.length && !/^#\s+/.test(lines[j])) j += 1;
        i = j;
        continue;
      }
    }
    out.push(line);
    i += 1;
  }

  const novas = phases.filter((p) => !replacedIds.has(p.id));
  if (novas.length === 0) return out.join('\n');

  const block = novas.flatMap((p) => ['', ...buildPhasePrompt(p).split('\n')]).join('\n');
  const idx = out.findIndex((l) => /^# Formato de passagem para o Terra/.test(l));
  if (idx >= 0) {
    out.splice(idx, 0, block);
  } else {
    out.push(block);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 4) Persistência
// ---------------------------------------------------------------------------

export function requirementsDir(aiDevDir: string): string {
  return safeJoin(aiDevDir, REQUIREMENTS_DIR);
}

export function requirementFile(aiDevDir: string, phaseId: string): string {
  if (!isValidPhaseId(phaseId)) throw new Error(`Id de fase inválido: ${phaseId}`);
  return safeJoin(requirementsDir(aiDevDir), `${phaseId}.json`);
}

export function requirementHash(phase: RequirementPhase): string {
  return createHash('sha256').update(JSON.stringify(phase)).digest('hex').slice(0, 12);
}

/** Persiste o requisito estruturado em requirements/<id>.json. */
export async function writeRequirement(aiDevDir: string, phase: RequirementPhase): Promise<string> {
  await mkdir(requirementsDir(aiDevDir), { recursive: true });
  const path = requirementFile(aiDevDir, phase.id);
  await writeFile(path, JSON.stringify({ ...phase, _hash: requirementHash(phase) }, null, 2), 'utf8');
  return path;
}

/** Lê o requisito estruturado de um arquivo de entrada (linguagem natural). */
export async function readRequirementsInput(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new Error(`Arquivo de requisitos não encontrado: ${file}`);
  }
}

/** Renderiza a estrutura enumerada para o usuário conferir antes de aplicar. */
export function renderRequirementsList(doc: RequirementsDocType): string {
  const parts: string[] = ['=== Requisitos estruturados (fases enumeradas) ===', ''];
  doc.fases.forEach((f, i) => {
    parts.push(`${i + 1}. ${f.id} — ${f.titulo}`);
    parts.push(`   Descrição: ${f.descricao}`);
    parts.push(`   Dependências: ${f.dependencias.length > 0 ? f.dependencias.join(', ') : '—'}`);
    parts.push(`   Escopo: ${f.escopo}`);
    if (f.foraDoEscopo) parts.push(`   Fora do escopo: ${f.foraDoEscopo}`);
    if (f.testesObrigatorios.length > 0) {
      parts.push(`   Testes obrigatórios:`);
      f.testesObrigatorios.forEach((t) => parts.push(`     - ${t}`));
    }
    parts.push(`   Critérios de aceite:`);
    f.criteriosAceite.forEach((c) => parts.push(`     - ${c}`));
    parts.push('');
  });
  return parts.join('\n');
}

/** Concatena os requisitos de todas as fases num bloco para o estruturador (inclui ids existentes). */
export function buildStructureInput(texto: string, existingIds: string[]): string {
  return [
    texto.trim(),
    '',
    `Ids de fases já existentes (NÃO repita; use a próxima faixa livre, ex.: ${existingIds.length > 0 ? nextPhaseId(existingIds) : '1A'}):`,
    existingIds.length > 0 ? existingIds.join(', ') : '(nenhum)',
  ].join('\n');
}

/** Sugere o próximo id de fase (ex.: "5A" se o maior existente for "4Z"). */
export function nextPhaseId(existingIds: string[]): string {
  let maxNum = 0;
  let maxLetter = 'A';
  for (const id of existingIds) {
    const m = id.match(/^(\d+)([A-Za-z]+)$/);
    if (!m) continue;
    const num = Number(m[1]);
    if (num > maxNum) {
      maxNum = num;
      maxLetter = m[2];
    } else if (num === maxNum && m[2] > maxLetter) {
      maxLetter = m[2];
    }
  }
  if (maxNum === 0) return '1A';
  if (maxLetter === 'Z') return `${maxNum + 1}A`;
  const nextLetter = String.fromCharCode(maxLetter.charCodeAt(0) + 1);
  return `${maxNum}${nextLetter}`;
}

// Zod re-export para uso externo consistente.
export const RequirementSchema = RequirementsDoc;
export { z };

// ---------------------------------------------------------------------------
// 5) Aplicação (grava requisitos + regenera roadmap/prompts)
// ---------------------------------------------------------------------------

export interface ApplyResult {
  arquivos: string[];
  fases: RequirementPhase[];
}

/**
 * Aplica os requisitos estruturados: grava requirements/<id>.json, atualiza o
 * roadmap e os prompts das fases. Idempotente (upsert por id). Retorna os
 * caminhos alterados.
 */
export async function applyRequirements(
  aiDevDir: string,
  config: AutomationConfig,
  fases: RequirementPhase[],
): Promise<ApplyResult> {
  // 1) Persiste cada requisito estruturado.
  const escritos: string[] = [];
  for (const fase of fases) {
    escritos.push(await writeRequirement(aiDevDir, fase));
  }

  // 2) Roadmap: upsert das linhas/seções.
  const roadmapFile = safeJoin(aiDevDir, basename(config.roadmap));
  const roadmapMd = await readFile(roadmapFile, 'utf8');
  const novoRoadmap = renderRoadmapWithPhases(roadmapMd, fases);
  await writeTextAtomic(roadmapFile, novoRoadmap);
  escritos.push(roadmapFile);

  // 3) Prompts: upsert dos blocos por fase.
  const promptsFile = safeJoin(aiDevDir, basename(config.phasePrompts));
  const promptsMd = await readFile(promptsFile, 'utf8');
  const novoPrompts = renderPromptsWithPhases(promptsMd, fases);
  await writeTextAtomic(promptsFile, novoPrompts);
  escritos.push(promptsFile);

  return { arquivos: escritos, fases };
}

/** Lista os ids de fases já presentes no roadmap (para o estruturador não repetir). */
export function existingPhaseIds(aiDevDir: string, config: AutomationConfig): string[] {
  const roadmapFile = safeJoin(aiDevDir, basename(config.roadmap));
  try {
    const { phases } = parseRoadmap(readFileSync(roadmapFile, 'utf8'));
    return phases.map((p) => p.id);
  } catch {
    return [];
  }
}
