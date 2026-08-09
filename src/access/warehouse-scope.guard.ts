import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { AccessService } from './access.service.js';
import {
  collectDirectWarehouseIds,
  entityWarehouseSourceFor,
  idParamIsWarehouse,
} from './warehouse-scope.js';

/**
 * Guard de bodegas por usuario (F8).
 *
 * Un usuario con bodegas asignadas solo puede operar en las suyas. Se aplica
 * aquí, en un solo sitio, y no endpoint por endpoint: la bodega se detecta por
 * el nombre del campo (`warehouseId`, `fromWarehouseId`…), así que **cualquier
 * endpoint nuevo queda cubierto**, y las rutas donde la bodega hay que ir a
 * buscarla están declaradas en `warehouse-scope.ts`.
 *
 * Puerta de salida rápida: el usuario **sin bodegas asignadas ve todas**, que es
 * como funciona hoy. Ahí el guard no consulta nada.
 */
@Injectable()
export class WarehouseScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; role: Role } }>();
    const user = request.user;
    if (!user || user.role === Role.SUPER_ADMIN) return true;

    const allowed = await this.access.allowedWarehouses(user.id);
    // Sin bodegas asignadas: acceso a todas (comportamiento de siempre).
    if (!allowed) return true;
    const permitidas = new Set(allowed);

    const routePath = request.route?.path
      ? request.baseUrl + (request.route.path as string)
      : request.path;

    // 1) Bodegas que vienen nombradas en la petición.
    const directas = collectDirectWarehouseIds({
      params: request.params,
      query: request.query,
      body: request.body,
    });
    // `/inventory/warehouses/:id`: el id ES una bodega aunque no se llame así.
    if (
      idParamIsWarehouse(routePath) &&
      typeof request.params?.id === 'string'
    ) {
      directas.push(request.params.id);
    }

    for (const id of directas) {
      if (!permitidas.has(id)) await this.reject(id);
    }

    // 2) Bodegas a las que pertenece lo que se está tocando.
    const source = entityWarehouseSourceFor(request.method, routePath);
    if (source) {
      const id = request.params?.[source.param];
      if (typeof id === 'string' && id) {
        const rows: { warehouse_id: string | null }[] =
          await this.dataSource.query(source.sql, [id]);
        const warehouseIds = rows
          .map((row) => row.warehouse_id)
          .filter((warehouseId): warehouseId is string => !!warehouseId);
        // Si no existe, que responda el servicio con su propio 404: no es
        // trabajo de este guard decidir eso.
        if (
          warehouseIds.length > 0 &&
          !warehouseIds.some((warehouseId) => permitidas.has(warehouseId))
        ) {
          await this.reject(warehouseIds[0], source.action);
        }
      }
    }

    return true;
  }

  /** Mensaje que nombra la bodega y dice qué hacer. */
  private async reject(warehouseId: string, action?: string): Promise<never> {
    const rows: { name: string }[] = await this.dataSource.query(
      'SELECT name FROM warehouses WHERE id = $1',
      [warehouseId],
    );
    const nombre = rows[0]?.name ?? warehouseId;

    throw new ForbiddenException(
      action
        ? `No tienes acceso a la bodega "${nombre}", así que no puedes ${action}. ` +
            `Pídele a un administrador que te la asigne.`
        : `No tienes acceso a la bodega "${nombre}". Solo puedes operar en las ` +
            `bodegas que te asignaron; pídele a un administrador que te agregue ` +
            `si necesitas esta.`,
    );
  }
}
