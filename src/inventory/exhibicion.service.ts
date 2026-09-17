import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { StockLedgerService } from './ledger/stock-ledger.service.js';
import { faltaPorExhibir, type ConfiguracionExhibicion } from './exhibicion.js';
import {
  huecosDeLaPlantilla,
  type FilaDeLaPlantilla,
  type HuecoDeVitrina,
} from './plantilla-de-vitrina.js';

/** Una talla del local que se puede subir a la vitrina. */
export interface TallaDisponible {
  variantId: string;
  talla: string | null;
  color: string | null;
  disponible: number;
}

/** Una referencia que no está en la vitrina y debería. */
export interface PendienteDeExhibir {
  vitrinaId: string;
  vitrinaNombre: string;
  localId: string;
  localNombre: string;
  productId: string;
  productNombre: string;
  referencia: string | null;
  /** Cuántos hay hoy en la vitrina. */
  enVitrina: number;
  /** Cuántos puede subir el local. */
  disponibleEnElLocal: number;
  /** Cuántos faltan por subir. */
  faltan: number;
  /**
   * Qué tallas hay en el local para subir.
   *
   * Vienen en la misma respuesta a propósito: quien ve el pendiente tiene que
   * poder resolverlo ahí mismo. La queja que originó todo esto fue tener que
   * «salirse de la pantalla, devolverse y recordar un número» para completar
   * una tarea.
   */
  tallasEnElLocal: TallaDisponible[];
}

/**
 * Qué está en la vitrina y qué falta por subir.
 *
 * La exhibición no es una tabla: es una bodega marcada (`is_exhibition`) que
 * pertenece a un local (`exhibition_of_warehouse_id`). Esa decisión es la que
 * hace que se pueda vender exhibición y bodega **en el mismo ticket**, que es
 * justo lo que la aplicación de la competencia no puede: allá la exhibición
 * vive en otro inventario y hay que reportarla en una venta aparte.
 *
 * Acá lo único propio es el aviso: «venden un zapato que está en exhibición,
 * que es la muestra. Si lo venden o lo prestan, ahí automáticamente ya sale la
 * alerta de que falta por exhibir».
 */
@Injectable()
export class ExhibicionService {
  private readonly log = new Logger(ExhibicionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: StockLedgerService,
  ) {}

  private async configuracion(
    manager: EntityManager,
    tenantId: string,
  ): Promise<ConfiguracionExhibicion> {
    const settings = await manager
      .getRepository(StoreSettings)
      .findOne({ where: { tenantId } });
    return {
      encendida: !!settings?.exhibicionEnabled,
      objetivo: settings?.exhibicionObjetivo ?? 1,
    };
  }

  /**
   * Lo que falta por exhibir, por vitrina y por referencia.
   *
   * Cuenta **por referencia y no por talla**: en vitrina va un par del modelo,
   * no uno de cada talla. Pedir uno por talla llenaría la lista de pendientes
   * imposibles y nadie volvería a mirarla.
   *
   * Una vitrina sin local asignado no aparece: no habría de dónde sacar el
   * par, y un pendiente que nadie puede cumplir el vendedor lo lee como un
   * error suyo.
   */
  async pendientes(
    tenantId: string,
    filtro?: { vitrinaId?: string; localId?: string },
  ): Promise<PendienteDeExhibir[]> {
    const config = await this.configuracion(this.dataSource.manager, tenantId);
    // Salida temprana **redundante**: `faltaPorExhibir` también respeta el
    // interruptor, así que quitar esta línea no cambia el resultado y ninguna
    // prueba la mata. Está para no correr la consulta —que recorre todo el
    // stock de la tienda— cuando la respuesta ya se sabe.
    if (!config.encendida) return [];

    const filas = await this.dataSource.query<
      {
        vitrina_id: string;
        vitrina_nombre: string;
        local_id: string;
        local_nombre: string;
        product_id: string;
        product_nombre: string;
        referencia: string | null;
        objetivo_propio: number | null;
        en_vitrina: string;
        en_local: string;
      }[]
    >(
      `SELECT v.id                AS vitrina_id,
              v.name              AS vitrina_nombre,
              l.id                AS local_id,
              l.name              AS local_nombre,
              p.id                AS product_id,
              p.name              AS product_nombre,
              p.sku_prefix        AS referencia,
              p.exhibicion_objetivo AS objetivo_propio,
              COALESCE(SUM(CASE WHEN s.warehouse_id = v.id THEN s.quantity END), 0) AS en_vitrina,
              COALESCE(SUM(CASE WHEN s.warehouse_id = l.id THEN s.quantity END), 0) AS en_local
         FROM warehouses v
         JOIN warehouses l
           ON l.id = v.exhibition_of_warehouse_id
          AND l.tenant_id = v.tenant_id
          AND l.is_active = true
         JOIN stock s
           ON s.warehouse_id IN (v.id, l.id)
          AND s.tenant_id = v.tenant_id
         JOIN product_variants pv ON pv.id = s.variant_id
         JOIN products p ON p.id = pv.product_id AND p.status = 'ACTIVE'
        WHERE v.tenant_id = $1
          AND v.is_exhibition = true
          AND v.is_active = true
          AND ($2::uuid IS NULL OR v.id = $2::uuid)
          AND ($3::uuid IS NULL OR l.id = $3::uuid)
        GROUP BY v.id, v.name, l.id, l.name, p.id, p.name, p.sku_prefix,
                 p.exhibicion_objetivo
        ORDER BY l.name, v.name, p.name`,
      [tenantId, filtro?.vitrinaId ?? null, filtro?.localId ?? null],
    );

    const pendientes: PendienteDeExhibir[] = [];
    for (const f of filas) {
      const enVitrina = Number(f.en_vitrina);
      const disponibleEnElLocal = Number(f.en_local);
      // La decisión es de `faltaPorExhibir`, que está probada aparte: acá solo
      // se le traen los números.
      const decision = faltaPorExhibir(config, {
        enVitrina,
        disponibleEnElLocal,
        objetivoPropio:
          f.objetivo_propio === null ? null : Number(f.objetivo_propio),
      });
      if (!decision) continue;
      pendientes.push({
        vitrinaId: f.vitrina_id,
        vitrinaNombre: f.vitrina_nombre,
        localId: f.local_id,
        localNombre: f.local_nombre,
        productId: f.product_id,
        productNombre: f.product_nombre,
        referencia: f.referencia,
        enVitrina,
        disponibleEnElLocal,
        faltan: decision.cantidad,
        tallasEnElLocal: [],
      });
    }

    await this.colgarTallas(tenantId, pendientes);
    return pendientes;
  }

  /**
   * Le cuelga a cada pendiente las tallas que el local tiene para subir.
   *
   * En **una sola consulta** para todos: hacerlo por pendiente sería un N+1 en
   * una tienda con catálogo grande, que es justo donde esta pantalla importa.
   */
  private async colgarTallas(
    tenantId: string,
    pendientes: PendienteDeExhibir[],
  ): Promise<void> {
    if (!pendientes.length) return;
    const productIds = [...new Set(pendientes.map((p) => p.productId))];
    const localIds = [...new Set(pendientes.map((p) => p.localId))];

    const filas = await this.dataSource.query<
      {
        product_id: string;
        warehouse_id: string;
        variant_id: string;
        talla: string | null;
        color: string | null;
        disponible: string;
      }[]
    >(
      // La talla y el color viven en su catálogo, no en la variante: por eso
      // los dos LEFT JOIN. Son LEFT y no INNER porque una variante puede no
      // tener color, y perderla dejaría al vendedor sin poder exhibirla.
      `SELECT pv.product_id, s.warehouse_id, pv.id AS variant_id,
              sz.name AS talla, co.name AS color,
              s.quantity AS disponible
         FROM stock s
         JOIN product_variants pv ON pv.id = s.variant_id
         LEFT JOIN sizes sz ON sz.id = pv.size_id
         LEFT JOIN colors co ON co.id = pv.color_id
        WHERE s.tenant_id = $1
          AND pv.product_id = ANY($2::uuid[])
          AND s.warehouse_id = ANY($3::uuid[])
          AND s.quantity > 0
          AND pv.is_active = true
        ORDER BY sz.name, co.name`,
      [tenantId, productIds, localIds],
    );

    const porClave = new Map<string, TallaDisponible[]>();
    for (const f of filas) {
      const clave = `${f.product_id}|${f.warehouse_id}`;
      const lista = porClave.get(clave) ?? [];
      lista.push({
        variantId: f.variant_id,
        talla: f.talla,
        color: f.color,
        disponible: Number(f.disponible),
      });
      porClave.set(clave, lista);
    }
    for (const p of pendientes) {
      p.tallasEnElLocal = porClave.get(`${p.productId}|${p.localId}`) ?? [];
    }
  }

  /**
   * Sube un par del local a la vitrina.
   *
   * Es un traslado, no una salida y una entrada: el par **conserva su código**
   * al subir a la vitrina. Si se recreara, la etiqueta pegada a la caja
   * dejaría de coincidir con la del sistema y se perdería de qué compra vino.
   */
  async exhibir(
    orden: {
      vitrinaId: string;
      variantId: string;
      cantidad: number;
    },
    usuarioId: string,
    tenantId: string,
  ): Promise<{ movidas: number; desdeWarehouseId: string }> {
    if (!Number.isInteger(orden.cantidad) || orden.cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad a exhibir debe ser un entero mayor a 0.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const [vitrina] = await manager.query<
        {
          id: string;
          name: string;
          is_exhibition: boolean;
          exhibition_of_warehouse_id: string | null;
        }[]
      >(
        `SELECT id, name, is_exhibition, exhibition_of_warehouse_id
           FROM warehouses
          WHERE id = $1 AND tenant_id = $2`,
        [orden.vitrinaId, tenantId],
      );
      if (!vitrina) throw new NotFoundException('Vitrina no encontrada');
      if (!vitrina.is_exhibition) {
        throw new BadRequestException(
          `"${vitrina.name}" no está marcada como vitrina.`,
        );
      }
      if (!vitrina.exhibition_of_warehouse_id) {
        // Sin local no hay de dónde sacar el par. Se dice cuál es el arreglo
        // en vez de fallar con un mensaje que obligue a adivinar.
        throw new BadRequestException(
          `La vitrina "${vitrina.name}" no tiene local asignado: ` +
            'primero hay que decir de qué bodega se surte.',
        );
      }

      await this.ledger.trasladar(manager, {
        variantId: orden.variantId,
        desdeWarehouseId: vitrina.exhibition_of_warehouse_id,
        hastaWarehouseId: vitrina.id,
        cantidad: orden.cantidad,
        motivo: 'EXHIBICION_IN',
        motivos: { salida: 'EXHIBICION_OUT', entrada: 'EXHIBICION_IN' },
        notas: `Subido a la vitrina "${vitrina.name}"`,
        usuarioId,
        tenantId,
      });

      await this.anotarEnPlantilla(manager, tenantId, vitrina.id, {
        variantId: orden.variantId,
      });
      this.log.log(
        `Exhibición: ${orden.cantidad} de la variante ${orden.variantId} ` +
          `subieron a la vitrina ${vitrina.name}.`,
      );
      return {
        movidas: orden.cantidad,
        desdeWarehouseId: vitrina.exhibition_of_warehouse_id,
      };
    });
  }

  /**
   * Subir a la vitrina **ese** par o esa caja, por su código.
   *
   * «Veo la referencia y la vitrina pero no de dónde sale, qué código es,
   * cuál quiero»: el panel elige por antigüedad; acá manda el sticker. La
   * vitrina es la que surte el local donde está el bulto; si ese local surte
   * varias, hay que decir cuál.
   */
  async exhibirPorCodigo(
    orden: { codigo: string; vitrinaId?: string },
    usuarioId: string,
    tenantId: string,
  ): Promise<{
    movidas: number;
    barcode: string;
    esCaja: boolean;
    vitrina: string;
    desde: string;
  }> {
    const codigo = orden.codigo.trim();
    return this.dataSource.transaction(async (manager) => {
      const [bulto] = await manager.query<
        {
          id: string;
          barcode: string;
          kind: string;
          status: string;
          quantity: number;
          variant_id: string | null;
          warehouse_id: string;
          bodega: string;
          bodega_es_vitrina: boolean;
        }[]
      >(
        `SELECT su.id, su.barcode, su.kind, su.status, su.quantity, su.variant_id,
                su.warehouse_id, w.name AS bodega, w.is_exhibition AS bodega_es_vitrina
           FROM stock_units su
           JOIN warehouses w ON w.id = su.warehouse_id
          WHERE su.tenant_id = $1 AND su.barcode = $2`,
        [tenantId, codigo],
      );
      if (!bulto) {
        throw new NotFoundException(
          'Ese código no es de ninguna caja ni par de la tienda.',
        );
      }
      const que = bulto.kind === 'BOX' ? 'La caja' : 'El par';
      if (bulto.bodega_es_vitrina) {
        throw new BadRequestException(
          `${que} ${bulto.barcode} ya está en la vitrina "${bulto.bodega}".`,
        );
      }
      if (bulto.status !== 'IN_STOCK') {
        throw new BadRequestException(
          `${que} ${bulto.barcode} ya no está disponible en el local.`,
        );
      }
      if (!bulto.variant_id) {
        throw new BadRequestException(
          `${que} ${bulto.barcode} no tiene talla asociada: no se puede exhibir.`,
        );
      }

      const vitrinas = await manager.query<{ id: string; name: string }[]>(
        `SELECT id, name FROM warehouses
          WHERE tenant_id = $1 AND is_exhibition = true AND is_active = true
            AND exhibition_of_warehouse_id = $2
          ORDER BY name`,
        [tenantId, bulto.warehouse_id],
      );
      if (vitrinas.length === 0) {
        throw new BadRequestException(
          `${que} está en "${bulto.bodega}" y ese local no tiene vitrina. ` +
            'Créala en Exhibición diciendo que la surte ese local.',
        );
      }
      const vitrina = orden.vitrinaId
        ? vitrinas.find((v) => v.id === orden.vitrinaId)
        : vitrinas.length === 1
          ? vitrinas[0]
          : undefined;
      if (!vitrina) {
        throw new BadRequestException(
          orden.vitrinaId
            ? `Esa vitrina no la surte "${bulto.bodega}".`
            : `"${bulto.bodega}" surte ${vitrinas.length} vitrinas: di a cuál va.`,
        );
      }

      const cantidad = Number(bulto.quantity) || 1;
      await this.ledger.trasladar(manager, {
        variantId: bulto.variant_id,
        desdeWarehouseId: bulto.warehouse_id,
        hastaWarehouseId: vitrina.id,
        cantidad,
        motivo: 'EXHIBICION_IN',
        motivos: { salida: 'EXHIBICION_OUT', entrada: 'EXHIBICION_IN' },
        notas: `Subido a la vitrina "${vitrina.name}" (${bulto.barcode})`,
        usuarioId,
        unidades: [bulto.id],
        tenantId,
      });
      await this.anotarEnPlantilla(manager, tenantId, vitrina.id, {
        variantId: bulto.variant_id,
      });
      this.log.log(
        `Exhibición: ${bulto.kind} ${bulto.barcode} subió a la vitrina ${vitrina.name}.`,
      );
      return {
        movidas: cantidad,
        barcode: bulto.barcode,
        esCaja: bulto.kind === 'BOX',
        vitrina: vitrina.name,
        desde: bulto.bodega,
      };
    });
  }

  /**
   * La referencia gana su puesto en la vitrina la primera vez que se exhibe.
   * Ver `plantilla-de-vitrina.ts`.
   */
  private async anotarEnPlantilla(
    manager: EntityManager,
    tenantId: string,
    vitrinaId: string,
    de: { variantId: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO vitrina_plantilla (tenant_id, vitrina_id, product_id)
       SELECT $1, $2, pv.product_id FROM product_variants pv WHERE pv.id = $3
       ON CONFLICT DO NOTHING`,
      [tenantId, vitrinaId, de.variantId],
    );
  }

  /** La plantilla con su estado: cuántos hay en la vitrina de cada puesto. */
  private async filasDeLaPlantilla(
    tenantId: string,
    filtro?: { vitrinaId?: string | null },
  ): Promise<FilaDeLaPlantilla[]> {
    const filas = await this.dataSource.query<
      {
        vitrina_id: string;
        vitrina_nombre: string;
        local_id: string;
        local_nombre: string;
        product_id: string;
        product_nombre: string;
        referencia: string | null;
        image_url: string | null;
        en_vitrina: string;
        en_local: string;
        vendidas: string;
        ultima_variant_id: string | null;
        ultima_talla: string | null;
        ultima_codigo: string | null;
      }[]
    >(
      `SELECT v.id AS vitrina_id, v.name AS vitrina_nombre,
              l.id AS local_id, l.name AS local_nombre,
              p.id AS product_id, p.name AS product_nombre, p.sku_prefix AS referencia,
              p.image_url,
              COALESCE((SELECT SUM(s.quantity) FROM stock s JOIN product_variants pv ON pv.id = s.variant_id
                         WHERE pv.product_id = p.id AND s.warehouse_id = v.id), 0) AS en_vitrina,
              COALESCE((SELECT SUM(s.quantity) FROM stock s JOIN product_variants pv ON pv.id = s.variant_id
                         WHERE pv.product_id = p.id AND s.warehouse_id = l.id), 0) AS en_local,
              (SELECT COUNT(*) FROM stock_units su
                WHERE su.product_id = p.id AND su.warehouse_id = v.id AND su.status = 'SOLD') AS vendidas,
              u.variant_id AS ultima_variant_id,
              COALESCE(sz.name, vsz.name) AS ultima_talla,
              u.barcode AS ultima_codigo
         FROM vitrina_plantilla t
         JOIN warehouses v ON v.id = t.vitrina_id AND v.is_exhibition = true AND v.is_active = true
         JOIN warehouses l ON l.id = v.exhibition_of_warehouse_id AND l.is_active = true
         JOIN products p ON p.id = t.product_id AND p.status = 'ACTIVE'
         LEFT JOIN LATERAL (
           SELECT su.variant_id, su.size_id, su.barcode FROM stock_units su
            WHERE su.product_id = p.id AND su.warehouse_id = v.id AND su.status = 'SOLD'
            ORDER BY su.updated_at DESC LIMIT 1
         ) u ON true
         LEFT JOIN sizes sz ON sz.id = u.size_id
         -- Una caja no trae talla propia: se toma la de su variante.
         LEFT JOIN product_variants uv ON uv.id = u.variant_id
         LEFT JOIN sizes vsz ON vsz.id = uv.size_id
        WHERE t.tenant_id = $1
          AND ($2::uuid IS NULL OR v.id = $2::uuid)
        ORDER BY l.name, v.name, p.name`,
      [tenantId, filtro?.vitrinaId ?? null],
    );
    if (!filas.length) return [];

    // Lo que hay en las demás bodegas, por referencia, para saber a quién pedirle.
    const productIds = [...new Set(filas.map((f) => f.product_id))];
    // Y los bultos que están hoy en cada vitrina, con su código: «cuál es».
    const enVitrina = await this.dataSource.query<
      {
        product_id: string;
        warehouse_id: string;
        barcode: string;
        kind: string;
        quantity: number;
        talla: string | null;
      }[]
    >(
      `SELECT su.product_id, su.warehouse_id, su.barcode, su.kind, su.quantity,
              COALESCE(sz.name, vsz.name) AS talla
         FROM stock_units su
         LEFT JOIN sizes sz ON sz.id = su.size_id
         LEFT JOIN product_variants pv ON pv.id = su.variant_id
         LEFT JOIN sizes vsz ON vsz.id = pv.size_id
        WHERE su.tenant_id = $1 AND su.product_id = ANY($2::uuid[]) AND su.status = 'IN_STOCK'
          AND su.warehouse_id IN (SELECT id FROM warehouses WHERE tenant_id = $1 AND is_exhibition = true)
        ORDER BY su.barcode`,
      [tenantId, productIds],
    );
    const otras = await this.dataSource.query<
      {
        product_id: string;
        warehouse_id: string;
        bodega: string;
        cantidad: string;
      }[]
    >(
      `SELECT pv.product_id, s.warehouse_id, w.name AS bodega, SUM(s.quantity) AS cantidad
         FROM stock s
         JOIN product_variants pv ON pv.id = s.variant_id
         JOIN warehouses w ON w.id = s.warehouse_id AND w.is_active = true AND w.is_exhibition = false
        WHERE s.tenant_id = $1 AND pv.product_id = ANY($2::uuid[]) AND s.quantity > 0
        GROUP BY pv.product_id, s.warehouse_id, w.name`,
      [tenantId, productIds],
    );

    return filas.map((f) => ({
      vitrinaId: f.vitrina_id,
      vitrinaNombre: f.vitrina_nombre,
      localId: f.local_id,
      localNombre: f.local_nombre,
      productId: f.product_id,
      productNombre: f.product_nombre,
      referencia: f.referencia,
      imageUrl: f.image_url,
      enVitrina: Number(f.en_vitrina),
      enLocal: Number(f.en_local),
      enOtras: otras
        .filter(
          (o) => o.product_id === f.product_id && o.warehouse_id !== f.local_id,
        )
        .map((o) => ({
          bodegaId: o.warehouse_id,
          bodega: o.bodega,
          cantidad: Number(o.cantidad),
        })),
      vendidasDeLaVitrina: Number(f.vendidas),
      ultimaMuestra: f.ultima_variant_id
        ? {
            variantId: f.ultima_variant_id,
            talla: f.ultima_talla ?? '',
            codigo: f.ultima_codigo,
          }
        : null,
    }));
  }

  /** Los puestos vacíos de la vitrina y qué hacer con cada uno. */
  async huecos(tenantId: string): Promise<HuecoDeVitrina[]> {
    const config = await this.configuracion(this.dataSource.manager, tenantId);
    if (!config.encendida) return [];
    return huecosDeLaPlantilla(await this.filasDeLaPlantilla(tenantId));
  }

  /** La plantilla completa (llenos y huecos), para cambiar lo que se exhibe. */
  async plantilla(
    tenantId: string,
    vitrinaId?: string | null,
  ): Promise<(FilaDeLaPlantilla & { hueco: boolean })[]> {
    const filas = await this.filasDeLaPlantilla(tenantId, { vitrinaId });
    return filas.map((f) => ({ ...f, hueco: f.enVitrina <= 0 }));
  }

  /** La tienda decide que esa referencia ya no se muestra: pierde el puesto. */
  async quitarDePlantilla(
    tenantId: string,
    vitrinaId: string,
    productId: string,
  ): Promise<{ quitado: boolean }> {
    const r: unknown[] = await this.dataSource.query(
      `DELETE FROM vitrina_plantilla WHERE tenant_id = $1 AND vitrina_id = $2 AND product_id = $3 RETURNING id`,
      [tenantId, vitrinaId, productId],
    );
    return { quitado: r.length > 0 };
  }

  /**
   * Bajar de la vitrina **ese** par o esa caja, por su código: vuelve al
   * local que la surte. Es la mitad de «cambiar lo exhibido»: baja uno, sube
   * otro. No toca la plantilla: el puesto sigue siendo de la referencia hasta
   * que la tienda la quite.
   */
  async bajarPorCodigo(
    orden: { codigo: string },
    usuarioId: string,
    tenantId: string,
  ): Promise<{
    movidas: number;
    barcode: string;
    esCaja: boolean;
    vitrina: string;
    local: string;
  }> {
    const codigo = orden.codigo.trim();
    return this.dataSource.transaction(async (manager) => {
      const [bulto] = await manager.query<
        {
          id: string;
          barcode: string;
          kind: string;
          status: string;
          quantity: number;
          variant_id: string | null;
          warehouse_id: string;
          vitrina: string;
          es_vitrina: boolean;
          local_id: string | null;
          local: string | null;
        }[]
      >(
        `SELECT su.id, su.barcode, su.kind, su.status, su.quantity, su.variant_id, su.warehouse_id,
                w.name AS vitrina, w.is_exhibition AS es_vitrina, l.id AS local_id, l.name AS local
           FROM stock_units su
           JOIN warehouses w ON w.id = su.warehouse_id
           LEFT JOIN warehouses l ON l.id = w.exhibition_of_warehouse_id
          WHERE su.tenant_id = $1 AND su.barcode = $2`,
        [tenantId, codigo],
      );
      if (!bulto)
        throw new NotFoundException(
          'Ese código no es de ninguna caja ni par de la tienda.',
        );
      const que = bulto.kind === 'BOX' ? 'La caja' : 'El par';
      if (!bulto.es_vitrina) {
        throw new BadRequestException(
          `${que} ${bulto.barcode} no está en una vitrina: está en "${bulto.vitrina}".`,
        );
      }
      if (bulto.status !== 'IN_STOCK') {
        throw new BadRequestException(
          `${que} ${bulto.barcode} ya no está disponible.`,
        );
      }
      if (!bulto.local_id || !bulto.variant_id) {
        throw new BadRequestException(
          `La vitrina "${bulto.vitrina}" no tiene local al que devolverlo.`,
        );
      }
      const cantidad = Number(bulto.quantity) || 1;
      await this.ledger.trasladar(manager, {
        variantId: bulto.variant_id,
        desdeWarehouseId: bulto.warehouse_id,
        hastaWarehouseId: bulto.local_id,
        cantidad,
        motivo: 'TRANSFER_OUT',
        notas: `Bajado de la vitrina "${bulto.vitrina}" (${bulto.barcode})`,
        usuarioId,
        unidades: [bulto.id],
        tenantId,
      });
      return {
        movidas: cantidad,
        barcode: bulto.barcode,
        esCaja: bulto.kind === 'BOX',
        vitrina: bulto.vitrina,
        local: bulto.local!,
      };
    });
  }
}
