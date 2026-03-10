import { CreateClientDto } from './create-client.dto.js';
declare const UpdateClientDto_base: import("@nestjs/common").Type<Partial<CreateClientDto>>;
export declare class UpdateClientDto extends UpdateClientDto_base {
    isActive?: boolean;
}
export {};
