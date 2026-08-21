/**
 * Renderização de peças jurídicas em PDF (pdfkit) e DOCX (docx) com papel
 * timbrado do escritório. As funções sempre retornam um Buffer não-vazio e
 * nunca lançam exceção por causa de logo inválido (imagem é ignorada).
 *
 * O corpo é renderizado a partir do modelo intermediário `BlocoRico[]`
 * (paragraph/heading/listItem com runs formatados: negrito, itálico,
 * sublinhado, tamanho e alinhamento), preservando o papel timbrado.
 */
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx';
import type { AlinhamentoRico, EscritorioIdentity, PecaDocumento, RunRico } from './letterhead.js';

const MARGEM_ESQUERDA = 64;
const MARGEM_DIREITA = 64;

/** Normaliza um valor para string trimada ('' quando nulo/vazio). */
function limpar(s: string | null | undefined): string {
  return s == null ? '' : String(s).trim();
}

/** Linha de contato do papel timbrado: campos preenchidos unidos por " · ". */
function linhaDeContato(esc: EscritorioIdentity): string {
  const enderecoCompleto = [esc.endereco, esc.numero, esc.bairro, esc.cidade, esc.uf, esc.cep]
    .map(limpar)
    .filter(Boolean)
    .join(', ');
  return [esc.cnpj, esc.inscricaoOab, enderecoCompleto, esc.telefone, esc.email, esc.site]
    .map(limpar)
    .filter(Boolean)
    .join(' · ');
}

/** Nome exibido no cabeçalho: razão social (ou e-mail/fallback). */
function nomePapelTimbrado(esc: EscritorioIdentity): string {
  return limpar(esc.razaoSocial) || limpar(esc.email) || 'Escritório de Advocacia';
}

/**
 * Retorna a string base64 de uma data-URI (ex.: "data:image/png;base64,...").
 * Devolve '' se não for uma data-URI válida.
 */
function base64DeDataUri(logoUrl: string | null | undefined): string {
  if (typeof logoUrl !== 'string' || !logoUrl.startsWith('data:image')) return '';
  return logoUrl.split(',')[1] ?? '';
}

// ---------------------------------------------------------------------------
// Helpers de formatação rica
// ---------------------------------------------------------------------------

/** Fonte Times correspondente às marcas do run (bold/italic). */
function fonteRica(run: RunRico): string {
  if (run.bold && run.italic) return 'Times-BoldItalic';
  if (run.bold) return 'Times-Bold';
  if (run.italic) return 'Times-Italic';
  return 'Times-Roman';
}

/** Mapeia alinhamento do editor para o enum do docx (undefined → LEFT). */
function mapAlign(a?: AlinhamentoRico): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === 'center') return AlignmentType.CENTER;
  if (a === 'right') return AlignmentType.RIGHT;
  if (a === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

/** Converte um run rico em TextRun do docx (size em half-points). */
function toTextRun(r: RunRico): TextRun {
  return new TextRun({
    text: r.text,
    bold: r.bold,
    italics: r.italic,
    underline: r.underline ? {} : undefined,
    size: (r.size ?? 12) * 2,
  });
}

/**
 * Expande os runs de um bloco em TextRuns do docx, quebrando '\n'
 * (proveniente de hardBreak no editor) em quebras de linha reais.
 */
function textRunsDoBloco(runs: RunRico[]): TextRun[] {
  const resultado: TextRun[] = [];
  for (const r of runs) {
    const partes = r.text.split('\n');
    partes.forEach((parte, i) => {
      if (i > 0) resultado.push(new TextRun({ break: 1 }));
      resultado.push(toTextRun({ ...r, text: parte }));
    });
  }
  return resultado;
}

/** HeadingLevel do docx para o nível 1-6 do editor. */
function headingDeNivel(nivel: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  const nivelLimitado = Math.max(1, Math.min(6, nivel));
  return HeadingLevel[`HEADING_${nivelLimitado}` as keyof typeof HeadingLevel];
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export async function renderPdf(doc: PecaDocumento): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 56, left: 64, right: 64 },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    pdf.on('end', () => res(Buffer.concat(chunks)));
    pdf.on('error', rej);
  });

  const larguraPagina = pdf.page.width;
  const larguraUtil = larguraPagina - MARGEM_ESQUERDA - MARGEM_DIREITA;

  let numeroPagina = 1;

  // Estado da fonte do CORPO, rastreado manualmente. NÃO usar `_font`/`_fillColor`
  // do pdfkit: `_font` é um objeto Font (não o nome a passar a `pdf.font`) e os
  // helpers de cabeçalho/rodapé mudam a fonte para Helvetica 8pt — o pdfkit
  // retoma o texto interrompido numa quebra de página com esse estado, o que
  // encolhia a continuação do parágrafo na página nova.
  let nomeFonteCorpo = 'Times-Roman';
  let tamanhoFonteCorpo = 12;
  let corFonteCorpo = 'black';
  const capturarFonte = () => ({ font: nomeFonteCorpo, size: tamanhoFonteCorpo, color: corFonteCorpo });
  const restaurarFonte = (estado: { font: string; size: number; color: string }) => {
    pdf.font(estado.font).fontSize(estado.size).fillColor(estado.color || 'black');
  };

  // Número de página centralizado no rodapé (coordenadas explícitas).
  // Usa lineBreak:false e centragem manual para não disparar quebra de página:
  // desenhar com width ativaria o LineWrapper, que cria página nova quando
  // y > page.maxY() (o rodapé fica dentro da margem inferior, além do maxY).
  const desenharRodape = () => {
    if (numeroPagina <= 0) return;
    pdf.font('Helvetica').fontSize(8).fillColor('#7a7870');
    const nome = nomePapelTimbrado(doc.escritorio);
    if (nome) {
      const yNome = pdf.page.height - 52;
      const xNome = MARGEM_ESQUERDA + (larguraUtil - pdf.widthOfString(nome)) / 2;
      pdf.text(nome, xNome, yNome, { lineBreak: false });
    }
    const texto = `Página ${numeroPagina}`;
    const yRodape = pdf.page.height - 38;
    const xCentro = MARGEM_ESQUERDA + (larguraUtil - pdf.widthOfString(texto)) / 2;
    pdf.text(texto, xCentro, yRodape, { lineBreak: false });
  };

  // Cabeçalho (papel timbrado): logo, nome/razão social, contato e linha.
  // Desenha a partir da posição atual e retorna a nova posição de y.
  const drawHeader = (): number => {
    const base64 = base64DeDataUri(doc.escritorio.logoUrl);
    // Guarda defensiva: imagens minúsculas (ex.: PNG 1x1) fazem o pdfkit entrar
    // em loop infinito de CPU com `fit`. Filtramos por tamanho mínimo do base64.
    if (base64 && base64.length >= 300) {
      try {
        pdf.image(Buffer.from(base64, 'base64'), { fit: [120, 60], align: 'left' } as any);
      } catch {
        // Logo inválido: ignora e segue sem quebrar o documento.
      }
    }
    const nome = nomePapelTimbrado(doc.escritorio);
    if (nome) {
      pdf.font('Helvetica-Bold').fontSize(14);
      pdf.text(nome, MARGEM_ESQUERDA, pdf.y, { width: larguraUtil, align: 'left' });
    }
    const contato = linhaDeContato(doc.escritorio);
    if (contato) {
      pdf.font('Helvetica').fontSize(8).fillColor('#7a7870');
      pdf.text(contato, MARGEM_ESQUERDA, pdf.y, { width: larguraUtil, align: 'left' });
      pdf.fillColor('black');
    }
    pdf.moveDown(0.5);
    const yLinha = pdf.y;
    pdf.moveTo(MARGEM_ESQUERDA, yLinha).lineTo(larguraPagina - MARGEM_DIREITA, yLinha).stroke();
    pdf.moveDown(0.8);
    return pdf.y;
  };

  // Páginas novas (quebra automática): redesenha o cabeçalho no topo e o
  // rodapé no final. Em pageAdded o pdfkit já resetou x/y para as margens.
  pdf.on('pageAdded', () => {
    numeroPagina += 1;
    const estado = capturarFonte();
    const yAposHeader = drawHeader();
    desenharRodape();
    // Restaura a fonte que o corpo usava antes da quebra — evita o texto
    // encolhido (Helvetica 8pt) na continuação de um parágrafo.
    restaurarFonte(estado);
    // O corpo continua logo abaixo do cabeçalho (pageAdded não resetou y de novo).
    pdf.y = yAposHeader;
  });

  // Página 1: o cabeçalho é desenhado manualmente (pageAdded não dispara para
  // a primeira página, criada no construtor antes dos listeners), junto com o
  // rodapé correspondente antes do conteúdo.
  const estadoInicial = capturarFonte();
  const yInicioPagina1 = drawHeader();
  desenharRodape();
  restaurarFonte(estadoInicial);
  pdf.y = yInicioPagina1;

  // Título da peça
  nomeFonteCorpo = 'Times-Bold';
  tamanhoFonteCorpo = 12;
  corFonteCorpo = 'black';
  pdf.font('Times-Bold').fontSize(12);
  pdf.text(doc.titulo, MARGEM_ESQUERDA, pdf.y, { width: larguraUtil, align: 'center' });
  pdf.moveDown(0.8);

  // Corpo (blocos ricos)
  for (const bloco of doc.blocos) {
    const runs = bloco.runs.length > 0 ? bloco.runs : [{ text: '' }];

    if (bloco.type === 'heading') {
      pdf.moveDown(0.5);
      const tamanho = bloco.level === 1 ? 16 : bloco.level === 2 ? 14 : 13;
      nomeFonteCorpo = 'Times-Bold';
      runs.forEach((run, idx) => {
        const isLast = idx === runs.length - 1;
        tamanhoFonteCorpo = run.size ?? tamanho;
        corFonteCorpo = 'black';
        pdf.font('Times-Bold').fontSize(run.size ?? tamanho);
        pdf.text(run.text, MARGEM_ESQUERDA, pdf.y, {
          continued: !isLast,
          underline: run.underline,
          width: larguraUtil,
          ...(bloco.align ? { align: bloco.align } : {}),
        });
      });
    } else if (bloco.type === 'listItem') {
      const prefixo = bloco.ordered ? `${bloco.index ?? 1}. ` : '• ';
      nomeFonteCorpo = 'Times-Roman';
      tamanhoFonteCorpo = 12;
      pdf.font('Times-Roman').fontSize(12);
      pdf.text(prefixo, MARGEM_ESQUERDA, pdf.y, { continued: true, width: larguraUtil });
      runs.forEach((run, idx) => {
        const isLast = idx === runs.length - 1;
        nomeFonteCorpo = fonteRica(run);
        tamanhoFonteCorpo = run.size ?? 12;
        pdf.font(fonteRica(run)).fontSize(run.size ?? 12);
        pdf.text(run.text, MARGEM_ESQUERDA, pdf.y, {
          continued: !isLast,
          underline: run.underline,
          lineGap: 6,
          width: larguraUtil,
          indent: isLast ? 18 : undefined,
          ...(bloco.align ? { align: bloco.align } : {}),
        });
      });
    } else {
      // paragraph (justificado por padrão — padrão forense)
      const alinhamento = bloco.align ?? 'justify';
      runs.forEach((run, idx) => {
        const isLast = idx === runs.length - 1;
        nomeFonteCorpo = fonteRica(run);
        tamanhoFonteCorpo = run.size ?? 12;
        corFonteCorpo = 'black';
        pdf.font(fonteRica(run)).fontSize(run.size ?? 12);
        pdf.text(run.text, MARGEM_ESQUERDA, pdf.y, {
          continued: !isLast,
          underline: run.underline,
          lineGap: 6,
          width: larguraUtil,
          align: alinhamento,
        });
      });
    }

    pdf.moveDown(0.3);
  }

  // Assinatura (alinhada à direita)
  pdf.moveDown(2);
  pdf.font('Times-Roman').fontSize(12);
  const assinatura = [
    doc.dataLocal,
    '_____________________________',
    doc.advogadoNome,
    doc.advogadoOab,
  ].filter(Boolean);
  for (const linha of assinatura) {
    pdf.text(linha, MARGEM_ESQUERDA, undefined, { width: larguraUtil, align: 'right' });
  }

  pdf.end();
  return await done;
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------
function tipoImagemDaUrl(logoUrl: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  const m = logoUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
  if (m) {
    const tipo = m[1].toLowerCase();
    if (tipo === 'jpeg' || tipo === 'jpg') return 'jpg';
    if (tipo === 'png') return 'png';
    if (tipo === 'gif') return 'gif';
    if (tipo === 'bmp') return 'bmp';
  }
  return 'png';
}

export async function renderDocx(doc: PecaDocumento): Promise<Buffer> {
  const headerChildren: Paragraph[] = [];

  const base64 = base64DeDataUri(doc.escritorio.logoUrl);
  if (base64) {
    try {
      headerChildren.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: tipoImagemDaUrl(doc.escritorio.logoUrl as string),
              data: base64,
              transformation: { width: 120, height: 60 },
            }),
          ],
        })
      );
    } catch {
      // Logo inválido: ignora e segue sem quebrar o documento.
    }
  }

  const nome = nomePapelTimbrado(doc.escritorio);
  if (nome) {
    headerChildren.push(
      new Paragraph({ children: [new TextRun({ text: nome, bold: true })] })
    );
  }
  const contato = linhaDeContato(doc.escritorio);
  if (contato) {
    headerChildren.push(
      new Paragraph({ children: [new TextRun({ text: contato, size: 16 })] })
    );
  }

  const header = new Header({ children: headerChildren });
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${nomePapelTimbrado(doc.escritorio)}  ·  `, size: 16 }),
          new TextRun({ children: ['Página ', PageNumber.CURRENT], size: 16 }),
        ],
      }),
    ],
  });

  const children: Paragraph[] = [];

  // Título
  children.push(
    new Paragraph({
      children: [new TextRun({ text: doc.titulo, bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Numeração real (apenas se houver ao menos uma lista ordenada)
  const temListaNumerada = doc.blocos.some((b) => b.type === 'listItem' && b.ordered);
  const configNumbering = temListaNumerada
    ? {
        config: [
          {
            reference: 'lista-numerada',
            levels: [
              {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: '%1.',
                alignment: AlignmentType.START,
                style: {
                  paragraph: {
                    indent: {
                      left: convertInchesToTwip(0.5),
                      hanging: convertInchesToTwip(0.25),
                    },
                  },
                },
              },
            ],
          },
        ],
      }
    : undefined;

  // Corpo (blocos ricos)
  let instanciaLista = 0;
  let listaOrdenadaAtiva = false;
  for (const bloco of doc.blocos) {
    if (bloco.type === 'heading') {
      listaOrdenadaAtiva = false;
      children.push(
        new Paragraph({
          heading: headingDeNivel(bloco.level ?? 1),
          alignment: mapAlign(bloco.align),
          children: textRunsDoBloco(bloco.runs),
        })
      );
    } else if (bloco.type === 'listItem') {
      if (bloco.ordered) {
        if (!listaOrdenadaAtiva) {
          instanciaLista += 1;
          listaOrdenadaAtiva = true;
        }
        children.push(
          new Paragraph({
            numbering: { reference: 'lista-numerada', level: 0, instance: instanciaLista },
            children: textRunsDoBloco(bloco.runs),
            spacing: { after: 80 },
          })
        );
      } else {
        listaOrdenadaAtiva = false;
        children.push(
          new Paragraph({
            bullet: { level: bloco.level ?? 0 },
            children: textRunsDoBloco(bloco.runs),
            spacing: { after: 80 },
          })
        );
      }
    } else {
      // paragraph (justificado por padrão, com recuo de primeira linha)
      listaOrdenadaAtiva = false;
      children.push(
        new Paragraph({
          alignment: mapAlign(bloco.align ?? 'justify'),
          indent: { firstLine: convertInchesToTwip(0.5) },
          children: textRunsDoBloco(bloco.runs),
          spacing: { after: 200, line: 360 },
        })
      );
    }
  }

  // Assinatura (alinhada à direita)
  children.push(new Paragraph({ spacing: { after: 400 } }));
  const assinatura = [
    doc.dataLocal,
    '_____________________________',
    doc.advogadoNome,
    doc.advogadoOab,
  ].filter(Boolean);
  for (const linha of assinatura) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: linha })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 80 },
      })
    );
  }

  const documento = new Document({
    numbering: configNumbering,
    sections: [
      {
        properties: {},
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });

  return await Packer.toBuffer(documento);
}
