import {
  IsUUID,
  IsInt,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  variantId: string;

  @IsUUID()
  warehouseId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;
}
