"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantId = void 0;
const common_1 = require("@nestjs/common");
exports.TenantId = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId;
});
//# sourceMappingURL=tenant-id.decorator.js.map