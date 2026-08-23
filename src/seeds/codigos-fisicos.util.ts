/**
 * Emparejar los códigos físicos de demachine con el catálogo de MiPinta.
 *
 * El código de la variante dice **qué** es —modelo, talla y color, el mismo
 * para todos los pares iguales—; este dice **cuál** es: el que está impreso en
 * esa caja y el que lee la pistola. Sin él, dos líneas de la misma referencia
 * en una factura son indistinguibles.
 *
 * Nada de esto es de una tienda en particular, aunque naciera con AMAWAD: lo
 * usan AMAWAD (521 códigos, migrados) y Sportcali (2.742 en demachine, que su
 * extractor original nunca leyó). Por eso el archivo ya no lleva el nombre de
 * ninguna.
 */
import {
  StockUnitKind,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import { createHash } from 'node:crypto';

export interface LegacyPhysicalUnit {
  line: number;
  barcode: string;
  legacy_order_id: string | null;
  warehouse: string;
  shelf: string | null;
  stand: string | null;
  size: string | null;
  product_name: string;
  product_code: string | null;
  product_source_id: number | null;
  product_match_count: number;
  product_type: string | null;
  color: string | null;
  cost: number;
  quantity: number;
  price: number;
  status: string;
  product_active: string;
  created_at: string | null;
}

export interface TargetVariant {
  id: string;
  productId: string;
  sizeId: string | null;
  size: string | null;
  colorId: string | null;
  color: string | null;
}

export interface TargetProduct {
  id: string;
  sourceRef: string | null;
  name: string;
  variants: TargetVariant[];
}

export interface TargetWarehouse {
  id: string;
  name: string;
}

export interface ExistingPhysicalUnit {
  id: string;
  barcode: string;
  productId: string;
  variantId: string | null;
  colorId: string | null;
  sizeId: string | null;
  warehouseId: string;
  kind: StockUnitKind;
  status: StockUnitStatus;
  quantity: number;
  cost: number;
}

export interface ResolvedPhysicalUnit {
  source: LegacyPhysicalUnit;
  barcode: string;
  productId: string;
  variantId: string;
  colorId: string | null;
  sizeId: string | null;
  warehouseId: string;
  kind: StockUnitKind;
  status: StockUnitStatus;
  quantity: number;
  cost: number;
  alreadyImported: boolean;
}

export interface ImportIssue {
  line: number;
  barcode: string;
  code: string;
  message: string;
}

export interface StockMismatch {
  variantId: string;
  warehouseId: string;
  aggregateQuantity: number;
  physicalQuantity: number;
  difference: number;
}

export interface ProductStockTotal {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  aggregateQuantity: number;
  physicalQuantity: number;
  difference: number;
}

export function buildReconciliationConfirmation(params: {
  checksum: string;
  tenantId: string;
  aggregateQuantity: number;
  resolvedPhysicalQuantity: number;
  stockMismatches: StockMismatch[];
}) {
  const mismatches = [...params.stockMismatches]
    .sort(
      (a, b) =>
        a.variantId.localeCompare(b.variantId) ||
        a.warehouseId.localeCompare(b.warehouseId),
    )
    .map((row) => [
      row.variantId,
      row.warehouseId,
      row.aggregateQuantity,
      row.physicalQuantity,
    ]);
  return createHash('sha256')
    .update(
      JSON.stringify({
        checksum: params.checksum,
        tenantId: params.tenantId,
        aggregateQuantity: params.aggregateQuantity,
        resolvedPhysicalQuantity: params.resolvedPhysicalQuantity,
        mismatches,
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .trim()
    .toLocaleUpperCase('es-CO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const STATUS_MAP = new Map<string, StockUnitStatus>([
  ['DISPONIBLE', StockUnitStatus.IN_STOCK],
  ['VENDIDO', StockUnitStatus.SOLD],
  ['EN TRANSITO', StockUnitStatus.TRANSFERRED],
  ['TRASLADADO', StockUnitStatus.TRANSFERRED],
  ['REMITIDO EXTERNO', StockUnitStatus.CONSIGNED],
]);

/**
 * Si la unidad que ya está en MiPinta es la misma que trae la fuente.
 *
 * **La variante de una caja no cuenta.** Una caja no tiene talla, así que se
 * cuelga de cualquiera de las variantes de su color —la de id más bajo—: una
 * elección arbitraria, no un hecho de la caja. Al agregarle tallas al producto
 * esa elección cambia, y nueve cajas de AMAWAD que llevaban meses importadas
 * salieron como «el código ya existe con atributos diferentes» sin que nada de
 * la caja física hubiera cambiado.
 *
 * El producto sí se compara, que es lo que de verdad identifica a la caja. Y
 * en un par suelto la variante manda: si cambió, cambió de talla.
 *
 * Dicho de frente: para un par suelto, comparar `variantId` es una **guarda
 * redundante**. `productId`, `sizeId` y `colorId` ya lo determinan, y dos
 * variantes con la misma talla y color se rechazan antes con
 * `VARIANT_NOT_UNIQUE`. Ninguna mutación la caza y se deja igual, porque el
 * día que esa unicidad deje de garantizarse esta comparación es la que avisa.
 */
function sameExisting(
  existing: ExistingPhysicalUnit,
  resolved: Omit<ResolvedPhysicalUnit, 'source' | 'alreadyImported'>,
) {
  const mismaVariante =
    resolved.kind === StockUnitKind.BOX ||
    existing.variantId === resolved.variantId;
  return (
    existing.productId === resolved.productId &&
    mismaVariante &&
    existing.colorId === resolved.colorId &&
    existing.sizeId === resolved.sizeId &&
    existing.warehouseId === resolved.warehouseId &&
    existing.kind === resolved.kind &&
    existing.status === resolved.status &&
    Number(existing.quantity) === resolved.quantity &&
    Number(existing.cost) === resolved.cost
  );
}

export function previewPhysicalUnitImport(params: {
  /**
   * La tienda de la que salieron estos códigos, como aparece en `sourceRef`.
   *
   * Estaba escrita a mano dentro de la función. Al correr el importador para
   * Sportcali, las 2.742 filas buscaron su producto con el prefijo de AMAWAD y
   * ninguna lo encontró. Lo detuvo la salvaguarda de conflictos, no una
   * prueba.
   */
  origen: string;
  /**
   * Si un código que ya está en MiPinta con otros atributos se corrige para
   * quedar como dice la fuente, en vez de bloquear la importación.
   *
   * Apagado por defecto: corregir en silencio cambiaría la talla de un par que
   * alguien puede tener apartado. Se pide a propósito, con
   * `UPDATE_DIVERGENT=1`, y solo tiene sentido cuando la fuente manda —que es
   * el caso de AMAWAD y Sportcali frente a demachine, porque la etiqueta
   * física está pegada a ese par y dice lo que dice allá—.
   */
  corregirDivergentes?: boolean;
  rows: LegacyPhysicalUnit[];
  products: TargetProduct[];
  warehouses: TargetWarehouse[];
  existing: ExistingPhysicalUnit[];
  aggregateStock: {
    variantId: string;
    warehouseId: string;
    quantity: number;
  }[];
}) {
  const issues: ImportIssue[] = [];
  const resolved: ResolvedPhysicalUnit[] = [];
  /** Las que ya están pero no coinciden con la fuente, y hay que corregir. */
  const divergentes: (ResolvedPhysicalUnit & { id: string })[] = [];
  const productsBySource = new Map(
    params.products
      .filter((product) => product.sourceRef)
      .map((product) => [product.sourceRef!, product]),
  );
  const warehousesByName = new Map<string, TargetWarehouse[]>();
  for (const warehouse of params.warehouses) {
    const key = normalize(warehouse.name);
    warehousesByName.set(key, [
      ...(warehousesByName.get(key) ?? []),
      warehouse,
    ]);
  }
  const existingByBarcode = new Map(
    params.existing.map((unit) => [unit.barcode, unit]),
  );
  const seen = new Set<string>();

  const issue = (row: LegacyPhysicalUnit, code: string, message: string) => {
    issues.push({ line: row.line, barcode: row.barcode, code, message });
  };

  for (const row of params.rows) {
    if (!/^\d{8,32}$/.test(row.barcode)) {
      issue(
        row,
        'INVALID_BARCODE',
        'El código debe contener solo 8 a 32 dígitos.',
      );
      continue;
    }
    if (seen.has(row.barcode)) {
      issue(
        row,
        'DUPLICATE_PAYLOAD_BARCODE',
        'El código está repetido en el archivo.',
      );
      continue;
    }
    seen.add(row.barcode);
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
      issue(
        row,
        'INVALID_QUANTITY',
        'La cantidad física debe ser un entero positivo.',
      );
      continue;
    }
    if (!row.product_source_id) {
      issue(
        row,
        'UNMAPPED_SOURCE_PRODUCT',
        `El catálogo fuente no identifica un producto único para ${row.product_code ?? row.product_name}.`,
      );
      continue;
    }
    const referencia = `demachine:${params.origen}:${row.product_source_id}`;
    const product = productsBySource.get(referencia);
    if (!product) {
      issue(row, 'TARGET_PRODUCT_NOT_FOUND', `MiPinta no tiene ${referencia}.`);
      continue;
    }
    const warehouseMatches =
      warehousesByName.get(normalize(row.warehouse)) ?? [];
    if (warehouseMatches.length !== 1) {
      issue(
        row,
        'WAREHOUSE_NOT_UNIQUE',
        `La bodega "${row.warehouse}" tiene ${warehouseMatches.length} coincidencias.`,
      );
      continue;
    }
    const status = STATUS_MAP.get(normalize(row.status));
    if (!status) {
      issue(
        row,
        'UNSUPPORTED_STATUS',
        `Estado legacy no soportado: ${row.status}.`,
      );
      continue;
    }
    const kind = row.quantity > 1 ? StockUnitKind.BOX : StockUnitKind.UNIT;
    const candidates = product.variants.filter(
      (variant) =>
        (!row.color || normalize(variant.color) === normalize(row.color)) &&
        (kind === StockUnitKind.BOX ||
          (!!row.size && normalize(variant.size) === normalize(row.size))),
    );
    if (kind === StockUnitKind.UNIT && !row.size) {
      issue(
        row,
        'UNIT_WITHOUT_SIZE',
        'Una unidad individual debe tener talla.',
      );
      continue;
    }
    if (candidates.length === 0) {
      issue(
        row,
        'VARIANT_NOT_FOUND',
        `No existe variante para talla ${row.size ?? '—'} y color ${row.color ?? '—'}.`,
      );
      continue;
    }
    if (kind === StockUnitKind.UNIT && candidates.length !== 1) {
      issue(
        row,
        'VARIANT_NOT_UNIQUE',
        `La talla/color tiene ${candidates.length} variantes posibles.`,
      );
      continue;
    }
    const variant = [...candidates].sort((a, b) => a.id.localeCompare(b.id))[0];
    const candidate = {
      barcode: row.barcode,
      productId: product.id,
      variantId: variant.id,
      colorId: variant.colorId,
      sizeId: kind === StockUnitKind.UNIT ? variant.sizeId : null,
      warehouseId: warehouseMatches[0].id,
      kind,
      status,
      quantity: row.quantity,
      cost: Number(row.cost),
    };
    const existing = existingByBarcode.get(row.barcode);
    if (existing && !sameExisting(existing, candidate)) {
      if (!params.corregirDivergentes) {
        issue(
          row,
          'EXISTING_BARCODE_CONFLICT',
          'El código ya existe en MiPinta con atributos diferentes.',
        );
        continue;
      }
      divergentes.push({
        id: existing.id,
        source: row,
        alreadyImported: true,
        ...candidate,
      });
      continue;
    }
    resolved.push({
      source: row,
      ...candidate,
      alreadyImported: Boolean(existing),
    });
  }

  const productByVariant = new Map<string, TargetProduct>();
  for (const product of params.products) {
    for (const variant of product.variants) {
      productByVariant.set(variant.id, product);
    }
  }
  const warehouseById = new Map(
    params.warehouses.map((warehouse) => [warehouse.id, warehouse]),
  );
  const scopedAggregateStock = params.aggregateStock.filter((stock) =>
    productByVariant.has(stock.variantId),
  );
  const aggregateByKey = new Map(
    scopedAggregateStock.map((stock) => [
      `${stock.variantId}|${stock.warehouseId}`,
      Number(stock.quantity),
    ]),
  );
  const physicalByKey = new Map<string, number>();
  for (const unit of resolved) {
    if (unit.status !== StockUnitStatus.IN_STOCK) continue;
    const key = `${unit.variantId}|${unit.warehouseId}`;
    physicalByKey.set(key, (physicalByKey.get(key) ?? 0) + unit.quantity);
  }
  const keys = new Set([...aggregateByKey.keys(), ...physicalByKey.keys()]);
  const stockMismatches: StockMismatch[] = [...keys]
    .map((key) => {
      const [variantId, warehouseId] = key.split('|');
      const aggregateQuantity = aggregateByKey.get(key) ?? 0;
      const physicalQuantity = physicalByKey.get(key) ?? 0;
      return {
        variantId,
        warehouseId,
        aggregateQuantity,
        physicalQuantity,
        difference: physicalQuantity - aggregateQuantity,
      };
    })
    .filter((row) => row.difference !== 0)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  const aggregateByProduct = new Map<string, number>();
  for (const stock of scopedAggregateStock) {
    const product = productByVariant.get(stock.variantId)!;
    const key = `${product.id}|${stock.warehouseId}`;
    aggregateByProduct.set(
      key,
      (aggregateByProduct.get(key) ?? 0) + Number(stock.quantity),
    );
  }
  const physicalByProduct = new Map<string, number>();
  for (const unit of resolved) {
    if (unit.status !== StockUnitStatus.IN_STOCK) continue;
    const key = `${unit.productId}|${unit.warehouseId}`;
    physicalByProduct.set(
      key,
      (physicalByProduct.get(key) ?? 0) + unit.quantity,
    );
  }
  const productKeys = new Set([
    ...aggregateByProduct.keys(),
    ...physicalByProduct.keys(),
  ]);
  const productById = new Map(
    params.products.map((product) => [product.id, product]),
  );
  const productTotals: ProductStockTotal[] = [...productKeys]
    .map((key) => {
      const [productId, warehouseId] = key.split('|');
      const aggregateQuantity = aggregateByProduct.get(key) ?? 0;
      const physicalQuantity = physicalByProduct.get(key) ?? 0;
      return {
        productId,
        productName: productById.get(productId)?.name ?? productId,
        warehouseId,
        warehouseName: warehouseById.get(warehouseId)?.name ?? warehouseId,
        aggregateQuantity,
        physicalQuantity,
        difference: physicalQuantity - aggregateQuantity,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.difference) - Math.abs(a.difference) ||
        a.productName.localeCompare(b.productName),
    );
  const aggregateQuantity = scopedAggregateStock.reduce(
    (sum, stock) => sum + Number(stock.quantity),
    0,
  );
  const resolvedPhysicalQuantity = resolved
    .filter((unit) => unit.status === StockUnitStatus.IN_STOCK)
    .reduce((sum, unit) => sum + unit.quantity, 0);

  return {
    resolved,
    divergentes,
    issues,
    stockMismatches,
    productTotals,
    summary: {
      inputRows: params.rows.length,
      physicalQuantity: params.rows.reduce((sum, row) => sum + row.quantity, 0),
      ready: resolved.filter((row) => !row.alreadyImported).length,
      alreadyImported: resolved.filter((row) => row.alreadyImported).length,
      toUpdate: divergentes.length,
      conflicts: issues.length,
      stockMismatches: stockMismatches.length,
      aggregateQuantity,
      resolvedPhysicalQuantity,
      aggregateDifference: resolvedPhysicalQuantity - aggregateQuantity,
    },
  };
}

/**
 * Lo que impide meterle a una tienda los códigos de otra.
 *
 * Este script escribe en producción y lo corre una persona desde su terminal,
 * a veces meses después de la última vez. Estas cuatro preguntas son lo único
 * que hay entre un `MODE=apply` distraído y miles de códigos físicos en el
 * inventario equivocado —que además no se deshacen limpio, porque cada código
 * arrastra sus eventos—.
 *
 * Vivían sueltas dentro de `main()`, donde no se podían probar sin base de
 * datos. Acá se prueban sin nada.
 */
export function revisarSalvaguardas(params: {
  modo: 'preview' | 'apply' | 'reconcile';
  slug: string;
  confirmTenant: string | undefined;
  checksumEsperado: string;
  confirmChecksum: string | undefined;
  filasExcluidas: number;
  razonDeExclusion: string | null | undefined;
  conflictos: number;
}): void {
  if (!params.slug.trim()) {
    throw new Error(
      'Falta TENANT_SLUG. Ejemplo: TENANT_SLUG=sportcali npm run importar:codigos-fisicos',
    );
  }
  // El preview no escribe nada: exigirle confirmaciones dejaría a la gente sin
  // poder mirar antes de decidir, que es para lo único que existe.
  if (params.modo === 'preview') return;

  if (params.confirmTenant !== params.slug) {
    throw new Error(
      `Operación bloqueada: falta CONFIRM_TENANT=${params.slug}.`,
    );
  }
  if (params.confirmChecksum !== params.checksumEsperado) {
    throw new Error(
      `Operación bloqueada: CONFIRM_CHECKSUM debe ser ${params.checksumEsperado}.`,
    );
  }
  if (params.filasExcluidas > 0 && !params.razonDeExclusion?.trim()) {
    throw new Error(
      'Operación bloqueada: toda exclusión exige EXCLUSION_REASON para quedar auditada.',
    );
  }
  if (params.conflictos > 0) {
    // Importar «casi todo» deja un inventario a medias que nadie sabe leer:
    // los códigos que entraron y los que no se ven igual.
    throw new Error(
      `Operación bloqueada: hay ${params.conflictos} conflicto(s) en el reporte.`,
    );
  }
}

/**
 * Qué filas se dejan fuera de la importación.
 *
 * Antes solo se podía excluir por **referencia**. Cuando en 2.742 códigos de
 * Sportcali apareció **una sola** fila mala —un par sin talla, error de
 * captura en demachine—, las opciones eran tirar los diez pares buenos de esa
 * referencia o dejar los 2.741 sin importar, porque el guardián no deja
 * aplicar con conflictos. Bajarle al guardián no era opción: importar «casi
 * todo» deja un inventario a medias que nadie sabe leer.
 *
 * Ahora también se excluye el código exacto. Las dos formas exigen igual una
 * razón escrita (`EXCLUSION_REASON`), que es lo que queda para leer dentro de
 * seis meses.
 */
export function repartirPorExclusion<
  T extends { barcode: string; product_code: string | null },
>(
  filas: T[],
  excluir: { referencias: string[]; codigos: string[] },
): { entran: T[]; quedanFuera: T[] } {
  const limpiar = (v: string | null | undefined) => (v ?? '').trim();
  // Lo que se pega desde una hoja de cálculo trae espacios alrededor.
  const referencias = new Set(excluir.referencias.map(limpiar).filter(Boolean));
  const codigos = new Set(excluir.codigos.map(limpiar).filter(Boolean));
  const entran: T[] = [];
  const quedanFuera: T[] = [];
  for (const fila of filas) {
    // No hace falta preguntar si la referencia está vacía: el `.filter(Boolean)`
    // de arriba ya impide que la cadena vacía entre al conjunto.
    const porReferencia = referencias.has(limpiar(fila.product_code));
    const porCodigo = codigos.has(limpiar(fila.barcode));
    // Una sola vez aunque coincida por las dos: si se contara dos veces, el
    // total del reporte no cuadraría con las filas.
    if (porReferencia || porCodigo) quedanFuera.push(fila);
    else entran.push(fila);
  }
  return { entran, quedanFuera };
}
