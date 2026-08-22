// ===========================================================================
// Roadmap: parser do implementation-roadmap.md, máquina de estados e render
// conservador (só altera células de estado e o histórico de auditoria; todo o
// resto do arquivo é preservado).
// ===========================================================================

import {
  PhaseState,
  type PhaseState as PhaseStateType,
  type RoadmapPhase,
} from './contracts.js';

export interface ParsedRoadmap {
  phases: RoadmapPhase[];
}

const PHASE_ROW =
  /^\|\s*([A-Za-z0-9._-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*`([A-Z_]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/;

export function parsePhaseRow(line: string): RoadmapPhase | null {
  const m = line.match(PHASE_ROW);
  if (!m) return null;
  const depsRaw = m[3].trim();
  const dependencies =
    depsRaw === '' || depsRaw === '—' || depsRaw === '-'
      ? []
      : depsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    id: m[1].trim(),
    description: m[2].trim(),
    dependencies,
    status: PhaseState.parse(m[4].trim()),
    implementer: m[5].trim(),
    reviewer: m[6].trim(),
  };
}

export function parseRoadmap(md: string): ParsedRoadmap {
  const phases: RoadmapPhase[] = [];
  const lines = md.split(/\r?\n/);
  let inGeneralTable = false;
  for (const line of lines) {
    if (/^## Roadmap geral/.test(line)) {
      inGeneralTable = true;
      continue;
    }
    if (inGeneralTable && /^##\s+/.test(line)) {
      inGeneralTable = false;
      continue;
    }
    if (!inGeneralTable) continue;
    const row = parsePhaseRow(line);
    if (row) phases.push(row);
  }
  if (phases.length === 0) {
    throw new Error('Nenhuma fase encontrada na seção "## Roadmap geral".');
  }
  return { phases };
}

export function findPhase(phases: RoadmapPhase[], id: string): RoadmapPhase | undefined {
  return phases.find((p) => p.id === id);
}

export function isApproved(phase: RoadmapPhase | undefined): boolean {
  return phase?.status === 'AUDIT_APPROVED';
}

/**
 * Primeira fase PLANNED (na ordem do roadmap) cujas dependências estejam todas
 * AUDIT_APPROVED.
 */
export function findNextPlannable(phases: RoadmapPhase[]): RoadmapPhase | null {
  for (const phase of phases) {
    if (phase.status !== 'PLANNED') continue;
    const depsOk = phase.dependencies.every((dep) => {
      const depPhase = findPhase(phases, dep);
      return isApproved(depPhase);
    });
    if (depsOk) return phase;
  }
  return null;
}

export function getBlockingDependencies(phases: RoadmapPhase[], phase: RoadmapPhase): string[] {
  return phase.dependencies.filter((dep) => !isApproved(findPhase(phases, dep)));
}

// --- Máquina de estados ---

const TRANSITIONS: Record<PhaseStateType, PhaseStateType[]> = {
  PLANNED: ['IMPLEMENTING'],
  IMPLEMENTING: ['IMPLEMENTED', 'PLANNED'], // PLANNED = rollback por falha de infraestrutura
  IMPLEMENTED: ['AUDIT_PENDING', 'AUDIT_APPROVED'], // AUDIT_APPROVED = override manual humano
  AUDIT_PENDING: ['AUDIT_APPROVED', 'CORRECTION_PENDING', 'AUDIT_FAILED'],
  CORRECTION_PENDING: ['IMPLEMENTING', 'AUDIT_APPROVED'], // override manual humano
  AUDIT_FAILED: ['IMPLEMENTING', 'AUDIT_APPROVED'], // override manual humano
  AUDIT_APPROVED: [],
  BLOCKED: ['PLANNED'],
};

export function canTransition(from: PhaseStateType, to: PhaseStateType): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: PhaseStateType, to: PhaseStateType): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição de estado inválida: ${from} → ${to}.`);
  }
}

// --- Render conservador ---

export type RoadmapUpdates = Record<string, PhaseStateType>;

export function splitRowCells(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
}

const HISTORY_ROW =
  /^\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|$/;

function isHistoryDataRow(line: string): boolean {
  if (!HISTORY_ROW.test(line)) return false;
  if (/^\|\s*:?-{2,}/.test(line)) return false; // linha separadora
  return true;
}

/**
 * Aplica atualizações de estado nas células da tabela "Roadmap geral" e nos
 * campos `**Estado:**` das seções detalhadas, e anexa linhas ao
 * "## Histórico de auditoria". Todo o restante do arquivo é preservado.
 */
export function renderRoadmap(
  md: string,
  updates: RoadmapUpdates = {},
  historyRows: string[] = [],
): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inGeneralTable = false;
  let inHistory = false;
  let historyLastDataRow = -1;
  let currentPhase: string | null = null;

  for (const line of lines) {
    if (/^## Roadmap geral/.test(line)) inGeneralTable = true;
    else if (/^##\s+/.test(line)) {
      inGeneralTable = false;
      // Só rearma o contador ao ENTRAR no histórico; títulos seguintes
      // (ex.: "## Critério final") não podem apagar a posição já registrada.
      if (/^## Histórico de auditoria/.test(line)) {
        inHistory = true;
        historyLastDataRow = -1;
      } else {
        inHistory = false;
      }
    }

    if (inGeneralTable) {
      const row = parsePhaseRow(line);
      if (row && updates[row.id]) {
        const cols = splitRowCells(line);
        cols[3] = `\`${updates[row.id]}\``;
        out.push(`| ${cols.join(' | ')} |`);
        continue;
      }
    }

    if (/^###\s+/.test(line)) {
      const m = line.match(/^###\s+([A-Za-z0-9._-]+)\s*—/);
      currentPhase = m ? m[1] : null;
    }
    if (currentPhase && updates[currentPhase]) {
      const st = line.match(/^\*\*Estado:\*\*\s*`([A-Z_]+)`/);
      if (st) {
        out.push(`**Estado:** \`${updates[currentPhase]}\``);
        continue;
      }
    }

    if (inHistory && isHistoryDataRow(line)) {
      historyLastDataRow = out.length;
    }

    out.push(line);
  }

  if (historyRows.length > 0) {
    if (historyLastDataRow < 0) {
      throw new Error('Seção "## Histórico de auditoria" não encontrada no roadmap.');
    }
    out.splice(historyLastDataRow + 1, 0, ...historyRows);
  }

  return out.join('\n');
}

/**
 * Extrai as linhas do histórico de auditoria de uma fase específica
 * (formato `| data | fase | implementador | revisor | veredito | avançou | nota |`).
 * Usado para dar MEMÓRIA ao revisor: ele vê o que já foi pedido nas rodadas
 * anteriores em vez de reavaliar do zero (alvo móvel).
 */
export function extractAuditHistory(md: string, phaseId: string): string[] {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inHistory = false;
  for (const line of lines) {
    if (/^## Histórico de auditoria/.test(line)) {
      inHistory = true;
      continue;
    }
    if (inHistory && /^##\s+/.test(line)) {
      break; // fim do histórico
    }
    if (inHistory && isHistoryDataRow(line)) {
      const cells = splitRowCells(line);
      // cells: [data, fase, implementador, revisor, veredito, avançou, nota]
      if (cells[1]?.trim() === phaseId) {
        out.push(line.trim());
      }
    }
  }
  return out;
}

export function buildHistoryRow(opts: {
  date: string;
  phase: string;
  implementer: string;
  reviewer: string;
  verdict: string;
  advanceAllowed: boolean;
  note: string;
}): string {
  const clean = (s: string): string => s.replace(/[|\r\n]/g, ' ').trim();
  return `| ${clean(opts.date)} | ${clean(opts.phase)} | ${clean(opts.implementer)} | ${clean(opts.reviewer)} | ${clean(opts.verdict)} | ${opts.advanceAllowed ? 'Sim' : 'Não'} | ${clean(opts.note)} |`;
}

/** Valida formato de id de fase (usado para branch e run id). */
export function isValidPhaseId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}
