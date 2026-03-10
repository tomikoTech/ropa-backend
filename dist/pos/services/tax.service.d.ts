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
export declare class TaxService {
    calculateLine(unitPrice: number, quantity: number, discountPercent: number, taxRate: number): LineCalculation;
    calculateSaleTotals(lines: LineCalculation[]): TaxCalculation;
    private round;
}
