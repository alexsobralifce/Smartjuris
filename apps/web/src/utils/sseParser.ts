// ===========================================================================
// Fase 3D — Parser de eventos SSE da geração de peças (Fase 3C).
//
// Funções PURAS (sem DOM/IO) para o fluxo de consumo dos eventos tipados:
//   operacao → progresso → texto → concluido | erro (com reconciliacao).
// Isoladas para teste unitário sem servidor.
// ===========================================================================

export type EventoGeracaoSSE =
  | { type: 'progresso'; progresso: number; label?: string }
  | { type: 'texto'; delta: string }
  | { type: 'operacao'; operationId: string | null; status?: string }
  | { type: 'concluido'; operationId?: string | null; saldo?: { credits?: number | null } }
  | { type: 'erro'; code: string; reason?: string; reconciliacao?: boolean }

/** Extrai e faz parse de todos os eventos `data: JSON` de um chunk SSE bruto.
 *  Aceita delimitadores LF e CRLF (SSE HTTP pode usar `\r\n\r\n`).
 *  Eventos malformados são ignorados (mesma tolerância do consumidor). */
export function parseEventosSSE(chunk: string): EventoGeracaoSSE[] {
  const eventos: EventoGeracaoSSE[] = []
  // Normaliza CRLF → LF para interoperabilidade com a formatação SSE válida.
  const normalizado = chunk.replace(/\r\n/g, '\n')
  for (const linha of normalizado.split('\n')) {
    if (!linha.startsWith('data: ')) continue
    const dataStr = linha.substring(6).trim()
    if (!dataStr) continue
    try {
      const data = JSON.parse(dataStr)
      if (data && typeof data.type === 'string') eventos.push(data as EventoGeracaoSSE)
    } catch {
      // linha SSE malformada: ignora
    }
  }
  return eventos
}

/** Monta o body do POST /api/pecas/gerar-sse (Fase 3C/3D).
 *  NUNCA inclui créditos/custo/modelo/limites — decisão de servidor. */
export function montarBodyGeracao(input: {
  pieceType: string
  area: string
  processoId?: string
  outputSize?: 'SHORT' | 'STANDARD' | 'COMPLETE'
  includeJurisprudence?: boolean
  idempotencyKey: string
  dadosCaso: string
}): Record<string, unknown> {
  return {
    pieceType: input.pieceType,
    area: input.area,
    processoId: input.processoId ?? undefined,
    outputSize: input.outputSize ?? 'STANDARD',
    includeJurisprudence: input.includeJurisprudence ?? true,
    idempotencyKey: input.idempotencyKey,
    dadosCaso: input.dadosCaso,
  }
}

/** Chave de idempotência por peça: identifica EXATAMENTE uma geração
 *  intencional — estável para RECONEXÕES (mesmos dados → mesmo conteúdo → sem
 *  dupla cobrança) e NOVA quando QUALQUER dado que altera o payload de geração
 *  muda (dadosCaso final, extensão, partes, vara, valor). O hash cobre o
 *  payload REAL enviado ao endpoint (3C), não apenas o texto bruto. */
/** Hash SHA-256 hex (crypto.subtle — assíncrono). Resistente a colisões
 *  práticas entre payloads distintos que afetariam cobrança/reconciliação. */
async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Chave de idempotência por peça: identifica EXATAMENTE uma geração
 *  intencional — estável para RECONEXÕES (mesmos dados → mesmo conteúdo → sem
 *  dupla cobrança) e NOVA quando QUALQUER dado que altera o payload de geração
 *  muda. O hash SHA-256 cobre o payload REAL enviado ao endpoint (3C):
 *  dadosCaso final, extensão, partes, vara e valor. */
export async function chaveIdempotenciaPeca(input: {
  tipo: string
  area: string
  processoId?: string
  dadosCaso: string
  outputSize?: 'SHORT' | 'STANDARD' | 'COMPLETE'
  // Campos processuais incorporados ao payload (3C) — alterá-los é uma NOVA
  // geração intencional.
  nomeCliente?: string
  parteAdversa?: string
  varaTribunal?: string
  valorCausa?: string
}): Promise<string> {
  const fonte = [
    input.dadosCaso,
    input.outputSize ?? 'STANDARD',
    input.nomeCliente ?? '',
    input.parteAdversa ?? '',
    input.varaTribunal ?? '',
    input.valorCausa ?? '',
  ].join('|')
  const hashHex = await sha256Hex(fonte)
  return `peca:${input.tipo || 'peticao'}:${input.area}:${input.processoId || 'avulso'}:${hashHex}`
}
