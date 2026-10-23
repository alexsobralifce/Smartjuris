import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { associacoesIndevidas } from './redator.js';

const artigo = (texto: string) => ({
  titulo: 't', descricao: 'd', resumo: 'r', alt_imagem: 'a', prompt_imagem: 'p', categoria: 'IA na advocacia',
  secoes: [{ titulo: 'O que aconteceu', paragrafos: [texto], lista: [] }],
  faq: [], checklist: [],
} as any);

describe('associações indevidas do SmartJuris', () => {
  test('reprova SmartJuris ligado a prompt injection', () => {
    assert.equal(associacoesIndevidas(artigo('O SmartJuris usa prompt injection para gerar peças.')).length, 1);
  });
  test('reprova peças do SmartJuris apresentadas como feitas por IA', () => {
    assert.equal(associacoesIndevidas(artigo('As peças do SmartJuris são feitas por IA sem revisão.')).length, 1);
  });
  test('não reprova notícia de terceiros sobre prompt injection sem citar o SmartJuris', () => {
    assert.equal(associacoesIndevidas(artigo('O STJ multou advogados por uso de prompt injection em petição.')).length, 0);
  });
  test('não reprova menção neutra ao SmartJuris', () => {
    assert.equal(associacoesIndevidas(artigo('A revisão final da peça é responsabilidade do advogado, como em qualquer ferramenta.')).length, 0);
  });
});
