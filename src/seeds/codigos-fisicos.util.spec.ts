import {
  buildReconciliationConfirmation,
  ExistingPhysicalUnit,
  LegacyPhysicalUnit,
  previewPhysicalUnitImport,
} from './codigos-fisicos.util';
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
  origen: 'amawad',
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
      toUpdate: 0,
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

describe('buildReconciliationConfirmation', () => {
  it('es estable aunque cambie el orden de las diferencias', () => {
    const params = {
      checksum: 'corte-1',
      tenantId: 'tenant-1',
      aggregateQuantity: 3,
      resolvedPhysicalQuantity: 8,
      stockMismatches: [
        {
          variantId: 'variant-b',
          warehouseId: 'warehouse-1',
          aggregateQuantity: 1,
          physicalQuantity: 4,
          difference: 3,
        },
        {
          variantId: 'variant-a',
          warehouseId: 'warehouse-1',
          aggregateQuantity: 2,
          physicalQuantity: 4,
          difference: 2,
        },
      ],
    };

    expect(buildReconciliationConfirmation(params)).toBe(
      buildReconciliationConfirmation({
        ...params,
        stockMismatches: [...params.stockMismatches].reverse(),
      }),
    );
  });

  it('cambia si cambia cualquier cantidad objetivo', () => {
    const params = {
      checksum: 'corte-1',
      tenantId: 'tenant-1',
      aggregateQuantity: 1,
      resolvedPhysicalQuantity: 2,
      stockMismatches: [
        {
          variantId: 'variant-a',
          warehouseId: 'warehouse-1',
          aggregateQuantity: 1,
          physicalQuantity: 2,
          difference: 1,
        },
      ],
    };
    expect(buildReconciliationConfirmation(params)).not.toBe(
      buildReconciliationConfirmation({
        ...params,
        resolvedPhysicalQuantity: 3,
        stockMismatches: [
          { ...params.stockMismatches[0], physicalQuantity: 3, difference: 2 },
        ],
      }),
    );
  });
});

describe('el prefijo de procedencia es el de la tienda que se está importando', () => {
  it('no busca los productos de otra tienda', () => {
    // La que importa. El prefijo estaba escrito a mano como
    // `demachine:amawad:` dentro de la utilidad, así que al correr el
    // importador para Sportcali —2.742 códigos— **ninguna fila encontró su
    // producto**: el reporte decía «MiPinta no tiene demachine:amawad:62»
    // mientras se importaba Sportcali.
    //
    // Lo detuvo la salvaguarda de conflictos, no esta prueba. Que la próxima
    // vez la detenga esta.
    const preview = previewPhysicalUnitImport({
      origen: 'sportcali',
      rows: [row({ product_source_id: 62 })],
      products: [
        {
          id: 'product-sc',
          sourceRef: 'demachine:sportcali:62',
          name: 'Zapato',
          variants: [
            {
              id: 'variant-sc',
              productId: 'product-sc',
              sizeId: 'size-40',
              size: '40',
              colorId: 'color-fucsia',
              color: 'FUCSIA',
            },
          ],
        },
      ],
      warehouses: [{ id: 'warehouse-1', name: 'Amawad' }],
      aggregateStock: [],
      existing: [],
    });
    expect(preview.issues).toEqual([]);
    expect(preview.summary.ready).toBe(1);
  });

  it('y no confunde el mismo id de dos tiendas distintas', () => {
    // `demachine:amawad:62` y `demachine:sportcali:62` son productos que no
    // tienen nada que ver. Sin el prefijo correcto, el código de un par de
    // Sportcali terminaría colgado de un producto de AMAWAD.
    const preview = previewPhysicalUnitImport({
      ...catalog,
      origen: 'sportcali',
      rows: [row({ product_source_id: 47 })],
      existing: [],
    });
    expect(preview.summary.ready).toBe(0);
    expect(preview.issues[0].code).toBe('TARGET_PRODUCT_NOT_FOUND');
    expect(preview.issues[0].message).toContain('demachine:sportcali:47');
  });
});

describe('una caja que ya existe no cambia por el catálogo', () => {
  const caja = () =>
    row({ quantity: 24, size: null, product_source_id: 47, color: 'FUCSIA' });

  it('no se reporta conflicto porque la caja se ate a otra variante', () => {
    // Una caja no tiene talla, así que se cuelga de **cualquiera** de las
    // variantes de su color: la de id más bajo. Es una elección arbitraria, no
    // un hecho de la caja.
    //
    // Al agregarle tallas al producto —conciliando contra demachine, que es la
    // fuente— esa elección cambia, y nueve cajas de AMAWAD que llevaban meses
    // importadas salieron como «el código ya existe con atributos
    // diferentes». No había cambiado nada de la caja física.
    const yaImportada: ExistingPhysicalUnit = {
      id: 'unidad-1',
      barcode: '260412000500200103',
      productId: 'product-1',
      variantId: 'variant-41', // la que se eligió cuando se importó
      colorId: 'color-fucsia',
      sizeId: null,
      warehouseId: 'warehouse-1',
      kind: StockUnitKind.BOX,
      status: StockUnitStatus.IN_STOCK,
      quantity: 24,
      cost: 70,
    };
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [caja()],
      existing: [yaImportada],
    });
    expect(preview.issues).toEqual([]);
    expect(preview.summary.alreadyImported).toBe(1);
  });

  it('pero un cambio de verdad sí se reporta', () => {
    // El producto sí importa: una caja que aparece colgada de otra referencia
    // es un error que hay que ver.
    const otra: ExistingPhysicalUnit = {
      id: 'unidad-1',
      barcode: '260412000500200103',
      productId: 'otro-producto',
      variantId: 'variant-41',
      colorId: 'color-fucsia',
      sizeId: null,
      warehouseId: 'warehouse-1',
      kind: StockUnitKind.BOX,
      status: StockUnitStatus.IN_STOCK,
      quantity: 24,
      cost: 70,
    };
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [caja()],
      existing: [otra],
    });
    expect(preview.issues[0].code).toBe('EXISTING_BARCODE_CONFLICT');
  });

  it('y en un par suelto la variante sigue mandando', () => {
    // Un par sí tiene talla: si cambió de variante, cambió de talla, y eso es
    // un error real.
    const parSuelto: ExistingPhysicalUnit = {
      id: 'unidad-2',
      barcode: '260412000500200103',
      productId: 'product-1',
      variantId: 'variant-41',
      colorId: 'color-fucsia',
      sizeId: 'size-41',
      warehouseId: 'warehouse-1',
      kind: StockUnitKind.UNIT,
      status: StockUnitStatus.IN_STOCK,
      quantity: 1,
      cost: 70,
    };
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [row({ size: '40' })],
      existing: [parSuelto],
    });
    expect(preview.issues[0].code).toBe('EXISTING_BARCODE_CONFLICT');
  });
});

describe('cuando la fuente manda, una unidad divergente se corrige', () => {
  /**
   * demachine es la fuente de verdad para AMAWAD y Sportcali. Si un par que ya
   * está en MiPinta aparece allá con otra talla, la que vale es la de allá:
   * la etiqueta física está pegada a ese par y dice esa talla.
   *
   * Sin esto solo quedaba reportarlo y arreglarlo a mano, uno por uno.
   */
  const divergente = (): ExistingPhysicalUnit => ({
    id: 'unidad-1',
    barcode: '260412000500200103',
    productId: 'product-1',
    variantId: 'variant-41',
    colorId: 'color-fucsia',
    sizeId: 'size-41',
    warehouseId: 'warehouse-1',
    kind: StockUnitKind.BOX,
    status: StockUnitStatus.IN_STOCK,
    quantity: 1,
    cost: 70,
  });

  it('por defecto sigue siendo un conflicto y no se toca nada', () => {
    // Corregir en silencio sería peor: cambia la talla de un par que alguien
    // puede tener apartado.
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [row({ size: '40' })],
      existing: [divergente()],
    });
    expect(preview.issues[0].code).toBe('EXISTING_BARCODE_CONFLICT');
    expect(preview.summary.toUpdate).toBe(0);
  });

  it('pidiéndolo, sale para corregir en vez de bloquear', () => {
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [row({ size: '40' })],
      existing: [divergente()],
      corregirDivergentes: true,
    });
    expect(preview.issues).toEqual([]);
    expect(preview.summary.toUpdate).toBe(1);
    const [aCorregir] = preview.divergentes;
    expect(aCorregir.id).toBe('unidad-1');
    expect(aCorregir.sizeId).toBe('size-40');
    expect(aCorregir.variantId).toBe('variant-40');
  });

  it('lo que ya coincide no entra a corregirse', () => {
    // Reescribir 2.741 filas iguales llena la auditoría de ruido y esconde
    // los cambios de verdad.
    const igual: ExistingPhysicalUnit = {
      ...divergente(),
      variantId: 'variant-40',
      sizeId: 'size-40',
      kind: StockUnitKind.UNIT,
    };
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [row({ size: '40' })],
      existing: [igual],
      corregirDivergentes: true,
    });
    expect(preview.summary.toUpdate).toBe(0);
    expect(preview.summary.alreadyImported).toBe(1);
  });

  it('un código que todavía no existe no es una corrección', () => {
    const preview = previewPhysicalUnitImport({
      ...catalog,
      rows: [row({ size: '40' })],
      existing: [],
      corregirDivergentes: true,
    });
    expect(preview.summary.toUpdate).toBe(0);
    expect(preview.summary.ready).toBe(1);
  });
});
