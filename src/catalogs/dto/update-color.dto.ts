import { PartialType } from '@nestjs/swagger';
import { CreateColorDto } from './create-color.dto.js';

export class UpdateColorDto extends PartialType(CreateColorDto) {}
