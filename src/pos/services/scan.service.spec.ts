import { ScanService } from './scan.service.js';
import {
  StockUnitKind,
  StockUnitStatus,
} from '../../inventory/entities/stock-unit.entity.js';

describe('ScanService', () => {
  it('does not expose pairs inside closed mixed boxes as loose size stock', async () => {
    const variantRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'variant-40',
        productId: 'product-1',
        sku: 'AMA-40',
        sizeName: '40',
        colorName: 'Blanco',
        product: { name: 'AMA 15', basePrice: 100000, taxRate: 19 },
      }),
    };
    const unitRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([
        {
          variantId: 'variant-40',
          warehouseId: 'warehouse-1',
          kind: StockUnitKind.BOX,
          status: StockUnitStatus.IN_STOCK,
          quantity: 24,
        },
      ]),
    };
    const stockRepo = {
      find: jest.fn().mockResolvedValue([
        { variantId: 'variant-40', warehouseId: 'warehouse-1', quantity: 126 },
      ]),
    };
    const boxLineRepo = { findOne: jest.fn() };
    const contentRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new ScanService(
      variantRepo as any,
      unitRepo as any,
      stockRepo as any,
      boxLineRepo as any,
      contentRepo as any,
    );

    const result = await service.resolve('AMA-40', 'tenant-1');

    expect(result.available).toBe(102);
    expect(result.warehouseId).toBe('warehouse-1');
  });
});

/**
 * Vender una caja no es vender un par veinticuatro veces: es una venta al por
 * mayor y hay que decir qué trae. Antes se cobraba a precio de mostrador y la
 * línea se guardaba con la talla de la variante equivalente.
 */
describe('ScanService — precio y contenido de una caja', () => {
  const armar = (
    unit: Record<string, unknown>,
    opciones: {
      purchaseLine?: { salePrice: number } | null;
      contents?: { size: { name: string }; actualQuantity: number }[];
    } = {},
  ) => {
    const unitRepo = { findOne: jest.fn().mockResolvedValue(unit), find: jest.fn() };
    const variantRepo = { findOne: jest.fn() };
    const stockRepo = { find: jest.fn().mockResolvedValue([]) };
    const boxLineRepo = {
      findOne: jest.fn().mockResolvedValue(opciones.purchaseLine ?? null),
    };
    const contentRepo = {
      find: jest.fn().mockResolvedValue(opciones.contents ?? []),
    };
    return new ScanService(
      variantRepo as any,
      unitRepo as any,
      stockRepo as any,
      boxLineRepo as any,
      contentRepo as any,
    );
  };

  const caja = {
    id: 'unit-1',
    barcode: '2608190000010011',
    kind: StockUnitKind.BOX,
    status: StockUnitStatus.IN_STOCK,
    quantity: 24,
    productId: 'product-1',
    variantId: 'variant-36',
    warehouseId: 'warehouse-1',
    purchaseBoxLineId: 'line-1',
    variant: { id: 'variant-36', sku: 'REF-36' },
    product: {
      name: 'Tenis Runner',
      basePrice: 100000,
      wholesalePrice: 70000,
      taxRate: 19,
    },
  };

  it('cobra la caja al por mayor: son veinticuatro pares de un golpe', async () => {
    const service = armar(caja, { purchaseLine: { salePrice: 90000 } });
    const result = await service.resolve('2608190000010011', 'tenant-1');

    expect(result.priceSource).toBe('WHOLESALE');
    expect(result.unitPrice).toBe(70000);
    // Y el total de la línea es el precio por par por lo que trae la caja.
    expect(result.suggestedPrice).toBe(70000 * 24);
  });

  it('sin precio al por mayor manda el de la compra, y luego el de lista', async () => {
    const sinMayorista = {
      ...caja,
      product: { ...caja.product, wholesalePrice: null },
    };
    const conCompra = armar(sinMayorista, {
      purchaseLine: { salePrice: 90000 },
    });
    const r1 = await conCompra.resolve('2608190000010011', 'tenant-1');
    expect(r1.priceSource).toBe('PURCHASE');
    expect(r1.suggestedPrice).toBe(90000 * 24);

    const sinCompra = armar({ ...sinMayorista, purchaseBoxLineId: null });
    const r2 = await sinCompra.resolve('2608190000010011', 'tenant-1');
    expect(r2.priceSource).toBe('BASE');
    expect(r2.suggestedPrice).toBe(100000 * 24);
  });

  it('un par suelto se cobra al detal aunque el producto tenga precio mayorista', async () => {
    // El mayoreo es por vender la caja completa, no por el producto.
    const par = {
      ...caja,
      kind: StockUnitKind.UNIT,
      quantity: 1,
      purchaseBoxLineId: null,
    };
    const service = armar(par);
    const result = await service.resolve('2608190000010011', 'tenant-1');
    expect(result.priceSource).toBe('BASE');
    expect(result.unitPrice).toBe(100000);
  });

  it('dice qué tallas trae la caja, ordenadas como las lee una persona', async () => {
    const service = armar(caja, {
      contents: [
        { size: { name: '38' }, actualQuantity: 6 },
        { size: { name: '9' }, actualQuantity: 6 },
        { size: { name: '36' }, actualQuantity: 6 },
        { size: { name: '37' }, actualQuantity: 0 },
      ],
    });
    const result = await service.resolve('2608190000010011', 'tenant-1');

    // Orden numérico: '9' antes de '36' si se ordena como texto.
    expect(result.contents).toEqual([
      { size: '9', quantity: 6 },
      { size: '36', quantity: 6 },
      { size: '38', quantity: 6 },
    ]);
  });

  it('un par no arrastra el surtido de ninguna caja', async () => {
    const service = armar(
      { ...caja, kind: StockUnitKind.UNIT, quantity: 1 },
      { contents: [{ size: { name: '36' }, actualQuantity: 6 }] },
    );
    const result = await service.resolve('2608190000010011', 'tenant-1');
    expect(result.contents).toEqual([]);
  });
});
