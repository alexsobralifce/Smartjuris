// ===========================================================================
// Painel web em tempo real (template): agrega os runs/ledger/roadmap em um
// snapshot JSON e serve um dashboard HTML simples — custos, verificações e
// progresso por fase. Sem dependências (node:http puro). Leitura ao vivo do
// disco a cada request; o front faz polling a cada poucos segundos.
// ===========================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { safeJoin, moduleDir } from './paths.js';
import { readText } from './io.js';
import { parseRoadmap } from './roadmap.js';
import { readLedger, openFindings, type LedgerEntry } from './ledger.js';
import { structureRequirements, applyRequirements } from './requirements.js';
import type { RequirementPhase } from './contracts.js';
import type { AutomationConfig } from './contracts.js';

interface RunItem {
  id: string;
  ts: number;
  fase: string;
  status: string;
  veredito: string | null;
  revisor: string;
  custoUsd: number | null;
  promptTokens: number;
  completionTokens: number;
  testesOk: boolean | null;
  buildOk: boolean | null;
  diffOk: boolean | null;
  skip: boolean;
  cache: boolean;
}

interface PhaseRow {
  id: string;
  estado: string;
  rounds: number;
  ultimoVeredito: string | null;
  ultimoRevisor: string | null;
  custoUsd: number | null;
  tokens: number;
  testesOk: boolean | null;
  buildOk: boolean | null;
  diffOk: boolean | null;
  ledgerAbertos: number;
}

export interface Snapshot {
  geradoEm: string;
  config: {
    revisor: string;
    tetoCorrecoes: number;
    preflight: string;
  };
  totais: {
    custoUsd: number;
    tokens: number;
    runs: number;
    fasesAprovadas: number;
    fasesPendentes: number;
    revisorPoupado: number;
  };
  fases: PhaseRow[];
  ultimosRuns: RunItem[];
}

function readJsonLoose<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Monta o snapshot completo (roadmap + runs + ledger) — sem mutar nada. */
export function buildSnapshot(aiDevDir: string, config: AutomationConfig): Snapshot {
  const roadmapFile = safeJoin(aiDevDir, basename(config.roadmap));
  const { phases } = parseRoadmap(readText(roadmapFile));

  const runsDir = safeJoin(aiDevDir, 'runs');
  let entries: string[] = [];
  try {
    entries = readdirSync(runsDir);
  } catch {
    entries = [];
  }

  const runs: RunItem[] = [];
  for (const entry of entries) {
    const m = entry.match(/^(\d{8}T\d{6}Z)-(.+)$/);
    if (!m) continue;
    const dir = safeJoin(runsDir, entry);
    const run = readJsonLoose<{
      status?: string;
      reviewerModel?: string;
      costEstimateUsd?: number | null;
      tokenUsage?: { promptTokens?: number; completionTokens?: number };
      fromCache?: boolean;
      skippedReviewer?: boolean;
    }>(safeJoin(dir, 'run.json'));
    const audit = readJsonLoose<{ verdict?: string }>(safeJoin(dir, '10-audit-result.json'));
    const evidence = readJsonLoose<{ testsPass?: boolean; buildsPass?: boolean; hasDiff?: boolean }>(safeJoin(dir, '11-evidence.json'));
    runs.push({
      id: entry,
      ts: Date.parse(m[1]) || 0,
      fase: m[2],
      status: run?.status ?? '?',
      veredito: audit?.verdict ?? null,
      revisor: run?.reviewerModel ?? '?',
      custoUsd: typeof run?.costEstimateUsd === 'number' ? run.costEstimateUsd : null,
      promptTokens: run?.tokenUsage?.promptTokens ?? 0,
      completionTokens: run?.tokenUsage?.completionTokens ?? 0,
      testesOk: evidence?.testsPass ?? null,
      buildOk: evidence?.buildsPass ?? null,
      diffOk: evidence?.hasDiff ?? null,
      skip: run?.skippedReviewer === true,
      cache: run?.fromCache === true,
    });
  }
  runs.sort((a, b) => a.ts - b.ts);

  const porFase = new Map<string, RunItem[]>();
  for (const r of runs) {
    const lista = porFase.get(r.fase) ?? [];
    lista.push(r);
    porFase.set(r.fase, lista);
  }

  const fases: PhaseRow[] = phases.map((p) => {
    const lista = (porFase.get(p.id) ?? []).sort((a, b) => a.ts - b.ts);
    const ultimo = lista.length > 0 ? lista[lista.length - 1] : null;
    return {
      id: p.id,
      estado: p.status,
      rounds: lista.length,
      ultimoVeredito: ultimo?.veredito ?? null,
      ultimoRevisor: ultimo?.revisor && ultimo.revisor !== '?' ? ultimo.revisor : null,
      custoUsd: lista.reduce((acc, r) => acc + (r.custoUsd ?? 0), 0) || null,
      tokens: lista.reduce((acc, r) => acc + r.promptTokens + r.completionTokens, 0) || 0,
      testesOk: ultimo?.testesOk ?? null,
      buildOk: ultimo?.buildOk ?? null,
      diffOk: ultimo?.diffOk ?? null,
      ledgerAbertos: openFindings(readLedgerSync(aiDevDir, p.id)).length,    };
  });

  const custoTotal = runs.reduce((acc, r) => acc + (r.custoUsd ?? 0), 0);
  const tokensTotal = runs.reduce((acc, r) => acc + r.promptTokens + r.completionTokens, 0);
  const aprovadas = phases.filter((p) => p.status === 'AUDIT_APPROVED').length;

  return {
    geradoEm: new Date().toISOString(),
    config: {
      revisor: config.reviewer.model,
      tetoCorrecoes: config.limits.maxCorrectionAttempts,
      preflight: config.preflight?.mode ?? 'collect-all',
    },
    totais: {
      custoUsd: custoTotal,
      tokens: tokensTotal,
      runs: runs.length,
      fasesAprovadas: aprovadas,
      fasesPendentes: phases.length - aprovadas,
      revisorPoupado: runs.filter((r) => r.skip || r.cache).length,
    },
    fases,
    ultimosRuns: runs.slice(-12).reverse(),
  };
}

function readLedgerSync(aiDevDir: string, phaseId: string): LedgerEntry[] {
  // Versão síncrona do readLedger para o snapshot (evita async em todo o fluxo).
  try {
    const raw = readFileSync(safeJoin(aiDevDir, 'runs', 'ledger', `${phaseId}.json`), 'utf8');
    const parsed = JSON.parse(raw) as LedgerEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const HTML_PATH = join(moduleDir(import.meta.url), '..', 'web', 'dashboard.html');

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

export interface DashboardServerOptions {
  aiDevDir: string;
  config: AutomationConfig;
  port: number;
  log: { info: (msg: string) => void };
  /** Cliente LLM usado para estruturar requisitos (DeepSeek Flash). */
  llm: import('./llm.js').LlmClient;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 1_000_000) {
        reject(new Error('corpo da requisição muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Sobe o servidor do painel. Retorna a URL base. */
export function startDashboardServer(opts: DashboardServerOptions): string {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? '/').split('?')[0];
    try {
      if (url === '/api/snapshot') {
        sendJson(res, 200, buildSnapshot(opts.aiDevDir, opts.config));
        return;
      }
      if (url === '/api/requisitos' && req.method === 'POST') {
        // Entrada de requisitos: texto livre → estruturação por LLM (DeepSeek Flash).
        const body = JSON.parse(await readBody(req)) as { texto?: string };
        if (!body.texto?.trim()) {
          sendJson(res, 400, { erro: 'Informe o texto dos requisitos.' });
          return;
        }
        const doc = await structureRequirements(opts.llm, body.texto);
        sendJson(res, 200, { fases: doc.fases });
        return;
      }
      if (url === '/api/requisitos' && req.method === 'PUT') {
        // Aplica os requisitos (já estruturados) no roadmap + prompts + requirements/.
        const body = JSON.parse(await readBody(req)) as { fases?: RequirementPhase[] };
        if (!Array.isArray(body.fases) || body.fases.length === 0) {
          sendJson(res, 400, { erro: 'Envie o array de fases estruturadas.' });
          return;
        }
        const result = await applyRequirements(opts.aiDevDir, opts.config, body.fases);
        sendJson(res, 200, result);
        return;
      }
      // /api/* desconhecido → JSON de erro claro.
      if (url.startsWith('/api/')) {
        sendJson(res, 404, { erro: `API não encontrada: ${url}. Use /api/snapshot, POST/PUT /api/requisitos.` });
        return;
      }
      // favicon: silencioso (não vira "rota não encontrada" no console).
      if (url === '/favicon.ico') {
        res.writeHead(204, { 'Content-Type': 'image/x-icon' });
        res.end();
        return;
      }
      // Página do painel: rota raiz + aliases; qualquer outra rota de página
      // cai no HTML (fallback SPA) — nunca "rota não encontrada" ao navegar.
      let html = '';
      try {
        html = readFileSync(HTML_PATH, 'utf8');
      } catch {
        sendHtml(res, 500, '<h1>dashboard.html não encontrado</h1><p>Verifique tools/ai-orchestrator/web/dashboard.html</p>');
        return;
      }
      sendHtml(res, 200, html);
    } catch (err) {
      sendJson(res, 500, { erro: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(opts.port, () => {
    opts.log.info(`Painel do orquestrador: http://localhost:${opts.port}`);
    opts.log.info('  Página:  http://localhost:' + opts.port + '/');
    opts.log.info('  Dados:   http://localhost:' + opts.port + '/api/snapshot');
  });

  return `http://localhost:${opts.port}`;
}
