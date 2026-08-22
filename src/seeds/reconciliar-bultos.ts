/**
 * Pone de acuerdo las dos cuentas del inventario.
 *
 * El mismo stock vive en `stock.quantity` —el agregado por variante y bodega—
 * y en las filas de bultos, cada par o caja con su código. Durante mucho
 * tiempo varios caminos movían uno sin el otro, así que quedó un desvío: pares
 * marcados como disponibles que ya se habían vendido, y existencia sin ningún
 * código que la respalde.
 *
 * Ese desvío ya no crece —todo pasa por el `StockLedger`—, pero el que quedó
 * hay que limpiarlo a mano, porque solo la tienda sabe qué hay de verdad en la
 * bodega. Lo que hace este script es aplicar el criterio que se decidió:
 *
 *  - **Manda el agregado.** Es el número que la tienda ve al vender y el que
 *    ha venido cuadrando con la plata.
 *  - **Sobran etiquetas** (hay más códigos disponibles que existencia): se dan
 *    de baja los **más antiguos**. Es como rota una tienda: lo que primero
 *    entró es lo que primero salió, así que los viejos son los que casi seguro
 *    ya no están.
 *  - **Falta etiqueta** (hay existencia sin código): se crea una, para que ese
 *    par se pueda imprimir, pegar y escanear.
 *
 * Por defecto **no toca nada**: imprime lo que haría. Para aplicarlo hay que
 * pedirlo con nombre y apellido:
 *
 *   MODE=apply CONFIRM_TENANT=amawad node dist/seeds/reconciliar-bultos.js
 */
import 'dotenv/config';
import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../config/data-source.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../inventory/entities/stock-unit-event.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import {
  buildStockBarcode,
  withCheckDigit,
} from '../inventory/barcode.util.js';

const REFERENCIA = 'RECONCILIACION_BULTOS';

interface Punto {
  variant_id: string;
  sku: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  agregado: number;
  etiquetadas: number;
}

/**
 * Las combinaciones donde las dos cuentas no coinciden.
 *
 * Recibe el `manager` para poder recalcularse **dentro** de la transacción:
 * este script va a correr contra una tienda que puede estar vendiendo, y con
 * un diagnóstico leído antes de abrir la transacción se corrige un descuadre
 * que ya no existe —y se crea uno nuevo en el sentido contrario—.
 */
async function descuadres(
  manager: EntityManager,
  tenantId: string,
): Promise<Punto[]> {
  const filas = await manager.query<
    (Omit<Punto, 'agregado' | 'etiquetadas'> & {
      agregado: string;
      etiquetadas: string;
    })[]
  >(
    `
    WITH etiquetadas AS (
      SELECT su.variant_id, su.warehouse_id, SUM(su.quantity)::int AS u
      FROM stock_units su
      WHERE su.tenant_id = $1 AND su.status = 'IN_STOCK'
        AND su.variant_id IS NOT NULL
      GROUP BY 1, 2
    ),
    agregado AS (
      SELECT s.variant_id, s.warehouse_id, s.quantity::int AS u
      FROM stock s WHERE s.tenant_id = $1
    )
    SELECT COALESCE(a.variant_id, e.variant_id) AS variant_id,
           pv.sku, p.name AS product_name,
           COALESCE(a.warehouse_id, e.warehouse_id) AS warehouse_id,
           w.name AS warehouse_name,
           COALESCE(a.u, 0) AS agregado,
           COALESCE(e.u, 0) AS etiquetadas
    FROM agregado a
    FULL OUTER JOIN etiquetadas e
      ON e.variant_id = a.variant_id AND e.warehouse_id = a.warehouse_id
    JOIN product_variants pv ON pv.id = COALESCE(a.variant_id, e.variant_id)
    JOIN products p ON p.id = pv.product_id
    JOIN warehouses w ON w.id = COALESCE(a.warehouse_id, e.warehouse_id)
    WHERE (p.unit_tracking OR EXISTS (
            SELECT 1 FROM store_settings ss
             WHERE ss.tenant_id = $1 AND ss.unit_tracking_enabled))
      AND COALESCE(a.u, 0) <> COALESCE(e.u, 0)
    ORDER BY p.name, pv.sku, w.name
    `,
    [tenantId],
  );
  return filas.map((f) => ({
    ...f,
    agregado: Number(f.agregado),
    etiquetadas: Number(f.etiquetadas),
  }));
}

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const slug = process.env.CONFIRM_TENANT;
  if (!slug) {
    console.error(
      'Falta CONFIRM_TENANT=<slug>. Sin decir a qué tienda, no se toca nada.',
    );
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { slug },
    });
    if (!tenant) {
      throw new Error(`No existe la tienda «${slug}».`);
    }

    const puntos = await descuadres(AppDataSource.manager, tenant.id);
    if (puntos.length === 0) {
      console.log(`«${slug}»: las dos cuentas ya están de acuerdo.`);
      return;
    }

    let sobran = 0;
    let faltan = 0;
    console.log(
      `\n«${slug}» — ${puntos.length} combinaciones de variante y bodega en desacuerdo:\n`,
    );
    for (const p of puntos) {
      const diferencia = p.agregado - p.etiquetadas;
      if (diferencia < 0) sobran += -diferencia;
      else faltan += diferencia;
      console.log(
        `  ${p.sku.padEnd(22)} ${p.warehouse_name.padEnd(22)} ` +
          `agregado ${String(p.agregado).padStart(4)} · códigos ${String(
            p.etiquetadas,
          ).padStart(4)} · ` +
          (diferencia < 0
            ? `sobran ${-diferencia} etiqueta(s)`
            : `falta(n) ${diferencia} etiqueta(s)`),
      );
    }
    console.log(
      `\nTotal: ${sobran} etiqueta(s) a dar de baja, ${faltan} a crear.\n`,
    );

    if (!aplicar) {
      console.log(
        'Esto fue un ensayo: no se tocó nada. Para aplicarlo:\n' +
          `  MODE=apply CONFIRM_TENANT=${slug} node dist/seeds/reconciliar-bultos.js\n`,
      );
      return;
    }

    await AppDataSource.transaction(async (manager) => {
      const unitRepo = manager.getRepository(StockUnit);
      const eventRepo = manager.getRepository(StockUnitEvent);
      const hoy = new Date();

      // El diagnóstico se rehace aquí adentro: el de arriba era para que un
      // humano lo leyera, y entre leerlo y aplicarlo la tienda pudo vender.
      const puntos = await descuadres(manager, tenant.id);

      // El consecutivo continúa el del día en vez de empezar en uno.
      //
      // El tramo `YYMMDD0000` lo comparten todas las etiquetas que nacen sin
      // orden de compra —y desde este refactor el ledger crea etiquetas en
      // cada recepción y en cada ajuste al alza—. Empezando en 1 se chocaba
      // con lo que la tienda ya había creado hoy, y el índice único tumbaba
      // la transacción entera con un error crudo de Postgres.
      const prefijoDelDia = buildStockBarcode({
        date: hoy,
        orderSequence: 0,
        lineConsecutive: 0,
        unitSequence: 0,
      }).slice(0, 10);
      const delDia = await manager.query<{ barcode: string }[]>(
        `SELECT barcode FROM stock_units
          WHERE tenant_id = $1 AND barcode LIKE $2`,
        [tenant.id, `${prefijoDelDia}%`],
      );
      let consecutivo = delDia.reduce((max, fila) => {
        const n = Number(fila.barcode.slice(10, 13));
        return !Number.isNaN(n) && n > max ? n : max;
      }, 0);

      for (const p of puntos) {
        const diferencia = p.agregado - p.etiquetadas;

        if (diferencia < 0) {
          // Sobran etiquetas: se dan de baja las más antiguas.
          const candidatas = await unitRepo.find({
            where: {
              variantId: p.variant_id,
              warehouseId: p.warehouse_id,
              tenantId: tenant.id,
              status: StockUnitStatus.IN_STOCK,
            },
            order: { createdAt: 'ASC', id: 'ASC' },
          });
          let faltaPorDarDeBaja = -diferencia;
          const elegidas: StockUnit[] = [];
          for (const u of candidatas) {
            if (faltaPorDarDeBaja <= 0) break;
            // Una caja no se parte: si no cabe en lo que sobra, se salta.
            if (u.quantity > faltaPorDarDeBaja) continue;
            elegidas.push(u);
            faltaPorDarDeBaja -= u.quantity;
          }
          if (!elegidas.length) continue;
          await unitRepo.update(
            { id: In(elegidas.map((u) => u.id)), tenantId: tenant.id },
            { status: StockUnitStatus.WRITTEN_OFF },
          );
          await eventRepo.save(
            elegidas.map((u) =>
              eventRepo.create({
                stockUnitId: u.id,
                eventType: StockUnitEventType.WRITTEN_OFF,
                fromStatus: StockUnitStatus.IN_STOCK,
                toStatus: StockUnitStatus.WRITTEN_OFF,
                referenceType: REFERENCIA,
                referenceId: null,
                metadata: {
                  motivo:
                    'El inventario agregado no reconocía este código: se dio ' +
                    'de baja por antigüedad al poner de acuerdo las dos cuentas.',
                  agregado: p.agregado,
                  etiquetadas: p.etiquetadas,
                },
                tenantId: tenant.id,
              }),
            ),
          );
          continue;
        }

        // Falta etiqueta: se crea una por unidad, para poder imprimirla.
        const variante = await manager.getRepository(ProductVariant).findOne({
          where: { id: p.variant_id, tenantId: tenant.id },
        });
        if (!variante) continue;
        const nuevas: StockUnit[] = [];
        consecutivo += 1;
        if (consecutivo > 999) {
          throw new Error(
            'El código de barras solo tiene tres dígitos de renglón: se ' +
              'llegó a 999 en un mismo día. Corre el resto mañana.',
          );
        }
        for (let i = 0; i < diferencia; i++) {
          nuevas.push(
            unitRepo.create({
              barcode: withCheckDigit(
                buildStockBarcode({
                  date: hoy,
                  orderSequence: 0,
                  lineConsecutive: consecutivo,
                  unitSequence: i + 1,
                }),
              ),
              kind: StockUnitKind.UNIT,
              status: StockUnitStatus.IN_STOCK,
              productId: variante.productId,
              variantId: variante.id,
              sizeId: variante.sizeId,
              colorId: variante.colorId,
              warehouseId: p.warehouse_id,
              quantity: 1,
              tenantId: tenant.id,
            }),
          );
        }
        const guardadas = await unitRepo.save(nuevas);
        await eventRepo.save(
          guardadas.map((u) =>
            eventRepo.create({
              stockUnitId: u.id,
              eventType: StockUnitEventType.RECEIVED,
              toStatus: StockUnitStatus.IN_STOCK,
              referenceType: REFERENCIA,
              referenceId: null,
              metadata: {
                motivo:
                  'El inventario agregado decía tener este par y no había ' +
                  'código para él: se creó al poner de acuerdo las dos cuentas.',
              },
              tenantId: tenant.id,
            }),
          ),
        );
      }
    });

    const despues = await descuadres(AppDataSource.manager, tenant.id);
    console.log(
      `Aplicado. Quedan ${despues.length} combinaciones en desacuerdo ` +
        '(las cajas que no caben enteras en la diferencia no se parten).',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
