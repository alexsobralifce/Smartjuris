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
    if (/^## GPT-5.6 Luna — revisão/.test(line)) {
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
  /** Regras de baliza (orquestrador-regras.md) — lidas a cada acionamento. */
  guardrails?: string;
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
    'Padrões de teste exigidos na pré-auditoria (incorpore JÁ na primeira rodada):',
    REVIEWER_TEST_PATTERNS,
    '',
    'REGRA DE BALIZA (valem para esta rodada):',
    input.guardrails ?? '(nenhuma regra adicional)',
    '',
    'Implemente somente esta fase. Ao concluir, entregue diff, testes, build, riscos e limitações. Pare para revisão.',
  ].join('\n');
}

/**
 * Padrões de teste que o revisor exige recorrentemente (aprendido nas fases
 * 3A/3B/3C/3D — 15+ rounds cada). Incluir ANTES da primeira auditoria evita
 * rounds de correção previsíveis. Ver checklist completo em
 * docs/ai-development/smartjuris-prompt-templates.md.
 */
export const REVIEWER_TEST_PATTERNS = [
  '1. Migration nova: teste em banco LIMPO (aplica coluna/índice) + UPGRADE a partir do estado anterior (recria) + reaplicação idempotente + rollback documentado.',
  '2. Concorrência/corrida: requisições simultâneas idempotentes → exatamente UMA linha; violação de unicidade (23505) recupera e devolve o registro vencedor; chave normalizada (trim) idêntica em TODOS os caminhos (checagem, insert, catch).',
  '3. Fluxo/UI (quando houver frontend): chamadores coalescidos aplicam o id e concluem a transição; retry após falha NÃO fica bloqueado (chave liberada); chave de idempotência cobre o payload COMPLETO.',
  '4. Evidências: suítes de teste do backend E do frontend executadas (o orquestrador roda ambas); builds verdes.',
  '5. Fail-closed (quando IA): erros estruturados SEM detalhes internos de provedor; evento SSE terminal ÚNICO; uso REAL de tokens (nunca aproximado); reserva retida em falhas ambíguas; tenant isolado em toda consulta.',
].join('\n');

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
  /** Linhas do histórico de auditoria anterior da fase (memória: evita alvo móvel). */
  auditHistory: string;
  /** Mudanças feitas nesta rodada em resposta às condições anteriores. */
  correctionsApplied: string;
  /** Findings abertos do ledger (round 2+): o revisor valida SOMENTE estes itens. */
  openFindings?: string;
  /** Se true, é uma rodada de correção: auditoria focada no delta, sem novas exigências. */
  isCorrection?: boolean;
  /** Regras de baliza (orquestrador-regras.md) — lidas a cada acionamento. */
  guardrails?: string;
}

/** Formato de passagem para o Terra (smartjuris-phase-prompts.md). */
export function buildReviewContext(input: ReviewContextInput): string {
  const parts: string[] = [
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
  ];

  // Memória das rodadas anteriores — o revisor NÃO deve reabrir o que já foi
  // aprovado nem repetir condições já atendidas (evita o "alvo móvel").
  if (input.auditHistory.trim()) {
    parts.push('', 'Histórico de auditoria anterior desta fase (mais recente primeiro):', input.auditHistory.trim());
  }
  if (input.correctionsApplied.trim()) {
    parts.push('', 'Correções aplicadas NESTA rodada em resposta às condições anteriores:', input.correctionsApplied.trim());
  }

  // Rodada de correção (round 2+): o revisor recebe o LEDGER de itens abertos e
  // valida EXCLUSIVAMENTE se cada um foi resolvido — sem criar novas exigências.
  if (input.isCorrection) {
    parts.push(
      '',
      'MODO: VALIDAÇÃO DE CORREÇÃO (delta).',
      'Você está avaliando EXCLUSIVAMENTE a correção dos itens abertos abaixo.',
      'Para cada item, o veredito deve refletir apenas se foi RESOLVIDO (não reaparece como HIGH/BLOCKER) ou UNRESOLVIDO (continua HIGH/BLOCKER).',
      'É PROIBIDO adicionar novos achados LOW/MEDIUM ou sugestões cosméticas/estilo.',
      'Novos achados só são permitidos se forem HIGH/BLOCKER introduzidos diretamente nas linhas MODIFICADAS deste delta (nunca em arquivos/linhas não tocados).',
    );
    if (input.openFindings?.trim()) {
      parts.push('', 'Itens abertos (avaliar apenas estes):', input.openFindings.trim());
    } else {
      parts.push('', 'Itens abertos: (nenhum — se o diff resolveu tudo, aprove sem novas exigências).');
    }
  }

  parts.push(
    '',
    'REGRAS DE REVISÃO:',
    '- Avalie APENAS as condições pendentes desta rodada; não reabra tópicos já resolvidos nas rodadas anteriores.',
    '- Se uma condição anterior já foi atendida, registre PASS e avance; não exija itens novos fora do escopo da fase.',
    '- Liste apenas achados NOVOS e não duplicados em rodadas anteriores.',
    '- Retorne somente o contrato JSON de revisão.',
  );

  // Regras de baliza (orquestrador-regras.md) — lidas a cada acionamento.
  if (input.guardrails?.trim()) {
    parts.push('', 'REGRA DE BALIZA (valem para esta rodada):', input.guardrails.trim());
  }

  return parts.join('\n');
}
