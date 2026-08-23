/**
 * Preview / aplicación / conciliación de los códigos físicos por par que
 * vienen de demachine.
 *
 * Nació para AMAWAD y ahora sirve a cualquier tienda migrada: la tienda se
 * pasa por `TENANT_SLUG` y de ahí salen la carpeta del archivo extraído y el
 * prefijo de `sourceRef` con el que se buscan sus productos. Antes estaba
 * escrito a mano en seis sitios, y copiar el archivo para la siguiente tienda
 * habría dejado dos versiones que se van separando.
 *
 * Por defecto SOLO genera reportes. Para importar códigos exige:
 *   MODE=apply TENANT_SLUG=<slug> CONFIRM_TENANT=<slug> CONFIRM_CHECKSUM=<sha256>
 * Para conciliar stock agregado exige además el token exacto publicado por el
 * preview y que todos los códigos ya hayan sido importados.
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
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../inventory/entities/stock-unit-event.entity.js';
import {
  buildReconciliationConfirmation,
  LegacyPhysicalUnit,
  previewPhysicalUnitImport,
  revisarSalvaguardas,
} from './codigos-fisicos.util.js';

type ImportMode = 'preview' | 'apply' | 'reconcile';

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
  const requestedMode = process.env.MODE;
  const mode: ImportMode =
    requestedMode === 'apply' || requestedMode === 'reconcile'
      ? requestedMode
      : 'preview';
  // La tienda se pide con nombre y apellido: sin esto, correr el script en la
  // carpeta equivocada le metería a una tienda los códigos de otra.
  const slug = (process.env.TENANT_SLUG ?? '').trim();
  if (!slug) {
    throw new Error(
      'Falta TENANT_SLUG. Ejemplo: TENANT_SLUG=sportcali npm run importar:codigos-fisicos',
    );
  }
  const payloadPath = path.resolve(
    process.env.PAYLOAD_PATH ??
      path.join('..', `migracion-${slug}`, 'out', 'stock-units.json'),
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
      where: { slug },
    });
    if (!tenant) throw new Error(`No existe el tenant ${slug} en MiPinta.`);

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
          sourceRef: Like(`demachine:${slug}:%`),
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

    const reconciliationConfirmation = buildReconciliationConfirmation({
      checksum: document.meta.sha256,
      tenantId: tenant.id,
      aggregateQuantity: preview.summary.aggregateQuantity,
      resolvedPhysicalQuantity: preview.summary.resolvedPhysicalQuantity,
      stockMismatches: preview.stockMismatches,
    });
    const productByVariant = new Map(
      products.flatMap((product) =>
        product.variants.map((variant) => [variant.id, product] as const),
      ),
    );
    const variantById = new Map(
      products.flatMap((product) =>
        product.variants.map((variant) => [variant.id, variant] as const),
      ),
    );
    const warehouseById = new Map(
      warehouses.map((warehouse) => [warehouse.id, warehouse]),
    );
    const reconciliationRows = preview.stockMismatches.map((row) => {
      const product = productByVariant.get(row.variantId);
      const variant = variantById.get(row.variantId);
      return {
        ...row,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        size: variant?.sizeRef?.name ?? null,
        color: variant?.colorRef?.name ?? null,
        warehouseName: warehouseById.get(row.warehouseId)?.name ?? null,
      };
    });

    const report = {
      mode,
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
      reconciliation: {
        confirmation: reconciliationConfirmation,
        rows: reconciliationRows,
        aggregateBefore: preview.summary.aggregateQuantity,
        physicalTarget: preview.summary.resolvedPhysicalQuantity,
        difference: preview.summary.aggregateDifference,
      },
      note:
        mode === 'reconcile'
          ? 'La conciliación reemplaza solamente las cantidades discrepantes y registra un movimiento ADJUSTMENT por fila.'
          : 'Apply importa códigos sin tocar stock agregado. MODE=reconcile es una operación posterior y explícita.',
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
    writeCsv(
      path.join(reportDir, 'stock-units-reconciliation.csv'),
      [
        'productId',
        'productName',
        'variantId',
        'size',
        'color',
        'warehouseId',
        'warehouseName',
        'aggregateQuantity',
        'physicalQuantity',
        'difference',
      ],
      reconciliationRows,
    );
    console.log(JSON.stringify(report, null, 2));

    // Las salvaguardas viven en `codigos-fisicos.util.ts` y se prueban sin
    // base de datos: son lo único que hay entre un `MODE=apply` distraído y
    // miles de códigos en el inventario equivocado.
    revisarSalvaguardas({
      modo: mode,
      slug,
      confirmTenant: process.env.CONFIRM_TENANT,
      checksumEsperado: document.meta.sha256,
      confirmChecksum: process.env.CONFIRM_CHECKSUM,
      filasExcluidas: excludedRows.length,
      razonDeExclusion: process.env.EXCLUSION_REASON,
      conflictos: preview.issues.length,
    });
    if (mode === 'preview') {
      console.log('PREVIEW: no se escribió ninguna fila en MiPinta.');
      return;
    }

    if (mode === 'reconcile') {
      if (preview.summary.ready > 0) {
        throw new Error(
          `Conciliación bloqueada: primero importa los ${preview.summary.ready} código(s) pendientes con MODE=apply.`,
        );
      }
      if (process.env.CONFIRM_RECONCILIATION !== reconciliationConfirmation) {
        throw new Error(
          `Conciliación bloqueada: CONFIRM_RECONCILIATION debe ser ${reconciliationConfirmation}.`,
        );
      }
      if (preview.stockMismatches.length === 0) {
        console.log(
          'RECONCILE: el stock agregado ya coincide; no se escribió nada.',
        );
        return;
      }

      const backupCreatedAt = new Date();
      const backupFile = path.join(
        reportDir,
        `stock-reconciliation-backup-${backupCreatedAt
          .toISOString()
          .replaceAll(':', '-')}.json`,
      );
      await AppDataSource.transaction(async (manager) => {
        const stockRepo = manager.getRepository(Stock);
        const movementRepo = manager.getRepository(StockMovement);
        const locked = await stockRepo
          .createQueryBuilder('stock')
          .setLock('pessimistic_write')
          .where('stock.tenant_id = :tenantId', { tenantId: tenant.id })
          .andWhere(
            `(${preview.stockMismatches
              .map(
                (_, index) =>
                  `(stock.variant_id = :variant${index} AND stock.warehouse_id = :warehouse${index})`,
              )
              .join(' OR ')})`,
            Object.fromEntries(
              preview.stockMismatches.flatMap((row, index) => [
                [`variant${index}`, row.variantId],
                [`warehouse${index}`, row.warehouseId],
              ]),
            ),
          )
          .getMany();
        const lockedByKey = new Map(
          locked.map((stock) => [
            `${stock.variantId}|${stock.warehouseId}`,
            stock,
          ]),
        );
        const exactRows = reconciliationRows.map((row) => {
          const key = `${row.variantId}|${row.warehouseId}`;
          const current = lockedByKey.get(key);
          const currentQuantity = current ? Number(current.quantity) : 0;
          if (currentQuantity !== row.aggregateQuantity) {
            throw new Error(
              `Conciliación abortada: ${key} cambió de ${row.aggregateQuantity} a ${currentQuantity} después del preview.`,
            );
          }
          return { ...row, stockId: current?.id ?? null, currentQuantity };
        });
        const backup = {
          tenant: { id: tenant.id, slug: tenant.slug },
          source: document.meta,
          createdAt: backupCreatedAt.toISOString(),
          confirmation: reconciliationConfirmation,
          exclusions: report.exclusions,
          totals: {
            before: preview.summary.aggregateQuantity,
            target: preview.summary.resolvedPhysicalQuantity,
            difference: preview.summary.aggregateDifference,
          },
          rows: exactRows,
        };
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf8');
        writeCsv(
          backupFile.replace(/\.json$/, '.csv'),
          [
            'stockId',
            'productId',
            'productName',
            'variantId',
            'size',
            'color',
            'warehouseId',
            'warehouseName',
            'currentQuantity',
            'physicalQuantity',
            'difference',
          ],
          exactRows,
        );

        for (const row of exactRows) {
          const key = `${row.variantId}|${row.warehouseId}`;
          const current = lockedByKey.get(key);
          const stock =
            current ??
            stockRepo.create({
              variantId: row.variantId,
              warehouseId: row.warehouseId,
              tenantId: tenant.id,
              quantity: 0,
              minStock: 0,
            });
          stock.quantity = row.physicalQuantity;
          await stockRepo.save(stock);
          await movementRepo.save(
            movementRepo.create({
              variantId: row.variantId,
              warehouseId: row.warehouseId,
              tenantId: tenant.id,
              movementType: MovementType.ADJUSTMENT,
              quantity: row.physicalQuantity,
              referenceType: 'DEMACHINE_RECONCILIATION',
              referenceId: document.meta.sha256,
              notes: `Conciliación AMAWAD ${row.currentQuantity}→${row.physicalQuantity}; corte ${document.meta.extracted_at}`,
            }),
          );
        }
      });
      console.log(
        `RECONCILE completado: ${preview.stockMismatches.length} fila(s), ${preview.summary.aggregateQuantity}→${preview.summary.resolvedPhysicalQuantity}. Respaldo: ${backupFile}`,
      );
      return;
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
