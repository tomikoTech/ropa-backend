import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '../enums/role.enum.js';

/**
 * Para lo que es del dueño: lo hace el `ADMIN`, o quien tenga un rol de acceso
 * que se lo permita.
 *
 * `RolesGuard` solo mira el rol técnico, y en AMAWAD los encargados entran
 * como `COLABORADOR` con el rol de acceso «Administrador»: se quedaban por
 * fuera de cosas que su rol sí permite («no me deja mover la fecha», Andrés,
 * 2026-11-28). La matriz ya la revisó `PermissionsGuard`, que corre antes como
 * guard global; aquí solo se cierra la puerta al colaborador **sin** rol de
 * acceso, al que esa matriz deja pasar por compatibilidad.
 */
@Injectable()
export class AdminORolConPermisoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: Role; accessRoleId?: string | null } }>();
    if (!user) return false;
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) return true;
    if (user.accessRoleId) return true;
    throw new ForbiddenException(
      'Esto lo hace un administrador o alguien con un rol que lo permita.',
    );
  }
}
