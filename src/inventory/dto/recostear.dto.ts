import { IsEnum, IsNumber, Min } from 'class-validator';

/**
 * A qué alcanza un cambio de costo, tal como lo pidió el dueño:
 * - `unidad`: solo este bulto.
 * - `vendidos`: lo que ya se vendió de este producto (costo histórico).
 * - `existencias`: todo lo de este producto que está en inventario.
 * - `costo_cero`: solo lo que está en inventario con costo en cero (lo que se
 *   ingresó sin costo y hay que corregir en bloque).
 */
export enum AlcanceRecosteo {
  UNIDAD = 'unidad',
  VENDIDOS = 'vendidos',
  EXISTENCIAS = 'existencias',
  COSTO_CERO = 'costo_cero',
}

export class RecostearDto {
  @IsNumber()
  @Min(0)
  nuevoCosto!: number;

  @IsEnum(AlcanceRecosteo)
  alcance!: AlcanceRecosteo;
}
