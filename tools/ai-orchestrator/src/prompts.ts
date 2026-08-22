// ===========================================================================
// Prompts: extração do prompt da fase (smartjuris-phase-prompts.md) e montagem
// dos envelopes de implementação e de revisão (smartjuris-prompt-templates.md).
// ===========================================================================

export interface PhasePrompt {
  phaseId: string;
  name: string;
  implementer: string;
  reviewer: string;
}

/**
 * Extrai a seção `# <phaseId> — <nome>` e os blocos `## DeepSeek — implementação`
 * e `## GPT-5.6 Terra — revisão` (conteúdo fora das cercas ``` é ignorado).
 */
export function extractPhasePrompts(md: string, phaseId: string): PhasePrompt {
  const lines = md.split(/\r?\n/);
  let name = '';
  let section: 'none' | 'implementer' | 'reviewer' = 'none';
  const impl: string[] = [];
  const rev: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^#\s+([A-Za-z0-9._-]+)\s*—\s*(.+)$/);
    if (heading) {
      if (heading[1] === phaseId) {
        name = heading[2].trim();
        continue;
      }
      // Outra seção: se já capturamos algo desta fase, paramos.
      if (name && (impl.length || rev.length)) break;
      continue;
    }
    if (!name) continue;

    if (/^## DeepSeek — implementação/.test(line)) {
      section = 'implementer';
      continue;
    }
    if (/^## GPT-5.6 Terra — revisão/.test(line)) {
      section = 'reviewer';
      continue;
    }
    if (/^##\s+/.test(line)) {
      section = 'none';
      continue;
    }
    if (section !== 'none' && !/^\s*```/.test(line)) {
      (section === 'implementer' ? impl : rev).push(line);
    }
  }

  if (!name) {
    throw new Error(`Seção da fase ${phaseId} não encontrada em smartjuris-phase-prompts.md.`);
  }
  return {
    phaseId,
    name,
    implementer: impl.join('\n').trim(),
    reviewer: rev.join('\n').trim(),
  };
}

export interface ImplementerEnvelopeInput {
  phaseId: string;
  phaseName: string;
  approvedDependencies: string[];
  objective: string;
  scopePrompt: string;
  outOfScope: string;
  completionCriteria: string;
}

/** Envelope de implementação (template de smartjuris-prompt-templates.md). */
export function buildImplementerEnvelope(input: ImplementerEnvelopeInput): string {
  const deps =
    input.approvedDependencies.length > 0
      ? input.approvedDependencies.map((d) => `- ${d}`).join('\n')
      : '- nenhuma (fase raiz)';
  return [
    `Fase atual: ${input.phaseId} — ${input.phaseName}`,
    '',
    'Dependências aprovadas:',
    deps,
    '',
    'Objetivo:',
    input.objective,
    '',
    'Escopo:',
    input.scopePrompt,
    '',
    'Fora do escopo:',
    input.outOfScope,
    '',
    'Critério de conclusão:',
    input.completionCriteria,
    '',
    'Implemente somente esta fase. Ao concluir, entregue diff, testes, build, riscos e limitações. Pare para revisão.',
  ].join('\n');
}

export interface ReviewContextInput {
  phaseId: string;
  phaseName: string;
  objective: string;
  approvedDependencies: string[];
  filesChanged: string;
  diff: string;
  tests: string;
  build: string;
  migrations: string;
  decisions: string;
  limitations: string;
  risks: string;
}

/** Formato de passagem para o Terra (smartjuris-phase-prompts.md). */
export function buildReviewContext(input: ReviewContextInput): string {
  return [
    `Fase: ${input.phaseId}${input.phaseName ? ` — ${input.phaseName}` : ''}`,
    '',
    'Objetivo:',
    input.objective || '—',
    '',
    'Dependências aprovadas:',
    input.approvedDependencies.length > 0 ? input.approvedDependencies.join(', ') : '—',
    '',
    'Arquivos alterados:',
    input.filesChanged || '—',
    '',
    'Diff:',
    input.diff || '—',
    '',
    'Testes:',
    input.tests || '—',
    '',
    'Build:',
    input.build || '—',
    '',
    'Migration:',
    input.migrations || '—',
    '',
    'Decisões tomadas:',
    input.decisions || '—',
    '',
    'Limitações:',
    input.limitations || '—',
    '',
    'Riscos:',
    input.risks || '—',
    '',
    'Analise a implementação e retorne somente o contrato JSON de revisão.',
  ].join('\n');
}
