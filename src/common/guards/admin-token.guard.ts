import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Guarda las rutas admin del agente Canario. Espera:
 *   Authorization: Bearer <MIPINTA_ADMIN_TOKEN>
 *
 * - El token se compara (timing-safe) contra la env var MIPINTA_ADMIN_TOKEN.
 * - Si MIPINTA_ADMIN_TENANT está definido, el :tenantSlug del path debe coincidir
 *   (así el token "corresponde" a un tenant concreto, p.ej. the-culture).
 *
 * Las rutas se marcan además con @Public() para saltar el JwtAuthGuard global.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('MIPINTA_ADMIN_TOKEN');
    if (!expected) {
      throw new InternalServerErrorException(
        'MIPINTA_ADMIN_TOKEN no configurado en el servidor',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autorización faltante');
    }
    const provided = header.slice('Bearer '.length).trim();

    if (!this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Token de autorización inválido');
    }

    // Validar que el token corresponde al tenant del path.
    const allowedTenant = this.configService.get<string>(
      'MIPINTA_ADMIN_TENANT',
    );
    if (allowedTenant) {
      const tenantSlug = (request.params as Record<string, string>)?.tenantSlug;
      if (tenantSlug !== allowedTenant) {
        throw new ForbiddenException(
          'El token no está autorizado para este tenant',
        );
      }
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}
