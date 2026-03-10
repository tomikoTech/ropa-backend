import { ReturnsService } from './returns.service.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
export declare class ReturnsController {
    private readonly returnsService;
    constructor(returnsService: ReturnsService);
    create(dto: CreateReturnDto, user: {
        id: string;
    }, tenantId: string): Promise<import("./entities/return.entity.js").Return>;
    findAll(tenantId: string): Promise<import("./entities/return.entity.js").Return[]>;
    findCreditNotes(tenantId: string): Promise<import("./entities/credit-note.entity.js").CreditNote[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/return.entity.js").Return>;
}
