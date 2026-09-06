import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import sharp from 'sharp';
import { StockUnit, StockUnitKind } from '../entities/stock-unit.entity.js';
import { buildLabelBatchZpl, LabelData, ZplOptions } from './zpl.util.js';
import { buildLabelsPdf } from './pdf-label.js';
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
          size: u.size?.name || undefined,
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
    return buildLabelsPdf(labels, {
      widthMm: options?.widthMm,
      heightMm: options?.heightMm,
      logoPng: raw ? await this.logoPng(raw) : null,
    });
  }
}
