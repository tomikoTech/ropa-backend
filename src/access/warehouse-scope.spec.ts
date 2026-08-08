import {
  collectDirectWarehouseIds,
  entityWarehouseSourceFor,
  idParamIsWarehouse,
  normalizeRoutePath,
  ENTITY_WAREHOUSE_SOURCES,
} from './warehouse-scope.js';
import { stripCosts } from './cost-visibility.interceptor.js';

const WH_A = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
const WH_B = '11111111-2222-4333-8444-555555555555';

describe('collectDirectWarehouseIds', () => {
  it('encuentra la bodega en el cuerpo', () => {
    expect(collectDirectWarehouseIds({ body: { warehouseId: WH_A } })).toEqual([
      WH_A,
    ]);
  });

  it('encuentra las dos puntas de un traslado', () => {
    // Sacar de una bodega ajena y meter en una ajena son la misma fuga por
    // caminos distintos: las dos tienen que salir.
    const ids = collectDirectWarehouseIds({
      body: { fromWarehouseId: WH_A, toWarehouseId: WH_B, quantity: 3 },
    });
    expect(ids.sort()).toEqual([WH_A, WH_B].sort());
  });

  it('la reconoce en snake_case', () => {
    expect(collectDirectWarehouseIds({ body: { warehouse_id: WH_A } })).toEqual(
      [WH_A],
    );
  });

  it('la encuentra dentro de un arreglo de ítems', () => {
    // Si solo mirara la raíz, un endpoint que reciba bodega por línea se
    // escaparía.
    expect(
      collectDirectWarehouseIds({
        body: { items: [{ quantity: 1, warehouseId: WH_A }, { quantity: 2 }] },
      }),
    ).toEqual([WH_A]);
  });

  it('la encuentra en la ruta y en el query', () => {
    expect(
      collectDirectWarehouseIds({ params: { warehouseId: WH_A } }),
    ).toEqual([WH_A]);
    expect(collectDirectWarehouseIds({ query: { warehouseId: WH_B } })).toEqual(
      [WH_B],
    );
  });

  it('no repite la misma bodega', () => {
    expect(
      collectDirectWarehouseIds({
        params: { warehouseId: WH_A },
        body: { warehouseId: WH_A },
      }),
    ).toEqual([WH_A]);
  });

  it('ignora lo que no es un uuid', () => {
    // "ALL" y los vacíos llegan de los filtros del frontend y no son bodegas.
    expect(
      collectDirectWarehouseIds({ query: { warehouseId: 'ALL' } }),
    ).toEqual([]);
    expect(collectDirectWarehouseIds({ body: { warehouseId: '' } })).toEqual(
      [],
    );
  });

  it('no confunde otros campos que terminan en Id', () => {
    expect(
      collectDirectWarehouseIds({
        body: { variantId: WH_A, clientId: WH_B, userId: WH_A },
      }),
    ).toEqual([]);
  });

  it('con el cuerpo vacío o nulo no revienta', () => {
    expect(collectDirectWarehouseIds({})).toEqual([]);
    expect(collectDirectWarehouseIds({ body: null })).toEqual([]);
    expect(collectDirectWarehouseIds({ body: 'texto' })).toEqual([]);
  });
});

describe('rutas donde el :id es una bodega', () => {
  it('reconoce el detalle de bodega', () => {
    expect(idParamIsWarehouse('/api/inventory/warehouses/:id')).toBe(true);
    expect(idParamIsWarehouse('inventory/warehouses/:id')).toBe(true);
  });

  it('no confunde estanterías ni stands, que cuelgan de la misma ruta', () => {
    expect(idParamIsWarehouse('/api/inventory/shelves/:id')).toBe(false);
    expect(idParamIsWarehouse('/api/inventory/stands/:id')).toBe(false);
    expect(idParamIsWarehouse('/api/products/:id')).toBe(false);
  });

  it('normaliza el prefijo de la API', () => {
    expect(normalizeRoutePath('/api/pos/sales/:id/')).toBe('pos/sales/:id');
  });
});

describe('bodegas que hay que ir a buscar', () => {
  it('recibir un traslado mira la bodega DESTINO y anularlo la de ORIGEN', () => {
    // Es la distinción que un chequeo genérico no puede adivinar.
    const recibir = entityWarehouseSourceFor(
      'POST',
      '/api/inventory/transfers/:id/receive',
    )!;
    const anular = entityWarehouseSourceFor(
      'POST',
      '/api/inventory/transfers/:id/cancel',
    )!;
    expect(recibir.sql).toContain('to_warehouse_id');
    expect(anular.sql).toContain('from_warehouse_id');
  });

  it('están declaradas las operaciones que mueven inventario ajeno', () => {
    const rutas = [
      ['POST', 'inventory/transfers/:id/receive'],
      ['POST', 'inventory/transfers/:id/cancel'],
      ['POST', 'inventory/loans/:id/return'],
      ['POST', 'purchases/:id/receive'],
      ['POST', 'inventory-counts/:id/lines'],
      ['POST', 'inventory-counts/:id/close'],
      ['POST', 'stock-units/receive/:boxLineId'],
      ['POST', 'stock-units/:id/split'],
      ['POST', 'pos/sales/:id/cancel'],
      ['PATCH', 'pos/sales/:id'],
      ['POST', 'returns/:id/approve'],
    ];
    for (const [method, path] of rutas) {
      expect(entityWarehouseSourceFor(method, path)).toBeDefined();
    }
  });

  it('cada declaración devuelve una columna warehouse_id y usa parámetro', () => {
    // Sin `$1` la consulta sería concatenación de strings: inyección esperando.
    for (const [key, source] of Object.entries(ENTITY_WAREHOUSE_SOURCES)) {
      expect(source.sql).toContain('$1');
      expect(source.sql.toLowerCase()).toContain('warehouse_id');
      expect(source.action).toBeTruthy();
      // El parámetro declarado tiene que existir en la ruta.
      expect(key).toContain(`:${source.param}`);
    }
  });

  it('una ruta sin declarar no impone nada', () => {
    expect(entityWarehouseSourceFor('GET', 'products')).toBeUndefined();
    expect(entityWarehouseSourceFor('POST', 'clients')).toBeUndefined();
  });
});

describe('stripCosts', () => {
  it('quita el costo del producto dentro de la variante', () => {
    const limpio = stripCosts({
      sku: 'A-1',
      product: { name: 'Bota', basePrice: 100, costPrice: 40 },
    }) as { product: Record<string, unknown> };
    expect(limpio.product.basePrice).toBe(100);
    expect('costPrice' in limpio.product).toBe(false);
  });

  it('quita todos los nombres con los que viaja el costo', () => {
    const limpio = stripCosts({
      cost: 1,
      unitCost: 2,
      costValue: 3,
      landedCost: 4,
      costPrice: 5,
      precio: 9,
    }) as Record<string, unknown>;
    expect(Object.keys(limpio)).toEqual(['precio']);
  });

  it('entra en arreglos y en la respuesta envuelta', () => {
    const limpio = stripCosts({
      data: [{ product: { costPrice: 10, name: 'X' } }],
      statusCode: 200,
    }) as { data: { product: Record<string, unknown> }[] };
    expect('costPrice' in limpio.data[0].product).toBe(false);
    expect(limpio.data[0].product.name).toBe('X');
  });

  it('no toca lo que no es costo', () => {
    const original = {
      basePrice: 1,
      wholesalePrice: 2,
      salePrice: 3,
      total: 4,
      costCenter: 'X',
    };
    expect(stripCosts(original)).toEqual(original);
  });

  it('deja pasar fechas y valores simples', () => {
    const fecha = new Date('2026-08-07T00:00:00Z');
    expect(stripCosts(fecha)).toBe(fecha);
    expect(stripCosts(null)).toBeNull();
    expect(stripCosts('texto')).toBe('texto');
    expect(stripCosts(42)).toBe(42);
  });

  it('sobrevive a una referencia circular', () => {
    // TypeORM devuelve relaciones en los dos sentidos; sin el corte esto sería
    // un bucle infinito en medio de una respuesta.
    const a: Record<string, unknown> = { name: 'a', costPrice: 1 };
    a.self = a;
    const limpio = stripCosts(a) as Record<string, unknown>;
    expect('costPrice' in limpio).toBe(false);
    expect(limpio.name).toBe('a');
  });
});
