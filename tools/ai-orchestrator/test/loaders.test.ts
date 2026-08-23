// ===========================================================================
// Testes dos loaders de requisitos (estilo LangChain): um loader por formato,
// todos retornando RequirementsDocType; dispatcher por extensão do arquivo.
// ===========================================================================

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  languageRequirementLoader,
  jsonRequirementLoader,
  loadRequirementsFromFile,
  LOADERS_BY_EXTENSION,
  JSON_REQUIREMENTS_EXAMPLE,
} from '../src/loaders.js';
import type { LlmClient } from '../src/llm.js';

const tmpRoots: string[] = [];
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'loaders-'));
  tmpRoots.push(d);
  return d;
}
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

const FASES_JSON = JSON.stringify({
  fases: [
    {
      id: '5A',
      titulo: 'Faturamento mensal',
      descricao: 'Gerar relatório mensal.',
      dependencias: ['4B'],
      escopo: 'Criar rota e PDF.',
      foraDoEscopo: 'Não alterar planos.',
      testesObrigatorios: ['Teste do PDF'],
      criteriosAceite: ['PDF com valores corretos'],
    },
  ],
});

function fakeLlm(responder: () => string): LlmClient {
  return {
    async structurer() {
      return { content: responder(), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    },
    async implementer() {
      return { content: 'ok', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
    async reviewer() {
      return { content: '{}', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    },
  };
}

describe('jsonRequirementLoader', () => {
  test('carrega documento com fases do contrato', async () => {
    const doc = await jsonRequirementLoader.load(FASES_JSON, {});
    assert.equal(doc.fases.length, 1);
    assert.equal(doc.fases[0].id, '5A');
  });

  test('aceita array direto de fases (sem wrapper fases:)', async () => {
    const arr = JSON.parse(FASES_JSON).fases;
    const doc = await jsonRequirementLoader.load(JSON.stringify(arr), {});
    assert.equal(doc.fases.length, 1);
  });

  test('rejeita JSON fora do contrato com erro claro', async () => {
    await assert.rejects(
      () => jsonRequirementLoader.load(JSON.stringify({ fases: [{ nome: 'x' }] }), {}),
      /Contrato de requisitos inválido/,
    );
  });
});

describe('languageRequirementLoader', () => {
  test('estrutura texto via LLM e retorna fases', async () => {
    const llm = fakeLlm(() => FASES_JSON);
    const doc = await languageRequirementLoader.load('Criar módulo de faturamento.', { llm, existingIds: ['4B'] });
    assert.equal(doc.fases.length, 1);
    assert.equal(doc.fases[0].id, '5A');
  });

  test('tenta até 3x e corrige com o erro de validação', async () => {
    let calls = 0;
    const llm = fakeLlm(() => {
      calls += 1;
      if (calls < 3) return '{"fases":[{"id":1,"titulo":""}]}'; // id number, falta tudo
      return FASES_JSON;
    });
    const doc = await languageRequirementLoader.load('x', { llm });
    assert.equal(calls, 3, 'usou as 3 tentativas');
    assert.equal(doc.fases[0].id, '5A');
  });

  test('falha com erro claro após 3 tentativas', async () => {
    const llm = fakeLlm(() => 'não é json');
    await assert.rejects(
      () => languageRequirementLoader.load('x', { llm }),
      /após 3 tentativas/,
    );
  });

  test('rejeita texto acima do limite de caracteres', async () => {
    const llm = fakeLlm(() => FASES_JSON);
    await assert.rejects(
      () => languageRequirementLoader.load('x'.repeat(101), { llm, maxChars: 100 }),
      /muito longo|limite/,
    );
  });

  test('exige ctx.llm para linguagem natural', async () => {
    await assert.rejects(
      () => languageRequirementLoader.load('texto', {}),
      /exige um cliente LLM/,
    );
  });
});

describe('loadRequirementsFromFile (dispatcher por extensão)', () => {
  test('escolhe o loader pela extensão do arquivo', async () => {
    const dir = tmpDir();
    const txt = join(dir, 'req.txt');
    const json = join(dir, 'req.json');
    writeFileSync(txt, 'Criar módulo de faturamento.', 'utf8');
    writeFileSync(json, FASES_JSON, 'utf8');

    const llm = fakeLlm(() => FASES_JSON);
    const docTxt = await loadRequirementsFromFile(txt, { llm });
    const docJson = await loadRequirementsFromFile(json, {});
    assert.equal(docTxt.fases[0].id, '5A', 'txt → loader de linguagem natural');
    assert.equal(docJson.fases[0].id, '5A', 'json → loader estruturado');
  });

  test('rejeita extensão não suportada com mensagem clara', async () => {
    const dir = tmpDir();
    const pdf = join(dir, 'req.pdf');
    writeFileSync(pdf, 'x', 'utf8');
    await assert.rejects(
      () => loadRequirementsFromFile(pdf, {}),
      /Formato não suportado.*\.pdf.*Suportados/,
    );
  });

  test('rejeita arquivo inexistente', async () => {
    await assert.rejects(
      () => loadRequirementsFromFile(join(tmpDir(), 'nao-existe.txt'), {}),
      /não encontrado|ilegível/,
    );
  });

  test('mapeia extensões esperadas', () => {
    assert.ok(LOADERS_BY_EXTENSION['.txt']);
    assert.ok(LOADERS_BY_EXTENSION['.md']);
    assert.ok(LOADERS_BY_EXTENSION['.json']);
  });
});

describe('JSON_REQUIREMENTS_EXAMPLE', () => {
  test('é um documento válido do contrato', async () => {
    const doc = await jsonRequirementLoader.load(JSON.stringify(JSON_REQUIREMENTS_EXAMPLE), {});
    assert.equal(doc.fases.length, 1);
  });
});
