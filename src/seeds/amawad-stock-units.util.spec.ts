import {
  ExistingPhysicalUnit,
  LegacyPhysicalUnit,
  previewPhysicalUnitImport,
} from './amawad-stock-units.util';
import {
  StockUnitKind,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity';

const row = (
  overrides: Partial<LegacyPhysicalUnit> = {},
): LegacyPhysicalUnit => ({
  line: 2,
  barcode: '260412000500200103',
  legacy_order_id: '5',
  warehouse: 'AMAWAD',
  shelf: null,
  stand: null,
  size: '40',
  product_name: 'Zapato',
  product_code: 'CH2',
  product_source_id: 47,
  product_match_count: 1,
  product_type: 'AMAWAD 888',
  color: 'FUCSIA',
  cost: 70,
  quantity: 1,
  price: 110,
  status: 'Disponible',
  product_active: 'Activo',
  created_at: '2026-04-12 09:11:37',
  ...overrides,
});

const catalog = {
  products: [
    {
      id: 'product-1',
      sourceRef: 'demachine:amawad:47',
      name: 'Zapato',
      variants: [
        {
          id: 'variant-40',
          productId: 'product-1',
          sizeId: 'size-40',
          size: '40',
          colorId: 'color-fucsia',
          color: 'Fucsia',
        },
        {
          id: 'variant-41',
          productId: 'product-1',
          sizeId: 'size-41',
          size: '41',
          colorId: 'color-fucsia',
          color: 'FUCSIA',
        },
      ],
    },
  ],
  warehouses: [{ id: 'warehouse-1', name: 'Amawad' }],
  aggregateStock: [
    { variantId: 'variant-40', warehouseId: 'warehouse-1', quantity: 1 },
  ],
};

describe('previewPhysicalUnitImport', () => {
  it('mapea una unidad y conserva el agregado sin tocarlo', () => {
    const preview = previewPhysicalUnitImport({
      rows: [row()],
      existing: [],
      ...catalog,
    });

    expect(preview.summary).toEqual({
      inputRows: 1,
      physicalQuantity: 1,
      ready: 1,
      alreadyImported: 0,
      conflicts: 0,
      stockMismatches: 0,
      aggregateQuantity: 1,
      resolvedPhysicalQuantity: 1,
      aggregateDifference: 0,
    });
    expect(preview.resolved[0]).toMatchObject({
      variantId: 'variant-40',
      sizeId: 'size-40',
      kind: StockUnitKind.UNIT,
      status: StockUnitStatus.IN_STOCK,
    });
  });

  it('trata una caja como bulto y reporta la conciliación pendiente', () => {
    const preview = previewPhysicalUnitImport({
      rows: [row({ quantity: 24, size: null })],
      existing: [],
      ...catalog,
    });

    expect(preview.resolved[0].kind).toBe(StockUnitKind.BOX);
    expect(preview.resolved[0].sizeId).toBeNull();
    expect(preview.stockMismatches[0]).toMatchObject({
      aggregateQuantity: 1,
      physicalQuantity: 24,
      difference: 23,
    });
    expect(preview.productTotals[0]).toMatchObject({
      productName: 'Zapato',
      aggregateQuantity: 1,
      physicalQuantity: 24,
      difference: 23,
    });
  });

  it('es idempotente cuando el código existente coincide', () => {
    const existing: ExistingPhysicalUnit = {
      id: 'unit-1',
      barcode: row().barcode,
      productId: 'product-1',
      variantId: 'variant-40',
      colorId: 'color-fucsia',
      sizeId: 'size-40',
      warehouseId: 'warehouse-1',
      kind: StockUnitKind.UNIT,
      status: StockUnitStatus.IN_STOCK,
      quantity: 1,
      cost: 70,
    };
    const preview = previewPhysicalUnitImport({
      rows: [row()],
      existing: [existing],
      ...catalog,
    });

    expect(preview.summary.ready).toBe(0);
    expect(preview.summary.alreadyImported).toBe(1);
    expect(preview.issues).toHaveLength(0);
  });

  it.each([
    ['DUPLICATE_PAYLOAD_BARCODE', [row(), row({ line: 3 })]],
    ['UNMAPPED_SOURCE_PRODUCT', [row({ product_source_id: null })]],
    ['TARGET_PRODUCT_NOT_FOUND', [row({ product_source_id: 999 })]],
    ['UNSUPPORTED_STATUS', [row({ status: 'En garantía' })]],
  ])('bloquea %s', (code, rows) => {
    const preview = previewPhysicalUnitImport({
      rows,
      existing: [],
      ...catalog,
    });
    expect(preview.issues.some((issue) => issue.code === code)).toBe(true);
  });

  it('bloquea un barcode existente con atributos diferentes', () => {
    const preview = previewPhysicalUnitImport({
      rows: [row()],
      existing: [
        {
          id: 'unit-1',
          barcode: row().barcode,
          productId: 'otro-producto',
          variantId: 'otra-variante',
          colorId: null,
          sizeId: null,
          warehouseId: 'warehouse-1',
          kind: StockUnitKind.UNIT,
          status: StockUnitStatus.IN_STOCK,
          quantity: 1,
          cost: 70,
        },
      ],
      ...catalog,
    });
    expect(preview.issues[0].code).toBe('EXISTING_BARCODE_CONFLICT');
  });
});
