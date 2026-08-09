/**
 * Preview/aplicación de códigos físicos AMAWAD extraídos desde demachine.
 *
 * Por defecto SOLO genera reportes. Para escribir exige simultáneamente:
 *   MODE=apply CONFIRM_TENANT=amawad CONFIRM_CHECKSUM=<sha256 del preview>
 * y cero conflictos. Nunca modifica la tabla agregada `stock`.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Like } from 'typeorm';
import { AppDataSource } from '../config/data-source.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../inventory/entities/stock-unit-event.entity.js';
import {
  LegacyPhysicalUnit,
  previewPhysicalUnitImport,
} from './amawad-stock-units.util.js';

interface ImportDocument {
  meta: {
    source: string;
    extracted_at: string;
    sha256: string;
    rows: number;
    physical_quantity: number;
  };
  stock_units: LegacyPhysicalUnit[];
}

const csvCell = (value: unknown) => {
  const text =
    value == null
      ? ''
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
};

function writeCsv<T extends object>(
  file: string,
  headers: string[],
  rows: T[],
) {
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map((row) =>
      headers
        .map((header) => csvCell((row as Record<string, unknown>)[header]))
        .join(','),
    ),
  ].join('\n');
  fs.writeFileSync(file, `${body}\n`, 'utf8');
}

function legacyDate(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value.replace(' ', 'T')}-05:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function main() {
  const payloadPath = path.resolve(
    process.env.PAYLOAD_PATH ??
      path.join('..', 'migracion-amawad', 'out', 'stock-units.json'),
  );
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`No existe el archivo extraído: ${payloadPath}`);
  }
  const document = JSON.parse(
    fs.readFileSync(payloadPath, 'utf8'),
  ) as ImportDocument;
  const reportDir = path.resolve(
    process.env.REPORT_DIR ?? path.dirname(payloadPath),
  );
  fs.mkdirSync(reportDir, { recursive: true });

  await AppDataSource.initialize();
  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { slug: 'amawad' },
    });
    if (!tenant) throw new Error('No existe el tenant amawad en MiPinta.');

    const excludedSourceCodes = new Set(
      (process.env.EXCLUDE_SOURCE_CODES ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    );
    const excludedRows = document.stock_units.filter(
      (row) =>
        row.product_code && excludedSourceCodes.has(row.product_code.trim()),
    );
    const importRows = document.stock_units.filter(
      (row) =>
        !row.product_code || !excludedSourceCodes.has(row.product_code.trim()),
    );

    const [products, warehouses, existing, aggregateStock] = await Promise.all([
      AppDataSource.getRepository(Product).find({
        where: {
          tenantId: tenant.id,
          sourceRef: Like('demachine:amawad:%'),
        },
        relations: { variants: true },
      }),
      AppDataSource.getRepository(Warehouse).find({
        where: { tenantId: tenant.id },
      }),
      AppDataSource.getRepository(StockUnit).find({
        where: { tenantId: tenant.id },
      }),
      AppDataSource.getRepository(Stock).find({
        where: { tenantId: tenant.id },
      }),
    ]);

    const preview = previewPhysicalUnitImport({
      rows: importRows,
      products: products.map((product) => ({
        id: product.id,
        sourceRef: product.sourceRef,
        name: product.name,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          productId: variant.productId,
          sizeId: variant.sizeId,
          size: variant.sizeRef?.name ?? null,
          colorId: variant.colorId,
          color: variant.colorRef?.name ?? null,
        })),
      })),
      warehouses: warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
      })),
      existing: existing.map((unit) => ({
        id: unit.id,
        barcode: unit.barcode,
        productId: unit.productId,
        variantId: unit.variantId,
        colorId: unit.colorId,
        sizeId: unit.sizeId,
        warehouseId: unit.warehouseId,
        kind: unit.kind,
        status: unit.status,
        quantity: unit.quantity,
        cost: Number(unit.cost),
      })),
      aggregateStock: aggregateStock.map((stock) => ({
        variantId: stock.variantId,
        warehouseId: stock.warehouseId,
        quantity: Number(stock.quantity),
      })),
    });

    const report = {
      mode: process.env.MODE === 'apply' ? 'apply' : 'preview',
      tenant: { id: tenant.id, slug: tenant.slug },
      source: document.meta,
      exclusions: {
        sourceCodes: [...excludedSourceCodes],
        rows: excludedRows.length,
        physicalQuantity: excludedRows.reduce(
          (sum, row) => sum + row.quantity,
          0,
        ),
        reason: process.env.EXCLUSION_REASON ?? null,
      },
      summary: preview.summary,
      issues: preview.issues,
      stockMismatches: preview.stockMismatches,
      productTotals: preview.productTotals,
      note: 'El importador nunca modifica stock agregado. Las diferencias requieren conciliación explícita.',
    };
    fs.writeFileSync(
      path.join(reportDir, 'stock-units-preview.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    writeCsv(
      path.join(reportDir, 'stock-units-conflicts.csv'),
      ['line', 'barcode', 'code', 'message'],
      preview.issues,
    );
    writeCsv(
      path.join(reportDir, 'stock-units-stock-mismatches.csv'),
      [
        'variantId',
        'warehouseId',
        'aggregateQuantity',
        'physicalQuantity',
        'difference',
      ],
      preview.stockMismatches,
    );
    writeCsv(
      path.join(reportDir, 'stock-units-product-totals.csv'),
      [
        'productId',
        'productName',
        'warehouseId',
        'warehouseName',
        'aggregateQuantity',
        'physicalQuantity',
        'difference',
      ],
      preview.productTotals,
    );
    console.log(JSON.stringify(report, null, 2));

    if (process.env.MODE !== 'apply') {
      console.log('PREVIEW: no se escribió ninguna fila en MiPinta.');
      return;
    }
    if (process.env.CONFIRM_TENANT !== 'amawad') {
      throw new Error('Apply bloqueado: falta CONFIRM_TENANT=amawad.');
    }
    if (process.env.CONFIRM_CHECKSUM !== document.meta.sha256) {
      throw new Error(
        `Apply bloqueado: CONFIRM_CHECKSUM debe ser ${document.meta.sha256}.`,
      );
    }
    if (excludedRows.length > 0 && !process.env.EXCLUSION_REASON?.trim()) {
      throw new Error(
        'Apply bloqueado: toda exclusión exige EXCLUSION_REASON para quedar auditada.',
      );
    }
    if (preview.issues.length > 0) {
      throw new Error(
        `Apply bloqueado: hay ${preview.issues.length} conflicto(s) en el reporte.`,
      );
    }
    if (
      preview.stockMismatches.length > 0 &&
      process.env.CONFIRM_STOCK_MISMATCH !== '1'
    ) {
      throw new Error(
        `Apply bloqueado: hay ${preview.stockMismatches.length} diferencia(s) con stock agregado. Revísalas y, solo si se importarán sin ajustar stock, usa CONFIRM_STOCK_MISMATCH=1.`,
      );
    }

    const ready = preview.resolved.filter((unit) => !unit.alreadyImported);
    await AppDataSource.transaction(async (manager) => {
      const concurrent = ready.length
        ? await manager.getRepository(StockUnit).find({
            where: ready.map((unit) => ({
              tenantId: tenant.id,
              barcode: unit.barcode,
            })),
          })
        : [];
      if (concurrent.length > 0) {
        throw new Error(
          'Un código apareció después del preview. Vuelve a ejecutar el preview antes del apply.',
        );
      }
      const unitRepo = manager.getRepository(StockUnit);
      const saved = await unitRepo.save(
        ready.map((unit) =>
          unitRepo.create({
            barcode: unit.barcode,
            productId: unit.productId,
            variantId: unit.variantId,
            colorId: unit.colorId,
            sizeId: unit.sizeId,
            warehouseId: unit.warehouseId,
            standId: null,
            kind: unit.kind,
            status: unit.status,
            quantity: unit.quantity,
            cost: unit.cost,
            purchaseBoxLineId: null,
            parentUnitId: null,
            printedAt: null,
            createdAt: legacyDate(unit.source.created_at),
            tenantId: tenant.id,
          }),
        ),
        { chunk: 200 },
      );
      const sourceByBarcode = new Map(
        ready.map((unit) => [unit.barcode, unit.source]),
      );
      const eventRepo = manager.getRepository(StockUnitEvent);
      await eventRepo.save(
        saved.map((unit) => {
          const source = sourceByBarcode.get(unit.barcode)!;
          return eventRepo.create({
            stockUnitId: unit.id,
            eventType: StockUnitEventType.IMPORTED,
            fromStatus: null,
            toStatus: unit.status,
            referenceType: 'DEMACHINE_AMAWAD',
            referenceId: null,
            userId: null,
            metadata: {
              legacyOrderId: source.legacy_order_id,
              productCode: source.product_code,
              productName: source.product_name,
              price: source.price,
              legacyCreatedAt: source.created_at,
              checksum: document.meta.sha256,
            },
            createdAt: legacyDate(source.created_at),
            tenantId: tenant.id,
          });
        }),
        { chunk: 200 },
      );
    });
    console.log(
      `APPLY completado: ${ready.length} código(s) insertados; ${preview.summary.alreadyImported} ya existían.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
