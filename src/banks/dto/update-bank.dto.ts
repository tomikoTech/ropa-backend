import { PartialType } from '@nestjs/swagger';
import { CreateBankDto } from './create-bank.dto.js';

export class UpdateBankDto extends PartialType(CreateBankDto) {}
