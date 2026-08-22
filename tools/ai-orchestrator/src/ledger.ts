// ===========================================================================
// Findings Ledger: fonte canônica dos achados HIGH/BLOCKER por fase, com IDs
// estáveis entre rodadas. Elimina o "goalpost moving" (alvo móvel do revisor):
// no round 2+, o revisor recebe SOMENTE os itens abertos e responde
// RESOLVED/UNRESOLVED por ID — sem reinventar exigências já atendidas.
//
// O ledger fica em `runs/ledger/<phaseId>.json` (gitignored, como os runs).
// ===========================================================================

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditResult, Finding } from './contracts.js';
import { safeJoin } from './paths.js';

export interface LedgerEntry {
  id: string;
  severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';
  file: string | null;
  line: number | null;
  requirement: string;
  evidence: string;
  action: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  createdRunId: string;
  resolvedRunId: string | null;
}

/** Normaliza texto para comparação estável entre redações diferentes do mesmo achado. */
export function normalizeForMatching(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'em', 'um', 'uma', 'que', 'para', 'por', 'com', 'sem',
  'the', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'no', 'na', 'os', 'as',
]);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const tok of normalizeForMatching(text).split(/\s+/)) {
    // Mantém números curtos (ex.: "20") e remove stopwords; tokens >= 2 chars.
    if (tok.length >= 2 && !STOPWORDS.has(tok)) out.add(tok);
  }
  return out;
}

/** ID estável de um finding, derivado do conteúdo normalizado (severidade + arquivo + requisito). */
export function findingId(finding: Pick<Finding, 'severity' | 'file' | 'requirement'>): string {
  const base = `${finding.severity}::${finding.file ?? ''}::${normalizeForMatching(finding.requirement)}`;
  return 'F-' + createHash('sha256').update(base).digest('hex').slice(0, 12);
}

/**
 * Similaridade entre dois achados: MAX(overlap de tokens, overlap de trigramas
 * de caracteres). Trigramas tornam o match robusto a reescritas que reordenam
 * ou trocam palavras mantendo o núcleo do achado. >= 0.35 = MESMO item.
 */
export function findingSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  const tokenOverlap = (() => {
    if (ta.size === 0 && tb.size === 0) return 1;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter += 1;
    const min = Math.min(ta.size, tb.size);
    return min === 0 ? 0 : inter / min;
  })();

  const triA = trigrams(a);
  const triB = trigrams(b);
  const triOverlap = (() => {
    if (triA.size === 0 && triB.size === 0) return 1;
    let inter = 0;
    for (const t of triA) if (triB.has(t)) inter += 1;
    const min = Math.min(triA.size, triB.size);
    return min === 0 ? 0 : inter / min;
  })();

  return Math.max(tokenOverlap, triOverlap);
}

function trigrams(text: string): Set<string> {
  const n = normalizeForMatching(text);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= n.length; i++) out.add(n.slice(i, i + 3));
  return out;
}

const LEDGER_DIR = 'ledger';

function ledgerPath(aiDevDir: string, phaseId: string): string {
  return safeJoin(aiDevDir, 'runs', LEDGER_DIR, `${phaseId}.json`);
}

export async function readLedger(aiDevDir: string, phaseId: string): Promise<LedgerEntry[]> {
  try {
    const raw = await readFile(ledgerPath(aiDevDir, phaseId), 'utf8');
    const parsed = JSON.parse(raw) as LedgerEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeLedger(aiDevDir: string, phaseId: string, entries: LedgerEntry[]): Promise<void> {
  const file = ledgerPath(aiDevDir, phaseId);
  await mkdir(join(aiDevDir, 'runs', LEDGER_DIR), { recursive: true });
  await writeFile(file, JSON.stringify(entries, null, 2), 'utf8');
}

/** Achados abertos (não RESOLVED), mais recentes primeiro. */
export function openFindings(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => e.status === 'OPEN');
}

/**
 * Reconcilia o resultado de uma auditoria com o ledger da fase:
 *  - achados HIGH/BLOCKER equivalentes a itens abertos mantêm o MESMO ID (OPEN);
 *  - itens abertos que não reaparecem → RESOLVED;
 *  - achados HIGH/BLOCKER novos → OPEN com novo ID.
 *  - achados MEDIUM/LOW NUNCA entram no ledger (débito técnico, não bloqueiam).
 *
 * Retorna o ledger atualizado (já persistido em disco).
 */
export async function reconcileLedger(
  aiDevDir: string,
  phaseId: string,
  runId: string,
  audit: AuditResult,
): Promise<LedgerEntry[]> {
  const now = new Date().toISOString();
  const severe = audit.findings.filter(
    (f): f is Finding & { severity: 'HIGH' | 'BLOCKER' } => f.severity === 'HIGH' || f.severity === 'BLOCKER',
  );
  const prev = await readLedger(aiDevDir, phaseId);
  const openPrev = openFindings(prev);

  const next: LedgerEntry[] = [];
  const consumed = new Set<string>();

  // 1) Achados novos: reusa ID de um item aberto equivalente; senão cria.
  for (const f of severe) {
    let match: LedgerEntry | undefined;
    for (const o of openPrev) {
      if (consumed.has(o.id)) continue;
      if (o.file === f.file && findingSimilarity(o.requirement, f.requirement) >= 0.35) {
        match = o;
        break;
      }
    }
    if (match) {
      consumed.add(match.id);
      next.push({ ...match, severity: f.severity, file: f.file, line: f.line, requirement: f.requirement, evidence: f.evidence, action: f.action });
    } else {
      next.push({
        id: findingId(f),
        severity: f.severity,
        file: f.file,
        line: f.line,
        requirement: f.requirement,
        evidence: f.evidence,
        action: f.action,
        status: 'OPEN',
        createdAt: now,
        createdRunId: runId,
        resolvedRunId: null,
      });
    }
  }

  // 2) Itens abertos anteriores que não reapareceram → RESOLVED.
  for (const o of openPrev) {
    if (consumed.has(o.id)) continue;
    next.push({ ...o, status: 'RESOLVED', resolvedRunId: runId });
  }

  // 3) Preserva itens já RESOLVED (histórico).
  for (const e of prev) {
    if (e.status === 'RESOLVED') next.push(e);
  }

  next.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  await writeLedger(aiDevDir, phaseId, next);
  return next;
}
