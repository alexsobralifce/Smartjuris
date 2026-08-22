// ===========================================================================
// Fase 2C — Builder do payload real.
//
// Cobertura exigida pelo prompt:
//   - processo do mesmo escritório (vínculo → dados reais);
//   - processo de outro escritório (rejeitado);
//   - documento sem escopo (quarentena) excluído das contagens;
//   - plano legado normalizado (ex.: "basico"/"starter" → ESSENTIAL);
//   - saldo real (rollover de ciclo respeitado);
//   - peça simples / padrão / complexa (via pieceType/área/dadosCaso);
//   - ausência de processo (payload autônomo, sem número real);
//   - chave de idempotência ausente (warning).
//
// Nunca deriva créditos/custo/modelo/páginas/limites do cliente — só do banco.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray, and, sql } from 'drizzle-orm';

const { db, client } = await import('../db/client.js');
const s = await import('../db/schema.js');
const { buildClassifierPayload, builderInputSchema, valorParaCentavos, CAMPOS_PROIBIDOS_DO_CLIENTE } = await import('./payloadBuilder.js');
const { classifyAiOperation } = await import('./classifier.js');

let dbDisponivel = true;
try {
  await db.execute(sql`SELECT 1`);
} catch {
  dbDisponivel = false;
}

const escIds: string[] = [];
const userIds: string[] = [];
const processoIds: string[] = [];
const documentoIds: string[] = [];

// Contas de teste determinísticas por execução (UUID único).
const suffix = randomUUID().slice(0, 8);

let escA: { id: string };
let escB: { id: string };
let adminA: { id: string; escritorioId: string | null };
let adminB: { id: string; escritorioId: string | null };
let procA: { id: string; numero: string | null };
let procB: { id: string; numero: string | null };

before(async () => {
  if (!dbDisponivel) return;

  // Escritório A: plano LEGADO ("basico") com saldo real de ciclo.
  const [ea, eb] = await db.insert(s.escritorios).values([
    { nome: `Builder A ${suffix}`, plano: 'basico', ativo: true, limiteTokensMes: null, limiteUsuarios: 5, creditsAvailable: 40, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    { nome: `Builder B ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, limiteUsuarios: 20, creditsAvailable: 99, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
  ]).returning({ id: s.escritorios.id });
  escA = ea; escB = eb;
  escIds.push(ea.id, eb.id);

  const users = await db.insert(s.usuarios).values([
    { nome: 'Builder Admin A', email: `builder.a.${suffix}@teste.local`, senha: 'x', role: 'admin', escritorioId: ea.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    { nome: 'Builder Admin B', email: `builder.b.${suffix}@teste.local`, senha: 'x', role: 'admin', escritorioId: eb.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
  ]).returning({ id: s.usuarios.id, escritorioId: s.usuarios.escritorioId });
  adminA = users[0]; adminB = users[1];
  userIds.push(users[0].id, users[1].id);

  // Processo A (escritório A) com número real; processo B (escritório B).
  const procs = await db.insert(s.processos).values([
    { tipo: 'Reclamação Trabalhista', cliente: 'Fernanda', adverso: 'Empresa XYZ', vara: '3ª Vara Trabalhista', area: 'Trabalhista', status: 'ativo', valor: 'R$ 87.500,00', prazo: '2026-12-31', advogado: 'Dr. A', usuarioId: users[0].id, escritorioId: ea.id, numero: '1001234-56.2026.5.02.0003' },
    { tipo: 'Ação de Danos Morais', cliente: 'Roberto', adverso: 'Companhia Aérea', vara: '2ª Vara Cível', area: 'Consumerista', status: 'ativo', valor: 'R$ 15.000,00', prazo: '2026-12-31', advogado: 'Dr. B', usuarioId: users[1].id, escritorioId: eb.id, numero: '2001234-56.2026.8.02.0002' },
  ]).returning({ id: s.processos.id, numero: s.processos.numero });
  procA = procs[0]; procB = procs[1];
  processoIds.push(procs[0].id, procs[1].id);

  // Documentos do escritório A: 1 indexado (20 págs), 1 processando (10 págs),
  // e 1 SEM escopo (quarentena) — que NÃO pode entrar nas contagens.
  const docs = await db.insert(s.documentos).values([
    { nome: `doc-a.pdf ${suffix}`, colecao: 'Jurisprudência', tamanho: '1MB', chunks: 2, escritorioId: ea.id, totalPages: 20, indexedStatus: 'indexed', failedChunks: 0 },
    { nome: `doc-a2.pdf ${suffix}`, colecao: 'Legislação', tamanho: '2MB', chunks: 1, escritorioId: ea.id, totalPages: 10, indexedStatus: 'processing', failedChunks: 0 },
    { nome: `doc-unscoped.pdf ${suffix}`, colecao: 'Legislação', tamanho: '3MB', chunks: 0, escritorioId: null, totalPages: 999, indexedStatus: 'unscoped', failedChunks: 0 },
  ]).returning({ id: s.documentos.id });
  documentoIds.push(...docs.map((d) => d.id));

  // Chunks do escritório A (contexto RAG disponível).
  await db.insert(s.chunks).values([
    { documentoId: docs[0].id, colecao: 'Jurisprudência', texto: 'Precedente sobre horas extras com reflexos.', embedding: null, escritorioId: ea.id },
    { documentoId: docs[0].id, colecao: 'Jurisprudência', texto: 'Responsabilidade objetiva do transportador aéreo.', embedding: null, escritorioId: ea.id },
  ]);
});

after(async () => {
  if (dbDisponivel) {
    await db.delete(s.chunks).where(eq(s.chunks.escritorioId, escA.id)).catch(() => {});
    for (const id of documentoIds) await db.delete(s.documentos).where(eq(s.documentos.id, id)).catch(() => {});
    for (const id of processoIds) await db.delete(s.processos).where(eq(s.processos.id, id)).catch(() => {});
    for (const id of userIds) await db.delete(s.usuarios).where(eq(s.usuarios.id, id)).catch(() => {});
    for (const id of escIds) await db.delete(s.escritorios).where(eq(s.escritorios.id, id)).catch(() => {});
  }
  await client.end({ timeout: 5 });
});

describe('2C — builder do payload real', { skip: !dbDisponivel }, () => {
  test('processo do MESMO escritório → dados reais derivados (número, partes, valor, escopo)', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Trabalhista', dadosCaso: 'Horas extras não pagas.', processoId: procA.id, includeJurisprudence: true, outputSize: 'STANDARD', idempotencyKey: 'k-1' },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.payload.case.processNumber, procA.numero, 'número real do processo');
    assert.equal(res.payload.case.clientName, 'Fernanda');
    assert.equal(res.payload.case.adverseParty, 'Empresa XYZ');
    assert.equal(res.payload.case.area, 'Trabalhista');
    assert.equal(res.payload.workspace.planCode, 'ESSENTIAL', 'plano legado "basico" → ESSENTIAL');
    assert.equal(res.payload.workspace.creditsAvailable, 40, 'saldo real do banco');
    assert.equal(res.payload.documents.count, 2, 'documentos do escritório A (unscoped excluído)');
    assert.equal(res.payload.documents.totalPages, 30, '20 + 10');
    assert.equal(res.payload.rag.available, true);
    assert.ok(res.payload.request.includeJurisprudence === true);
    assert.equal(res.payload.request.outputSize, 'STANDARD');
  });

  test('processo de OUTRO escritório → rejeitado (não vaza dados entre tenants)', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X', processoId: procB.id, idempotencyKey: 'k-2' },
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'processo-de-outro-escritorio');
    }
  });

  test('processo INEXISTENTE → rejeitado', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X', processoId: randomUUID(), idempotencyKey: 'k-3' },
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'processo-de-outro-escritorio');
  });

  test('documento SEM escopo (quarentena) NÃO entra nas contagens', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Trabalhista', dadosCaso: 'Y', processoId: procA.id, idempotencyKey: 'k-4' },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    // O doc sem escopo tem total_pages=999; se entrasse, totalPages seria 1029.
    assert.equal(res.payload.documents.totalPages, 30, 'unscoped de 999 páginas excluído');
    assert.equal(res.payload.documents.count, 2);
  });

  test('ausência de processo → payload autônomo, sem número real (warnings)', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Manifestação', area: 'Cível', dadosCaso: 'Pedido de diligência.' },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.payload.case.processNumber, undefined);
    assert.equal(res.payload.case.id, undefined);
    assert.ok(res.warnings.some((w) => w.includes('Número real')), 'warning de número real');
    assert.ok(res.warnings.some((w) => w.includes('idempotencyKey')), 'warning de idempotencyKey ausente');
  });

  test('chave de idempotência ausente → warning (não bloqueia a montagem)', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'Z', processoId: procA.id },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.warnings.some((w) => w.includes('idempotencyKey')));
  });

  test('saldo real respeita o ROLLOVER do ciclo (ciclo antigo → saldo do plano)', async () => {
    // Escritório próprio com ciclo antigo, para não afetar os demais testes.
    const [escTmp] = await db.insert(s.escritorios).values([
      { nome: `Builder Rollover ${suffix}`, plano: 'profissional', ativo: true, creditsAvailable: 0, reserveCentsUsed: 500, cycleMonth: '2000-01' },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escTmp.id);
    const [userTmp] = await db.insert(s.usuarios).values([
      { nome: 'Builder User Rollover', email: `builder.rollover.${suffix}@teste.local`, senha: 'x', role: 'admin', escritorioId: escTmp.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(userTmp.id);
    try {
      const res = await buildClassifierPayload({
        user: { id: userTmp.id, role: 'admin', escritorioId: escTmp.id },
        input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'Rollover.' },
      });
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.payload.workspace.planCode, 'PROFESSIONAL');
      assert.equal(res.payload.workspace.creditsAvailable, 50, 'rollover → saldo do plano PROFESSIONAL');
      // reserva usada zerada no rollover → orçamento cheio
      assert.ok((res.payload.workspace.aiBudgetAvailableCents ?? 0) > 0);
    } finally {
      await db.delete(s.usuarios).where(eq(s.usuarios.id, userTmp.id)).catch(() => {});
      await db.delete(s.escritorios).where(eq(s.escritorios.id, escTmp.id)).catch(() => {});
    }
  });

  test('payload válido passa pelo classificador (integração builder → classifier)', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Trabalhista', dadosCaso: 'Horas extras não pagas durante 2 anos.', processoId: procA.id, outputSize: 'STANDARD', idempotencyKey: 'k-5' },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    const output = classifyAiOperation(res.payload);
    // O escritório A tem documentos indexados mas SEM contexto processado
    // (summariesAvailable=false) → o classificador corretamente decide que a
    // análise documental precede a redação (regra Q5). O payload nunca é
    // BLOCKED/INSUFFICIENT_DATA — a decisão é coerente com os dados reais.
    assert.notEqual(output.status, 'BLOCKED');
    assert.notEqual(output.status, 'INSUFFICIENT_DATA');
    assert.equal(output.operation, 'DOCUMENT_ANALYSIS_20_PAGES');
    assert.equal(output.caseContext, 'PROCESS_LINKED');
    assert.equal(output.recommendedModelTier, 'FLASH');
  });

  test('campo proibido do cliente (ex.: credits) nunca vira créditos reais', async () => {
    // O schema rejeita/ignora campos proibidos — nunca aceita do body.
    const entrada: Record<string, unknown> = { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X', credits: 999, modelTier: 'PRO', escritorioId: 'hack', maxPages: 500 };
    const parsed = builderInputSchema.safeParse(entrada);
    assert.equal(parsed.success, true, 'campos proibidos extras não inviabilizam o parse (strip por default)');
    if (!parsed.success) return;
    assert.equal((parsed.data as Record<string, unknown>)['credits'], undefined);
    assert.equal((parsed.data as Record<string, unknown>)['modelTier'], undefined);
    assert.equal((parsed.data as Record<string, unknown>)['escritorioId'], undefined);
    assert.equal((parsed.data as Record<string, unknown>)['maxPages'], undefined);
    assert.ok(CAMPOS_PROIBIDOS_DO_CLIENTE.includes('credits'));
  });

  test('valor monetário → centavos (best-effort)', () => {
    assert.equal(valorParaCentavos('R$ 87.500,00'), 8_750_000);
    assert.equal(valorParaCentavos('87.500,00'), 8_750_000);
    assert.equal(valorParaCentavos('87500.50'), 8_750_050, 'formato internacional com ponto decimal');
    assert.equal(valorParaCentavos('87.500'), 8_750_000, 'milhar brasileiro sem decimal');
    assert.equal(valorParaCentavos('15000'), 1_500_000, 'inteiro puro');
    assert.equal(valorParaCentavos(null), null);
    assert.equal(valorParaCentavos('—'), null);
  });

  // -------------------------------------------------------------------------
  // Correções exigidas pelo revisor (2C — re-auditoria)
  // -------------------------------------------------------------------------

  test('usuário INATIVO → falha fail-closed (usuario-inativo)', async () => {
    const [userInativo] = await db.insert(s.usuarios).values([
      { nome: 'Builder Inativo', email: `builder.inativo.${suffix}@teste.local`, senha: 'x', role: 'user', escritorioId: escA.id, ativo: false, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(userInativo.id);
    try {
      const res = await buildClassifierPayload({
        user: { id: userInativo.id, role: 'user', escritorioId: escA.id },
        input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.code, 'usuario-inativo');
    } finally {
      await db.delete(s.usuarios).where(eq(s.usuarios.id, userInativo.id)).catch(() => {});
    }
  });

  test('usuário com claim de escritorioId DESATUALIZADO → falha (vinculo-invalido)', async () => {
    const res = await buildClassifierPayload({
      // adminA pertence ao escA, mas o claim mente dizendo escB.
      user: { id: adminA.id, role: 'admin', escritorioId: escB.id },
      input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'vinculo-invalido');
  });

  test('usuário INEXISTENTE → falha (usuario-nao-encontrado)', async () => {
    const res = await buildClassifierPayload({
      user: { id: randomUUID(), role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'usuario-nao-encontrado');
  });

  test('escritório INATIVO → falha fail-closed (escritorio-inativo)', async () => {
    const [escTmp] = await db.insert(s.escritorios).values([
      { nome: `Builder Inativo ${suffix}`, plano: 'basico', ativo: false, limiteTokensMes: null },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escTmp.id);
    const [userTmp] = await db.insert(s.usuarios).values([
      { nome: 'Builder User Inativo', email: `builder.user.inativo.${suffix}@teste.local`, senha: 'x', role: 'user', escritorioId: escTmp.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(userTmp.id);
    try {
      const res = await buildClassifierPayload({
        user: { id: userTmp.id, role: 'user', escritorioId: escTmp.id },
        input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.code, 'escritorio-inativo');
    } finally {
      await db.delete(s.usuarios).where(eq(s.usuarios.id, userTmp.id)).catch(() => {});
      await db.delete(s.escritorios).where(eq(s.escritorios.id, escTmp.id)).catch(() => {});
    }
  });

  test('documento unscoped COM escritorioId preenchido NÃO entra (filtro explícito + RAG)', async () => {
    // Defesa em profundidade: mesmo com escritorio_id setado, um documento
    // marcado como 'unscoped' deve ser excluído de contagens E do RAG.
    const [docInconsistente] = await db.insert(s.documentos).values([
      { nome: `doc-inconsistente.pdf ${suffix}`, colecao: 'Legislação', tamanho: '1MB', chunks: 0, escritorioId: escA.id, totalPages: 500, indexedStatus: 'unscoped', failedChunks: 0 },
    ]).returning({ id: s.documentos.id });
    documentoIds.push(docInconsistente.id);
    // Chunk desse documento (também com escopo) — não pode contar como RAG.
    await db.insert(s.chunks).values([
      { documentoId: docInconsistente.id, colecao: 'Legislação', texto: 'Chunk de documento em quarentena.', embedding: null, escritorioId: escA.id },
    ]);
    try {
      const res = await buildClassifierPayload({
        user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
        input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
      });
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.payload.documents.count, 2, 'unscoped inconsistente não entra no count');
      assert.equal(res.payload.documents.totalPages, 30, 'unscoped de 500 págs não entra');
      assert.equal(res.payload.rag.relevantChunks, 2, 'chunk do documento unscoped não conta no RAG');
    } finally {
      await db.delete(s.chunks).where(eq(s.chunks.documentoId, docInconsistente.id)).catch(() => {});
      await db.delete(s.documentos).where(eq(s.documentos.id, docInconsistente.id)).catch(() => {});
    }
  });

  test('entrada runtime INVALIDADA (tipos errados) → falha estruturada sem crash', async () => {
    // area numérica chegaria a input.area?.trim() sem a validação na borda.
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 123, area: 456 } as unknown as Record<string, unknown>,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'entrada-invalida');
  });

  test('cenários builder → classifier: simples, padrão e complexa (sem injetar créditos/modelo)', async () => {
    // Escritório sem documentos → o classificador NÃO exige análise documental
    // prévia (regra Q5), permitindo classificar a redação diretamente.
    const [escSemDocs] = await db.insert(s.escritorios).values([
      { nome: `Builder SemDocs ${suffix}`, plano: 'office', ativo: true, limiteTokensMes: null, creditsAvailable: 100, reserveCentsUsed: 0, cycleMonth: sql`to_char(now(), 'YYYY-MM')` },
    ]).returning({ id: s.escritorios.id });
    escIds.push(escSemDocs.id);
    const [userSemDocs] = await db.insert(s.usuarios).values([
      { nome: 'Builder User SemDocs', email: `builder.semdocs.${suffix}@teste.local`, senha: 'x', role: 'admin', escritorioId: escSemDocs.id, ativo: true, precisaTrocarSenha: false, emailVerificado: true },
    ]).returning({ id: s.usuarios.id });
    userIds.push(userSemDocs.id);
    const userCtx = { id: userSemDocs.id, role: 'admin' as const, escritorioId: escSemDocs.id };

    try {
      // Simples: notificação/manifestação sem documentos → redação simples.
      const simples = await buildClassifierPayload({
        user: userCtx,
        input: { pieceType: 'Notificação Extrajudicial', area: 'Cível', dadosCaso: 'Comunicação de rescisão contratual.' },
      });
      assert.equal(simples.ok, true);
      if (!simples.ok) return;
      const outSimples = classifyAiOperation(simples.payload);
      assert.equal(outSimples.operation, 'SIMPLE_PETITION', `op=${outSimples.operation}`);

      // Padrão: contestação com fatos extensos → STANDARD_PETITION.
      const padrao = await buildClassifierPayload({
        user: userCtx,
        input: { pieceType: 'Contestação', area: 'Cível', dadosCaso: 'Defesa extensa com mais de 800 caracteres: o autor alega fato incontroverso, porém houve prescrição da pretensão, ausência de nexo causal, culpa exclusiva da vítima e ausência de dano. A contestação enfrenta cada ponto da inicial e requer a improcedência, com condenação em custas e honorários, e subsidiariamente a compensação de obrigações recíprocas verificadas nos autos, tudo conforme a legislação aplicável e a jurisprudência dominante dos tribunais superiores.' },
      });
      assert.equal(padrao.ok, true);
      if (!padrao.ok) return;
      const outPadrao = classifyAiOperation(padrao.payload);
      assert.equal(outPadrao.operation, 'STANDARD_PETITION', `op=${outPadrao.operation}`);

      // Complexa: parecer → COMPLEX_DOCUMENT.
      const complexa = await buildClassifierPayload({
        user: userCtx,
        input: { pieceType: 'Parecer', area: 'Tributário', dadosCaso: 'Análise de matéria tributária complexa com teses concorrentes.' },
      });
      assert.equal(complexa.ok, true);
      if (!complexa.ok) return;
      const outComplexa = classifyAiOperation(complexa.payload);
      assert.equal(outComplexa.operation, 'COMPLEX_DOCUMENT', `op=${outComplexa.operation}`);
      assert.equal(outComplexa.recommendedModelTier, 'PRO');
    } finally {
      await db.delete(s.usuarios).where(eq(s.usuarios.id, userSemDocs.id)).catch(() => {});
      await db.delete(s.escritorios).where(eq(s.escritorios.id, escSemDocs.id)).catch(() => {});
    }
  });

  test('área canônica: processo vinculado prevalece sobre a área enviada pelo cliente', async () => {
    // procA é Trabalhista; o cliente tenta enviar area='Tributário' (contraditória).
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Petição Inicial', area: 'Tributário', dadosCaso: 'X', processoId: procA.id },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.payload.request.legalArea, 'Trabalhista', 'request.legalArea usa a área do processo');
    assert.equal(res.payload.case.area, 'Trabalhista', 'case.area usa a área do processo');
  });

  test('processoId: null é tratado como ausência de processo (warning de payload autônomo)', async () => {
    const res = await buildClassifierPayload({
      user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
      input: { pieceType: 'Manifestação', area: 'Cível', dadosCaso: 'X', processoId: null },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.payload.case.id, undefined);
    assert.equal(res.payload.case.processNumber, undefined);
    assert.ok(res.warnings.some((w) => w.includes('Nenhum processo vinculado')), 'warning emitido para processoId: null');
  });

  test('chunk com escopo inconsistente (chunk de A apontando doc elegível de B) NÃO conta no RAG', async () => {
    // Cria um documento ELEGÍVEL no escB e um chunk "órfão" com escritorioId=escA
    // apontando para ele. A consulta de RAG de A não pode contá-lo (defesa em
    // profundidade exige documentos.escritorioId = escritorioId).
    const [docB] = await db.insert(s.documentos).values([
      { nome: `doc-b-elegivel.pdf ${suffix}`, colecao: 'Jurisprudência', tamanho: '1MB', chunks: 0, escritorioId: escB.id, totalPages: 5, indexedStatus: 'indexed', failedChunks: 0 },
    ]).returning({ id: s.documentos.id });
    documentoIds.push(docB.id);
    // Chunk com escopo de A apontando para documento de B (dado inconsistente).
    await db.insert(s.chunks).values([
      { documentoId: docB.id, colecao: 'Jurisprudência', texto: 'Chunk inconsistente entre tenants.', embedding: null, escritorioId: escA.id },
    ]);
    try {
      const res = await buildClassifierPayload({
        user: { id: adminA.id, role: 'admin', escritorioId: escA.id },
        input: { pieceType: 'Petição', area: 'Cível', dadosCaso: 'X' },
      });
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.payload.rag.relevantChunks, 2, 'chunk inconsistente não conta no RAG de A');
    } finally {
      await db.delete(s.chunks).where(and(eq(s.chunks.documentoId, docB.id), eq(s.chunks.escritorioId, escA.id))).catch(() => {});
      await db.delete(s.documentos).where(eq(s.documentos.id, docB.id)).catch(() => {});
    }
  });
});
