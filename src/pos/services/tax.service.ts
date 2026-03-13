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
   * Calculate line item totals with IVA included in the price.
   * Colombian pricing: prices shown are IVA-included.
   * We extract the tax from the total price.
   */
  calculateLine(
    unitPrice: number,
    quantity: number,
    discountPercent: number,
    taxRate: number,
  ): LineCalculation {
    const subtotalBeforeDiscount = unitPrice * quantity;
    const discountAmount = subtotalBeforeDiscount * (discountPercent / 100);
    const totalAfterDiscount = subtotalBeforeDiscount - discountAmount;

    // IVA included: extract tax from the final price
    // Total = Base + Base * taxRate/100 = Base * (1 + taxRate/100)
    // Base = Total / (1 + taxRate/100)
    const taxableBase = totalAfterDiscount / (1 + taxRate / 100);
    const taxAmount = totalAfterDiscount - taxableBase;

    return {
      unitPrice,
      quantity,
      discountPercent,
      taxRate,
      subtotalBeforeDiscount: this.round(subtotalBeforeDiscount),
      discountAmount: this.round(discountAmount),
      taxableBase: this.round(taxableBase),
      taxAmount: this.round(taxAmount),
      lineTotal: this.round(totalAfterDiscount),
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
