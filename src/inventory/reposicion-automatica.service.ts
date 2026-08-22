import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import {
  InternalRequest,
  InternalRequestStatus,
} from '../internal-requests/entities/internal-request.entity.js';
import { InternalRequestItem } from '../internal-requests/entities/internal-request-item.entity.js';
import {
  decidirReposicion,
  type ConfiguracionReposicion,
} from './reposicion-automatica.js';

/**
 * Pide la reposición sola, cuando el local se está quedando sin una talla.
 *
 * «Siempre hay que notificar, reponer ese, reponer ese; solo debería ser
 * automático». Eso es esto: después de una venta, si el local bajó del umbral,
 * la solicitud nace sin que nadie la escriba.
 *
 * Tres cosas que hace bien y hay que no romper:
 *
 * 1. **No duplica.** Si ya hay una solicitud abierta hacia ese local, le suma
 *    el renglón en vez de crear otra. Cinco ventas seguidas de la misma talla
 *    generan una sola solicitud, no cinco.
 * 2. **No frena la venta.** Corre después de descontar, y si algo falla se
 *    anota y se sigue: la caja no puede quedarse sin cobrar porque el
 *    bodeguero no se enteró.
 * 3. **No pide lo que no hay.** Una solicitud que la bodega no puede cumplir
 *    el bodeguero la lee como un error suyo.
 */
@Injectable()
export class ReposicionAutomaticaService {
  private readonly log = new Logger(ReposicionAutomaticaService.name);

  /**
   * Revisa un punto (variante y bodega) y pide si toca.
   *
   * Recibe el `manager` de la transacción de la venta a propósito: si la venta
   * se deshace, la solicitud que generó también.
   */
  async revisar(
    manager: EntityManager,
    punto: {
      variantId: string;
      productId: string;
      warehouseId: string;
      tenantId: string;
      usuarioId?: string | null;
    },
  ): Promise<{ solicitudId: string; cantidad: number } | null> {
    const settings = await manager.getRepository(StoreSettings).findOne({
      where: { tenantId: punto.tenantId },
    });
    if (!settings?.autoReplenishEnabled) return null;

    const config: ConfiguracionReposicion = {
      encendida: true,
      umbral: settings.autoReplenishThreshold ?? 1,
      objetivo: settings.autoReplenishTarget ?? 3,
      soloEstosProductos: settings.autoReplenishProductIds ?? null,
    };

    // Cuánto queda en el local, cuál es su mínimo propio y de dónde saldría.
    const [fila] = await manager.query<{ saldo: string; minimo: string }[]>(
      `SELECT s.quantity AS saldo, s.min_stock AS minimo
         FROM stock s
        WHERE s.tenant_id = $1 AND s.variant_id = $2 AND s.warehouse_id = $3`,
      [punto.tenantId, punto.variantId, punto.warehouseId],
    );
    const saldo = Number(fila?.saldo ?? 0);
    const umbralPropio = Number(fila?.minimo ?? 0) || null;

    const origen = await this.bodegaDeOrigen(manager, punto, settings);
    if (!origen) return null;

    const yaPedido = await this.loQueYaViene(manager, punto);

    const decision = decidirReposicion(config, {
      productId: punto.productId,
      saldo,
      yaPedido,
      disponibleEnOrigen: origen.disponible,
      umbralPropio,
    });
    if (!decision) return null;

    return this.pedir(manager, punto, origen.warehouseId, decision.cantidad);
  }

  /**
   * De dónde sale la mercancía.
   *
   * La bodega que fijó la tienda, y si no fijó ninguna, la que más tenga en
   * ese momento. Nunca el mismo local que está pidiendo.
   */
  private async bodegaDeOrigen(
    manager: EntityManager,
    punto: { variantId: string; warehouseId: string; tenantId: string },
    settings: StoreSettings,
  ): Promise<{ warehouseId: string; disponible: number } | null> {
    const filas = await manager.query<
      { warehouse_id: string; quantity: string }[]
    >(
      `SELECT s.warehouse_id, s.quantity
         FROM stock s
         JOIN warehouses w ON w.id = s.warehouse_id
        WHERE s.tenant_id = $1
          AND s.variant_id = $2
          AND s.warehouse_id <> $3
          AND w.is_active = true
          AND s.quantity > 0
          AND ($4::uuid IS NULL OR s.warehouse_id = $4::uuid)
        ORDER BY s.quantity DESC`,
      [
        punto.tenantId,
        punto.variantId,
        punto.warehouseId,
        settings.autoReplenishSourceWarehouseId ?? null,
      ],
    );
    const mejor = filas[0];
    return mejor
      ? { warehouseId: mejor.warehouse_id, disponible: Number(mejor.quantity) }
      : null;
  }

  /** Lo que ya está pedido y todavía no llega. */
  private async loQueYaViene(
    manager: EntityManager,
    punto: { variantId: string; warehouseId: string; tenantId: string },
  ): Promise<number> {
    const [fila] = await manager.query<{ pendiente: string }[]>(
      `SELECT COALESCE(SUM(i.requested_quantity - i.remitted_quantity), 0) AS pendiente
         FROM internal_request_items i
         JOIN internal_requests r ON r.id = i.request_id
        WHERE r.tenant_id = $1
          AND r.destination_warehouse_id = $2
          AND i.variant_id = $3
          AND r.status IN ('CREATED', 'PREPARED', 'REMITTED')`,
      [punto.tenantId, punto.warehouseId, punto.variantId],
    );
    return Math.max(0, Number(fila?.pendiente ?? 0));
  }

  /**
   * Crea la solicitud, o le suma el renglón a la que ya está abierta.
   *
   * Sin esto, cinco ventas seguidas de la misma talla dejan cinco solicitudes
   * y el bodeguero acaba ignorándolas todas.
   */
  private async pedir(
    manager: EntityManager,
    punto: {
      variantId: string;
      warehouseId: string;
      tenantId: string;
      usuarioId?: string | null;
    },
    sourceWarehouseId: string,
    cantidad: number,
  ): Promise<{ solicitudId: string; cantidad: number }> {
    const requestRepo = manager.getRepository(InternalRequest);
    const itemRepo = manager.getRepository(InternalRequestItem);

    let solicitud = await requestRepo.findOne({
      where: {
        tenantId: punto.tenantId,
        destinationWarehouseId: punto.warehouseId,
        status: InternalRequestStatus.CREATED,
        origenAutomatico: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (!solicitud) {
      // El consecutivo se calcula con MAX+1 bajo el mismo candado que usa la
      // creación a mano: dos ventas simultáneas elegirían el mismo número.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `internal-request-number:${punto.tenantId}`,
      ]);
      const max = await requestRepo
        .createQueryBuilder('r')
        .select(
          "MAX(CAST(substring(r.request_number FROM '^SO-0*([0-9]+)$') AS integer))",
          'max',
        )
        .where('r.tenantId = :tenantId', { tenantId: punto.tenantId })
        .getRawOne<{ max: string | null }>();
      solicitud = await requestRepo.save(
        requestRepo.create({
          requestNumber: `SO-${String(Number(max?.max ?? 0) + 1).padStart(5, '0')}`,
          destinationWarehouseId: punto.warehouseId,
          sourceWarehouseId,
          notes: 'Pedida sola: el local se quedó sin existencia suficiente.',
          origenAutomatico: true,
          createdById: punto.usuarioId ?? null,
          tenantId: punto.tenantId,
        }),
      );
    }

    const existente = await itemRepo.findOne({
      where: {
        requestId: solicitud.id,
        variantId: punto.variantId,
        tenantId: punto.tenantId,
      },
    });
    if (existente) {
      await itemRepo.update(
        { id: existente.id, tenantId: punto.tenantId },
        { requestedQuantity: existente.requestedQuantity + cantidad },
      );
    } else {
      await itemRepo.save(
        itemRepo.create({
          requestId: solicitud.id,
          variantId: punto.variantId,
          requestedQuantity: cantidad,
          preparedQuantity: 0,
          remittedQuantity: 0,
          tenantId: punto.tenantId,
        }),
      );
    }

    this.log.log(
      `Reposición automática: ${cantidad} de la variante ${punto.variantId} ` +
        `hacia la bodega ${punto.warehouseId} (${solicitud.requestNumber}).`,
    );
    return { solicitudId: solicitud.id, cantidad };
  }
}
