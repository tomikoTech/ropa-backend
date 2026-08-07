import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { StockUnit, StockUnitKind } from '../entities/stock-unit.entity.js';
import { buildLabelBatchZpl, LabelData, ZplOptions } from './zpl.util.js';

@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
  ) {}

  /**
   * Convierte los bultos en datos de etiqueta.
   *
   * Una caja se rotula con lo que contiene ("CAJA x24") porque es lo que el
   * bodeguero necesita leer sin abrirla; una unidad, con su talla.
   */
  private async toLabels(
    ids: string[],
    tenantId: string,
  ): Promise<LabelData[]> {
    const units = await this.unitRepo.find({
      where: { id: In(ids), tenantId },
      relations: { product: true, color: true, size: true },
    });
    if (units.length === 0) {
      throw new NotFoundException('No se encontraron bultos para etiquetar');
    }

    // Se respeta el orden en que se pidieron: es el orden en que salen del
    // rollo y en que el operario las va pegando.
    const byId = new Map(units.map((u) => [u.id, u]));
    return ids
      .map((id) => byId.get(id))
      .filter((u): u is StockUnit => !!u)
      .map((u) => {
        const detail = [u.color?.name, u.size?.name && `Talla ${u.size.name}`]
          .filter(Boolean)
          .join(' · ');
        return {
          barcode: u.barcode,
          productName: u.product?.name ?? 'Producto',
          detail: detail || undefined,
          highlight:
            u.kind === StockUnitKind.BOX ? `CAJA x${u.quantity}` : undefined,
        };
      });
  }

  async buildZpl(
    ids: string[],
    tenantId: string,
    options?: ZplOptions,
  ): Promise<string> {
    return buildLabelBatchZpl(await this.toLabels(ids, tenantId), options);
  }

  /**
   * Mismas etiquetas en PDF, para imprimir desde el navegador o el celular a
   * cualquier impresora. Una etiqueta por página, del tamaño del rollo.
   */
  async buildPdf(
    ids: string[],
    tenantId: string,
    options?: { widthMm?: number; heightMm?: number },
  ): Promise<Buffer> {
    const labels = await this.toLabels(ids, tenantId);
    const mm = (v: number) => (v * 72) / 25.4; // milímetros a puntos PDF
    const width = mm(options?.widthMm ?? 50);
    const height = mm(options?.heightMm ?? 25);

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

    const pad = mm(2);
    for (const label of labels) {
      doc.addPage({ size: [width, height], margin: 0 });
      doc.fontSize(7).text(label.productName, pad, pad, {
        width: width - pad * 2,
        height: mm(4),
        ellipsis: true,
      });
      if (label.detail) {
        doc
          .fontSize(6)
          .fillColor('#444')
          .text(label.detail, pad, pad + mm(4), {
            width: width - pad * 2,
            ellipsis: true,
          });
      }
      if (label.highlight) {
        doc
          .fontSize(8)
          .fillColor('#000')
          .text(label.highlight, pad, pad + mm(7.5), {
            width: width - pad * 2,
            ellipsis: true,
          });
      }
      // El código en texto: si el símbolo se raya o no lee, el operario
      // todavía puede teclearlo.
      doc
        .fontSize(7)
        .fillColor('#000')
        .text(label.barcode, pad, height - pad - mm(3), {
          width: width - pad * 2,
          align: 'center',
        });
      doc.fillColor('#000');
    }

    doc.end();
    return done;
  }
}
