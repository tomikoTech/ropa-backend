import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, map, switchMap } from 'rxjs';
import type { Request } from 'express';
import { Role } from '../common/enums/role.enum.js';
import { AccessService } from './access.service.js';

/**
 * Campos que llevan el costo de la mercancía en las respuestas.
 *
 * Salen del modelo, no de una suposición: `costPrice` en producto y
 * consignación, `cost` en el bulto etiquetado (costo puesto en bodega),
 * `unitCost` en el renglón de compra y en la línea de venta, y los derivados
 * que calculan los servicios.
 */
const COST_FIELDS = new Set([
  'costPrice',
  'cost',
  'unitCost',
  'costValue',
  'totalCostValue',
  'landedCost',
  'unitLandedCost',
  'averageCost',
]);

/** Tope de profundidad, por si alguna respuesta viene muy anidada. */
const MAX_DEPTH = 12;

/**
 * El costo de la mercancía no viaja si el usuario no tiene permiso de ver
 * Productos.
 *
 * **Por qué en un interceptor y no en cada endpoint.** El costo se filtraba por
 * `GET /products/search`, que es la búsqueda que usa el POS. Cerrar ese endpoint
 * y seguir habría dejado el mismo agujero abierto en el siguiente que devuelva
 * un producto o un bulto: la lista de endpoints que arrastran costo crece con el
 * tiempo y nadie se acuerda de revisarla. Aquí la regla se escribe una vez y
 * cubre todo, incluido lo que se agregue mañana.
 *
 * Tiene una puerta de salida rápida: si el usuario no está restringido (o es de
 * la plataforma) la respuesta pasa intacta y no se recorre nada.
 *
 * **Lo que esto NO cubre, a propósito:** los reportes de costo y utilidad. Esos
 * se controlan con el permiso de **Reportes**, cuya ficha ya dice "incluye
 * costos, utilidad y cartera": dar Reportes es dar visibilidad del costo, y es
 * una decisión de quien configura, no un descuido.
 */
@Injectable()
export class CostVisibilityInterceptor implements NestInterceptor {
  constructor(private readonly access: AccessService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<
      Request & {
        user?: { role: Role; accessRoleId: string | null };
      }
    >();
    const user = request.user;

    // Sin usuario, plataforma, o usuario sin rol de acceso: nada que ocultar.
    if (!user || user.role === Role.SUPER_ADMIN || !user.accessRoleId) {
      return next.handle();
    }

    return from(this.access.userCan(user, 'products', 'list')).pipe(
      switchMap((seesCost) =>
        seesCost
          ? next.handle()
          : next.handle().pipe(map((body) => stripCosts(body))),
      ),
    );
  }
}

/**
 * Quita los campos de costo en profundidad.
 *
 * Se construyen objetos nuevos en vez de mutar: la respuesta puede compartir
 * instancias (TypeORM reutiliza la misma entidad producto entre variantes) y
 * mutarla podría afectar algo que todavía está en uso en la petición.
 *
 * `seen` corta los ciclos; `depth` es el cinturón por si algo se anida de más.
 */
export function stripCosts(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => stripCosts(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (COST_FIELDS.has(key)) continue;
    out[key] = stripCosts(item, depth + 1, seen);
  }
  return out;
}
