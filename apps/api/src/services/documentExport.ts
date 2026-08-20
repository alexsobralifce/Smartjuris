/**
 * Renderização de peças jurídicas em PDF (pdfkit) e DOCX (docx) com papel
 * timbrado do escritório. As funções sempre retornam um Buffer não-vazio e
 * nunca lançam exceção por causa de logo inválido (imagem é ignorada).
 */
import PDFDocument from 'pdfkit';
import {
  Document,
  Paragraph,
  TextRun,
  Header,
  Footer,
  Packer,
  AlignmentType,
  PageNumber,
  ImageRun,
  HeadingLevel,
  TabStopType,
} from 'docx';
import type { EscritorioIdentity, PecaDocumento } from './letterhead.js';

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

/** Nome exibido no cabeçalho: razão social (ou e-mail como fallback). */
function nomePapelTimbrado(esc: EscritorioIdentity): string {
  return limpar(esc.razaoSocial) || limpar(esc.email);
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

  // Número de página centralizado no rodapé (coordenadas explícitas).
  // Usa lineBreak:false e centragem manual para não disparar quebra de página:
  // desenhar com width ativaria o LineWrapper, que cria página nova quando
  // y > page.maxY() (o rodapé fica dentro da margem inferior, além do maxY).
  const desenharRodape = () => {
    if (numeroPagina <= 0) return;
    const texto = `Página ${numeroPagina}`;
    const yRodape = pdf.page.height - 40;
    pdf.font('Helvetica').fontSize(8).fillColor('#7a7870');
    const xCentro = MARGEM_ESQUERDA + (larguraUtil - pdf.widthOfString(texto)) / 2;
    pdf.text(texto, xCentro, yRodape, { lineBreak: false });
    pdf.fillColor('black');
  };

  // Cabeçalho (papel timbrado): logo, nome/razão social, contato e linha.
  // Desenha a partir da posição atual e retorna a nova posição de y.
  const drawHeader = (): number => {
    const base64 = base64DeDataUri(doc.escritorio.logoUrl);
    if (base64) {
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
    const yAposHeader = drawHeader();
    desenharRodape();
    // O corpo continua logo abaixo do cabeçalho (pageAdded não resetou y de novo).
    pdf.y = yAposHeader;
  });

  // Página 1: o cabeçalho é desenhado manualmente (pageAdded não dispara para
  // a primeira página, criada no construtor antes dos listeners), junto com o
  // rodapé correspondente antes do conteúdo.
  const yInicioPagina1 = drawHeader();
  desenharRodape();
  pdf.y = yInicioPagina1;

  // Título da peça
  pdf.font('Times-Bold').fontSize(12);
  pdf.text(doc.titulo, MARGEM_ESQUERDA, pdf.y, { width: larguraUtil, align: 'center' });
  pdf.moveDown(0.8);

  // Endereçamento (negrito, caixa alta)
  if (doc.enderecamento) {
    pdf.font('Times-Bold').fontSize(12);
    pdf.text(doc.enderecamento.toUpperCase(), MARGEM_ESQUERDA, pdf.y, {
      width: larguraUtil,
      align: 'justify',
      lineGap: 6,
    });
    pdf.moveDown(0.6);
  }

  // Corpo
  pdf.font('Times-Roman').fontSize(12);
  for (const paragrafo of doc.corpo) {
    pdf.text(paragrafo, MARGEM_ESQUERDA, pdf.y, {
      width: larguraUtil,
      align: 'justify',
      lineGap: 6,
    });
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
        children: [new TextRun({ children: ['Página ', PageNumber.CURRENT] })],
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

  // Endereçamento (negrito, caixa alta)
  if (doc.enderecamento) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.enderecamento.toUpperCase(), bold: true })],
        spacing: { after: 200 },
      })
    );
  }

  // Corpo
  for (const paragrafo of doc.corpo) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: paragrafo })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 360 },
      })
    );
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
