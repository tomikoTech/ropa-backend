import { CreateSupplierDto } from './create-supplier.dto.js';
declare const UpdateSupplierDto_base: import("@nestjs/common").Type<Partial<CreateSupplierDto>>;
export declare class UpdateSupplierDto extends UpdateSupplierDto_base {
    isActive?: boolean;
}
export {};
