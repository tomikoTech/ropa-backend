import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { AccessService } from './access.service.js';
import {
  ACTION_LABELS,
  MODULES,
  resolvePermission,
} from './module-registry.js';

/**
 * Guard de permisos (F8): la matriz se aplica **en el servidor**.
 *
 * En el sistema anterior varias reglas viven solo en el JavaScript de la
 * pantalla, así que llamando la API directamente se las salta (se comprobó: por
 * API aceptó un abono de $5.000 sobre una venta de $1.000). Aquí el frontend
 * esconde lo que no se puede hacer **y además** el servidor lo rechaza.
 *
 * Se registra como guard global **después** de `JwtAuthGuard`, así que ya tiene
 * el usuario resuelto.
 *
 * Tres puertas de salida rápidas, en orden:
 * 1. Ruta pública → no aplica.
 * 2. `SUPER_ADMIN` → no aplica (es la cuenta de la plataforma).
 * 3. Usuario **sin rol de acceso** → no aplica: funciona como antes de que
 *    existieran los permisos. Es lo que hace que activar esto no le cambie el
 *    día a nadie hasta que se le asigne un rol.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<
      Request & {
        user?: { id: string; role: Role; accessRoleId: string | null };
      }
    >();

    const user = request.user;
    // Sin usuario no hay nada que decidir: de eso responde el guard de JWT.
    if (!user) return true;
    if (user.role === Role.SUPER_ADMIN) return true;
    if (!user.accessRoleId) return true;

    const path = request.route?.path
      ? request.baseUrl + (request.route.path as string)
      : request.originalUrl || request.url;
    const needed = resolvePermission(request.method, path);
    if (!needed) return true;

    const { allowed, roleName } = await this.access.can(
      user.accessRoleId,
      needed.module,
      needed.action,
    );
    if (allowed) return true;

    // El mensaje dice qué falta y a quién pedírselo: un "403 Forbidden" seco
    // hace que el usuario crea que el sistema se rompió.
    const moduleLabel =
      MODULES.find((m) => m.key === needed.module)?.label ?? needed.module;
    throw new ForbiddenException(
      `Tu rol "${roleName}" no tiene permiso de ` +
        `"${ACTION_LABELS[needed.action]}" en ${moduleLabel}. ` +
        `Pídele a un administrador que te lo habilite.`,
    );
  }
}
