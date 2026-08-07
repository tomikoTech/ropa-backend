import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCountsService } from './inventory-counts.service.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';

class OpenCountDto {
  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

class AddCountDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiPropertyOptional({
    default: 1,
    description: 'Se acumula a lo ya contado',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

class CloseCountDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Dejar el inventario igual a lo contado',
  })
  @IsOptional()
  @IsBoolean()
  adjust?: boolean;
}

/** Conteo físico de inventario (las "verificaciones" del sistema anterior). */
@ApiTags('Inventario - Conteos')
@ApiBearerAuth()
@Controller('inventory-counts')
export class InventoryCountsController {
  constructor(private readonly counts: InventoryCountsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar conteos' })
  findAll(@TenantId() tenantId: string) {
    return this.counts.findAll(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Abrir un conteo en una bodega' })
  open(
    @Body() dto: OpenCountDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.open(dto.warehouseId, dto.notes, userId, tenantId);
  }

  @Post(':id/lines')
  @ApiOperation({ summary: 'Registrar unidades contadas (se acumulan)' })
  addCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCountDto,
    @TenantId() tenantId: string,
  ) {
    return this.counts.addCount(id, dto.variantId, dto.quantity ?? 1, tenantId);
  }

  @Get(':id/differences')
  @ApiOperation({ summary: 'Diferencias entre lo contado y el sistema' })
  differences(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.getDifferences(id, tenantId);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Cerrar el conteo, ajustando el inventario o no' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCountDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.close(id, dto.adjust ?? false, userId, tenantId);
  }
}
