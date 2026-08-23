import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service.js';
import { limpiarParaAuditoria } from './limpiar-para-auditoria.js';

const AUDITED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    if (!AUDITED_METHODS.includes(method)) {
      return next.handle();
    }

    const userId = req.user?.id;
    const tenantId = req.user?.tenantId;
    const ip = req.ip;
    const path: string = req.route?.path || req.url;

    // Derive entity type from controller path
    const segments = path.split('/').filter(Boolean);
    // Remove 'api' prefix if present
    const entityType =
      (segments[0] === 'api' ? segments[1] : segments[0]) || 'unknown';

    const actionMap: Record<string, string> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    const action = actionMap[method] || method;

    return next.handle().pipe(
      tap((responseData) => {
        const entityId =
          req.params?.id || responseData?.data?.id || responseData?.id;

        this.auditService
          .log({
            userId,
            action,
            entityType,
            entityId,
            // El cuerpo pasa por el filtro. Antes se guardaba entero, y eso
            // dejó en producción 293 contraseñas en texto plano, 900 tokens de
            // sesión, los secretos de la pasarela de pagos y 90 MB de fotos en
            // base64. La regla vive en `limpiar-para-auditoria.ts`.
            newValues:
              method !== 'DELETE'
                ? limpiarParaAuditoria(req.body)
                : undefined,
            ip,
            tenantId,
          })
          .catch(() => {
            // Audit logging should never break the request
          });
      }),
    );
  }
}
