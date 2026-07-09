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
 * Guarda las rutas admin de escritura (agente Canario). Espera:
 *   Authorization: Bearer <MIPINTA_ADMIN_TOKEN>
 *
 * El token autentica al SERVICIO llamador (genérico, multi-tenant): el tenant
 * sobre el que se opera sale del :tenantSlug del path, no del token. Así el
 * mismo mecanismo sirve para cualquier tenant, presente o futuro.
 *
 * - El token se compara (timing-safe) contra MIPINTA_ADMIN_TOKEN.
 * - MIPINTA_ADMIN_TENANT es OPCIONAL y actúa como allowlist (uno o varios slugs
 *   separados por coma). Si se define, el :tenantSlug del path debe estar en la
 *   lista; si NO se define (recomendado), se permite cualquier tenant.
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

    // Allowlist OPCIONAL de tenants. Sin ella, el token opera sobre cualquier
    // tenant (el path decide). Con ella, el :tenantSlug debe estar en la lista.
    const allowlistRaw = this.configService.get<string>('MIPINTA_ADMIN_TENANT');
    if (allowlistRaw && allowlistRaw.trim()) {
      const allowed = allowlistRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const tenantSlug = (request.params as Record<string, string>)?.tenantSlug;
      if (!allowed.includes(tenantSlug)) {
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
