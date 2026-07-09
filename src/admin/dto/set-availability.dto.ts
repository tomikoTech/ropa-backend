import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetAvailabilityDto {
  @ApiProperty({
    example: false,
    description: 'true = disponible, false = agotado/oculto',
  })
  @IsBoolean()
  available: boolean;
}
