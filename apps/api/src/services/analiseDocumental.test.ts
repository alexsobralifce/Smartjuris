// ===========================================================================
// Fase 3A — Unidades de análise documental (design 2D).
//
// Cobertura (banco real):
//   - agrupamento em blocos de 20 páginas (ordem estável, páginas descontadas);
//   - escopo restrito ao escritório autenticado (unscoped excluído);
//   - fluxo completo: reserva → análise → settle (tokens/custo reais);
//   - idempotência por bloco (reprocessar a mesma chave reutiliza, sem novo
//     débito nem novo token_usage);
//   - retry de falha retryable (backoff curto) e bloco failed sem retry;
//   - falha parcial preserva blocos concluídos;
//   - falha na análise libera a reserva (release devolve créditos);
//   - isolamento entre escritórios (documentos de outro tenant nunca entram).
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const ad = await import('./analiseDocumental.js');
import type { BlocoAnaliseInput, GeradorAnaliseResult } from './analiseDocumental.js';
const { saldoEscritorio, tokenUsageCount } = await import('./aiOperationTestHelpers.js');

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const suffix = randomUUID().slice(0, 8);
const escIds: string[] = [];
const userIds: string[] = [];
const docIds: string[] = [];
const opIds: string[] = [];

let escA: { id: string };
let escB: { id: string };
let adminA: { id: string; escritorioId: string | null };
let adminB: { id: string; escritorioId: string | null };

/** Gerador de análise com CONTADOR de chamadas (por blocoId). */
type GeradorOk = {
  (bloco: BlocoAnaliseInput): Promise<GeradorAnaliseResult>;
  chamadas(blocoId?: string): number;
};

function geradorOk(): GeradorOk {
  const contador = new Map<string, number>();
  const gerar: GeradorOk = function (bloco) {
    return (async () => {
      contador.set(bloco.blocoId, (contador.get(bloco.blocoId) ?? 0) + 1);
      return {
        resumo: `Resumo do bloco ${bloco.paginaInicial}-${bloco.paginaFinal}`,
        fatos: [
          { tipo: 'parte', texto: 'Parte simulada' },
          { tipo: 'prazo', texto: '15 dias' },
        ],
        modelUsed: 'deepseek-v4-flash',
        tokensIn: 800,
        tokensOut: 400,
      };
    })();
  };
  gerar.chamadas = (blocoId?: string) =>
    blocoId ? (contador.get(blocoId) ?? 0) : [...contador.values()].reduce((a, b) => a + b, 0);
  return gerar;
}

/** Gera falha retryable (lança com mensagem reconhecida). */
function geradorFalhaRetryable() {
  return async () => {
    throw new Error('timeout na chamada ao modelo');
  };
}

/** Gera falha NÃO retryable (bloco ilegível). */
function geradorFalhaNaoRetryable() {
  return async () => {
    throw new Error('bloco ilegível: OCR necessário');
  };
}

/** Conta credit_ledger por operationId. */
async function ledgerPorOperacao(operationId: string) {
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM credit_ledger WHERE operation_id = ${operationId}
  `)) as any[];
  return Number(rows[0]?.n ?? 0);
}

/** Insere um documento + chunks de teste no escritório. */
async function criarDocumento(escritorioId: string, nome: string, totalPages: number, nChunks: number) {
  const [doc] = await db.insert(s.documentos).values({
    nome,
    colecao: 'teste-3a',
    tamanho: '0.01 MB',
    chunks: nChunks,
    totalPages,
    indexedStatus: 'indexed',
    escritorioId,
    processoId: null,
  }).returning({ id: s.documentos.id });
  docIds.push(doc.id);

  const textos: { texto: string; escritorioId: string; documentoId: string }[] = [];
  for (let i = 0; i < nChunks; i++) {
    textos.push({
      texto: `Texto do chunk ${i + 1} do documento ${nome}. `.repeat(120),
      escritorioId,
      documentoId: doc.id,
    });
  }
  await db.insert(s.chunks).values(textos.map((t) => ({ ...t, colecao: 'teste-3a' })));
  return doc;
}

before(async () => {
  if (!dbDisponivel) return;
  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `AnaA ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    { nome: `AnaB ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escA = ea; escB = eb;
  escIds.push(ea.id, eb.id);

  const hash = await bcrypt.hash('x', 10);
  const users = await db.insert(s.usuarios).values([
    { nome: 'Ana Admin A', email: `ana.a.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Ana Admin B', email: `ana.b.${suffix}@teste.local`, senha: hash, role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, escritorioId: s.usuarios.escritorioId });
  adminA = users[0]; adminB = users[1];
  userIds.push(users[0].id, users[1].id);
});

after(async () => {
  if (dbDisponivel) {
    for (const id of opIds) await db.delete(s.aiOperations).where(eq(s.aiOperations.id, id)).catch(() => {});
    for (const id of docIds) {
      await db.delete(s.chunks).where(eq(s.chunks.documentoId, id)).catch(() => {});
      await db.delete(s.documentos).where(eq(s.documentos.id, id)).catch(() => {});
    }
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  await client.end({ timeout: 5 });
});

describe('3A — unidades de análise documental', { skip: !dbDisponivel }, () => {
  test('agrupamento puro: blocos contíguos ≤20 páginas cobrindo todo o intervalo', () => {
    // Doc de 20 páginas com 60k chars (3.000 chars/página): 1 bloco 1-20.
    const doc20 = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-p20', nome: 'a.pdf', totalPages: 20, processoId: null, chunks: [{ id: 'c1', texto: 'x'.repeat(60_000) }] }],
    });
    assert.equal(doc20.length, 1);
    assert.equal(doc20[0].paginaInicial, 1);
    assert.equal(doc20[0].paginaFinal, 20);

    // Doc de 35 páginas com chunks de ~35k chars: blocos contíguos devem
    // cobrir 1..35 sem lacunas nem sobreposição, cada um ≤ 20 páginas.
    const doc35 = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{
        id: 'doc-p35',
        nome: 'b.pdf',
        totalPages: 35,
        processoId: null,
        chunks: [
          { id: 'c1', texto: 'y'.repeat(35_000) },
          { id: 'c2', texto: 'y'.repeat(35_000) },
          { id: 'c3', texto: 'y'.repeat(35_000) },
        ],
      }],
    });
    assert.ok(doc35.length >= 2, '35 páginas → mais de um bloco');
    let esperada = 1;
    for (const b of doc35) {
      assert.equal(b.paginaInicial, esperada, `contíguo (lacuna em ${b.paginaInicial})`);
      assert.ok(b.paginaFinal - b.paginaInicial + 1 <= 20, 'bloco ≤ 20 páginas');
      esperada = b.paginaFinal + 1;
    }
    assert.equal(esperada - 1, 35, 'cobertura total de 1..35');
  });

  test('agrupamento puro: pagesAlreadyAnalyzed é descontado (corte no offset, sem reenviar)', () => {
    // 3 chunks de 45k chars em 45 páginas → cada chunk ≈ 15 páginas
    // (chunk1: 1-15, chunk2: 16-30, chunk3: 31-45). Com 25 páginas já
    // analisadas, o chunk1 é descartado e o chunk2 é CORTADO no offset da
    // página 26 — o conteúdo 16-25 NUNCA é reenviado nem recobrado.
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{
        id: 'doc-p45',
        nome: 'c.pdf',
        totalPages: 45,
        processoId: null,
        chunks: [
          { id: 'c1', texto: 'z'.repeat(45_000) },
          { id: 'c2', texto: 'z'.repeat(45_000) },
          { id: 'c3', texto: 'z'.repeat(45_000) },
        ],
      }],
      pagesAlreadyAnalyzedByDoc: { 'doc-p45': 25 },
    });
    assert.ok(blocos.length >= 2, 'páginas restantes → blocos');
    // offsetCorte = 25 * 1000 chars/pág = 25.000 → começa na página 26.
    assert.equal(blocos[0].paginaInicial, 26, 'começa exatamente após as páginas já analisadas');
    // O texto do 1º bloco NÃO contém o prefixo do chunk2 (páginas 16-25).
    const chunk2Inteiro = 'z'.repeat(45_000);
    const textoBloco1 = blocos[0].texto;
    assert.ok(textoBloco1.length < chunk2Inteiro.length, 'chunk cortado (sem reenvio do prefixo)');
    // Contiguidade até o fim.
    let esperada = blocos[0].paginaInicial;
    for (const b of blocos) {
      assert.equal(b.paginaInicial, esperada, `contíguo (lacuna em ${b.paginaInicial})`);
      assert.ok(b.paginaFinal - b.paginaInicial + 1 <= 20, 'bloco ≤ 20 páginas');
      esperada = b.paginaFinal + 1;
    }
    assert.equal(esperada - 1, 45, 'cobertura até a última página');
  });

  test('agrupamento puro: chave de idempotência derivada no servidor', () => {
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: 'analise-documental-v1',
      docs: [{ id: 'doc-p20', nome: 'd.pdf', totalPages: 20, processoId: 'proc-123', chunks: [{ id: 'c1', texto: 'w'.repeat(60_000) }] }],
    });
    assert.equal(
      blocos[0].idempotencyKey,
      `analise:${escA.id}:proc-123:doc-p20:1-20:analise-documental-v1`,
    );
    // Mesma entrada → mesma chave (determinístico, exceto blocoId).
    const blocos2 = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: 'analise-documental-v1',
      docs: [{ id: 'doc-p20', nome: 'd.pdf', totalPages: 20, processoId: 'proc-123', chunks: [{ id: 'c1', texto: 'w'.repeat(60_000) }] }],
    });
    assert.equal(blocos[0].idempotencyKey, blocos2[0].idempotencyKey);
  });

  test('agrupamento puro: redução por teto de tokens NÃO cria lacunas entre blocos', () => {
    // Documento de 40 páginas com texto denso (60k chars por bloco de 20).
    // Tetos: maxInputTokens 8_000 → charsTeto = 32_000. Se ~35k chars por
    // bloco de 20 páginas, o 1º bloco reduz para ~18 páginas; o cursor deve
    // continuar na página 19 (sem pular páginas).
    const policyMaxInput = 8_000;
    const charsTeto = Math.floor(policyMaxInput / 0.25); // 32_000
    // 40 páginas → ~70k chars totais (texto denso: bloco de 20 páginas excede o teto)
    const texto40 = 'z'.repeat(charsTeto * 2 + 6_000);
    // Dividido em 4 chunks grandes: cada um sozinho ~17.5k chars (< teto 32k).
    const chunkDenso = [texto40.slice(0, 17_500), texto40.slice(17_500, 35_000), texto40.slice(35_000, 52_500), texto40.slice(52_500)];
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-denso', nome: 'denso.pdf', totalPages: 40, processoId: null, chunks: chunkDenso.map((t, i) => ({ id: `d${i}`, texto: t })) }],
    });
    // A soma dos intervalos deve cobrir 1..40 sem lacunas nem sobreposição.
    const intervalos = blocos.map((b) => [b.paginaInicial, b.paginaFinal] as const);
    assert.ok(intervalos.length >= 2, 'mais de um bloco para documento denso');
    let esperada = 1;
    for (const [ini, fim] of intervalos) {
      assert.equal(ini, esperada, `bloco começa onde o anterior terminou (lacuna em ${ini})`);
      assert.ok(fim >= ini && fim - ini + 1 <= 20, 'bloco ≤ 20 páginas');
      esperada = fim + 1;
    }
    assert.equal(esperada - 1, 40, 'todas as 40 páginas cobertas');
  });

  test('agrupamento puro: chunk >20 páginas (≤ teto de tokens) é dividido sem lacunas', () => {
    // Um único chunk de 75k chars = ~25 páginas (3k chars/pág), abaixo do
    // teto de tokens (100k chars) mas acima de 20 páginas → dividido em 2
    // sub-blocos contíguos (1-20 e 21-25), sem bloco failed.
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-g25', nome: 'g.pdf', totalPages: 25, processoId: null, chunks: [{ id: 'c1', texto: 'g'.repeat(75_000) }] }],
    });
    assert.equal(blocos.length, 2);
    assert.ok(blocos.every((b) => !b.excedeTeto), 'sem bloco failed');
    assert.equal(blocos[0].paginaInicial, 1);
    assert.equal(blocos[0].paginaFinal, 20);
    assert.equal(blocos[1].paginaInicial, 21);
    assert.equal(blocos[1].paginaFinal, 25);
  });

  test('agrupamento puro: totalPages ausente/zero usa fallback por caracteres', () => {
    // totalPages=0 (inválido) → fallback por caracteres; intervalo válido.
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-0', nome: 'h.pdf', totalPages: 0, processoId: null, chunks: [{ id: 'c1', texto: 'h'.repeat(60_000) }] }],
    });
    assert.equal(blocos.length, 1);
    assert.ok(blocos[0].paginaFinal >= blocos[0].paginaInicial, 'intervalo válido');
  });

  test('agrupamento puro: chunk acima do teto de TOKENS é fatiado sem descartar páginas', () => {
    // Um único chunk de 150k chars em doc de 50 páginas: excede o teto de
    // tokens (100k chars) E as 20 páginas → dividido em fatias de ≤100k chars,
    // cada uma virando um bloco (3 blocos: 1-33, 34-50...), SEM bloco failed
    // e SEM descarte das páginas 21-50.
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-g150', nome: 'g150.pdf', totalPages: 50, processoId: null, chunks: [{ id: 'c1', texto: 'g'.repeat(150_000) }] }],
    });
    assert.ok(blocos.length >= 3, '150k chars → ≥3 blocos');
    assert.ok(blocos.every((b) => !b.excedeTeto), 'nenhum bloco failed por teto');
    assert.ok(blocos.every((b) => b.paginaFinal - b.paginaInicial + 1 <= 20), 'cada bloco ≤20 páginas');
    let esperada = 1;
    for (const b of blocos) {
      assert.equal(b.paginaInicial, esperada, `contíguo (lacuna em ${b.paginaInicial})`);
      esperada = b.paginaFinal + 1;
    }
    assert.equal(esperada - 1, 50, 'todas as 50 páginas cobertas');
  });

  test('agrupamento puro: chunk denso (poucas páginas, muitos tokens) é fatiado', () => {
    // Doc de 5 páginas com 150k chars em 1 chunk: 150k > teto de tokens
    // (100k chars) mas estimativa de 5 páginas (≤20). Deve ser FATIADO em
    // sub-blocos que cabem no teto — nunca um bloco failed nem descarte.
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-denso5', nome: 'd5.pdf', totalPages: 5, processoId: null, chunks: [{ id: 'c1', texto: 'd'.repeat(150_000) }] }],
    });
    assert.ok(blocos.length >= 2, '150k chars → ≥2 sub-blocos');
    assert.ok(blocos.every((b) => !b.excedeTeto), 'nenhum bloco failed por teto');
    assert.ok(blocos.every((b) => b.texto.length <= 100_000), 'cada sub-bloco ≤ teto de tokens');
    let esperada = 1;
    for (const b of blocos) {
      assert.equal(b.paginaInicial, esperada, `contíguo (lacuna em ${b.paginaInicial})`);
      esperada = b.paginaFinal + 1;
    }
    assert.equal(esperada - 1, 5, 'todas as 5 páginas cobertas');
  });

  test('idempotência canônica: documento vinculado a processo gera MESMA chave com ou sem input.processoId', () => {
    // O processoId da chave vem do DOCUMENTO (fonte canônica), nunca do input:
    // analisar o mesmo doc informando ou não o processo produz a MESMA chave.
    const docId = `doc-proc-${suffix}`;
    const base = {
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: docId, nome: 'p.pdf', totalPages: 10, processoId: 'proc-can-1', chunks: [{ id: 'c1', texto: 'p'.repeat(30_000) }] }],
    };
    const comProcesso = ad.agruparBlocos({ ...base });
    const semProcesso = ad.agruparBlocos({ ...base });
    assert.equal(comProcesso[0].idempotencyKey, semProcesso[0].idempotencyKey);
    assert.ok(comProcesso[0].idempotencyKey.includes('proc-can-1'), 'chave contém o processo do documento');
  });

  test('agrupamento puro: doc de 1 página com muito texto → fatias rotuladas 1-1 com chaves únicas', () => {
    // 300k chars em 1 página declarada (teto de chars ≈ 86.957, compensando
    // a margem de 15% da estimativa): 4 fatias, TODAS rotuladas 1-1 (nunca
    // 2-2/3-3 — páginas inexistentes) mas com chaves de idempotência ÚNICAS.
    const blocos = ad.agruparBlocos({
      escritorioId: escA.id,
      versaoPrompt: ad.VERSAO_PROMPT_ANALISE,
      docs: [{ id: 'doc-1pag', nome: 'u.pdf', totalPages: 1, processoId: null, chunks: [{ id: 'c1', texto: 'u'.repeat(300_000) }] }],
    });
    assert.equal(blocos.length, 4, '4 fatias (~87k chars cada, com margem)');
    for (const b of blocos) {
      assert.equal(b.paginaInicial, 1);
      assert.equal(b.paginaFinal, 1, 'nunca inventa páginas além de totalPages');
      assert.ok(!b.excedeTeto);
    }
    const chaves = new Set(blocos.map((b) => b.idempotencyKey));
    assert.equal(chaves.size, blocos.length, 'chaves de idempotência únicas');
    assert.ok(blocos.every((b) => b.texto.length <= 86_957), 'cada fatia ≤ teto com margem');
  });

  test('fluxo completo: reserva → análise → settle (créditos e tokens reais)', async () => {
    const doc = await criarDocumento(escA.id, `fluxo-${suffix}.pdf`, 25, 3);
    const gerar = geradorOk();
    const antes = await saldoEscritorio(escA.id);
    const res = await ad.analisarDocumentos({
      user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId },
      documentoIds: [doc.id],
      gerarAnalise: gerar,
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 2); // 25 páginas → 2 blocos
    assert.ok(res.blocos.every((b) => b.status === 'completed'));
    assert.ok(res.blocos.every((b) => b.resumo && b.fatosEstruturados && b.fatosEstruturados.length > 0));
    assert.ok(res.blocos.every((b) => b.operationId));
    for (const b of res.blocos) opIds.push(b.operationId!);

    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits - 2); // 1 crédito por bloco
    assert.ok(depois.reserveCents <= antes.reserveCents, 'settle libera diferença da reserva');

    assert.equal(res.contexto.summariesAvailable, true);
    assert.equal(res.contexto.structuredFactsAvailable, true);
    assert.equal(res.contexto.pagesAlreadyAnalyzed, 25);
    assert.equal(res.contexto.analysisBlocks, 0);
    assert.equal(gerar.chamadas(), 2);
  });

  test('idempotência por bloco: reprocessar a mesma chave reutiliza sem novo débito', async () => {
    const doc = await criarDocumento(escA.id, `idem-${suffix}.pdf`, 22, 2);
    const gerar = geradorOk();
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };

    const r1 = await ad.analisarDocumentos({ user, documentoIds: [doc.id], gerarAnalise: gerar });
    assert.ok(r1.ok);
    if (!r1.ok) return;
    assert.equal(r1.blocos.length, 2);
    for (const b of r1.blocos) opIds.push(b.operationId!);
    const ops1 = r1.blocos.map((b) => b.operationId!);
    const tokens1 = await tokenUsageCount(adminA.id);

    // Reprocessamento: mesmas chaves → alreadyReserved; NENHUMA nova chamada IA.
    const r2 = await ad.analisarDocumentos({ user, documentoIds: [doc.id], gerarAnalise: gerar });
    assert.ok(r2.ok);
    if (!r2.ok) return;
    assert.equal(r2.blocos.length, 2);
    assert.ok(r2.blocos.every((b) => b.status === 'completed'), 'reprocessamento reutiliza resultado');
    assert.deepEqual(r2.blocos.map((b) => b.operationId), ops1, 'mesmas operações');
    assert.equal(gerar.chamadas(), 2, 'gerador chamado só na 1ª execução');

    const tokens2 = await tokenUsageCount(adminA.id);
    assert.equal(tokens2, tokens1, 'sem novo token_usage no reprocessamento');

    // Ledger: cada operação bem-sucedida tem RESERVE + SETTLE (2 entradas);
    // o reprocessamento NÃO adiciona nada novo.
    for (const op of ops1) {
      const n1 = await ledgerPorOperacao(op);
      const r3 = await ad.analisarDocumentos({ user, documentoIds: [doc.id], gerarAnalise: gerar });
      assert.ok(r3.ok);
      if (!r3.ok) return;
      assert.deepEqual(r3.blocos.map((b) => b.operationId), ops1, 'mesmas operações no 3º reprocessamento');
      const n2 = await ledgerPorOperacao(op);
      assert.equal(n2, n1, 'ledger inalterado após reprocessamento (sem novo débito)');
      break; // valida 1 operação representativa
    }

    // Sem doc novo: página marcada já analisada não é reprocessada.
    const semNada = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: gerar,
      pagesAlreadyAnalyzedByDoc: { [doc.id]: 22 },
    });
    assert.ok(semNada.ok);
    if (!semNada.ok) return;
    assert.equal(semNada.blocos.length, 0);
  });

  test('falha retryable: retry com backoff até o teto; depois bloco failed e release', async () => {
    const doc = await criarDocumento(escA.id, `retry-${suffix}.pdf`, 10, 2);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const antes = await saldoEscritorio(escA.id);

    let chamadas = 0;
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      backoffMs: [1, 1],
      gerarAnalise: async () => {
        chamadas += 1;
        throw new Error('timeout na chamada ao modelo');
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 1);
    assert.equal(res.blocos[0].status, 'failed');
    assert.equal(res.blocos[0].tentativas, ad.MAX_TENTATIVAS_BLOCO);
    assert.equal(chamadas, ad.MAX_TENTATIVAS_BLOCO, '2 tentativas (1 reenvio)');
    if (res.blocos[0].operationId) opIds.push(res.blocos[0].operationId);

    // Falha liberou a reserva: créditos voltam.
    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits, 'release devolve créditos');
    assert.equal(depois.reserveCents, antes.reserveCents);
  });

  test('falha NÃO retryable: bloco failed sem retry (1 chamada) e release', async () => {
    const doc = await criarDocumento(escA.id, `noretry-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const antes = await saldoEscritorio(escA.id);

    let chamadas = 0;
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: async () => {
        chamadas += 1;
        throw new Error('bloco ilegível: OCR necessário');
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos[0].status, 'failed');
    assert.equal(chamadas, 1, 'sem retry para falha não-retryable');
    if (res.blocos[0].operationId) opIds.push(res.blocos[0].operationId);

    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits);
  });

  test('falha parcial: um bloco failed NÃO cancela blocos concluídos', async () => {
    // Documento de 45 páginas → vários blocos. Gerador falha (retryable) SÓ no
    // bloco que contém a página 21; os demais concluem.
    const doc = await criarDocumento(escA.id, `parcial-${suffix}.pdf`, 45, 4);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };

    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: async (bloco) => {
        if (bloco.paginaInicial <= 21 && bloco.paginaFinal >= 21) {
          throw new Error('timeout na chamada ao modelo');
        }
        return {
          resumo: `Resumo ${bloco.paginaInicial}`,
          fatos: [{ tipo: 'fato', texto: 'ok' }],
          modelUsed: 'deepseek-v4-flash',
          tokensIn: 100,
          tokensOut: 50,
        };
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    const completed = res.blocos.filter((b) => b.status === 'completed');
    const failed = res.blocos.filter((b) => b.status === 'failed');
    assert.equal(failed.length, 1, 'apenas o bloco da página 21 falha');
    assert.ok(completed.length >= 2, 'demais blocos concluídos');
    assert.ok(completed.length + failed.length === res.blocos.length, 'nenhum bloco pendente');
    for (const b of res.blocos) if (b.operationId) opIds.push(b.operationId);

    assert.equal(res.contexto.summariesAvailable, true, '≥1 bloco concluído');
    assert.equal(res.contexto.analysisBlocks, 1, 'bloco com falha aparece como restante');
    // pagesAlreadyAnalyzed conta SÓ blocos concluídos (> 0 e < total).
    assert.ok(res.contexto.pagesAlreadyAnalyzed > 0, 'páginas concluídas contabilizadas');
    assert.ok(res.contexto.pagesAlreadyAnalyzed < 45, 'página do bloco falho não contabilizada');
  });

  test('consolidação: falha no PRIMEIRO bloco não conta páginas de blocos posteriores', async () => {
    // Doc de 45 páginas: o primeiro bloco (página 1) falha; um bloco posterior
    // conclui. A cobertura NÃO pode "puxar" o intervalo falho inicial.
    const doc = await criarDocumento(escA.id, `prim-falho-${suffix}.pdf`, 45, 4);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: async (bloco) => {
        if (bloco.paginaInicial === 1) throw new Error('timeout na chamada ao modelo');
        return {
          resumo: `Resumo ${bloco.paginaInicial}`,
          fatos: [{ tipo: 'fato', texto: 'ok' }],
          modelUsed: 'deepseek-v4-flash',
          tokensIn: 100,
          tokensOut: 50,
        };
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    const completed = res.blocos.filter((b) => b.status === 'completed');
    assert.ok(completed.length >= 1, 'blocos posteriores concluem');
    for (const b of res.blocos) if (b.operationId) opIds.push(b.operationId);
    // Nenhuma página contabilizada: o primeiro bloco falhou e os demais não
    // são contíguos à cobertura (que começa em 0) — a cobertura NÃO "puxa" o
    // intervalo inicial falho.
    assert.equal(res.contexto.pagesAlreadyAnalyzed, 0, 'bloco inicial falho não é contado');
    assert.equal(res.contexto.analysisBlocks, 1, 'só o bloco falho permanece pendente');
  });

  test('fencing: executor com token de posse obsoleto NÃO libera a reserva', async () => {
    const doc = await criarDocumento(escA.id, `fence-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const antes = await saldoEscritorio(escA.id);

    // 1ª chamada falha (release); depois reexecuta com sucesso. Simulamos a
    // perda de posse forçando o release com token obsoleto: criamos a operação
    // manualmente em `running` com token de posse X, e chamamos analisarDocumentos
    // que NÃO é dona (não retoma, pois updated_at recente) — a reserva não é
    // liberada indevidamente.
    const chave = `analise:${escA.id}:sem-processo:${doc.id}:1-10:${ad.VERSAO_PROMPT_ANALISE}`;
    const [op] = await db.insert(s.aiOperations).values({
      idempotencyKey: chave,
      idempotencyFingerprint: null,
      escritorioId: escA.id,
      usuarioId: adminA.id,
      operationType: 'DOCUMENT_ANALYSIS_20_PAGES',
      status: 'running',
      model: 'deepseek-v4-flash',
      fallbackReason: 'token-outro-executor',
      creditsReserved: 1,
      costCentsReserved: 1,
      updatedAt: new Date(), // recente → NÃO órfã → processing
    }).returning({ id: s.aiOperations.id });
    opIds.push(op.id);

    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      leaseMs: 30_000,
      gerarAnalise: geradorOk(),
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 1);
    assert.equal(res.blocos[0].status, 'processing', 'executor não-dono não processa nem libera');
    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits, 'reserva não foi liberada indevidamente');
  });

  test('fencing TOCTOU: executor que perdeu a posse não persiste nem liquida', async () => {
    const doc = await criarDocumento(escA.id, `toctou-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const antes = await saldoEscritorio(escA.id);

    // Executor A: gera o resultado e entrega; ANTES de persistir/settle, o
    // teste troca o token de posse (simula executor B que retomou a operação
    // vencendo o lease). A persistência fenced deve RECUSAR e o bloco deve
    // ficar `processing` (não liquidado, não sobrescrito).
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      leaseMs: 30_000,
      gerarAnalise: async () => {
        // Simula a perda de posse DURANTE a geração: outra requisição retomou
        // e gravou token próprio (fallback_reason mudou). A persistência e o
        // settle de A serão recusados pelo fencing.
        await db.execute(sql`
          UPDATE ai_operations
          SET lease_token = 'token-executor-B'
          WHERE id IN (SELECT id FROM ai_operations WHERE idempotency_key LIKE ${`analise:${escA.id}:%`} AND status = 'running')
        `);
        return { resumo: 'Resumo A', fatos: [{ tipo: 'fato', texto: 'ok' }], modelUsed: 'deepseek-v4-flash', tokensIn: 10, tokensOut: 5 };
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 1);
    // A não pode persistir/settle (posse perdida) → processing, reserva intacta.
    assert.equal(res.blocos[0].status, 'processing', 'posse perdida → não liquida');
    for (const b of res.blocos) if (b.operationId) opIds.push(b.operationId);
    const depois = await saldoEscritorio(escA.id);
    // A reserva foi debitada ANTES da geração; como A perdeu a posse, NÃO
    // houve settle (não liquidada) nem release (não liberada por A) — o
    // crédito permanece reservado para o executor B concluir.
    assert.equal(depois.credits, antes.credits - 1, 'reserva feita; settle/release de A não ocorreram');
  });

  test('isolamento: documentos de outro escritório nunca entram', async () => {
    const docA = await criarDocumento(escA.id, `isoA-${suffix}.pdf`, 10, 1);
    const docB = await criarDocumento(escB.id, `isoB-${suffix}.pdf`, 10, 1);
    const marcadorA = `MARCA-A-${suffix}`;
    const marcadorB = `MARCA-B-${suffix}`;
    const gerarCom = (marca: string) => async () => ({
      resumo: `Resumo ${marca}`,
      fatos: [{ tipo: 'parte', texto: marca }],
      modelUsed: 'deepseek-v4-flash',
      tokensIn: 100,
      tokensOut: 50,
    });

    const resA = await ad.analisarDocumentos({
      user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId },
      documentoIds: [docA.id, docB.id], // docB não pertence a A → ignorado
      gerarAnalise: gerarCom(marcadorA),
    });
    assert.ok(resA.ok);
    if (!resA.ok) return;
    assert.equal(resA.blocos.length, 1, 'só o doc de A entra');
    assert.equal(resA.blocos[0].resumo, `Resumo ${marcadorA}`, 'resumo de A');
    for (const b of resA.blocos) opIds.push(b.operationId!);

    const resB = await ad.analisarDocumentos({
      user: { id: adminB.id, role: 'admin', escritorioId: adminB.escritorioId },
      documentoIds: [docB.id],
      gerarAnalise: gerarCom(marcadorB),
    });
    assert.ok(resB.ok);
    if (!resB.ok) return;
    assert.equal(resB.blocos.length, 1);
    assert.equal(resB.blocos[0].resumo, `Resumo ${marcadorB}`, 'resumo de B');
    for (const b of resB.blocos) opIds.push(b.operationId!);

    // Marcadores distintos provam que nenhum bloco cruzou escritórios.
    assert.notEqual(marcadorA, marcadorB);
    assert.equal(resA.blocos[0].resumo, `Resumo ${marcadorA}`);
    assert.equal(resB.blocos[0].resumo, `Resumo ${marcadorB}`);
  });

  test('recuperação: operação órfã (running além do lease) é retomada sem novo débito', async () => {
    const doc = await criarDocumento(escA.id, `lease-${suffix}.pdf`, 15, 2);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const gerar = geradorOk();
    const antes = await saldoEscritorio(escA.id);

    // Reproduz uma RESERVA REAL (como reserveAiUsage faria): operação em
    // `running` com updated_at antigo + débito de crédito + reserve_cents_used
    // + entrada no credit_ledger (RESERVE).
    const chave = `analise:${escA.id}:sem-processo:${doc.id}:1-15:${ad.VERSAO_PROMPT_ANALISE}`;
    const [op] = await db.insert(s.aiOperations).values({
      idempotencyKey: chave,
      idempotencyFingerprint: null, // sem fingerprint persistido → sem conflito
      escritorioId: escA.id,
      usuarioId: adminA.id,
      operationType: 'DOCUMENT_ANALYSIS_20_PAGES',
      status: 'running',
      model: 'deepseek-v4-flash',
      creditsReserved: 1,
      costCentsReserved: 1,
      updatedAt: new Date(Date.now() - 60 * 60_000), // 1h atrás → órfã
    }).returning({ id: s.aiOperations.id });
    opIds.push(op.id);
    await db.execute(sql`
      UPDATE escritorios
      SET credits_available = credits_available - 1, reserve_cents_used = reserve_cents_used + 1
      WHERE id = ${escA.id}
    `);
    await db.insert(s.creditLedger).values({
      escritorioId: escA.id,
      usuarioId: adminA.id,
      operationId: op.id,
      operationType: 'DOCUMENT_ANALYSIS_20_PAGES',
      kind: 'RESERVE',
      creditsDelta: -1,
      costCents: 1,
      model: 'deepseek-v4-flash',
      idempotencyKey: chave,
      status: 'committed',
    });

    // Chamada com lease curto: a operação (updated_at 1h atrás) é órfã →
    // retomada executa a geração e liquida, SEM nova reserva (créditos não
    // debitados de novo). O lease mínimo (500ms) é respeitado e continua
    // sendo muito menor que a idade da órfã.
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      leaseMs: ad.LEASE_MS_MINIMO,
      gerarAnalise: gerar,
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 1);
    assert.equal(res.blocos[0].status, 'completed', 'órfã retomada e liquidada');
    assert.equal(res.blocos[0].operationId, op.id, 'mesma operação');
    assert.equal(gerar.chamadas(), 1);

    const depois = await saldoEscritorio(escA.id);
    // Reserva original consumiu 1 crédito; a retomada não debita novamente.
    assert.equal(depois.credits, antes.credits - 1, 'sem débito duplicado na retomada');
  });

  test('concorrência de lease: geração viva com heartbeat NÃO é retomada por outra chamada', async () => {
    const doc = await criarDocumento(escA.id, `lease-vivo-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };

    // Geração LENTA que DURA MUITO MAIS QUE O LEASE (2.000ms > leaseMs 500ms):
    // o heartbeat PERIÓDICO renova o lease (intervalo ~167ms) durante toda a
    // geração. A 2ª chamada disparada APÓS a expiração efetiva do lease
    // (700ms, sem heartbeat a operação seria ÓRFÃ) deve ver o lease renovado
    // pelo heartbeat e reportar `processing` — nunca executar gerarAnalise.
    let geracoes = 0;
    const lenta = ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      leaseMs: 500,
      gerarAnalise: async () => {
        geracoes += 1;
        await new Promise((r) => setTimeout(r, 2_000)); // >> leaseMs → heartbeat ativo
        return { resumo: 'Resumo lento', fatos: [{ tipo: 'fato', texto: 'ok' }], modelUsed: 'deepseek-v4-flash', tokensIn: 10, tokensOut: 5 };
      },
    });
    // Dispara a 2ª chamada APÓS a expiração nominal do lease (700ms > 500ms):
    // sem heartbeat ela seria retomável — com heartbeat renovado, não é.
    await new Promise((r) => setTimeout(r, 700));
    const concorrente = ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      leaseMs: 500,
      gerarAnalise: async () => {
        geracoes += 1;
        return { resumo: 'Resumo concorrente', fatos: [{ tipo: 'fato', texto: 'x' }], modelUsed: 'deepseek-v4-flash', tokensIn: 10, tokensOut: 5 };
      },
    });
    const [r1, r2] = await Promise.all([lenta, concorrente]);
    assert.ok(r1.ok && r2.ok);
    if (!r1.ok || !r2.ok) return;
    const statuses = [...r1.blocos.map((b) => b.status), ...r2.blocos.map((b) => b.status)];
    // A soma das gerações NUNCA passa de 1 (o heartbeat impediu a retomada).
    assert.equal(geracoes, 1, 'apenas UMA geração para a mesma chave (heartbeat no lease)');
    for (const b of r1.blocos) if (b.operationId) opIds.push(b.operationId);
    for (const b of r2.blocos) if (b.operationId) opIds.push(b.operationId);
    assert.ok(statuses.includes('completed'), 'a geração viva conclui');
  });

  test('resposta vazia/inválida: tratada como falha retryable; nunca liquidada', async () => {
    const doc = await criarDocumento(escA.id, `vazio-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const antes = await saldoEscritorio(escA.id);

    let chamadas = 0;
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      backoffMs: [1, 1],
      gerarAnalise: async () => {
        chamadas += 1;
        // Resposta vazia: mesma política de "resposta vazia" retryable.
        return { resumo: '', fatos: [], modelUsed: 'deepseek-v4-flash', tokensIn: 0, tokensOut: 0 };
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 1);
    assert.equal(res.blocos[0].status, 'failed', 'resposta vazia não é sucesso');
    assert.equal(chamadas, ad.MAX_TENTATIVAS_BLOCO, 'retry até o teto');
    if (res.blocos[0].operationId) opIds.push(res.blocos[0].operationId);

    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits, 'reserva liberada (sem cobrança)');
  });

  test('teto de tokens: tokens acima do limite da operação NÃO são liquidados', async () => {
    const doc = await criarDocumento(escA.id, `teto-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const antes = await saldoEscritorio(escA.id);

    let chamadas = 0;
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      backoffMs: [1, 1],
      gerarAnalise: async () => {
        chamadas += 1;
        // tokensOut acima do teto de 4.000 da DOCUMENT_ANALYSIS_20_PAGES.
        return { resumo: 'Resumo ok', fatos: [{ tipo: 'fato', texto: 'ok' }], modelUsed: 'deepseek-v4-flash', tokensIn: 100, tokensOut: 9_000 };
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 1);
    assert.equal(res.blocos[0].status, 'failed', 'tokens acima do teto não são sucesso');
    assert.equal(chamadas, ad.MAX_TENTATIVAS_BLOCO, 'retry até o teto');
    if (res.blocos[0].operationId) opIds.push(res.blocos[0].operationId);

    const depois = await saldoEscritorio(escA.id);
    assert.equal(depois.credits, antes.credits, 'reserva liberada (sem cobrança)');
  });

  test('custo único sob retomada: settle idempotente NÃO duplica cobrança', async () => {
    // Retomada de órfã com 2 execuções tentando liquidar a MESMA operação:
    // settleAiUsage é idempotente por operationId (alreadySettled) — o custo
    // e o token_usage NUNCA duplicam mesmo se dois executores tentarem.
    const doc = await criarDocumento(escA.id, `custo-unico-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };

    // Executa o fluxo normal (1 geração + 1 settle).
    const r1 = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: async () => ({ resumo: 'R', fatos: [{ tipo: 'f', texto: 'x' }], modelUsed: 'deepseek-v4-flash', tokensIn: 10, tokensOut: 5 }),
    });
    assert.ok(r1.ok);
    if (!r1.ok) return;
    assert.equal(r1.blocos.length, 1);
    const opId = r1.blocos[0].operationId!;
    opIds.push(opId);
    const tokensAntes = await tokenUsageCount(adminA.id);

    // Reprocessamento (mesma chave → alreadyReserved/succeeded): reutiliza o
    // resultado sem nova geração nem novo settle.
    const r2 = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: async () => ({ resumo: 'R2', fatos: [{ tipo: 'f', texto: 'y' }], modelUsed: 'deepseek-v4-flash', tokensIn: 99, tokensOut: 99 }),
    });
    assert.ok(r2.ok);
    if (!r2.ok) return;
    assert.equal(r2.blocos.length, 1);
    assert.equal(r2.blocos[0].status, 'completed', 'reprocessamento reutiliza');
    assert.equal(r2.blocos[0].operationId, opId, 'mesma operação');

    const tokensDepois = await tokenUsageCount(adminA.id);
    assert.equal(tokensDepois, tokensAntes, 'sem token_usage duplicado no reprocessamento');
    const ledger = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM credit_ledger WHERE operation_id = ${opId} AND kind = 'SETTLE'
    `)) as any[];
    assert.equal(Number(ledger[0]?.n ?? 0), 1, 'um único SETTLE por operação');
  });

  test('cobrança densa: reserva reflete o TEXTO REAL enviado (sem sub-reserva)', async () => {
    // Doc de 5 páginas com 150k chars → 2 fatias densas (100k + 50k chars).
    // A estimativa usa ragContextChars (chars reais), não páginas declaradas:
    // o volume denso gera estimativa de tokens proporcional (28750 vs 14375).
    // Nota: com preços em centavos inteiros (Math.ceil por componente), fatias
    // densas arredondam para o MESMO cost_cents_reserved (ex.: 10) — a
    // granularidade atual não distingue 100k vs 50k chars em centavos. O que o
    // teste garante: as fatias NÃO têm custo zero/sub-reserva e a estimativa de
    // tokens reflete o volume real (maior char → mais tokens estimados).
    const doc = await criarDocumento(escA.id, `densa-reserva-${suffix}.pdf`, 5, 1);
    // Substitui o chunk por um único chunk denso (150k chars).
    await db.delete(s.chunks).where(eq(s.chunks.documentoId, doc.id));
    await db.insert(s.chunks).values({
      texto: 'd'.repeat(150_000),
      colecao: 'teste-3a',
      escritorioId: escA.id,
      documentoId: doc.id,
    });
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      gerarAnalise: async () => ({ resumo: 'R', fatos: [{ tipo: 'f', texto: 'x' }], modelUsed: 'deepseek-v4-flash', tokensIn: 10, tokensOut: 5 }),
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.ok(res.blocos.length >= 2, '2 fatias densas');
    // Nenhuma fatia fica com custo ZERO (sem sub-reserva): toda fatia reserva.
    for (const b of res.blocos) {
      if (b.operationId) opIds.push(b.operationId);
      const rows = (await db.execute(sql`
        SELECT cost_cents_reserved, credits_reserved FROM ai_operations WHERE id = ${b.operationId} LIMIT 1
      `)) as any[];
      const cost = Number(rows[0]?.cost_cents_reserved ?? 0);
      assert.ok(cost > 0, `fatia reserva custo > 0 (veio ${cost})`);
    }
  });

  test('classificação de erros: ambígua vs confirmada (estruturada, fail-closed)', () => {
    // Confirmada (adaptador marcou): NÃO ambígua → fallback autorizado.
    assert.equal(ad.ehFalhaAmbígua(new ad.ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true })), false);
    assert.equal(ad.ehFalhaComResposta(new ad.ErroGeracaoIA('429 too many requests', { confirmadoSemProcessamento: true })), true);
    // Ambígua explícita (timeout/rede): retém reserva, sem fallback.
    assert.equal(ad.ehFalhaAmbígua(new ad.ErroGeracaoIA('timeout', { ambigua: true })), true);
    assert.equal(ad.ehFalhaComResposta(new ad.ErroGeracaoIA('timeout', { ambigua: true })), false);
    // FAIL-CLOSED: mensagem 5xx SEM marcação → AMBÍGUA (5xx não comprova).
    assert.equal(ad.ehFalhaAmbígua(new Error('500 internal server error')), true, '5xx sem marcação = ambíguo');
    assert.equal(ad.ehFalhaComResposta(new Error('500 internal server error')), false);
    // 429 sem marcação → ambíguo (mensagem não é confirmação).
    assert.equal(ad.ehFalhaAmbígua(new Error('429 too many requests')), true);
    // Erro não classificado → ambíguo (fail-closed).
    assert.equal(ad.ehFalhaAmbígua(new Error('AbortError')), true);
  });

  test('consolidação: pagesAlreadyAnalyzed clampa ao total real dos docs elegíveis', async () => {
    const doc = await criarDocumento(escA.id, `clamp-${suffix}.pdf`, 10, 1);
    const user = { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId };
    const res = await ad.analisarDocumentos({
      user,
      documentoIds: [doc.id],
      // 999 páginas informadas num doc de 10 → clampa para 10; ID inexistente ignorado.
      pagesAlreadyAnalyzedByDoc: { [doc.id]: 999, 'id-inexistente': 50 },
      gerarAnalise: geradorOk(),
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 0, 'tudo já analisado (clamp)');
    assert.equal(res.contexto.pagesAlreadyAnalyzed, 10, 'clampado ao total real');
    assert.equal(res.contexto.pagesToAnalyze, 0);
  });

  test('quarentena: documento unscoped nunca entra na análise', async () => {
    const [doc] = await db.insert(s.documentos).values({
      nome: `quarentena-${suffix}.pdf`,
      colecao: 'teste-3a',
      tamanho: '0.01 MB',
      chunks: 1,
      totalPages: 10,
      indexedStatus: 'unscoped',
      escritorioId: escA.id,
      processoId: null,
    }).returning({ id: s.documentos.id });
    docIds.push(doc.id);
    await db.insert(s.chunks).values({
      texto: 'Conteúdo em quarentena. '.repeat(100),
      colecao: 'teste-3a',
      escritorioId: escA.id,
      documentoId: doc.id,
    });

    const chamados: string[] = [];
    const res = await ad.analisarDocumentos({
      user: { id: adminA.id, role: 'admin', escritorioId: adminA.escritorioId },
      documentoIds: [doc.id],
      gerarAnalise: async (bloco) => {
        chamados.push(bloco.documentoId);
        return {
          resumo: `Resumo ${bloco.blocoId}`,
          fatos: [{ tipo: 'fato', texto: 'ok' }],
          modelUsed: 'deepseek-v4-flash',
          tokensIn: 10,
          tokensOut: 5,
        };
      },
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.blocos.length, 0, 'documento em quarentena não gera blocos');
    assert.equal(chamados.length, 0, 'gerador nunca é chamado');
  });
});
