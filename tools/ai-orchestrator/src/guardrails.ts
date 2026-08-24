// ===========================================================================
// guardrails.ts — Balizas anti-loop do orquestrador.
//
// Compilado de orquestradores conhecidos (Claude Code maxTurns, OpenRouter
// doom-loop detection, TokenFuse budget, MartinLoop stop conditions,
// AgentPatterns circuit breakers). Cada baliza é DETERMINÍSTICA (runtime,
// não instrução ao modelo) e, ao disparar, ABRE o circuito → decisão humana.
//
// Balizas:
//   1. Orçamento de custo por fase (maxUsdPorFase): soma o custo de todas as
//      rodadas da fase; ultrapassou → stop.
//   2. Doom-loop de comando (maxComandoRepetido): mesma saída de comando
//      (hash) N vezes seguidas → stop (ex.: suíte falhando sempre igual).
//   3. Loopgain v2: chave normalizada do achado + sinal de custo crescente
//      sem resolução.
//   4. Escalada do revisor (escalateAfterAttempts/maxEscalations): auditoria
//      em loop não pode gastar N rodadas no mesmo revisor sem progresso.
// ===========================================================================

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { safeJoin } from './paths.js';
import type { AutomationConfig } from './contracts.js';

/** Nome canônico do arquivo de regras (lido a cada acionamento). */
export const REGRAS_FILENAME = 'orquestrador-regras.md';

/**
 * Lê as REGRAS DE BALIZA do arquivo (orquestrador-regras.md) a cada
 * acionamento e retorna o TEXTO CURTO para injeção no prompt (implementador
 * e revisor). Lista simples de propósito — não encher o contexto. Se o
 * arquivo faltar, retorna fallback mínimo.
 */
export async function lerRegrasDeBaliza(aiDevDir: string): Promise<string> {
  const caminho = safeJoin(aiDevDir, REGRAS_FILENAME);
  try {
    if (!existsSync(caminho)) return '(sem arquivo de regras de baliza)';
    const raw = await readFile(caminho, 'utf8');
    // Usa apenas a seção de regras (ignora título/header) e limita o tamanho
    // para nunca inflar o contexto (regras de bolso ≤ ~40 linhas / 4 KB).
    const semHeader = raw.replace(/^# .*$/m, '').trim();
    return semHeader.slice(0, 4000);
  } catch (e) {
    console.warn('[guardrails] Falha ao ler regras de baliza:', (e as Error).message);
    return '(regras de baliza indisponíveis)';
  }
}

// ---------------------------------------------------------------------------
// 1. Orçamento de custo por fase
// ---------------------------------------------------------------------------

export interface CustoRodada {
  runId: string;
  costUsd: number | null;
}

/** Soma o custo (implementador + revisor) de todas as rodadas da fase. */
export async function custoAcumuladoDaFase(
  aiDevDir: string,
  phaseId: string,
  exceto?: string,
): Promise<CustoRodada[]> {
  const runsDir = safeJoin(aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    return [];
  }
  const rodadas: CustoRodada[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(`-${phaseId}`) || entry === exceto) continue;
    try {
      const raw = await readFile(safeJoin(runsDir, entry, 'run.json'), 'utf8');
      const parsed = JSON.parse(raw) as {
        costEstimateUsd?: number | null;
        implementerUsage?: { costUsd?: number | null };
        reviewerUsage?: { costUsd?: number | null };
      };
      const imp = Number(parsed.implementerUsage?.costUsd ?? 0);
      const rev = Number(parsed.reviewerUsage?.costUsd ?? 0);
      const total = Number.isFinite(imp) && Number.isFinite(rev) ? imp + rev : (parsed.costEstimateUsd ?? null);
      rodadas.push({ runId: entry, costUsd: Number.isFinite(Number(total)) ? Number(total) : null });
    } catch {
      // ignora rodada ilegível
    }
  }
  return rodadas;
}

/**
 * Baliza de orçamento: se o custo acumulado da fase (rodadas anteriores +
 * a atual) ultrapassar `limits.maxUsdPorFase`, abre o circuito.
 */
export function checarOrcamentoFase(
  config: AutomationConfig,
  rodadas: CustoRodada[],
  custoAtualUsd: number | null,
): { ok: boolean; motivo?: string; acumuladoUsd: number; limiteUsd: number } {
  const limite = config.limits.maxUsdPorFase ?? 0.4;
  const acumulado = rodadas.reduce((acc, r) => acc + (r.costUsd ?? 0), 0) + (custoAtualUsd ?? 0);
  if (acumulado > limite) {
    return {
      ok: false,
      motivo: `Orçamento da fase ultrapassado: US$ ${acumulado.toFixed(4)} > US$ ${limite} (limite maxUsdPorFase). Rodadas anteriores: ${rodadas.map((r) => r.runId).join(', ') || '(nenhuma)'}. Decisão humana requerida.`,
      acumuladoUsd: acumulado,
      limiteUsd: limite,
    };
  }
  return { ok: true, acumuladoUsd: acumulado, limiteUsd: limite };
}

// ---------------------------------------------------------------------------
// 2. Doom-loop de comando (mesma saída N vezes)
// ---------------------------------------------------------------------------

/** Hash estável da saída de um comando de evidência (stdout+stderr+exit). */
export function hashSaidaComando(output: string): string {
  return createHash('sha256').update(output).digest('hex');
}

/** Historico de saídas de comandos por fase (persistido em runs/). */
export interface HistoricoComando {
  comando: string;
  hashes: string[];
}

/**
 * Registra a saída de um comando e verifica se a MESMA saída (hash) repetiu
 * `maxComandoRepetido` vezes seguidas → doom-loop. A persistência usa um
 * arquivo por fase em runs/ (sobrevive a re-execuções).
 */
export function verificarDoomLoopComando(
  historico: HistoricoComando[],
  comando: string,
  saida: string,
  maxRepeticoes: number,
): { repetido: boolean; sequencia: number } {
  const hash = hashSaidaComando(saida);
  const entrada = historico.find((h) => h.comando === comando);
  const prev = entrada?.hashes ?? [];
  const sequencia = prev.length > 0 && prev[prev.length - 1] === hash ? prev.length + 1 : 1;
  return { repetido: sequencia >= maxRepeticoes, sequencia };
}

// ---------------------------------------------------------------------------
// 3. Loopgain v2 (chave normalizada + custo crescente)
// ---------------------------------------------------------------------------

/** Normaliza o requirement: minúsculas, sem pontuação/acentos, espaços colapsados. */
export function normalizarRequirement(req: string): string {
  return req
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens do requirement (para similaridade). */
function tokensRequirement(req: string): Set<string> {
  return new Set(normalizarRequirement(req).split(' ').filter((t) => t.length > 2));
}

/**
 * Similaridade de Jaccard entre dois requirements: ≥ `limiar` → MESMO achado
 * (reescrita de texto NÃO conta como progresso). Captura inserções como
 * "de pagamento" ou troca de ordem de palavras, que a igualdade de string
 * perderia — exatamente o padrão de loop que o loopgain v2 precisa pegar.
 */
export function mesmosRequisitos(a: string, b: string, limiar = 0.5): boolean {
  const na = normalizarRequirement(a);
  const nb = normalizarRequirement(b);
  // Requisitos idênticos (mesmo curtos, ex.: "r1") são o MESMO achado.
  if (na === nb && na !== '') return true;
  const A = tokensRequirement(a);
  const B = tokensRequirement(b);
  if (A.size === 0 || B.size === 0) return false;
  let intersecao = 0;
  for (const t of A) if (B.has(t)) intersecao++;
  const uniao = A.size + B.size - intersecao;
  return intersecao / uniao >= limiar;
}

/** Chave estável de um achado: severity + file + requirement NORMALIZADO. */
export function chaveAchado(f: { severity?: string; file?: string | null; requirement?: string }): string {
  return [f.severity ?? '', f.file ?? '', normalizarRequirement(f.requirement ?? '')].join('::');
}

export interface ConvergenciaV2Resultado {
  anterior: string;
  resolvidos: number;
  novos: number;
  gravesAtual: number;
  custoAnteriorUsd: number;
  custoAtualUsd: number;
  custoCrescenteSemResolucao: boolean;
}

/**
 * Loopgain v2: compara achados por SIMILARIDADE DE REQUISITOS (reescrita de
 * texto NÃO conta como "resolvido" — usa mesmosRequisitos/Jaccard) e adiciona
 * o sinal de CUSTO CRESCENTE sem resolução: se a rodada atual custou mais que
 * a anterior E nenhum achado foi resolvido, o loop não está convergindo
 * (mesmo que o revisor tenha reescrito os achados).
 */
export async function convergenciaFalhouV2(
  aiDevDir: string,
  phaseId: string,
  currentRunId: string,
  audit: { findings?: { severity?: string; file?: string | null; requirement?: string }[] },
  custoAtualUsd: number | null,
): Promise<ConvergenciaV2Resultado | null> {
  const runsDir = safeJoin(aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    return null;
  }

  const gravesAtual = (audit.findings ?? []).filter((f) => f.severity === 'HIGH' || f.severity === 'BLOCKER');
  if (gravesAtual.length === 0) return null; // convergiu

  const anteriores: { ts: number; runId: string; achados: { severity?: string; file?: string | null; requirement?: string }[]; costUsd: number | null }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(`-${phaseId}`) || entry === currentRunId) continue;
    try {
      const raw = await readFile(safeJoin(runsDir, entry, 'run.json'), 'utf8');
      const parsed = JSON.parse(raw) as {
        audit?: { findings?: { severity?: string; file?: string | null; requirement?: string }[] };
        implementerUsage?: { costUsd?: number | null };
        reviewerUsage?: { costUsd?: number | null };
        costEstimateUsd?: number | null;
      };
      const m = entry.match(/^(\d{8}T\d{6}Z)/);
      const imp = Number(parsed.implementerUsage?.costUsd ?? 0);
      const rev = Number(parsed.reviewerUsage?.costUsd ?? 0);
      const costUsd = Number.isFinite(imp) && Number.isFinite(rev) ? imp + rev : (parsed.costEstimateUsd ?? null);
      anteriores.push({
        ts: m ? Date.parse(m[1]) : 0,
        runId: entry,
        achados: (parsed.audit?.findings ?? []).filter((f) => f.severity === 'HIGH' || f.severity === 'BLOCKER'),
        costUsd: Number.isFinite(Number(costUsd)) ? Number(costUsd) : null,
      });
    } catch {
      // ignora
    }
  }
  if (anteriores.length === 0) return null; // primeira rodada de correção
  anteriores.sort((a, b) => b.ts - a.ts);
  const ultimo = anteriores[0];

  // Resolvidos = achados anteriores SEM equivalente similar no atual (mesmo
  // file + mesmosRequisitos). Reescrita de texto mantém o achado "não resolvido".
  const resolvidos = ultimo.achados.filter((ant) =>
    !gravesAtual.some((atual) =>
      (ant.file ?? '') === (atual.file ?? '') && mesmosRequisitos(ant.requirement ?? '', atual.requirement ?? ''),
    ),
  ).length;
  const novos = gravesAtual.filter((atual) =>
    !ultimo.achados.some((ant) =>
      (ant.file ?? '') === (atual.file ?? '') && mesmosRequisitos(ant.requirement ?? '', atual.requirement ?? ''),
    ),
  ).length;
  const custoAnteriorUsd = ultimo.costUsd ?? 0;
  const custoAtualUsdNorm = custoAtualUsd ?? 0;
  const custoCrescenteSemResolucao = resolvidos === 0 && custoAtualUsdNorm > custoAnteriorUsd + 0.0001;

  if ((resolvidos === 0 && gravesAtual.length > 0) || custoCrescenteSemResolucao) {
    return {
      anterior: ultimo.runId,
      resolvidos,
      novos,
      gravesAtual: gravesAtual.length,
      custoAnteriorUsd,
      custoAtualUsd: custoAtualUsdNorm,
      custoCrescenteSemResolucao,
    };
  }
  return null; // houve progresso → convergindo
}

// ---------------------------------------------------------------------------
// 4. Escalada do revisor
// ---------------------------------------------------------------------------

/** Decide se o revisor deve ser escalado (baliza anti-loop de revisão). */
export function deveEscalarRevisor(
  config: AutomationConfig,
  reprovacoesConsecutivas: number,
  escalacoesUsadas: number,
): { escalar: boolean; exigirHumano: boolean; motivo?: string } {
  const limiar = config.reviewer.escalateAfterAttempts ?? 2;
  const teto = config.reviewer.maxEscalations ?? 1;
  if (reprovacoesConsecutivas >= limiar && escalacoesUsadas < teto) {
    return { escalar: true, exigirHumano: false, motivo: `Revisor escalado após ${reprovacoesConsecutivas} reprovações consecutivas (${escalacoesUsadas + 1}/${teto}).` };
  }
  if (reprovacoesConsecutivas >= limiar + teto) {
    return {
      escalar: false,
      exigirHumano: true,
      motivo: `Revisor reprovou ${reprovacoesConsecutivas} rodadas consecutivas (limiar ${limiar}, ${teto} escalação(ões) usada(s)). Baliza anti-loop: decisão humana requerida.`,
    };
  }
  return { escalar: false, exigirHumano: false };
}
