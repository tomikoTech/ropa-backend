import { Repository, DataSource } from 'typeorm';
import { Return } from './entities/return.entity.js';
import { CreditNote } from './entities/credit-note.entity.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
export declare class ReturnsService {
    private readonly returnRepository;
    private readonly creditNoteRepository;
    private readonly dataSource;
    constructor(returnRepository: Repository<Return>, creditNoteRepository: Repository<CreditNote>, dataSource: DataSource);
    private generateReturnNumber;
    private generateCreditNoteNumber;
    create(dto: CreateReturnDto, userId: string, tenantId: string): Promise<Return>;
    findAll(tenantId: string): Promise<Return[]>;
    findOne(id: string, tenantId: string): Promise<Return>;
    findCreditNotes(tenantId: string): Promise<CreditNote[]>;
}
