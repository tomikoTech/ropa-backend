import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendInvoiceDto {
  @ApiProperty({ example: 'cliente@ejemplo.com' })
  @IsEmail()
  email: string;
}
