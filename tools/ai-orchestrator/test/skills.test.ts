// ===========================================================================
// Testes da busca de SKILLS do orquestrador (skills.ts).
//
// A pasta skills/ contém guias de boas práticas (debug, clean code, frontend,
// auditoria, testes, design patterns...). A busca faz matching por
// palavras-chave do contexto da fase e retorna as skills mais relevantes com
// limite de bytes — dicas sem encher o contexto.
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buscarSkillsRelevantes, formatarDicasSkills, listarSkills } from '../src/skills.js';

function criarSkills(arquivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    writeFileSync(join(dir, nome), conteudo, 'utf8');
  }
  return dir;
}

describe('skills — listagem e busca por relevância', () => {
  test('listarSkills retorna apenas .md', async () => {
    const dir = criarSkills({
      'debug.md': '# Debug\nComo depurar testes.',
      'nota.txt': 'ignorado',
      'clean-code.md': '# Clean Code\nBoas práticas.',
    });
    const lista = await listarSkills(dir);
    assert.deepEqual(lista.sort(), ['clean-code.md', 'debug.md']);
  });

  test('busca: consulta de testes encontra a skill de debug/testes', async () => {
    const dir = criarSkills({
      'debug.md': '# Debug\n# testes\nComo depurar testes que falham. use logs e breakpoints.',
      'frontend.md': '# Frontend\nReact e CSS, cores e responsividade.',
      'design_pattern.md': '# Design Patterns\nPadrões de projeto.',
    });
    const matches = await buscarSkillsRelevantes('testes falhando, depurar suíte de testes', { dir });
    assert.ok(matches.length >= 1, 'deve encontrar pelo menos uma skill');
    assert.ok(matches[0].nome.includes('debug'), 'skill de debug deve ser a mais relevante');
  });

  test('busca: escopo de frontend encontra a skill de frontend', async () => {
    const dir = criarSkills({
      'debug.md': '# Debug\nComo depurar testes.',
      'FrontSkill.md': '# Frontend\nReact, mobile-first, cores, responsividade, UX.',
      'design_pattern.md': '# Design Patterns\nPadrões.',
    });
    const matches = await buscarSkillsRelevantes('tela responsiva mobile first, componentes React', { dir });
    assert.ok(matches.length >= 1);
    assert.ok(matches[0].nome.includes('FrontSkill'), 'skill de frontend deve liderar');
  });

  test('sem correspondência → lista vazia (não polui o prompt)', async () => {
    const dir = criarSkills({
      'debug.md': '# Debug\nComo depurar testes.',
      'frontend.md': '# Frontend\nReact.',
    });
    const matches = await buscarSkillsRelevantes('configuração de rede kubernetes', { dir });
    assert.equal(matches.length, 0);
  });

  test('limite de bytes por skill respeitado (contexto enxuto)', async () => {
    const dir = criarSkills({
      'debug.md': '# Debug\n' + 'x'.repeat(10_000) + '\n',
    });
    const matches = await buscarSkillsRelevantes('debug testes', { dir, maxBytesPorSkill: 500 });
    assert.equal(matches.length, 1);
    assert.ok(matches[0].dicas.length <= 500, 'dicas truncadas ao limite');
  });

  test('formatarDicasSkills: vazio → string vazia; com match → bloco rotulado', () => {
    assert.equal(formatarDicasSkills([]), '');
    const out = formatarDicasSkills([{ arquivo: 'debug.md', nome: 'debug', score: 5, dicas: 'use logs' }]);
    assert.match(out, /DICAS DE SKILLS/);
    assert.match(out, /debug/);
    assert.match(out, /use logs/);
  });
});
