import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * ¿Cuadran las dos formas de contar el inventario?
 *
 * El mismo stock vive en dos sitios: `stock.quantity` (el agregado por variante
 * y bodega) y las filas de `stock_units` (cada par o caja con su código). En un
 * producto con seguimiento por unidad **tienen que dar lo mismo**.
 *
 * Durante mucho tiempo no dieron: solo algunas operaciones mantenían las dos
 * caras, así que vender desde el buscador, recibir una compra, trasladar o
 * ajustar dejaban una de ellas atrás. El desvío creció en silencio porque nadie
 * lo estaba mirando —en AMAWAD llegó a 866 contra 512—.
 *
 * Este servicio es el que lo mira. Se usa para tres cosas:
 *  - el reporte que ve la tienda,
 *  - la comprobación que corre el `StockLedger` antes de confirmar una
 *    operación, para que un descuadre no llegue a guardarse,
 *  - la reconciliación, que necesita saber exactamente qué reparar.
 *
 * Es de solo lectura: nunca arregla nada por su cuenta.
 */

/** Una variante y bodega donde las dos cuentas no coinciden. */
export interface Descuadre {
  variantId: string;
  sku: string;
  barcode: string | null;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  /** Lo que dice `stock.quantity`. */
  agregado: number;
  /** Lo que suman los bultos disponibles. */
  etiquetadas: number;
  /**
   * `agregado − etiquetadas`.
   *
   * Positivo: hay existencia sin etiqueta —se vende algo que no se puede
   * rastrear—. Negativo: hay etiquetas sin existencia —bultos fantasma que
   * alguien va a buscar a la bodega y no están—.
   */
  diferencia: number;
}

export interface ResumenIntegridad {
  /** Combinaciones de variante y bodega revisadas. */
  revisadas: number;
  descuadradas: number;
  /** Unidades que sobran en el agregado, sumadas. */
  sinEtiqueta: number;
  /** Unidades etiquetadas que el agregado no reconoce. */
  fantasma: number;
  descuadres: Descuadre[];
}

@Injectable()
export class StockIntegrityService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * El descuadre de una tienda.
   *
   * Solo mira las variantes que llevan bultos —por la marca del producto o
   * por el ajuste de la tienda, la misma regla que aplica el ledger—: en un
   * producto que nunca se etiquetó no hay nada que comparar, y meterlo en el
   * reporte lo llenaría de ceros.
   */
  async revisar(
    tenantId: string,
    opciones: {
      manager?: EntityManager;
      variantId?: string;
      warehouseId?: string;
    } = {},
  ): Promise<ResumenIntegridad> {
    const manager = opciones.manager ?? this.dataSource.manager;
    const filas = await manager.query<
      {
        variant_id: string;
        sku: string;
        barcode: string | null;
        product_id: string;
        product_name: string;
        warehouse_id: string;
        warehouse_name: string;
        agregado: string;
        etiquetadas: string;
      }[]
    >(
      `
      WITH etiquetadas AS (
        SELECT su.variant_id, su.warehouse_id, SUM(su.quantity)::int AS unidades
        FROM stock_units su
        WHERE su.tenant_id = $1 AND su.status = 'IN_STOCK' AND su.variant_id IS NOT NULL
        GROUP BY su.variant_id, su.warehouse_id
      ),
      agregado AS (
        SELECT s.variant_id, s.warehouse_id, s.quantity::int AS unidades
        FROM stock s
        WHERE s.tenant_id = $1
      ),
      -- FULL JOIN: interesa tanto el stock sin bultos como los bultos sin stock.
      combinado AS (
        SELECT
          COALESCE(a.variant_id, e.variant_id)   AS variant_id,
          COALESCE(a.warehouse_id, e.warehouse_id) AS warehouse_id,
          COALESCE(a.unidades, 0)  AS agregado,
          COALESCE(e.unidades, 0)  AS etiquetadas
        FROM agregado a
        FULL OUTER JOIN etiquetadas e
          ON e.variant_id = a.variant_id AND e.warehouse_id = a.warehouse_id
      )
      SELECT c.variant_id, pv.sku, pv.barcode, p.id AS product_id, p.name AS product_name,
             c.warehouse_id, w.name AS warehouse_name,
             c.agregado, c.etiquetadas
      FROM combinado c
      JOIN product_variants pv ON pv.id = c.variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN warehouses w ON w.id = c.warehouse_id
      -- La misma regla que usa el ledger para decidir si un producto lleva
      -- bultos: la marca del producto **o** el ajuste de la tienda. Mirar solo
      -- la del producto dejaba ciego el reporte justo en las tiendas que
      -- encendieron el inventario por códigos después de cargar su catálogo:
      -- el ledger sí movía las etiquetas, pero el descuadre no salía a la luz.
      --
      -- Con EXISTS y no con un JOIN: store_settings no tiene unicidad por
      -- tenant, y un tenant con dos filas duplicaría cada combinación —y con
      -- ella los totales del informe—.
      WHERE (
              p.unit_tracking
              OR EXISTS (
                SELECT 1 FROM store_settings ss
                 WHERE ss.tenant_id = $1 AND ss.unit_tracking_enabled
              )
            )
        AND ($2::uuid IS NULL OR c.variant_id = $2::uuid)
        AND ($3::uuid IS NULL OR c.warehouse_id = $3::uuid)
      ORDER BY abs(c.agregado - c.etiquetadas) DESC, p.name
      `,
      [tenantId, opciones.variantId ?? null, opciones.warehouseId ?? null],
    );

    const descuadres: Descuadre[] = [];
    let sinEtiqueta = 0;
    let fantasma = 0;
    for (const f of filas) {
      const agregado = Number(f.agregado);
      const etiquetadas = Number(f.etiquetadas);
      const diferencia = agregado - etiquetadas;
      if (diferencia === 0) continue;
      if (diferencia > 0) sinEtiqueta += diferencia;
      else fantasma += -diferencia;
      descuadres.push({
        variantId: f.variant_id,
        sku: f.sku,
        barcode: f.barcode,
        productId: f.product_id,
        productName: f.product_name,
        warehouseId: f.warehouse_id,
        warehouseName: f.warehouse_name,
        agregado,
        etiquetadas,
        diferencia,
      });
    }

    return {
      revisadas: filas.length,
      descuadradas: descuadres.length,
      sinEtiqueta,
      fantasma,
      descuadres,
    };
  }

  /**
   * ¿Quedó cuadrada esta variante y bodega?
   *
   * Lo llama el `StockLedger` **dentro** de la transacción, justo antes de
   * confirmar. No frena nada: deja el descuadre anotado en el movimiento y en
   * el log, para que se vea en vez de descubrirse semanas después contando a
   * mano.
   */
  async verificarPunto(
    manager: EntityManager,
    tenantId: string,
    variantId: string,
    warehouseId: string,
  ): Promise<Descuadre | null> {
    // Consulta propia y no `revisar()` con filtros.
    //
    // `revisar()` agrupa **todos** los bultos del tenant y solo después filtra
    // por variante y bodega: el FULL OUTER JOIN impide que Postgres empuje el
    // filtro hacia adentro. Como esto corre dentro de la transacción de la
    // venta, con la fila de stock bloqueada y una vez por renglón, una factura
    // de veinte líneas agregaba veinte veces la tabla entera mientras la caja
    // esperaba. Aquí solo se miran las dos filas que importan.
    const filas = await manager.query<
      {
        sku: string;
        barcode: string | null;
        product_id: string;
        product_name: string;
        warehouse_name: string;
        lleva: boolean;
        agregado: string;
        etiquetadas: string;
      }[]
    >(
      `SELECT pv.sku, pv.barcode, p.id AS product_id, p.name AS product_name,
              w.name AS warehouse_name,
              (p.unit_tracking OR EXISTS (
                 SELECT 1 FROM store_settings ss
                  WHERE ss.tenant_id = $1 AND ss.unit_tracking_enabled
               )) AS lleva,
              COALESCE((SELECT s.quantity FROM stock s
                         WHERE s.variant_id = $2 AND s.warehouse_id = $3
                           AND s.tenant_id = $1), 0) AS agregado,
              COALESCE((SELECT SUM(su.quantity) FROM stock_units su
                         WHERE su.variant_id = $2 AND su.warehouse_id = $3
                           AND su.tenant_id = $1
                           AND su.status = 'IN_STOCK'), 0) AS etiquetadas
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         JOIN warehouses w ON w.id = $3 AND w.tenant_id = $1
        WHERE pv.id = $2 AND pv.tenant_id = $1
        LIMIT 1`,
      [tenantId, variantId, warehouseId],
    );
    const fila = filas[0];
    if (!fila || !fila.lleva) return null;

    const agregado = Number(fila.agregado);
    const etiquetadas = Number(fila.etiquetadas);
    if (agregado === etiquetadas) return null;
    return {
      variantId,
      sku: fila.sku,
      barcode: fila.barcode,
      productId: fila.product_id,
      productName: fila.product_name,
      warehouseId,
      warehouseName: fila.warehouse_name,
      agregado,
      etiquetadas,
      diferencia: agregado - etiquetadas,
    };
  }
}
