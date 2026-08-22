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

/** Simula o loop de consumo do GeradorPecas (incluindo a deduplicação GLOBAL
 *  por idempotencyKey usada no componente — Map<chave, Promise<{id}>>: coalesce
 *  tentativas concorrentes, consumindo o JSON UMA vez; cada chamador aplica o
 *  id e conclui a transição para revisão; falha libera a chave). */
async function consumirStream(
  response: { ok: boolean; body?: { getReader: () => Reader } },
  onPersistir: (conteudo: string) => Promise<{ id: string } | void>,
  dedupGlobal?: Map<string, Promise<{ id: string }>>,
  idempotencyKey?: string,
): Promise<{ texto: string; persistiu: number; pecaSalvaId?: string; revisao?: boolean; erro?: string; reconciliacao?: boolean }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  let buffer = ''
  let recebeuTerminal = false
  let persistiu = 0
  let pecaPersistida = false
  let pecaSalvaId: string | undefined
  let revisao = false
  let erro: string | undefined
  let reconciliacao: boolean | undefined
  const persistir = async (conteudo: string) => {
    if (pecaPersistida) return
    pecaPersistida = true
    let promessa: Promise<{ id: string }>
    const emAndamento = dedupGlobal && idempotencyKey ? dedupGlobal.get(idempotencyKey) : undefined
    if (emAndamento) {
      // Concorrência: coalesce na MESMA Promise (JSON consumido uma vez).
      promessa = emAndamento
    } else {
      promessa = (async () => {
        persistiu += 1
        const r = await onPersistir(conteudo)
        return r ?? { id: '' }
      })()
      if (dedupGlobal && idempotencyKey) dedupGlobal.set(idempotencyKey, promessa)
    }
    try {
      // TODOS os chamadores aplicam o id e concluem a transição para revisão.
      const { id } = await promessa
      pecaSalvaId = id
      revisao = true
    } catch (err) {
      // Falha: libera a chave para que um retry possa persistir novamente.
      if (dedupGlobal && idempotencyKey) dedupGlobal.delete(idempotencyKey)
      throw err
    }
  }
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
            await persistir(acc)
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
          await persistir(acc)
        } else if (data.type === 'erro') {
          reconciliacao = Boolean(data.reconciliacao)
          throw new Error(data.reconciliacao ? 'reconciliacao' : (data.reason ?? 'erro'))
        }
      }
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }
  return { texto: acc, persistiu, pecaSalvaId, revisao, erro, reconciliacao }
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

  test('reexecução concorrente da MESMA geração → persistência ÚNICA (dedup global)', async () => {
    const dedup = new Map<string, Promise<{ id: string }>>()
    const chave = 'peca:contestacao:civel:p1:hash'
    let persistiu = 0
    // Duas execuções "concorrentes" com a MESMA idempotencyKey (streams novos).
    const r1 = await consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, async () => { persistiu += 1 }, dedup, chave)
    const r2 = await consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, async () => { persistiu += 1 }, dedup, chave)
    assert.equal(persistiu, 1, 'persistência ÚNICA mesmo com reexecução concorrente')
    assert.equal(r1.erro, undefined)
    assert.equal(r2.erro, undefined)
  })

  test('execuções SIMULTÂNEAS da mesma chave: UMA criação, MESMO id e transição de ambas para revisão', async () => {
    const dedup = new Map<string, Promise<{ id: string }>>()
    const chave = 'peca:simultanea:hash'
    let criacoes = 0
    const onPersistir = async () => {
      criacoes += 1
      return { id: 'peca-42' }
    }
    const p1 = consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, onPersistir, dedup, chave)
    const p2 = consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, onPersistir, dedup, chave)
    const [r1, r2] = await Promise.all([p1, p2])
    assert.equal(criacoes, 1, 'uma única chamada de criação (POST) para duas execuções')
    assert.equal(r1.pecaSalvaId, 'peca-42', '1ª execução aplica o id retornado')
    assert.equal(r2.pecaSalvaId, 'peca-42', '2ª execução (coalescida) aplica o MESMO id')
    assert.equal(r1.revisao, true, '1ª execução conclui na transição para revisão')
    assert.equal(r2.revisao, true, '2ª execução também conclui na transição para revisão')
    assert.equal(r1.erro, undefined)
    assert.equal(r2.erro, undefined)
    assert.equal(dedup.has(chave), true, 'chave mantida como concluída após sucesso')
  })

  test('falha em api.pecas.create NÃO bloqueia retry da mesma geração idempotente', async () => {
    const dedup = new Map<string, Promise<{ id: string }>>()
    const chave = 'peca:retry:hash'
    let tentativas = 0
    let salvou = 0
    const onPersistir = async () => {
      tentativas += 1
      if (tentativas === 1) throw new Error('falha no POST da peça')
      salvou += 1
    }
    // 1ª execução: concluido → persistência FALHA (POST não chegou ao banco).
    const r1 = await consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, onPersistir, dedup, chave)
    assert.ok(r1.erro, 'falha de persistência é explicitada')
    assert.equal(dedup.has(chave), false, 'falha libera a chave (sem bloqueio residual)')
    // 2ª execução: MESMA chave (mesmos dados) → tenta persistir de novo e salva.
    const r2 = await consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, onPersistir, dedup, chave)
    assert.equal(r2.erro, undefined, 'retry recupera a persistência')
    assert.equal(salvou, 1, 'peça salva na segunda tentativa')
    assert.equal(dedup.has(chave), true, 'chave mantida como concluída APÓS sucesso')
  })

  test('tentativas simultâneas da MESMA chave → UMA criação bem-sucedida', async () => {
    const dedup = new Map<string, Promise<{ id: string }>>()
    const chave = 'peca:concorrente:hash'
    let criacoes = 0
    const onPersistir = async () => { criacoes += 1 }
    // Lançadas juntas: a 2ª coalesce na Promise da 1ª (nenhum POST duplicado).
    const p1 = consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, onPersistir, dedup, chave)
    const p2 = consumirStream(streamFake(['data: {"type":"concluido","operationId":"op-1"}\n\n']) as any, onPersistir, dedup, chave)
    const [r1, r2] = await Promise.all([p1, p2])
    assert.equal(criacoes, 1, 'uma única criação para duas tentativas simultâneas')
    assert.equal(r1.erro, undefined)
    assert.equal(r2.erro, undefined)
    assert.equal(dedup.has(chave), true, 'concluída após sucesso')
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
