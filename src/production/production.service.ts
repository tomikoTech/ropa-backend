import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Production } from './entities/production.entity.js';
import { ProductionItem } from './entities/production-item.entity.js';
import { Paginated } from '../common/types/paginated.js';
import { resolverPagina, armarPaginado } from '../common/utils/paginacion.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { RecipeService } from '../products/services/recipe.service.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { CreateProductionDto } from './dto/create-production.dto.js';
import { StockLedgerService } from '../inventory/ledger/stock-ledger.service.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Product } from '../products/entities/product.entity.js';
import {
  EntradaDeTerminadoDto,
  SalidaDeEsenciaDto,
} from './dto/produccion-simple.dto.js';
import {
  costoDelTerminado,
  desgloseDelCosto,
  type CostoDelTerminado,
} from './costo-del-terminado.js';
import { costoDelPerfume, type CostoDelPerfume } from './costo-de-perfumes.js';
import { AjusteDeCostoDto } from './dto/ajuste-de-costo.dto.js';

/** Una fila de la página «Costo de perfumes». */
/** De dónde salió el costo del frasco; `null` si no hay ninguno. */
export type OrigenDelFrasco = 'compra' | 'manual' | 'ficha' | null;

export interface FilaDeCosto {
  productId: string;
  nombre: string;
  frasco: {
    variantId: string;
    nombre: string;
    costo: number | null;
    origen: OrigenDelFrasco;
  } | null;
  /** `products.mano_de_obra`; `null` = la general. */
  manoDeObraDelProducto: number | null;
  costoFrascoManual: number | null;
  costo: CostoDelPerfume;
}

export interface CostosDePerfumes {
  esenciaFijaPorUnidad: number;
  manoDeObraGeneral: number;
  presets: number[];
  perfumes: FilaDeCosto[];
}

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(Production)
    private readonly productionRepo: Repository<Production>,
    private readonly recipeService: RecipeService,
    private readonly dataSource: DataSource,
    private readonly ledger: StockLedgerService,
  ) {}

  async create(
    dto: CreateProductionDto,
    userId: string,
    tenantId: string,
  ): Promise<Production> {
    if (dto.producedVariantId && !dto.producedQuantity) {
      throw new BadRequestException(
        'Indica la cantidad de lociones producidas',
      );
    }
    const manualItems = dto.items ?? [];
    if (!dto.producedVariantId && manualItems.length === 0) {
      throw new BadRequestException(
        'Indica el producto a producir o al menos una esencia a consumir',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);
      const variantRepo = manager.getRepository(ProductVariant);
      const productionRepo = manager.getRepository(Production);
      const itemRepo = manager.getRepository(ProductionItem);

      // Crear la producción
      const production = productionRepo.create({
        warehouseId: dto.warehouseId,
        producedVariantId: dto.producedVariantId ?? null,
        producedQuantity: dto.producedQuantity ?? 0,
        notes: dto.notes,
        createdById: userId,
        tenantId,
      });
      const saved = await productionRepo.save(production);

      // ¿El producto final producido tiene receta de esencias? Si la tiene,
      // el consumo es automático por receta y se ignora el consumo manual.
      let recipeConsumed = false;
      if (dto.producedVariantId && dto.producedQuantity) {
        const producedVariant = await variantRepo.findOne({
          where: { id: dto.producedVariantId, tenantId },
        });
        if (!producedVariant) {
          throw new NotFoundException('Loción a producir no encontrada');
        }
        const consumed = await this.recipeService.consumeEssences(manager, {
          productId: producedVariant.productId,
          units: dto.producedQuantity,
          warehouseId: dto.warehouseId,
          userId,
          tenantId,
          referenceId: saved.id,
        });
        if (consumed.length > 0) {
          recipeConsumed = true;
          for (const c of consumed) {
            await itemRepo.save(
              itemRepo.create({
                productionId: saved.id,
                variantId: c.essenceVariantId,
                quantity: c.grams,
                tenantId,
              }),
            );
          }
        }
      }

      // Consumo manual de esencias (OUT) — solo si NO hubo consumo por receta.
      if (!recipeConsumed) {
        for (const item of manualItems) {
          const variant = await variantRepo.findOne({
            where: { id: item.variantId, tenantId },
          });
          if (!variant) {
            throw new NotFoundException(
              `Esencia ${item.variantId} no encontrada`,
            );
          }

          const stock = await stockRepo.findOne({
            where: {
              variantId: item.variantId,
              warehouseId: dto.warehouseId,
              tenantId,
            },
          });
          const available = stock ? Number(stock.quantity) : 0;
          if (available < item.quantity) {
            throw new BadRequestException(
              `Esencia "${variant.sku}": stock insuficiente (disponible ${available} g, requerido ${item.quantity} g)`,
            );
          }
          await this.ledger.mover(manager, {
            variantId: item.variantId,
            warehouseId: dto.warehouseId,
            cantidad: -item.quantity,
            motivo: 'PRODUCTION',
            referenciaId: saved.id,
            notas: 'Consumo de esencia (producción)',
            usuarioId: userId,
            tenantId,
          });

          await itemRepo.save(
            itemRepo.create({
              productionId: saved.id,
              variantId: item.variantId,
              quantity: item.quantity,
              tenantId,
            }),
          );
        }
      }

      // Producir loción (IN) — opcional
      if (dto.producedVariantId && dto.producedQuantity) {
        const locion = await variantRepo.findOne({
          where: { id: dto.producedVariantId, tenantId },
        });
        if (!locion) {
          throw new NotFoundException('Loción a producir no encontrada');
        }

        let stock = await stockRepo.findOne({
          where: {
            variantId: dto.producedVariantId,
            warehouseId: dto.warehouseId,
            tenantId,
          },
        });
        if (!stock) {
          stock = stockRepo.create({
            variantId: dto.producedVariantId,
            warehouseId: dto.warehouseId,
            tenantId,
            quantity: 0,
            minStock: 0,
          });
        }
        await this.ledger.mover(manager, {
          variantId: dto.producedVariantId,
          warehouseId: dto.warehouseId,
          cantidad: dto.producedQuantity,
          motivo: 'PRODUCTION',
          referenciaId: saved.id,
          notas: 'Producción de loción',
          usuarioId: userId,
          tenantId,
        });
      }

      const full = await productionRepo.findOne({
        where: { id: saved.id, tenantId },
        relations: ['items'],
      });
      return full!;
    });
  }

  async findAll(tenantId: string): Promise<Production[]> {
    return this.productionRepo.find({
      where: { tenantId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** El historial por página, sin traer las 200 de un golpe. */
  async findAllPaginado(
    tenantId: string,
    opts: { page?: string | number | null; limit?: string | number | null },
  ): Promise<Paginated<Production>> {
    const pagina = resolverPagina(opts, { limitDefault: 50, limitMax: 200 });
    const [data, total] = await this.productionRepo.findAndCount({
      where: { tenantId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      skip: pagina.offset,
      take: pagina.limit,
    });
    return armarPaginado(data, total, pagina);
  }

  async findOne(id: string, tenantId: string): Promise<Production> {
    const production = await this.productionRepo.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!production) throw new NotFoundException('Producción no encontrada');
    return production;
  }
  // ───────────────────────── Producción simple (perfumería) ─────────────────────────
  //
  // Lo acordado con Distri Amber, en dos pasos que no se tocan entre sí:
  //
  //  1. **César saca esencia**: «de estos 500 saqué 100». Gramos libres, de la
  //     bodega de esencias. No toca frascos ni lociones.
  //  2. **Andrea registra la entrada de lociones terminadas**: ahí se
  //     descuenta el frasco y nace la loción con su costo
  //     (`costo-del-terminado.ts`).
  //
  // La receta por gramos (`create()`) se deja para quien la quiera; ellos
  // la abandonaron porque «a veces le echamos más esencia, a veces el frasco
  // es más pequeño», y el costo lo cerraron en un valor fijo.

  /** Las esencias con lo que queda de cada una, en gramos, por bodega. */
  async existenciasDeEsencia(tenantId: string): Promise<
    {
      variantId: string;
      productId: string;
      nombre: string;
      warehouseId: string;
      bodega: string;
      gramos: number;
    }[]
  > {
    const filas: {
      variant_id: string;
      product_id: string;
      nombre: string;
      warehouse_id: string;
      bodega: string;
      gramos: string;
    }[] = await this.dataSource.query(
      `SELECT v.id AS variant_id, p.id AS product_id, p.name AS nombre, w.id AS warehouse_id, w.name AS bodega,
                coalesce(sum(st.quantity), 0) AS gramos
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           JOIN categories c ON c.id = p.category_id AND c.type = 'ESSENCE'
           LEFT JOIN stock st ON st.variant_id = v.id AND st.tenant_id = $1 AND st.quantity <> 0
           LEFT JOIN warehouses w ON w.id = st.warehouse_id
          WHERE p.tenant_id = $1 AND p.status = 'ACTIVE'
          GROUP BY v.id, p.id, p.name, w.id, w.name
          ORDER BY p.name, w.name`,
      [tenantId],
    );
    return filas.map((f) => ({
      variantId: f.variant_id,
      productId: f.product_id,
      nombre: f.nombre,
      warehouseId: f.warehouse_id,
      bodega: f.bodega,
      gramos: Number(f.gramos),
    }));
  }

  async sacarEsencia(
    dto: SalidaDeEsenciaDto,
    userId: string,
    tenantId: string,
  ): Promise<Production> {
    return this.dataSource.transaction(async (manager) => {
      const variante = await manager.getRepository(ProductVariant).findOne({
        where: { id: dto.variantId, tenantId },
        relations: ['product', 'product.category'],
      });
      if (!variante) throw new NotFoundException('Esencia no encontrada');
      if (variante.product.category?.type !== 'ESSENCE') {
        throw new BadRequestException(
          `«${variante.product.name}» no es una esencia.`,
        );
      }
      // Sin bodega pedida, la que más esencia tiene: César no tiene por qué
      // saber de bodegas.
      const existencias = await manager.getRepository(Stock).find({
        where: { variantId: variante.id, tenantId },
        order: { quantity: 'DESC' },
      });
      const fila = dto.warehouseId
        ? existencias.find((e) => e.warehouseId === dto.warehouseId)
        : existencias[0];
      const disponible = Number(fila?.quantity ?? 0);
      if (!fila || disponible < dto.gramos) {
        throw new BadRequestException(
          `De «${variante.product.name}» quedan ${disponible} g y se quieren sacar ${dto.gramos} g.`,
        );
      }
      const saved = await manager.getRepository(Production).save(
        manager.getRepository(Production).create({
          tenantId,
          warehouseId: fila.warehouseId,
          producedQuantity: 0,
          notes: dto.notes ?? undefined,
          createdById: userId,
          items: [
            manager.getRepository(ProductionItem).create({
              tenantId,
              variantId: variante.id,
              quantity: dto.gramos,
            }),
          ],
        }),
      );
      await this.ledger.mover(manager, {
        variantId: variante.id,
        warehouseId: fila.warehouseId,
        cantidad: -dto.gramos,
        motivo: 'PRODUCTION',
        referenciaId: saved.id,
        notas: `Salida de esencia (producción)${dto.notes ? `: ${dto.notes}` : ''}`,
        usuarioId: userId,
        tenantId,
      });
      return saved;
    });
  }

  async entrarTerminado(
    dto: EntradaDeTerminadoDto,
    userId: string,
    tenantId: string,
  ): Promise<{
    produccion: Production;
    costo: CostoDelTerminado;
    frascoDesde: string | null;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const variante = await manager.getRepository(ProductVariant).findOne({
        where: { id: dto.variantId, tenantId },
        relations: ['product', 'product.category'],
      });
      if (!variante) throw new NotFoundException('Producto no encontrado');
      const tipo = variante.product.category?.type ?? 'STANDARD';
      if (tipo !== 'STANDARD') {
        throw new BadRequestException(
          `«${variante.product.name}» no es producto terminado.`,
        );
      }
      const averiadas = dto.averiadas ?? 0;
      if (averiadas > dto.cantidad) {
        throw new BadRequestException(
          `No pueden salir ${averiadas} malas de ${dto.cantidad} producidas.`,
        );
      }
      const settings = await manager
        .getRepository(StoreSettings)
        .findOne({ where: { tenantId } });
      const warehouseId =
        dto.warehouseId ?? settings?.defaultWarehouseId ?? null;
      if (!warehouseId) {
        throw new BadRequestException(
          'La tienda no tiene bodega de venta configurada.',
        );
      }

      // El costo, antes de mover nada: si falta algo, se avisa pero no se frena.
      const frascoVariantId = variante.product.frascoVariantId ?? null;
      const costoDelFrasco = frascoVariantId
        ? ((await this.ultimoCostoDeCompra(manager, frascoVariantId, tenantId, {
            soloCompras: true,
          })) ??
          variante.product.costoFrascoManual ??
          (await this.ultimoCostoDeCompra(manager, frascoVariantId, tenantId)))
        : null;
      const costo = costoDelTerminado({
        costoDelFrasco,
        esenciaFijaPorUnidad: settings?.costoFijoDeEsencia,
        manoDeObraGeneral: settings?.manoDeObraPorUnidad,
        manoDeObraDelProducto: variante.product.manoDeObra,
      });
      if (!frascoVariantId)
        costo.avisos.unshift(
          'La loción no tiene frasco enlazado: no se descontó ningún frasco.',
        );

      const saved = await manager.getRepository(Production).save(
        manager.getRepository(Production).create({
          tenantId,
          warehouseId,
          producedVariantId: variante.id,
          producedQuantity: dto.cantidad,
          notes: [dto.notes, desgloseDelCosto(costo)]
            .filter(Boolean)
            .join(' · '),
          createdById: userId,
          items: [],
        }),
      );

      // 1) Sale un frasco por loción, de donde haya frascos. Puede quedar en
      //    negativo (igual que al vender): producir no se frena por un conteo.
      let frascoDesde: string | null = null;
      if (frascoVariantId) {
        const filas = await manager.getRepository(Stock).find({
          where: { variantId: frascoVariantId, tenantId },
          order: { quantity: 'DESC' },
        });
        frascoDesde = filas[0]?.warehouseId ?? warehouseId;
        await this.ledger.mover(manager, {
          variantId: frascoVariantId,
          warehouseId: frascoDesde,
          cantidad: -dto.cantidad,
          motivo: 'PRODUCTION',
          referenciaId: saved.id,
          notas: `Frascos usados en ${dto.cantidad} ${variante.product.name}`,
          usuarioId: userId,
          permitirNegativo: true,
          tenantId,
        });
      }
      // 2) Entra la loción terminada.
      await this.ledger.mover(manager, {
        variantId: variante.id,
        warehouseId,
        cantidad: dto.cantidad,
        motivo: 'PRODUCTION',
        referenciaId: saved.id,
        notas: `Entrada de producto terminado${dto.notes ? `: ${dto.notes}` : ''}`,
        usuarioId: userId,
        tenantId,
      });
      // 3) Las que salieron malas se dan de baja en el mismo acto.
      if (averiadas > 0) {
        await this.ledger.mover(manager, {
          variantId: variante.id,
          warehouseId,
          cantidad: -averiadas,
          motivo: 'ADJUSTMENT',
          referenciaId: saved.id,
          notas: `Averiadas al producir: ${averiadas} de ${dto.cantidad}`,
          usuarioId: userId,
          tenantId,
        });
      }
      // 4) El costo queda en el producto: la venta lo congela en el renglón.
      await manager
        .getRepository(Product)
        .update(
          { id: variante.product.id, tenantId },
          { costPrice: costo.total },
        );

      return { produccion: saved, costo, frascoDesde };
    });
  }

  // ── Costo de perfumes: la página que pidió Andrea ──────────────────────
  //
  // «Un lugarcito donde diga costo de perfumes y vaya anclado lo que vale
  // cada perfume». Es la misma cuenta de `entrarTerminado`, pero para todas
  // las lociones a la vez y sin mover inventario. De paso deja `cost_price`
  // al día en cada producto: así Valorización y Balance dejan de decir cero
  // para las lociones que nunca pasaron por «entrada de terminado».

  async costosDePerfumes(tenantId: string): Promise<CostosDePerfumes> {
    return this.dataSource.transaction(async (manager) => {
      const settings = await manager
        .getRepository(StoreSettings)
        .findOne({ where: { tenantId } });
      const filas = await this.filasDeCosto(manager, tenantId, settings);
      await this.guardarCostos(manager, tenantId, filas);
      return {
        esenciaFijaPorUnidad: Number(settings?.costoFijoDeEsencia ?? 0),
        manoDeObraGeneral: Number(settings?.manoDeObraPorUnidad ?? 0),
        presets: settings?.descuentosPresets ?? [],
        perfumes: filas.map((f) => f.fila),
      };
    });
  }

  async ajustarCostoDePerfume(
    productId: string,
    dto: AjusteDeCostoDto,
    tenantId: string,
  ): Promise<FilaDeCosto> {
    return this.dataSource.transaction(async (manager) => {
      const producto = await manager.getRepository(Product).findOne({
        where: { id: productId, tenantId },
        relations: ['category'],
      });
      if (!producto) throw new NotFoundException('Perfume no encontrado');
      if (String(producto.category?.type ?? 'STANDARD') !== 'STANDARD') {
        throw new BadRequestException(
          `«${producto.name}» no es un perfume terminado.`,
        );
      }
      const cambios: Partial<Product> = {};
      if (dto.manoDeObra !== undefined) cambios.manoDeObra = dto.manoDeObra;
      if (dto.costoFrasco !== undefined) {
        if (dto.costoFrasco !== null && !producto.frascoVariantId) {
          throw new BadRequestException(
            `«${producto.name}» no tiene frasco enlazado: enlázalo en la ficha del producto.`,
          );
        }
        if (
          dto.costoFrasco !== null &&
          producto.frascoVariantId &&
          (await this.ultimoCostoDeCompra(
            manager,
            producto.frascoVariantId,
            tenantId,
            { soloCompras: true },
          )) !== null
        ) {
          throw new BadRequestException(
            'Ese frasco ya tiene costo de compra: manda la compra, no el valor a mano.',
          );
        }
        cambios.costoFrascoManual = dto.costoFrasco;
      }
      if (Object.keys(cambios).length) {
        await manager
          .getRepository(Product)
          .update({ id: productId, tenantId }, cambios);
      }
      const settings = await manager
        .getRepository(StoreSettings)
        .findOne({ where: { tenantId } });
      const filas = await this.filasDeCosto(
        manager,
        tenantId,
        settings,
        productId,
      );
      await this.guardarCostos(manager, tenantId, filas);
      return filas[0].fila;
    });
  }

  private async filasDeCosto(
    manager: EntityManager,
    tenantId: string,
    settings: StoreSettings | null,
    productId?: string,
  ): Promise<{ fila: FilaDeCosto; costPriceActual: number }[]> {
    // Una sola consulta: la loción, su frasco y lo que costó el frasco la
    // última vez que llegó por compra. Con 170 lociones, 170 consultas
    // hacían esperar la página.
    const filas: {
      id: string;
      name: string;
      base_price: string;
      cost_price: string;
      mano_de_obra: number | null;
      costo_frasco_manual: number | null;
      frasco_variant_id: string | null;
      frasco_nombre: string | null;
      frasco_ficha: string | null;
      frasco_compra: string | null;
    }[] = await manager.query(
      `SELECT p.id, p.name, p.base_price, p.cost_price, p.mano_de_obra, p.costo_frasco_manual,
              p.frasco_variant_id, fp.name AS frasco_nombre, fp.cost_price AS frasco_ficha,
              (SELECT pi.unit_cost FROM purchase_order_items pi
                 JOIN purchase_orders po ON po.id = pi.purchase_order_id
                WHERE pi.variant_id = p.frasco_variant_id AND pi.tenant_id = p.tenant_id AND pi.quantity_received > 0
                ORDER BY po.created_at DESC LIMIT 1) AS frasco_compra
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_variants fv ON fv.id = p.frasco_variant_id
         LEFT JOIN products fp ON fp.id = fv.product_id
        WHERE p.tenant_id = $1 AND p.status = 'ACTIVE'
          AND COALESCE(c.type, 'STANDARD') = 'STANDARD'
          AND ($2::uuid IS NULL OR p.id = $2::uuid)
        ORDER BY p.name ASC`,
      [tenantId, productId ?? null],
    );
    const presets = settings?.descuentosPresets ?? [];
    return filas.map((f) => {
      // Mismo orden que al producir: la compra manda; a mano solo si nunca
      // se compró; y de último el costo de ficha del frasco, si tiene.
      let origen: OrigenDelFrasco = null;
      let costoDelFrasco: number | null = null;
      if (f.frasco_variant_id) {
        if (f.frasco_compra !== null) {
          costoDelFrasco = Number(f.frasco_compra);
          origen = 'compra';
        } else if (f.costo_frasco_manual !== null) {
          costoDelFrasco = Number(f.costo_frasco_manual);
          origen = 'manual';
        } else if (Number(f.frasco_ficha) > 0) {
          costoDelFrasco = Number(f.frasco_ficha);
          origen = 'ficha';
        }
      }
      const costo = costoDelPerfume(
        {
          precioDeVenta: Number(f.base_price),
          costoDelFrasco,
          esenciaFijaPorUnidad: settings?.costoFijoDeEsencia,
          manoDeObraGeneral: settings?.manoDeObraPorUnidad,
          manoDeObraDelProducto: f.mano_de_obra,
        },
        presets,
      );
      if (!f.frasco_variant_id) {
        costo.avisos.unshift('La loción no tiene frasco enlazado.');
      }
      const fila: FilaDeCosto = {
        productId: f.id,
        nombre: f.name,
        frasco: f.frasco_variant_id
          ? {
              variantId: f.frasco_variant_id,
              nombre: f.frasco_nombre ?? '',
              costo: costoDelFrasco,
              origen,
            }
          : null,
        manoDeObraDelProducto: f.mano_de_obra,
        costoFrascoManual: f.costo_frasco_manual,
        costo,
      };
      return { fila, costPriceActual: Number(f.cost_price) };
    });
  }

  /** `cost_price` al día, solo en los que cambió: es lo que congela la venta. */
  private async guardarCostos(
    manager: EntityManager,
    tenantId: string,
    filas: { fila: FilaDeCosto; costPriceActual: number }[],
  ): Promise<void> {
    for (const { fila, costPriceActual } of filas) {
      if (costPriceActual !== fila.costo.total) {
        await manager
          .getRepository(Product)
          .update(
            { id: fila.productId, tenantId },
            { costPrice: fila.costo.total },
          );
      }
    }
  }

  /** Lo que costó el frasco la última vez que se compró; si nunca, su costo de ficha o null. */
  private async ultimoCostoDeCompra(
    manager: EntityManager,
    variantId: string,
    tenantId: string,
    opts: { soloCompras?: boolean } = {},
  ): Promise<number | null> {
    const [fila]: { unit_cost: string }[] = await manager.query(
      `SELECT pi.unit_cost FROM purchase_order_items pi
         JOIN purchase_orders po ON po.id = pi.purchase_order_id
        WHERE pi.variant_id = $1 AND pi.tenant_id = $2 AND pi.quantity_received > 0
        ORDER BY po.created_at DESC LIMIT 1`,
      [variantId, tenantId],
    );
    if (fila) return Number(fila.unit_cost);
    if (opts.soloCompras) return null;
    const v = await manager
      .getRepository(ProductVariant)
      .findOne({ where: { id: variantId, tenantId }, relations: ['product'] });
    const costo = Number(v?.product?.costPrice);
    return costo > 0 ? costo : null;
  }
}
