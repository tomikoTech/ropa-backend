import { IsUUID } from 'class-validator';

/** Reasignar un bulto a otra variante (talla/color) YA existente. */
export class ReasignarDto {
  @IsUUID()
  nuevaVariantId!: string;
}
