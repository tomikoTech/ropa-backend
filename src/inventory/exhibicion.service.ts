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
}
