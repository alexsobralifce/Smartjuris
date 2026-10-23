import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { extrairTexto, htmlParaTexto, formatoSuportado } from './extracaoTexto.js';

describe('extração de texto para a base RAG', () => {
  test('aceita PDF, DOCX, HTML, MD e TXT e rejeita o resto', () => {
    for (const n of ['a.pdf', 'a.DOCX', 'a.html', 'a.htm', 'a.md', 'a.markdown', 'a.txt']) assert.equal(formatoSuportado(n), true, n);
    for (const n of ['a.exe', 'a.png', 'semextensao']) assert.equal(formatoSuportado(n), false, n);
  });

  test('HTML: remove scripts e tags, decodifica entidades', () => {
    const t = htmlParaTexto('<html><head><title>X</title></head><body><script>var a=1</script><h1>Art. 1</h1><p>Lei &amp; ordem &#233; &quot;ok&quot;.</p></body></html>');
    assert.equal(t.includes('var a'), false);
    assert.equal(t.includes('<'), false);
    assert.match(t, /Art\. 1/);
    assert.match(t, /Lei & ordem é "ok"\./);
  });

  test('Markdown e TXT: texto preservado', async () => {
    const md = await extrairTexto(Buffer.from('# Título\n\nArt. 1 texto'), 'lei.md');
    assert.match(md.texto, /# Título/);
    const txt = await extrairTexto(Buffer.from('linha 1\r\n\r\nlinha 2'), 'lei.txt');
    assert.equal(txt.texto, 'linha 1\n\nlinha 2');
  });

  test('DOCX: extrai o texto do documento', async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('Art. 5º Todos são iguais perante a lei.')] })] }] });
    const buf = await Packer.toBuffer(doc);
    const r = await extrairTexto(buf, 'lei.docx');
    assert.match(r.texto, /Todos são iguais perante a lei/);
  });

  test('formato não suportado lança erro', async () => {
    await assert.rejects(() => extrairTexto(Buffer.from('x'), 'arquivo.exe'));
  });
});
