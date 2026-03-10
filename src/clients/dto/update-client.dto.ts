import { PartialType } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto.js';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
