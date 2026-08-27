import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { StockUnit, StockUnitKind } from '../entities/stock-unit.entity.js';
import { buildLabelBatchZpl, LabelData, ZplOptions } from './zpl.util.js';
import { code128Widths } from './code128.js';
import { parseStockBarcode } from '../barcode.util.js';
import { StoreSettings } from '../../storefront/entities/store-settings.entity.js';

/** Precio en pesos colombianos, sin decimales y con punto de miles. */
function formatCOP(value: number): string {
  return '$' + Math.round(value).toLocaleString('es-CO');
}

/**
 * Desglose legible del código de barras del bulto: la misma fecha·pedido·bulto
 * que el operario ve en pantalla, ahora también impresa. Devuelve `undefined`
 * para códigos que no siguen el formato (importados, viejos), en cuyo caso la
 * etiqueta simplemente no lo muestra.
 */
function desgloseDelCodigo(barcode: string): string | undefined {
  const p = parseStockBarcode(barcode);
  if (!p) return undefined;
  const dd = String(p.day).padStart(2, '0');
  const mm = String(p.month).padStart(2, '0');
  const aa = String(p.year % 100).padStart(2, '0');
  return `${dd}/${mm}/${aa} · Pedido ${p.orderSequence} · N.º ${p.unitSequence}`;
}

@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
  ) {}

  /**
   * Convierte los bultos en datos de etiqueta.
   *
   * Una caja se rotula con lo que contiene ("CAJA x24") porque es lo que el
   * bodeguero necesita leer sin abrirla; una unidad, con su talla. En ambos
   * casos se imprime la mayor cantidad de información: marca, referencia y el
   * desglose del código.
   */
  private async loadContext(
    ids: string[],
    tenantId: string,
  ): Promise<{ labels: LabelData[]; settings: StoreSettings | null }> {
    const units = await this.unitRepo.find({
      where: { id: In(ids), tenantId },
      relations: { product: true, color: true, size: true },
    });
    if (units.length === 0) {
      throw new NotFoundException(
        'No se encontraron cajas ni pares para etiquetar',
      );
    }
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    const showSequence = !!settings?.showBoxPairSequenceOnLabels;
    const showPrice = !!settings?.labelShowPrice;
    const extra = settings?.labelExtraText?.trim() || undefined;

    // Se respeta el orden en que se pidieron: es el orden en que salen del
    // rollo y en que el operario las va pegando.
    const byId = new Map(units.map((u) => [u.id, u]));
    const labels = ids
      .map((id) => byId.get(id))
      .filter((u): u is StockUnit => !!u)
      .map((u) => {
        const detail = [u.color?.name, u.size?.name && `Talla ${u.size.name}`]
          .filter(Boolean)
          .join(' · ');
        const sequenceLabel =
          showSequence && u.boxSequence
            ? u.kind === StockUnitKind.BOX
              ? `CAJA ${u.boxSequence}`
              : `CAJA ${u.boxSequence} · PAR ${String(u.pairSequence ?? 0).padStart(2, '0')}`
            : undefined;
        const isBox = u.kind === StockUnitKind.BOX;
        const price =
          showPrice && u.product?.basePrice
            ? formatCOP(Number(u.product.basePrice))
            : undefined;
        return {
          barcode: u.barcode,
          productName: u.product?.name ?? 'Producto',
          detail: detail || undefined,
          brand: u.product?.brand || undefined,
          reference: u.product?.skuPrefix || undefined,
          desglose: desgloseDelCodigo(u.barcode),
          price,
          extra,
          isBox,
          highlight: isBox
            ? sequenceLabel
              ? `${sequenceLabel} · x${u.quantity}`
              : `CAJA x${u.quantity}`
            : sequenceLabel,
        } satisfies LabelData;
      });
    return { labels, settings };
  }

  /** Descarga el logo de la tienda una vez (o null si no hay o falla). */
  private async fetchLogo(url?: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      // Sin logo la etiqueta igual sale; no vale la pena tumbar la impresión.
      return null;
    }
  }

  /** El logo como PNG con fondo blanco, listo para pdfkit. */
  private async logoPng(raw: Buffer): Promise<Buffer | null> {
    try {
      return await sharp(raw)
        .resize(300, 300, { fit: 'inside' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  /** El logo convertido a mapa de bits 1-bit para ZPL (^GFA). */
  private async logoZplBlock(
    raw: Buffer,
    xDots: number,
    yDots: number,
    widthDots: number,
  ): Promise<string | null> {
    try {
      const w = Math.max(8, Math.floor(widthDots / 8) * 8);
      const { data, info } = await sharp(raw)
        .resize({ width: w })
        .flatten({ background: '#ffffff' })
        .grayscale()
        .threshold(180)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const bytesPerRow = Math.ceil(info.width / 8);
      const totalBytes = bytesPerRow * info.height;
      let hex = '';
      for (let row = 0; row < info.height; row++) {
        for (let b = 0; b < bytesPerRow; b++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = b * 8 + bit;
            // threshold(180): el pixel quedó en 0 (negro) o 255 (blanco).
            const black =
              x < info.width && data[row * info.width + x] < 128 ? 1 : 0;
            byte = (byte << 1) | black;
          }
          hex += byte.toString(16).padStart(2, '0');
        }
      }
      return `^FO${xDots},${yDots}^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}^FS`;
    } catch {
      return null;
    }
  }

  async buildZpl(
    ids: string[],
    tenantId: string,
    options?: ZplOptions,
  ): Promise<string> {
    const { labels, settings } = await this.loadContext(ids, tenantId);
    const dpmm = options?.dpmm ?? 8;
    const raw = await this.fetchLogo(
      settings?.labelLogoUrl || settings?.logoUrl,
    );
    const logoBlock = raw
      ? await this.logoZplBlock(
          raw,
          Math.round(2 * dpmm),
          Math.round(1.5 * dpmm),
          Math.round((options?.widthMm ?? 50) * 0.18 * dpmm),
        )
      : null;
    return buildLabelBatchZpl(labels, {
      ...options,
      logoBlock: logoBlock ?? undefined,
    });
  }

  /**
   * Mismas etiquetas en PDF, para imprimir desde el navegador o el celular a
   * cualquier impresora. Una etiqueta por página, del tamaño del rollo, con el
   * logo arriba y el código de barras grande y centrado en la mitad.
   */
  async buildPdf(
    ids: string[],
    tenantId: string,
    options?: { widthMm?: number; heightMm?: number },
  ): Promise<Buffer> {
    const { labels, settings } = await this.loadContext(ids, tenantId);
    const raw = await this.fetchLogo(
      settings?.labelLogoUrl || settings?.logoUrl,
    );
    const logo = raw ? await this.logoPng(raw) : null;

    const mm = (v: number) => (v * 72) / 25.4; // milímetros a puntos PDF
    const width = mm(options?.widthMm ?? 50);
    const height = mm(options?.heightMm ?? 25);
    const pad = mm(2);

    const doc = new PDFDocument({
      size: [width, height],
      margin: 0,
      autoFirstPage: false,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const drawBarcode = (
      code: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const widths = code128Widths(code);
      const total = widths.reduce((a, b) => a + b, 0);
      const unit = w / total;
      let cursor = x;
      doc.fillColor('#000');
      widths.forEach((moduleWidth, i) => {
        const bw = moduleWidth * unit;
        if (i % 2 === 0) doc.rect(cursor, y, bw, h).fill('#000'); // par = barra
        cursor += bw;
      });
    };

    for (const label of labels) {
      doc.addPage({ size: [width, height], margin: 0 });

      // Cada texto se dibuja en **una sola línea**: `height` de la altura de esa
      // línea + `ellipsis` es lo que hace que pdfkit recorte con "…" en vez de
      // envolver a dos renglones (que se montaban unos sobre otros) o, peor,
      // pasar de página y sacar etiquetas fantasma. `w` guarda para no dibujar
      // por debajo del borde del rollo.
      const w = width - pad * 2;
      const linea = (
        text: string,
        x: number,
        y: number,
        size: number,
        opts: { font?: string; color?: string; align?: 'center'; width?: number },
      ) => {
        const h = size * 1.35; // alto aproximado de una línea
        if (y + h > height) return y; // no cabe: se omite antes que desbordar
        doc
          .fontSize(size)
          .font(opts.font ?? 'Helvetica')
          .fillColor(opts.color ?? '#000')
          .text(text, x, y, {
            width: opts.width ?? w,
            align: opts.align,
            height: h,
            lineBreak: false,
            ellipsis: true,
          });
        return y + h;
      };

      // Logo arriba a la izquierda; el texto arranca a su derecha.
      const logoSize = Math.min(mm(8), height * 0.32);
      let textX = pad;
      if (logo) {
        try {
          doc.image(logo, pad, pad, { fit: [logoSize, logoSize] });
          textX = pad + logoSize + mm(1.5);
        } catch {
          // Un logo corrupto no debe impedir imprimir.
        }
      }
      const textW = width - textX - pad;

      // Encabezado: nombre y, debajo, marca · referencia.
      linea(label.productName, textX, mm(1), 7, {
        font: 'Helvetica-Bold',
        width: textW,
      });
      const head2 = [label.brand, label.reference && `Ref ${label.reference}`]
        .filter(Boolean)
        .join('  ·  ');
      if (head2) linea(head2, textX, mm(4.6), 5.5, { color: '#444', width: textW });

      // Código de barras grande y centrado en la mitad.
      const bcY = height * 0.32;
      const bcH = height * 0.3;
      drawBarcode(label.barcode, pad, bcY, w, bcH);
      // Los dígitos debajo: si el símbolo se raya, el operario los teclea.
      linea(label.barcode, pad, bcY + bcH + mm(0.3), 6, { align: 'center' });

      // Pie: caja/par destacado, y una línea con detalle · desglose · precio.
      let footY = bcY + bcH + mm(3.2);
      if (label.highlight) {
        footY = linea(label.highlight, pad, footY, 7, {
          font: 'Helvetica-Bold',
          align: 'center',
        });
      }
      const detalles = [label.detail, label.desglose, label.price]
        .filter(Boolean)
        .join('  ·  ');
      if (detalles) {
        footY = linea(detalles, pad, footY, 5.5, {
          color: '#333',
          align: 'center',
        });
      }
      // La línea libre de la tienda solo cabe en rollos altos; en 25 mm el
      // guardado de `linea` la omite antes que empujar nada fuera de la etiqueta.
      if (label.extra) {
        linea(label.extra, pad, footY, 5, { color: '#666', align: 'center' });
      }
      doc.fillColor('#000');
    }

    doc.end();
    return done;
  }
}
