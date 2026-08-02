import { PartialType } from '@nestjs/swagger';
import { CreateConsignmentDto } from './create-consignment.dto.js';

export class UpdateConsignmentDto extends PartialType(CreateConsignmentDto) {}
