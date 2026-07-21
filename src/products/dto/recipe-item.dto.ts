import { IsNumber, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Un ítem de la receta de esencias de un producto final: qué esencia
// (variante) y cuántos gramos se consumen por unidad producida.
export class RecipeItemDto {
  @ApiProperty({ example: 'uuid-variante-esencia' })
  @IsUUID()
  essenceVariantId: string;

  @ApiProperty({ example: 3.5, description: 'Gramos de esencia por unidad' })
  @IsNumber()
  @Min(0)
  gramsPerUnit: number;
}
