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

function sameExisting(
  existing: ExistingPhysicalUnit,
  resolved: Omit<ResolvedPhysicalUnit, 'source' | 'alreadyImported'>,
) {
  return (
    existing.productId === resolved.productId &&
    existing.variantId === resolved.variantId &&
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
    const product = productsBySource.get(
      `demachine:amawad:${row.product_source_id}`,
    );
    if (!product) {
      issue(
        row,
        'TARGET_PRODUCT_NOT_FOUND',
        `MiPinta no tiene demachine:amawad:${row.product_source_id}.`,
      );
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
      issue(
        row,
        'EXISTING_BARCODE_CONFLICT',
        'El código ya existe en MiPinta con atributos diferentes.',
      );
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
    issues,
    stockMismatches,
    productTotals,
    summary: {
      inputRows: params.rows.length,
      physicalQuantity: params.rows.reduce((sum, row) => sum + row.quantity, 0),
      ready: resolved.filter((row) => !row.alreadyImported).length,
      alreadyImported: resolved.filter((row) => row.alreadyImported).length,
      conflicts: issues.length,
      stockMismatches: stockMismatches.length,
      aggregateQuantity,
      resolvedPhysicalQuantity,
      aggregateDifference: resolvedPhysicalQuantity - aggregateQuantity,
    },
  };
}
