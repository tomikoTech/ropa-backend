import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ModulePermissionDto {
  @IsString()
  module: string;

  @IsBoolean()
  @IsOptional()
  list?: boolean;

  @IsBoolean()
  @IsOptional()
  create?: boolean;

  @IsBoolean()
  @IsOptional()
  edit?: boolean;

  @IsBoolean()
  @IsOptional()
  delete?: boolean;
}

export class CreateAccessRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  /** Plantilla de la que arranca ("cajero", "jefe-bodega"…). */
  @IsString()
  @IsOptional()
  templateKey?: string;

  /** Matriz explícita. Si viene, manda sobre la plantilla. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionDto)
  @IsOptional()
  permissions?: ModulePermissionDto[];
}

export class UpdateAccessRoleDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionDto)
  @IsOptional()
  permissions?: ModulePermissionDto[];
}

export class AssignAccessDto {
  /** `null` quita el rol: el usuario vuelve a funcionar como antes. */
  @IsUUID()
  @IsOptional()
  accessRoleId?: string | null;

  /** Lista vacía = sin restricción de bodega (ve todas). */
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  warehouseIds?: string[];
}
