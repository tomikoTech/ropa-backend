/**
 * Dibujo del PDF de etiquetas, **puro** (sin base de datos): recibe las
 * etiquetas ya armadas y el tamaño, y devuelve el PDF. Está aparte de
 * `labels.service` para poder generarlo en una prueba y verificar de verdad lo
 * que sale a la impresora —fue justo lo que faltó: las pruebas miraban otro
 * camino y el cliente imprimió algo cortado—.
 */
import PDFDocument from 'pdfkit';
import { code128Widths } from './code128.js';
import { computeLabelLayout } from './label-layout.js';
import type { LabelData } from './zpl.util.js';

export interface PdfLabelOptions {
  widthMm?: number;
  heightMm?: number;
  /** Logo ya convertido a PNG (o null). */
  logoPng?: Buffer | null;
}

/**
 * Tamaños por defecto **adivinados** de las fotos del cliente / demachine,
 * cuando no se fuerza uno: la CAJA sale más cuadrada y el PAR más alargado.
 * (No sabemos la medida exacta del rollo; el operario puede forzar otra con el
 * selector.)
 */
const DEFAULT_CAJA = { widthMm: 50, heightMm: 40 };
const DEFAULT_PAR = { widthMm: 58, heightMm: 30 };

export function buildLabelsPdf(
  labels: LabelData[],
  options: PdfLabelOptions = {},
): Promise<Buffer> {
  const logo = options.logoPng ?? null;
  // Si el operario forzó un tamaño (selector), ese manda para todas. Si no, se
  // decide por página según sea caja o par.
  const forzado =
    options.widthMm != null && options.heightMm != null
      ? { widthMm: options.widthMm, heightMm: options.heightMm }
      : null;
  const tamDe = (label: LabelData) =>
    forzado ?? (label.isBox ? DEFAULT_CAJA : DEFAULT_PAR);

  const mm = (v: number) => (v * 72) / 25.4; // milímetros a puntos PDF

  const doc = new PDFDocument({
    size: [mm(DEFAULT_CAJA.widthMm), mm(DEFAULT_CAJA.heightMm)],
    margin: 0,
    autoFirstPage: false,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const drawBarcode = (code: string, x: number, y: number, w: number, h: number) => {
    const widths = code128Widths(code);
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const unit = w / total;
    let cursor = x;
    doc.fillColor('#000');
    widths.forEach((moduleWidth, i) => {
      const bw = moduleWidth * unit;
      if (i % 2 === 0) doc.rect(cursor, y, bw, h).fill('#000');
      cursor += bw;
    });
  };

  // Fuente en puntos para que el alto de mayúscula sea ~fontMm (Helvetica
  // cap-height ~0.72 em).
  const fontPt = (fontMm: number) => mm(fontMm / 0.72);

  for (const label of labels) {
    const { widthMm, heightMm } = tamDe(label);
    doc.addPage({ size: [mm(widthMm), mm(heightMm)], margin: 0 });

    const lay = computeLabelLayout({
      widthMm,
      heightMm,
      isBox: !!label.isBox,
      hasLogo: !!logo,
    });

    const escribir = (
      text: string,
      caja: { xMm: number; yMm: number; wMm: number; hMm: number; fontMm: number },
      opts: { font?: string; color?: string; align?: 'center' | 'left'; fontMm?: number } = {},
    ) => {
      if (!text) return;
      const pedido = fontPt(opts.fontMm ?? caja.fontMm);
      const disponible = mm(caja.wMm);
      doc.font(opts.font ?? 'Helvetica').fontSize(pedido);
      // **Encoger antes que cortar.** El alto de la fila propone un tamaño; si
      // el texto no cabe a lo ancho, se baja hasta que quepa. Cortar dejaba
      // «PROMO WI…» en la caja y un nombre de producto a la mitad: se lee mejor
      // entero y pequeño que la mitad grande. El mínimo es lo que una térmica
      // todavía imprime legible; por debajo de eso sí se corta.
      const ancho = doc.widthOfString(text);
      const size =
        ancho > disponible && ancho > 0
          ? Math.max(fontPt(1.4), (pedido * disponible) / ancho)
          : pedido;
      const boxH = mm(caja.hMm);
      const yTop = mm(caja.yMm) + Math.max(0, (boxH - size) / 2);
      doc
        .fontSize(size)
        .fillColor(opts.color ?? '#000')
        .text(text, mm(caja.xMm), yTop, {
          width: mm(caja.wMm),
          align: opts.align ?? 'left',
          height: size * 1.2,
          lineBreak: false,
          ellipsis: true,
        });
    };

    // Marco: aleja el contenido del borde (la térmica no imprime el primer/
    // último milímetro) — era lo que cortaba la parte de arriba.
    doc
      .lineWidth(mm(0.35))
      .strokeColor('#000')
      .rect(mm(lay.marco.xMm), mm(lay.marco.yMm), mm(lay.marco.wMm), mm(lay.marco.hMm))
      .stroke();

    if (logo && lay.logo) {
      try {
        doc.image(logo, mm(lay.logo.xMm), mm(lay.logo.yMm), {
          fit: [mm(lay.logo.wMm), mm(lay.logo.hMm)],
        });
      } catch {
        /* un logo corrupto no debe impedir imprimir */
      }
    }

    escribir(label.productName, lay.nombre, { font: 'Helvetica-Bold' });
    const head2 = [label.brand, label.reference && `Ref ${label.reference}`]
      .filter(Boolean)
      .join('  ·  ');
    escribir(head2, lay.marca, { color: '#444' });

    drawBarcode(
      label.barcode,
      mm(lay.barcode.xMm),
      mm(lay.barcode.yMm),
      mm(lay.barcode.wMm),
      mm(lay.barcode.hMm),
    );
    escribir(label.barcode, lay.digitos, { align: 'center' });

    // Destacado: par → talla GRANDE; caja → "CAJA x24".
    if (label.isBox) {
      escribir(label.highlight ?? '', lay.destacado, { font: 'Helvetica-Bold', align: 'center' });
    } else {
      const talla = label.size ? `TALLA ${label.size}` : (label.highlight ?? '');
      escribir(talla, lay.destacado, { font: 'Helvetica-Bold', align: 'center' });
    }

    const detalles = [label.detail, label.desglose, label.price]
      .filter(Boolean)
      .join('  ·  ');
    escribir(detalles, lay.pie, { color: '#333', align: 'center' });

    doc.fillColor('#000');
  }

  doc.end();
  return done;
}
