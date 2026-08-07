import { EntityManager, DataSource } from 'typeorm';
import { Size } from '../catalogs/entities/size.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { deriveSortOrder } from '../catalogs/sizes.service.js';

/**
 * Resuelve nombres de talla/color a su id de catálogo para seeds e importadores.
 *
 * Cachea en memoria porque un importador procesa cientos de variantes que
 * repiten los mismos pocos valores: sin caché sería una consulta por variante.
 *
 * Devuelve `null` para vacío, que es lo que espera `ProductVariant.sizeId`
 * cuando la variante no tiene talla (producto de talla única sin especificar).
 */
export class CatalogCache {
  private readonly sizes = new Map<string, string>();
  private readonly colors = new Map<string, string>();

  constructor(private readonly db: DataSource | EntityManager) {}

  private manager(): EntityManager {
    return this.db instanceof DataSource ? this.db.manager : this.db;
  }

  async sizeId(name: string | null | undefined, tenantId: string) {
    return this.resolve(Size, this.sizes, name, tenantId, (n) => ({
      name: n,
      sortOrder: deriveSortOrder(n),
      tenantId,
    }));
  }

  async colorId(name: string | null | undefined, tenantId: string) {
    return this.resolve(Color, this.colors, name, tenantId, (n) => ({
      name: n,
      tenantId,
    }));
  }

  private async resolve<T extends { id: string }>(
    entity: new () => T,
    cache: Map<string, string>,
    rawName: string | null | undefined,
    tenantId: string,
    build: (name: string) => Record<string, unknown>,
  ): Promise<string | null> {
    const name = (rawName || '').trim();
    if (!name) return null;

    const key = `${tenantId}::${name}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const repo = this.manager().getRepository(entity);
    const found = await repo.findOne({ where: { tenantId, name } as never });
    const row =
      found ??
      ((await repo.save(repo.create(build(name) as never))) as unknown as T);
    cache.set(key, row.id);
    return row.id;
  }
}
