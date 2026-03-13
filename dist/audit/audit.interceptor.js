"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const audit_service_js_1 = require("./audit.service.js");
const AUDITED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
let AuditInterceptor = class AuditInterceptor {
    auditService;
    constructor(auditService) {
        this.auditService = auditService;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const method = req.method;
        if (!AUDITED_METHODS.includes(method)) {
            return next.handle();
        }
        const userId = req.user?.id;
        const tenantId = req.user?.tenantId;
        const ip = req.ip;
        const path = req.route?.path || req.url;
        const segments = path.split('/').filter(Boolean);
        const entityType = (segments[0] === 'api' ? segments[1] : segments[0]) || 'unknown';
        const actionMap = {
            POST: 'CREATE',
            PUT: 'UPDATE',
            PATCH: 'UPDATE',
            DELETE: 'DELETE',
        };
        const action = actionMap[method] || method;
        return next.handle().pipe((0, rxjs_1.tap)((responseData) => {
            const entityId = req.params?.id || responseData?.data?.id || responseData?.id;
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
            });
        }));
    }
};
exports.AuditInterceptor = AuditInterceptor;
exports.AuditInterceptor = AuditInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [audit_service_js_1.AuditService])
], AuditInterceptor);
//# sourceMappingURL=audit.interceptor.js.map