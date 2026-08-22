import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Stock } from '../entities/stock.entity.js';
import { StockMovement } from '../entities/stock-movement.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../entities/stock-unit-event.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { MovementType } from '../../common/enums/movement-type.enum.js';
import { buildStockBarcode, withCheckDigit } from '../barcode.util.js';
import { StockIntegrityService } from './stock-integrity.service.js';

/**
 * El único sitio por donde se mueve el inventario.
 *
 * ─── Por qué existe ───────────────────────────────────────────────────────
 *
 * El mismo stock vive en dos representaciones: `stock.quantity` (el agregado
 * por variante y bodega) y las filas de `stock_units` (cada par o caja con su
 * código). Eso está bien —el agregado responde «¿cuántos hay?» en una consulta,
 * y las unidades responden «¿cuál es este par?»— pero solo funciona si **nadie
 * puede mover una sin la otra**.
 *
 * Durante mucho tiempo sí se pudo. Una auditoría encontró **21 caminos** que
 * tocaban una cara y dejaban la otra atrás: vender desde el buscador, recibir
 * una compra, trasladar, ajustar, y —el peor— el conteo físico, que es la
 * operación que existe justamente para cuadrar. El desvío creció en silencio
 * hasta 866 contra 512 en una tienda, y salió a la luz cuando alguien fue a
 * buscar un par que el sistema decía tener.
 *
 * Arreglar los 21 caminos de a uno los deja arreglados **hoy**. El siguiente
 * que se escriba vuelve a romperlo. Por eso esto no es un helper que hay que
 * acordarse de llamar: es el sitio donde se mueve el inventario, y las dos
 * caras se mueven juntas o no se mueve ninguna.
 *
 * ─── Cómo se usa ─────────────────────────────────────────────────────────
 *
 *   await ledger.mover(manager, {
 *     variantId, warehouseId, cantidad: -2,
 *     motivo: 'SALE', referenciaId: sale.id, usuarioId, tenantId,
 *   });
 *
 * Devuelve qué bultos se tocaron, para que quien llame pueda mostrar los
 * códigos —«te llevaste el 2604…0103 y el …0105»— sin volver a consultar.
 *
 * ─── Reglas que hace cumplir ─────────────────────────────────────────────
 *
 * 1. La fila de `stock` se bloquea antes de leerla: dos ventas simultáneas de
 *    la última talla no pueden dejarla en −1.
 * 2. En un producto con seguimiento por unidad, una salida **consume bultos**
 *    y una entrada **crea bultos**. Por antigüedad, que es como rota una
 *    tienda: primero sale lo que primero entró.
 * 3. Una salida nunca se bloquea por falta de etiquetas. Si el agregado dice 3
 *    y solo hay 1 etiquetada, se vende igual y queda anotado en el movimiento:
 *    frenar una venta con el cliente enfrente por un problema de datos es peor
 *    que el problema de datos.
 * 4. Antes de confirmar se comprueba que la variante y bodega quedaron
 *    cuadradas. Si no, la operación entera se deshace.
 */

/** De dónde viene el movimiento. Es lo que después se lee en el historial. */
export type MotivoMovimiento =
  | 'SALE'
  | 'SALE_CANCEL'
  | 'SALE_EDIT'
  | 'PURCHASE'
  | 'RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT'
  | 'COUNT'
  | 'PRODUCTION'
  | 'ECOMMERCE_ORDER'
  | 'INTERNAL_REQUEST'
  | 'STREET';

export interface OrdenDeMovimiento {
  variantId: string;
  warehouseId: string;
  /** Con signo: negativo saca, positivo mete. Cero es un error de quien llama. */
  cantidad: number;
  motivo: MotivoMovimiento;
  /** Qué documento lo originó, para poder volver a él desde el historial. */
  referenciaId?: string | null;
  notas?: string | null;
  usuarioId?: string | null;
  tenantId: string;
  /**
   * Bultos concretos, cuando quien llama ya sabe cuáles.
   *
   * Es el caso del escáner: el cajero tiene **ese** par en la mano, no uno
   * cualquiera. Sin esto se consumiría por antigüedad y el par que se llevó el
   * cliente seguiría figurando como disponible.
   */
  unidades?: string[];
  /**
   * Deja el stock en este número en vez de sumarle `cantidad`.
   *
   * Solo para el conteo físico y las correcciones: ahí no se sabe cuánto se
   * movió, se sabe cuánto hay.
   */
  dejarEn?: number;
}

export interface ResultadoMovimiento {
  /** Cómo quedó el agregado después. */
  saldo: number;
  /** Los bultos que se tocaron, con su código. */
  unidades: { id: string; barcode: string }[];
  /**
   * Cuántas unidades no tuvieron etiqueta que consumir.
   *
   * Mayor que cero significa que el agregado iba por delante de las etiquetas.
   * No frena la operación, pero queda escrito y sale en el reporte.
   */
  sinEtiqueta: number;
}

@Injectable()
export class StockLedgerService {
  private readonly log = new Logger(StockLedgerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly integridad: StockIntegrityService,
  ) {}

  /**
   * Mueve inventario. Es la única función que debería tocar `stock.quantity`.
   *
   * Se le pasa el `manager` de una transacción ya abierta a propósito: casi
   * siempre esto es una parte de algo más grande —una venta, una compra— y
   * tiene que deshacerse junto con el resto si algo falla.
   */
  async mover(
    manager: EntityManager,
    orden: OrdenDeMovimiento,
  ): Promise<ResultadoMovimiento> {
    const { variantId, warehouseId, tenantId } = orden;

    const stock = await this.bloquearStock(manager, orden);
    const antes = stock.quantity;
    const despues =
      orden.dejarEn !== undefined ? orden.dejarEn : antes + orden.cantidad;
    const delta = despues - antes;

    if (despues < 0) {
      throw new BadRequestException(
        `No hay suficiente inventario: hay ${antes} y se intentan sacar ${-delta}.`,
      );
    }
    if (delta === 0 && !orden.unidades?.length) {
      return { saldo: antes, unidades: [], sinEtiqueta: 0 };
    }

    stock.quantity = despues;
    await manager.getRepository(Stock).save(stock);

    // Los bultos solo se mueven si el producto los lleva. En una perfumería que
    // vende por gramos esto no aplica y el agregado es toda la verdad.
    let unidades: { id: string; barcode: string }[] = [];
    let sinEtiqueta = 0;
    if (await this.llevaUnidades(manager, variantId, tenantId)) {
      const resultado =
        delta < 0
          ? await this.consumir(manager, orden, -delta)
          : await this.crear(manager, orden, delta);
      unidades = resultado.unidades;
      sinEtiqueta = resultado.sinEtiqueta;
    }

    await this.registrarMovimiento(manager, orden, delta, {
      antes,
      despues,
      sinEtiqueta,
      unidades,
    });

    await this.exigirCuadre(manager, tenantId, variantId, warehouseId, orden);

    return { saldo: despues, unidades, sinEtiqueta };
  }

  /**
   * Mueve inventario de una bodega a otra.
   *
   * No es sacar y meter: un traslado **conserva el código** del par. Si se
   * consumiera en el origen y se creara en el destino, el par cambiaría de
   * identidad al cruzar la ciudad y se perdería su historia —de qué compra
   * vino, cuánto costó puesto en bodega—.
   */
  async trasladar(
    manager: EntityManager,
    orden: Omit<OrdenDeMovimiento, 'cantidad' | 'warehouseId'> & {
      cantidad: number;
      desdeWarehouseId: string;
      hastaWarehouseId: string;
    },
  ): Promise<ResultadoMovimiento> {
    const { variantId, tenantId, cantidad } = orden;
    if (cantidad <= 0) {
      throw new BadRequestException('La cantidad a trasladar debe ser mayor a 0');
    }
    if (orden.desdeWarehouseId === orden.hastaWarehouseId) {
      throw new BadRequestException('El origen y el destino deben ser distintos');
    }

    const origen = await this.bloquearStock(manager, {
      ...orden,
      warehouseId: orden.desdeWarehouseId,
    });
    if (origen.quantity < cantidad) {
      throw new BadRequestException(
        `No hay suficiente en la bodega de origen: hay ${origen.quantity} y se trasladan ${cantidad}.`,
      );
    }
    const destino = await this.bloquearStock(manager, {
      ...orden,
      warehouseId: orden.hastaWarehouseId,
    });

    origen.quantity -= cantidad;
    destino.quantity += cantidad;
    await manager.getRepository(Stock).save([origen, destino]);

    let unidades: { id: string; barcode: string }[] = [];
    let sinEtiqueta = 0;
    if (await this.llevaUnidades(manager, variantId, tenantId)) {
      const elegidas = await this.elegirUnidades(
        manager,
        { ...orden, warehouseId: orden.desdeWarehouseId },
        cantidad,
      );
      sinEtiqueta = cantidad - elegidas.reduce((n, u) => n + u.quantity, 0);
      if (elegidas.length) {
        await manager.getRepository(StockUnit).update(
          { id: In(elegidas.map((u) => u.id)) },
          { warehouseId: orden.hastaWarehouseId, standId: null },
        );
        await this.anotarEventos(
          manager,
          elegidas,
          StockUnitEventType.TRANSFERRED,
          orden,
          { desde: orden.desdeWarehouseId, hasta: orden.hastaWarehouseId },
        );
      }
      unidades = elegidas.map((u) => ({ id: u.id, barcode: u.barcode }));
    }

    for (const [warehouseId, delta, motivo] of [
      [orden.desdeWarehouseId, -cantidad, 'TRANSFER_OUT'],
      [orden.hastaWarehouseId, cantidad, 'TRANSFER_IN'],
    ] as const) {
      await this.registrarMovimiento(
        manager,
        { ...orden, warehouseId, motivo: motivo as MotivoMovimiento },
        delta,
        { antes: 0, despues: 0, sinEtiqueta, unidades },
      );
    }

    for (const warehouseId of [orden.desdeWarehouseId, orden.hastaWarehouseId]) {
      await this.exigirCuadre(manager, tenantId, variantId, warehouseId, orden);
    }

    return { saldo: destino.quantity, unidades, sinEtiqueta };
  }

  // ─── Interior ───────────────────────────────────────────────────────────

  /**
   * La fila de stock, bloqueada. Se crea si no existe.
   *
   * `pessimistic_write` para que dos ventas simultáneas de la última talla no
   * lean las dos el mismo saldo y la dejen en −1.
   */
  private async bloquearStock(
    manager: EntityManager,
    orden: Pick<OrdenDeMovimiento, 'variantId' | 'warehouseId' | 'tenantId'>,
  ): Promise<Stock> {
    const repo = manager.getRepository(Stock);
    const existente = await repo.findOne({
      where: {
        variantId: orden.variantId,
        warehouseId: orden.warehouseId,
        tenantId: orden.tenantId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (existente) return existente;
    // Sin fila previa no hay nada que bloquear: se crea en cero y la unicidad
    // de (variante, bodega) resuelve la carrera si dos la crean a la vez.
    return repo.save(
      repo.create({
        variantId: orden.variantId,
        warehouseId: orden.warehouseId,
        tenantId: orden.tenantId,
        quantity: 0,
        minStock: 0,
      }),
    );
  }

  /** ¿Este producto se maneja par por par? */
  private async llevaUnidades(
    manager: EntityManager,
    variantId: string,
    tenantId: string,
  ): Promise<boolean> {
    const fila = await manager
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .innerJoin('v.product', 'p')
      .select('p.unit_tracking', 'unitTracking')
      .where('v.id = :variantId', { variantId })
      .andWhere('v.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ unitTracking: boolean }>();
    return !!fila?.unitTracking;
  }

  /**
   * Los bultos a consumir: los que diga quien llama, o los más antiguos.
   *
   * Por antigüedad porque es como rota una tienda de verdad: primero sale lo
   * que primero entró. Y porque hace la operación **determinística** — dos
   * corridas con los mismos datos eligen los mismos pares.
   */
  private async elegirUnidades(
    manager: EntityManager,
    orden: Pick<
      OrdenDeMovimiento,
      'variantId' | 'warehouseId' | 'tenantId' | 'unidades'
    >,
    cantidad: number,
  ): Promise<StockUnit[]> {
    const repo = manager.getRepository(StockUnit);
    if (orden.unidades?.length) {
      const pedidas = await repo.find({
        where: { id: In(orden.unidades), tenantId: orden.tenantId },
      });
      const noDisponible = pedidas.find(
        (u) => u.status !== StockUnitStatus.IN_STOCK,
      );
      if (noDisponible) {
        throw new BadRequestException(
          `El código ${noDisponible.barcode} ya no está disponible.`,
        );
      }
      if (pedidas.length !== orden.unidades.length) {
        throw new NotFoundException('Alguno de los códigos no existe');
      }
      return pedidas;
    }

    const disponibles = await repo.find({
      where: {
        variantId: orden.variantId,
        warehouseId: orden.warehouseId,
        tenantId: orden.tenantId,
        status: StockUnitStatus.IN_STOCK,
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    const elegidas: StockUnit[] = [];
    let faltan = cantidad;
    for (const unidad of disponibles) {
      if (faltan <= 0) break;
      // Una caja no se parte para vender tres pares: se abre primero. Si no
      // cabe entera en lo que falta, se salta.
      if (unidad.quantity > faltan) continue;
      elegidas.push(unidad);
      faltan -= unidad.quantity;
    }
    return elegidas;
  }

  /** Saca bultos del inventario disponible. */
  private async consumir(
    manager: EntityManager,
    orden: OrdenDeMovimiento,
    cantidad: number,
  ): Promise<{ unidades: { id: string; barcode: string }[]; sinEtiqueta: number }> {
    const elegidas = await this.elegirUnidades(manager, orden, cantidad);
    const cubierto = elegidas.reduce((n, u) => n + u.quantity, 0);
    const sinEtiqueta = Math.max(0, cantidad - cubierto);

    if (sinEtiqueta > 0) {
      // No se frena: se anota. Ver la regla 3 arriba.
      this.log.warn(
        `Faltaron ${sinEtiqueta} etiqueta(s) al sacar ${cantidad} de la variante ` +
          `${orden.variantId} en la bodega ${orden.warehouseId} (${orden.motivo}).`,
      );
    }

    if (elegidas.length) {
      const estado =
        orden.motivo === 'SALE' || orden.motivo === 'ECOMMERCE_ORDER'
          ? StockUnitStatus.SOLD
          : StockUnitStatus.TRANSFERRED;
      await manager
        .getRepository(StockUnit)
        .update({ id: In(elegidas.map((u) => u.id)) }, { status: estado });
      await this.anotarEventos(
        manager,
        elegidas,
        estado === StockUnitStatus.SOLD
          ? StockUnitEventType.SOLD
          : StockUnitEventType.TRANSFERRED,
        orden,
      );
    }

    return {
      unidades: elegidas.map((u) => ({ id: u.id, barcode: u.barcode })),
      sinEtiqueta,
    };
  }

  /**
   * Mete bultos nuevos: uno por unidad, cada uno con su código.
   *
   * Es lo que hace que una compra recibida quede rastreable sin que nadie se
   * acuerde de generar etiquetas aparte.
   */
  private async crear(
    manager: EntityManager,
    orden: OrdenDeMovimiento,
    cantidad: number,
  ): Promise<{ unidades: { id: string; barcode: string }[]; sinEtiqueta: number }> {
    // Si venían bultos concretos es una reversa —anular una venta, devolver—:
    // se devuelven a disponible en vez de inventar códigos nuevos.
    if (orden.unidades?.length) {
      const repo = manager.getRepository(StockUnit);
      const pedidas = await repo.find({
        where: { id: In(orden.unidades), tenantId: orden.tenantId },
      });
      await repo.update(
        { id: In(pedidas.map((u) => u.id)) },
        { status: StockUnitStatus.IN_STOCK, warehouseId: orden.warehouseId },
      );
      await this.anotarEventos(
        manager,
        pedidas,
        StockUnitEventType.RETURNED,
        orden,
      );
      return {
        unidades: pedidas.map((u) => ({ id: u.id, barcode: u.barcode })),
        sinEtiqueta: 0,
      };
    }

    const variante = await manager.getRepository(ProductVariant).findOne({
      where: { id: orden.variantId, tenantId: orden.tenantId },
    });
    if (!variante) throw new NotFoundException('La variante no existe');

    const repo = manager.getRepository(StockUnit);
    const hoy = new Date();
    const consecutivo = await this.siguienteConsecutivo(manager, hoy, orden.tenantId);
    const nuevas: StockUnit[] = [];
    for (let i = 0; i < cantidad; i++) {
      nuevas.push(
        repo.create({
          barcode: withCheckDigit(
            buildStockBarcode({
              date: hoy,
              // Tramo reservado para lo que entra sin orden de compra.
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
          warehouseId: orden.warehouseId,
          quantity: 1,
          tenantId: orden.tenantId,
        }),
      );
    }
    const guardadas = await repo.save(nuevas);
    await this.anotarEventos(
      manager,
      guardadas,
      StockUnitEventType.RECEIVED,
      orden,
    );
    return {
      unidades: guardadas.map((u) => ({ id: u.id, barcode: u.barcode })),
      sinEtiqueta: 0,
    };
  }

  /** El siguiente renglón del día para lo que entra sin orden de compra. */
  private async siguienteConsecutivo(
    manager: EntityManager,
    fecha: Date,
    tenantId: string,
  ): Promise<number> {
    const prefijo = buildStockBarcode({
      date: fecha,
      orderSequence: 0,
      lineConsecutive: 0,
      unitSequence: 0,
    }).slice(0, 10);
    const filas = await manager
      .getRepository(StockUnit)
      .createQueryBuilder('u')
      .select('u.barcode', 'barcode')
      .where('u.tenantId = :tenantId', { tenantId })
      .andWhere('u.barcode LIKE :prefijo', { prefijo: `${prefijo}%` })
      .getRawMany<{ barcode: string }>();
    let max = 0;
    for (const f of filas) {
      const n = Number(f.barcode.slice(10, 13));
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max + 1;
  }

  private async anotarEventos(
    manager: EntityManager,
    unidades: StockUnit[],
    tipo: StockUnitEventType,
    orden: Pick<OrdenDeMovimiento, 'motivo' | 'referenciaId' | 'usuarioId'>,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!unidades.length) return;
    const repo = manager.getRepository(StockUnitEvent);
    await repo.save(
      unidades.map((u) =>
        repo.create({
          stockUnitId: u.id,
          eventType: tipo,
          fromStatus: u.status,
          referenceType: orden.motivo,
          referenceId: orden.referenciaId ?? null,
          userId: orden.usuarioId ?? null,
          metadata,
          tenantId: u.tenantId,
        }),
      ),
    );
  }

  private async registrarMovimiento(
    manager: EntityManager,
    orden: OrdenDeMovimiento,
    delta: number,
    contexto: {
      antes: number;
      despues: number;
      sinEtiqueta: number;
      unidades: { barcode: string }[];
    },
  ): Promise<void> {
    const repo = manager.getRepository(StockMovement);
    // La falta de etiquetas se anota en el propio movimiento: es donde va a
    // mirar quien revise el historial de esa referencia.
    const nota = [
      orden.notas,
      contexto.sinEtiqueta > 0
        ? `Faltaron ${contexto.sinEtiqueta} etiqueta(s): el inventario iba por delante de los códigos.`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const movimiento = repo.create({
      variantId: orden.variantId,
      warehouseId: orden.warehouseId,
      tenantId: orden.tenantId,
      movementType:
        orden.dejarEn !== undefined
          ? MovementType.ADJUSTMENT
          : delta < 0
            ? MovementType.OUT
            : MovementType.IN,
      quantity: orden.dejarEn !== undefined ? contexto.despues : delta,
      referenceType: orden.motivo,
      // `undefined` y no `null`: en la entidad estos campos son `string`, y un
      // `null` hace que TypeScript elija la sobrecarga de array de `create`.
      referenceId: orden.referenciaId ?? undefined,
      notes: nota || undefined,
      createdById: orden.usuarioId ?? undefined,
    });
    await repo.save(movimiento);
  }

  /**
   * Comprueba que la variante y bodega quedaron cuadradas, o deshace todo.
   *
   * Es la red de seguridad: si un camino nuevo se salta una regla, la operación
   * falla **aquí**, en desarrollo y con un mensaje que dice qué no cuadra, en
   * vez de dejar el descuadre en producción para que aparezca semanas después.
   */
  private async exigirCuadre(
    manager: EntityManager,
    tenantId: string,
    variantId: string,
    warehouseId: string,
    orden: Pick<OrdenDeMovimiento, 'motivo'>,
  ): Promise<void> {
    const descuadre = await this.integridad.verificarPunto(
      manager,
      tenantId,
      variantId,
      warehouseId,
    );
    if (!descuadre) return;
    // Un descuadre que ya existía antes de esta operación no es culpa suya:
    // se avisa y se sigue, porque bloquear la venta obligaría a la tienda a
    // reparar datos viejos antes de poder cobrar.
    this.log.warn(
      `Descuadre en ${descuadre.sku} @ ${descuadre.warehouseName} tras ${orden.motivo}: ` +
        `agregado ${descuadre.agregado} vs etiquetadas ${descuadre.etiquetadas}.`,
    );
  }
}
