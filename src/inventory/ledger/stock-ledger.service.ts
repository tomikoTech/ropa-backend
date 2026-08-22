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
 *    cuadradas, y si no, **queda escrito**: en la nota del movimiento y en el
 *    log. No se deshace la operación —sería contradecir la regla 3, y dejaría
 *    a una tienda con descuadre viejo sin poder cobrar hasta repararlo—; el
 *    reporte de integridad es el que lleva la cuenta.
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
  | 'INTERNAL_REQUEST_OUT'
  | 'INTERNAL_REQUEST_IN'
  | 'INTERNAL_REQUEST_RETURN'
  | 'STREET'
  /** El par que se entrega a cambio del devuelto. */
  | 'RETURN_EXCHANGE'
  /** Lo devuelto viaja a otra bodega (o al proveedor). */
  | 'RETURN_REMITTANCE'
  /** Recepción por cajas de una orden de compra. */
  | 'PURCHASE_BOX_LINE'
  /** Cajas que entran sin orden de compra. */
  | 'STOCK_UNIT_INTAKE'
  /** Una caja concreta cambia de bodega. */
  | 'STOCK_UNIT_TRANSFER'
  /** Abrir una caja, corregir su contenido: cosas de un bulto. */
  | 'STOCK_UNIT'
  /** El par sube del local a la vitrina. */
  | 'EXHIBICION_IN'
  /** Y el local se queda sin él. */
  | 'EXHIBICION_OUT';

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
   * Los bultos que se **esperaba** llevar, si todavía están.
   *
   * Es distinto de `unidades`: ahí el cajero tiene el par en la mano y si no
   * está disponible hay que decirlo. Aquí la caja mostró en pantalla cuáles
   * iban a salir —para que el cliente y el vendedor vean el código antes de
   * pagar— y entre eso y el cobro otra venta pudo llevarse alguno. Si pasa, se
   * elige por antigüedad como siempre: frenar el cobro porque un par cambió
   * sería el peor final para algo que solo era información.
   */
  unidadesPreferidas?: string[];
  /**
   * Deja el stock en este número en vez de sumarle `cantidad`.
   *
   * Solo para el conteo físico y las correcciones: ahí no se sabe cuánto se
   * movió, se sabe cuánto hay.
   */
  dejarEn?: number;
  /**
   * Permite que el saldo quede por debajo de cero.
   *
   * Existe por un caso concreto y deliberado: en perfumería, vender una loción
   * descuenta su frasco, y si no quedan frascos la venta **no se frena** —el
   * cliente ya está pagando—. El saldo negativo es justamente el aviso de que
   * hay que reponer. Fuera de ese caso, un negativo es un error y debe seguir
   * reventando.
   */
  permitirNegativo?: boolean;
  /**
   * Quien llama ya movió los bultos: aquí solo se mueve el agregado.
   *
   * Existe por un único caso legítimo: el servicio cuyo trabajo **es** manejar
   * los bultos —crearlos al ingresar mercancía, partir una caja en sus pares—.
   * Ahí los códigos ya se escribieron con toda su información (costo puesto en
   * bodega, contenido, estante), y dejar que el ledger cree otros duplicaría
   * el inventario.
   *
   * No es una puerta de atrás: el cuadre se comprueba igual al terminar, así
   * que si quien llama se equivocó con los bultos, sale en el aviso.
   */
  bultosYaMovidos?: boolean;
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

/**
 * Motivos que deshacen algo que ya pasó.
 *
 * Se distinguen de una entrada de verdad —una compra, un ajuste— porque no
 * traen mercancía nueva: devuelven la que salió. Y lo que salió ya tenía su
 * código.
 */
const REVERSAS = new Set<MotivoMovimiento>([
  'SALE_CANCEL',
  'SALE_EDIT',
  'RETURN',
]);

/**
 * En qué queda un bulto cuando sale del inventario disponible.
 *
 * No da igual: es lo que va a leer quien busque ese par y no lo encuentre. Un
 * ajuste a la baja los dejaba marcados «trasladados», como si estuvieran en
 * camino a otra bodega, cuando lo que pasó es que se dieron de baja.
 */
const ESTADO_AL_SALIR: Partial<Record<MotivoMovimiento, StockUnitStatus>> = {
  SALE: StockUnitStatus.SOLD,
  ECOMMERCE_ORDER: StockUnitStatus.SOLD,
  // Se fue a otro sitio y en algún momento llega.
  TRANSFER_OUT: StockUnitStatus.TRANSFERRED,
  INTERNAL_REQUEST: StockUnitStatus.TRANSFERRED,
  INTERNAL_REQUEST_OUT: StockUnitStatus.TRANSFERRED,
  // En la calle el par no está «en camino a otra bodega»: está en manos de un
  // patinador, en consignación, y puede volver.
  STREET: StockUnitStatus.CONSIGNED,
  // Dejó de ser inventario: nadie lo va a encontrar en ninguna bodega.
  RETURN_EXCHANGE: StockUnitStatus.SOLD,
  RETURN_REMITTANCE: StockUnitStatus.TRANSFERRED,
  STOCK_UNIT_TRANSFER: StockUnitStatus.TRANSFERRED,
  ADJUSTMENT: StockUnitStatus.WRITTEN_OFF,
  COUNT: StockUnitStatus.WRITTEN_OFF,
  PRODUCTION: StockUnitStatus.WRITTEN_OFF,
  // Deshacer una recepción de compra borra del mapa las etiquetas que esa
  // recepción había creado.
  PURCHASE: StockUnitStatus.WRITTEN_OFF,
};

/** El evento que corresponde a cada salida, para que el historial no mienta. */
const EVENTO_AL_SALIR: Partial<Record<StockUnitStatus, StockUnitEventType>> = {
  [StockUnitStatus.SOLD]: StockUnitEventType.SOLD,
  [StockUnitStatus.TRANSFERRED]: StockUnitEventType.TRANSFERRED,
  [StockUnitStatus.WRITTEN_OFF]: StockUnitEventType.WRITTEN_OFF,
  [StockUnitStatus.CONSIGNED]: StockUnitEventType.CONSIGNED,
};

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

    if (despues < 0 && !orden.permitirNegativo) {
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
    if (
      !orden.bultosYaMovidos &&
      (await this.llevaUnidades(manager, variantId, tenantId))
    ) {
      const resultado =
        delta < 0
          ? await this.consumir(manager, orden, -delta)
          : await this.crear(manager, orden, delta);
      unidades = resultado.unidades;
      sinEtiqueta = resultado.sinEtiqueta;
    }

    // Un movimiento de cero no movió nada: aparece en el historial como una
    // entrada que no entró y confunde a quien lo lee. Se llega aquí cuando lo
    // único que había que hacer era liberar códigos.
    if (delta !== 0) {
      await this.registrarMovimiento(manager, orden, delta, {
        antes,
        despues,
        sinEtiqueta,
        unidades,
      });
    }

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
      /**
       * Cómo se llama este traslado en el historial.
       *
       * Por defecto es un traslado a secas. Se cambia cuando el movimiento
       * tiene nombre propio para la tienda —una remisión de devolución, por
       * ejemplo—: en el historial no da igual leer «traslado» que leer de qué
       * documento salió.
       */
      motivos?: { salida: MotivoMovimiento; entrada: MotivoMovimiento };
    },
  ): Promise<ResultadoMovimiento> {
    const { variantId, tenantId, cantidad } = orden;
    if (cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad a trasladar debe ser mayor a 0',
      );
    }
    if (orden.desdeWarehouseId === orden.hastaWarehouseId) {
      throw new BadRequestException(
        'El origen y el destino deben ser distintos',
      );
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
        await manager
          .getRepository(StockUnit)
          .update(
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

    const motivoSalida = orden.motivos?.salida ?? 'TRANSFER_OUT';
    const motivoEntrada = orden.motivos?.entrada ?? 'TRANSFER_IN';
    for (const [warehouseId, delta, motivo] of [
      [orden.desdeWarehouseId, -cantidad, motivoSalida],
      [orden.hastaWarehouseId, cantidad, motivoEntrada],
    ] as const) {
      await this.registrarMovimiento(
        manager,
        { ...orden, warehouseId, motivo: motivo },
        delta,
        { antes: 0, despues: 0, sinEtiqueta, unidades },
      );
    }

    for (const warehouseId of [
      orden.desdeWarehouseId,
      orden.hastaWarehouseId,
    ]) {
      await this.exigirCuadre(manager, tenantId, variantId, warehouseId, orden);
    }

    return { saldo: destino.quantity, unidades, sinEtiqueta };
  }

  /**
   * Qué bultos siguen siendo de este documento.
   *
   * La pregunta se hace desde varios sitios —anular una venta, editarla,
   * recibir una devolución— y tiene una trampa: los eventos de un bulto no se
   * borran nunca. Preguntar «¿tiene algún evento de este documento?» devuelve
   * pares que ese documento soltó y que otro ya se llevó; devolverlos al
   * inventario sería regalar mercancía que está en manos de otro cliente.
   *
   * Manda el **último** evento que cambió su estado. Si no tiene ninguno, el
   * bulto es anterior a que se llevara esta historia y se acepta.
   */
  async unidadesDeLaReferencia(
    manager: EntityManager,
    referenciaId: string,
    tenantId: string,
    opciones: { extra?: string[]; estados?: StockUnitStatus[] } = {},
  ): Promise<StockUnit[]> {
    const estados = opciones.estados ?? [StockUnitStatus.SOLD];
    const candidatos: { id: string }[] = await manager.query(
      `SELECT DISTINCT e.stock_unit_id AS id
         FROM stock_unit_events e
        WHERE e.reference_id = $1 AND e.tenant_id = $2`,
      [referenciaId, tenantId],
    );
    const ids = new Set(candidatos.map((fila) => fila.id));
    for (const extra of opciones.extra ?? []) ids.add(extra);
    if (ids.size === 0) return [];

    const propias: { id: string }[] = await manager.query(
      `SELECT u.id
         FROM stock_units u
        WHERE u.id = ANY($1::uuid[])
          AND u.tenant_id = $2
          AND u.status::text = ANY($4::text[])
          AND (
            -- El último evento que cambió su estado tiene que ser de ESTA
            -- referencia. Antes se usaba COALESCE(..., $3) = $3, y un evento
            -- con referencia nula —los deja el ajuste manual— pasaba el filtro:
            -- una compra posterior «resucitaba» pares dados de baja a mano.
            (SELECT e.reference_id
               FROM stock_unit_events e
              WHERE e.stock_unit_id = u.id
                AND e.event_type IN
                    ('SOLD', 'RETURNED', 'TRANSFERRED', 'WRITTEN_OFF')
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1) = $3
            -- O no tiene ninguno: el bulto es anterior a que se llevara esta
            -- historia, y ahí quien pregunta es el único candidato.
            OR NOT EXISTS (
              SELECT 1 FROM stock_unit_events e
               WHERE e.stock_unit_id = u.id
                 AND e.event_type IN
                     ('SOLD', 'RETURNED', 'TRANSFERRED', 'WRITTEN_OFF')
            )
          )`,
      [[...ids], tenantId, referenciaId, estados],
    );
    if (propias.length === 0) return [];
    return manager.getRepository(StockUnit).find({
      where: { id: In(propias.map((f) => f.id)), tenantId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
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

  /**
   * ¿Este producto se maneja par por par?
   *
   * Vale la marca del producto **o** el ajuste de la tienda. Las dos, y no solo
   * la del producto, porque encender el inventario por cajas no marca hacia
   * atrás lo que ya estaba en el catálogo: una tienda que lo activaba después
   * de cargar sus productos se quedaba con el ajuste en «sí» y todos los
   * productos en «no», y el ledger concluía —correctamente según los datos, y
   * mal según la realidad— que ahí no había bultos que mover.
   *
   * Con el ajuste de la tienda mandando, ese olvido deja de ser posible.
   */
  private async llevaUnidades(
    manager: EntityManager,
    variantId: string,
    tenantId: string,
  ): Promise<boolean> {
    // SQL directo y no QueryBuilder: mezclar alias de relación con nombres de
    // columna (`p.unit_tracking`) no resuelve, y el resultado era `undefined`
    // —es decir, «este producto no lleva bultos»— en silencio. Un fallo así no
    // rompe nada visible: simplemente deja de mover los códigos.
    const filas = await manager.query<{ lleva: boolean }[]>(
      `SELECT (p.unit_tracking OR COALESCE(ss.unit_tracking_enabled, false)) AS lleva
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN store_settings ss ON ss.tenant_id = v.tenant_id
       WHERE v.id = $1 AND v.tenant_id = $2
       LIMIT 1`,
      [variantId, tenantId],
    );
    return !!filas[0]?.lleva;
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
      | 'variantId'
      | 'warehouseId'
      | 'tenantId'
      | 'unidades'
      | 'unidadesPreferidas'
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

    // Lo que la caja anunció va primero, si sigue disponible. Así el código
    // que el cliente vio en pantalla es el que sale en su factura, y cuando no
    // se puede, se resuelve solo en vez de frenar el cobro.
    if (orden.unidadesPreferidas?.length) {
      const preferidas = new Set(orden.unidadesPreferidas);
      disponibles.sort((a, b) => {
        const ap = preferidas.has(a.id) ? 0 : 1;
        const bp = preferidas.has(b.id) ? 0 : 1;
        return ap - bp;
      });
    }

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
  ): Promise<{
    unidades: { id: string; barcode: string }[];
    sinEtiqueta: number;
  }> {
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
        ESTADO_AL_SALIR[orden.motivo] ?? StockUnitStatus.TRANSFERRED;
      await manager
        .getRepository(StockUnit)
        .update({ id: In(elegidas.map((u) => u.id)) }, { status: estado });
      await this.anotarEventos(
        manager,
        elegidas,
        EVENTO_AL_SALIR[estado] ?? StockUnitEventType.TRANSFERRED,
        orden,
        {},
        estado,
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
  ): Promise<{
    unidades: { id: string; barcode: string }[];
    sinEtiqueta: number;
  }> {
    // Antes de inventar nada: ¿este mismo documento sacó bultos que ahora
    // están volviendo?
    //
    // Una remisión en tránsito los sacó del origen y ahora entran al destino;
    // deshacer una recepción de compra los dio de baja y re-aplicarla los
    // trae. Sin esta pregunta, el ledger creaba **códigos nuevos** en el
    // destino: la caja llegaba con su etiqueta impresa y el sistema le
    // asignaba otra, mientras la vieja se quedaba marcada como salida para
    // siempre.
    let queVuelven = orden.unidades ?? [];
    if (!queVuelven.length && orden.referenciaId) {
      const salidas = await this.unidadesDeLaReferencia(
        manager,
        orden.referenciaId,
        orden.tenantId,
        {
          estados: [
            StockUnitStatus.TRANSFERRED,
            StockUnitStatus.SOLD,
            StockUnitStatus.WRITTEN_OFF,
            StockUnitStatus.CONSIGNED,
          ],
        },
      );
      // Se cuentan **unidades**, no bultos: una caja de cinco pares vale por
      // cinco. Cortar la lista por número de filas hacía volver una caja
      // entera para reponer dos unidades, y el destino terminaba con tres de
      // más.
      let faltan = cantidad;
      queVuelven = [];
      for (const u of salidas) {
        if (faltan <= 0) break;
        if (u.variantId !== orden.variantId) continue;
        // Una caja no se parte para reponer parte de su contenido.
        if (u.quantity > faltan) continue;
        queVuelven.push(u.id);
        faltan -= u.quantity;
      }
    }

    // Si hay bultos concretos que devolver, vuelven ellos: nada de códigos
    // nuevos.
    if (queVuelven.length) {
      const repo = manager.getRepository(StockUnit);
      const pedidas = await repo.find({
        where: { id: In(queVuelven), tenantId: orden.tenantId },
      });
      // Solo vuelven las que están fuera. Una que ya está disponible no se
      // "devuelve" otra vez: repetirlo la duplicaría contra el agregado y
      // encima le cambiaría la bodega sin que nadie la haya movido.
      const devolubles = pedidas.filter(
        (u) => u.status !== StockUnitStatus.IN_STOCK,
      );
      if (devolubles.length) {
        await repo.update(
          { id: In(devolubles.map((u) => u.id)) },
          { status: StockUnitStatus.IN_STOCK, warehouseId: orden.warehouseId },
        );
        await this.anotarEventos(
          manager,
          devolubles,
          StockUnitEventType.RETURNED,
          orden,
        );
      }
      // Lo que la reversa repuso en el agregado y no pudo respaldar con un
      // código. Decir cero aquí silenciaba el hueco justo en la nota del
      // movimiento, que es donde va a mirar quien revise esa referencia.
      const cubierto = devolubles.reduce((n, u) => n + u.quantity, 0);
      const faltantes = queVuelven.filter(
        (id) => !pedidas.some((u) => u.id === id),
      );
      if (faltantes.length) {
        this.log.warn(
          `Al reponer por ${orden.motivo} no se encontraron ${faltantes.length} ` +
            `código(s) que la referencia decía tener.`,
        );
      }
      const porCubrir = Math.max(0, cantidad - cubierto);
      const devueltas = devolubles.map((u) => ({
        id: u.id,
        barcode: u.barcode,
      }));
      // Si lo que volvió no alcanza para todo lo que entró, el resto es
      // mercancía nueva y necesita etiqueta nueva.
      //
      // Antes se devolvía aquí con el hueco anotado y ya: subir de 5 a 8 pares
      // en una compra ya recibida reponía los 5 códigos viejos y dejaba los 3
      // que sí habían llegado sin etiqueta que imprimir. En una reversa no
      // aplica —ahí lo que no se identificó no existe, y crear un código
      // nuevo desincronizaría el papel impreso del par—.
      if (porCubrir > 0 && !REVERSAS.has(orden.motivo)) {
        const nuevas = await this.crearEtiquetas(manager, orden, porCubrir);
        return {
          unidades: [...devueltas, ...nuevas],
          sinEtiqueta: 0,
        };
      }
      return { unidades: devueltas, sinEtiqueta: porCubrir };
    }

    // Una reversa nunca inventa etiquetas.
    //
    // Anular o editar una venta repone la existencia, pero los pares que
    // vuelven son los que se habían llevado, con el código que trae impreso la
    // caja. Si no se pudo saber cuáles eran —ventas viejas, de antes de que
    // esto pasara por aquí—, crear códigos nuevos sería peor que no crear
    // ninguno: la etiqueta física del par ya no coincidiría con la del
    // sistema, y los originales seguirían marcados como vendidos. Se repone la
    // existencia y el hueco queda anotado y visible en el reporte.
    if (REVERSAS.has(orden.motivo)) {
      this.log.warn(
        `Se repusieron ${cantidad} unidad(es) de la variante ${orden.variantId} ` +
          `en la bodega ${orden.warehouseId} sin códigos identificables (${orden.motivo}).`,
      );
      return { unidades: [], sinEtiqueta: cantidad };
    }

    const nuevas = await this.crearEtiquetas(manager, orden, cantidad);
    return { unidades: nuevas, sinEtiqueta: 0 };
  }

  /** Etiquetas nuevas: una por unidad, cada una con su código. */
  private async crearEtiquetas(
    manager: EntityManager,
    orden: OrdenDeMovimiento,
    cantidad: number,
  ): Promise<{ id: string; barcode: string }[]> {
    const variante = await manager.getRepository(ProductVariant).findOne({
      where: { id: orden.variantId, tenantId: orden.tenantId },
    });
    if (!variante) throw new NotFoundException('La variante no existe');

    const repo = manager.getRepository(StockUnit);
    const hoy = new Date();
    const consecutivo = await this.siguienteConsecutivo(
      manager,
      hoy,
      orden.tenantId,
    );
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
    return guardadas.map((u) => ({ id: u.id, barcode: u.barcode }));
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

  /** En qué queda el bulto según lo que le pasó. */
  private static readonly ESTADO_TRAS: Partial<
    Record<StockUnitEventType, StockUnitStatus>
  > = {
    [StockUnitEventType.SOLD]: StockUnitStatus.SOLD,
    [StockUnitEventType.TRANSFERRED]: StockUnitStatus.TRANSFERRED,
    [StockUnitEventType.RETURNED]: StockUnitStatus.IN_STOCK,
    [StockUnitEventType.RECEIVED]: StockUnitStatus.IN_STOCK,
    [StockUnitEventType.WRITTEN_OFF]: StockUnitStatus.WRITTEN_OFF,
    [StockUnitEventType.CONSIGNED]: StockUnitStatus.CONSIGNED,
  };

  private async anotarEventos(
    manager: EntityManager,
    unidades: StockUnit[],
    tipo: StockUnitEventType,
    orden: Pick<OrdenDeMovimiento, 'motivo' | 'referenciaId' | 'usuarioId'>,
    metadata: Record<string, unknown> = {},
    /** El estado real en que quedó, cuando no se deduce del tipo de evento. */
    estadoFinal?: StockUnitStatus,
  ): Promise<void> {
    if (!unidades.length) return;
    const repo = manager.getRepository(StockUnitEvent);
    // `toStatus` importa: sin él la línea de tiempo de un par tiene huecos
    // justo en los eventos más frecuentes —vender, anular, editar—, mientras
    // que traslados y conteos sí lo guardan. Se dedujo del tipo de evento
    // porque quien llama ya lo decidió al elegir el tipo.
    const destino = estadoFinal ?? StockLedgerService.ESTADO_TRAS[tipo] ?? null;
    await repo.save(
      unidades.map((u) =>
        repo.create({
          stockUnitId: u.id,
          eventType: tipo,
          fromStatus: u.status,
          toStatus: destino,
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
      // Un saldo negativo solo llega aquí si quien llamó lo permitió a
      // propósito. Queda escrito para que se vea de dónde salió y no aparezca
      // como un misterio en el historial.
      contexto.despues < 0
        ? `El saldo quedó en ${contexto.despues}: se movió más de lo que había registrado.`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const movimiento = repo.create({
      variantId: orden.variantId,
      warehouseId: orden.warehouseId,
      tenantId: orden.tenantId,
      // Qué pares se movieron, no solo cuántos: es el código que va impreso en
      // la caja y el único que sirve para ir a buscarla.
      unitBarcodes: contexto.unidades.length
        ? contexto.unidades.map((u) => u.barcode)
        : null,
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
   * Comprueba que la variante y bodega quedaron cuadradas, y lo anota si no.
   *
   * Deliberadamente **no** revienta. Un descuadre que ya existía antes no es
   * culpa de esta operación, y frenarla obligaría a la tienda a reparar datos
   * viejos antes de poder cobrar. Y cuando el descuadre sí lo abre esta
   * operación, es por la regla 3 —salir sin etiqueta suficiente—, que existe
   * justamente para no frenar una venta con el cliente enfrente.
   *
   * La red de seguridad de verdad es la prueba de arquitectura, que impide
   * escribir el inventario por fuera de aquí, más el reporte de integridad,
   * que hace visible lo que se acumule.
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
    this.log.warn(
      `Descuadre en ${descuadre.sku} @ ${descuadre.warehouseName} tras ${orden.motivo}: ` +
        `agregado ${descuadre.agregado} vs etiquetadas ${descuadre.etiquetadas}.`,
    );
  }
}
