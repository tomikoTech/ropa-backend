import { Injectable } from '@nestjs/common';

export interface TaxCalculation {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
}

export interface LineCalculation {
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxRate: number;
  subtotalBeforeDiscount: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  lineTotal: number;
}

@Injectable()
export class TaxService {
  /**
   * Calculate line item totals.
   *  - mode 'included' (default): el precio ya incluye IVA, se extrae del total
   *    (el total no cambia). Precios colombianos típicos.
   *  - mode 'added': el IVA se suma sobre el precio (total = base + IVA).
   */
  calculateLine(
    unitPrice: number,
    quantity: number,
    discountPercent: number,
    taxRate: number,
    mode: 'included' | 'added' = 'included',
  ): LineCalculation {
    const subtotalBeforeDiscount = unitPrice * quantity;
    const discountAmount = subtotalBeforeDiscount * (discountPercent / 100);
    const priceAfterDiscount = subtotalBeforeDiscount - discountAmount;

    let taxableBase: number;
    let taxAmount: number;
    let lineTotal: number;
    if (mode === 'added') {
      // El precio es la base; el IVA se suma encima.
      taxableBase = priceAfterDiscount;
      taxAmount = priceAfterDiscount * (taxRate / 100);
      lineTotal = priceAfterDiscount + taxAmount;
    } else {
      // IVA incluido: se extrae del precio final (el total no cambia).
      taxableBase = priceAfterDiscount / (1 + taxRate / 100);
      taxAmount = priceAfterDiscount - taxableBase;
      lineTotal = priceAfterDiscount;
    }

    return {
      unitPrice,
      quantity,
      discountPercent,
      taxRate,
      subtotalBeforeDiscount: this.round(subtotalBeforeDiscount),
      discountAmount: this.round(discountAmount),
      taxableBase: this.round(taxableBase),
      taxAmount: this.round(taxAmount),
      lineTotal: this.round(lineTotal),
    };
  }

  /**
   * Aggregate all line calculations into a sale-level total.
   */
  calculateSaleTotals(lines: LineCalculation[]): TaxCalculation {
    const subtotal = lines.reduce(
      (sum, l) => sum + l.subtotalBeforeDiscount,
      0,
    );
    const discountAmount = lines.reduce((sum, l) => sum + l.discountAmount, 0);
    const taxAmount = lines.reduce((sum, l) => sum + l.taxAmount, 0);
    const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);

    return {
      subtotal: this.round(subtotal),
      discountAmount: this.round(discountAmount),
      taxableBase: this.round(subtotal - discountAmount - taxAmount),
      taxAmount: this.round(taxAmount),
      total: this.round(total),
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
