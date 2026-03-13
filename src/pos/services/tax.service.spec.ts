import { TaxService } from './tax.service.js';

describe('TaxService', () => {
  let service: TaxService;

  beforeEach(() => {
    service = new TaxService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateLine', () => {
    it('should calculate line with no discount', () => {
      // Price: 119000, Qty: 1, Discount: 0%, Tax: 19%
      const result = service.calculateLine(119000, 1, 0, 19);

      expect(result.unitPrice).toBe(119000);
      expect(result.quantity).toBe(1);
      expect(result.discountPercent).toBe(0);
      expect(result.taxRate).toBe(19);
      expect(result.subtotalBeforeDiscount).toBe(119000);
      expect(result.discountAmount).toBe(0);
      // IVA included: base = 119000 / 1.19 = 100000
      expect(result.taxableBase).toBe(100000);
      // Tax = 119000 - 100000 = 19000
      expect(result.taxAmount).toBe(19000);
      expect(result.lineTotal).toBe(119000);
    });

    it('should calculate line with percentage discount', () => {
      // Price: 119000, Qty: 2, Discount: 10%, Tax: 19%
      const result = service.calculateLine(119000, 2, 10, 19);

      // subtotal = 119000 * 2 = 238000
      expect(result.subtotalBeforeDiscount).toBe(238000);
      // discount = 238000 * 0.10 = 23800
      expect(result.discountAmount).toBe(23800);
      // totalAfterDiscount = 238000 - 23800 = 214200
      expect(result.lineTotal).toBe(214200);
      // base = 214200 / 1.19 = 180000
      expect(result.taxableBase).toBe(180000);
      // tax = 214200 - 180000 = 34200
      expect(result.taxAmount).toBe(34200);
    });

    it('should handle zero quantity', () => {
      const result = service.calculateLine(50000, 0, 0, 19);

      expect(result.subtotalBeforeDiscount).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.taxableBase).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.lineTotal).toBe(0);
    });
  });

  describe('calculateSaleTotals', () => {
    it('should aggregate totals from multiple line items', () => {
      const line1 = service.calculateLine(119000, 1, 0, 19);
      const line2 = service.calculateLine(59500, 2, 10, 19);

      const result = service.calculateSaleTotals([line1, line2]);

      // line1: subtotal=119000, discount=0, lineTotal=119000, tax=19000
      // line2: subtotal=119000, discount=11900, lineTotal=107100
      //   base2=107100/1.19=90000, tax2=17100
      expect(result.subtotal).toBe(119000 + 119000);
      expect(result.discountAmount).toBe(0 + 11900);
      expect(result.taxAmount).toBe(19000 + 17100);
      expect(result.total).toBe(119000 + 107100);
      // taxableBase = subtotal - discountAmount - taxAmount
      expect(result.taxableBase).toBe(
        result.subtotal - result.discountAmount - result.taxAmount,
      );
    });

    it('should handle empty lines array', () => {
      const result = service.calculateSaleTotals([]);

      expect(result.subtotal).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.taxableBase).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});
