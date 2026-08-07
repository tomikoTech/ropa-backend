import { PartialType } from '@nestjs/swagger';
import { CreateSizeDto } from './create-size.dto.js';

export class UpdateSizeDto extends PartialType(CreateSizeDto) {}
