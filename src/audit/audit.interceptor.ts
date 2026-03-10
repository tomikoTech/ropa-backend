import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service.js';

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
    const entityType = (segments[0] === 'api' ? segments[1] : segments[0]) || 'unknown';

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
          req.params?.id ||
          (responseData as any)?.data?.id ||
          (responseData as any)?.id;

        this.auditService
          .log({
            userId,
            action,
            entityType,
            entityId,
            newValues: method !== 'DELETE' ? req.body : undefined,
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
