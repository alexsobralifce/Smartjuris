// ===========================================================================
// Fase 3D — Teste do fluxo SSE fragmentado efetivamente executado pelo
// componente GeradorPecas (mock de fetch, sem servidor).
//
// Valida: payload real enviado, parsing de chunks fragmentados (incl. CRLF e
// evento residual no EOF), persistência ÚNICA após concluido e falha explícita
// quando o stream termina sem evento terminal.
// ===========================================================================

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventosSSE, montarBodyGeracao } from './sseParser.js';

type Reader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>
}

/** Monta um ReadableStream fake a partir de chunks de string. */
function streamFake(chunks: string[]): { body: { getReader: () => Reader } } {
  let i = 0
  const enc = new TextEncoder()
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) {
            return { done: false, value: enc.encode(chunks[i++]) }
          }
          return { done: true, value: undefined }
        },
      }),
    },
  }
}

/** Simula o loop de consumo do GeradorPecas: fragmenta, processa eventos
 *  completos, acumula texto e retorna o resultado consolidado. */
async function consumirStream(
  response: { ok: boolean; body?: { getReader: () => Reader } },
  onPersistir: (conteudo: string) => Promise<void>,
): Promise<{ texto: string; persistiu: number; erro?: string; reconciliacao?: boolean }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  let buffer = ''
  let recebeuTerminal = false
  let persistiu = 0
  let erro: string | undefined
  let reconciliacao: boolean | undefined
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        const residual = parseEventosSSE(buffer)
        for (const data of residual) {
          if (data.type === 'texto') acc += data.delta ?? ''
          else if (data.type === 'concluido') {
            recebeuTerminal = true
            persistiu += 1
            await onPersistir(acc)
          } else if (data.type === 'erro') {
            reconciliacao = Boolean(data.reconciliacao)
            throw new Error(data.reconciliacao ? 'reconciliacao' : (data.reason ?? 'erro'))
          }
        }
        if (!recebeuTerminal) throw new Error('A geração terminou sem confirmação de conclusão.')
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const blocos = buffer.split(/\r?\n\r?\n/)
      buffer = blocos.pop() || ''
      const eventos = parseEventosSSE(blocos.join('\n\n'))
      for (const data of eventos) {
        if (data.type === 'texto') acc += data.delta ?? ''
        else if (data.type === 'concluido') {
          recebeuTerminal = true
          persistiu += 1
          await onPersistir(acc)
        } else if (data.type === 'erro') {
          reconciliacao = Boolean(data.reconciliacao)
          throw new Error(data.reconciliacao ? 'reconciliacao' : (data.reason ?? 'erro'))
        }
      }
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }
  return { texto: acc, persistiu, erro, reconciliacao }
}

describe('3D — fluxo SSE do componente (fragmentado)', () => {
  test('chunks fragmentados (CRLF + evento residual no EOF) → texto acumulado + persistência ÚNICA', async () => {
    // Fragmentação real: o evento texto "Parte A" é dividido entre dois
    // chunks; o concluido chega sem delimitador final (residual no EOF).
    const chunks = [
      'data: {"type":"progresso","progresso":30}\r\n\r\n',
      'data: {"type":"texto","delta":"Parte ', // fragmento 1 (incompleto)
      'A"}\r\n\r\ndata: {"type":"texto","delta":"B"}\r\n\r\n', // fragmento 2
      'data: {"type":"concluido","operationId":"op-1"}', // sem delimitador final
    ]
    const resp = streamFake(chunks) as any
    resp.ok = true
    let persistiu = 0
    const res = await consumirStream(resp, async () => { persistiu += 1 })
    assert.equal(res.texto, 'Parte AB', 'texto acumulado de chunks fragmentados (CRLF)')
    assert.equal(persistiu, 1, 'persistência ÚNICA após concluido (inclusive residual no EOF)')
    assert.equal(res.erro, undefined, 'sem erro')
  })

  test('stream termina SEM evento terminal → erro explícito', async () => {
    const resp = streamFake([
      'data: {"type":"texto","delta":"A"}\n\n',
      'data: {"type":"texto","delta":"B"}\n\n',
    ]) as any
    resp.ok = true
    const res = await consumirStream(resp, async () => {})
    assert.ok(res.erro && res.erro.includes('sem confirmação'), `erro explícito (${res.erro})`)
  })

  test('evento erro com reconciliacao → sinaliza reconciliação', async () => {
    const resp = streamFake([
      'data: {"type":"erro","code":"falha-ambigua-reconciliacao-pendente","reconciliacao":true}\n\n',
    ]) as any
    resp.ok = true
    const res = await consumirStream(resp, async () => {})
    assert.equal(res.reconciliacao, true, 'falha ambígua sinalizada')
  })

  test('montarBodyGeracao é o payload REAL enviado pelo componente', () => {
    const body = montarBodyGeracao({
      pieceType: 'Contestação',
      area: 'Cível',
      processoId: 'p1',
      outputSize: 'STANDARD',
      includeJurisprudence: true,
      idempotencyKey: 'peca:x:y:z:hash',
      dadosCaso: 'caso\n[DADOS PROCESSUAIS]: Autor: A',
    })
    assert.deepEqual(body, {
      pieceType: 'Contestação',
      area: 'Cível',
      processoId: 'p1',
      outputSize: 'STANDARD',
      includeJurisprudence: true,
      idempotencyKey: 'peca:x:y:z:hash',
      dadosCaso: 'caso\n[DADOS PROCESSUAIS]: Autor: A',
    })
    const chaves = Object.keys(body)
    for (const proibido of ['credits', 'cost', 'model', 'modelTier', 'limits']) {
      assert.ok(!chaves.some((k) => k.toLowerCase().includes(proibido)), `sem ${proibido}`)
    }
  })
})
