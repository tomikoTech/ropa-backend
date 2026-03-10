import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuditService } from './audit.service.js';
export declare class AuditInterceptor implements NestInterceptor {
    private readonly auditService;
    constructor(auditService: AuditService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
}
