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
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
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

  @ApiProperty({ description: 'Consecutivo INV- escrito por el usuario' })
  @IsString()
  confirmation: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acknowledgeExceptions?: boolean;
}

class ScanCountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  barcode: string;

  @ApiProperty({ description: 'ID único generado por el dispositivo' })
  @IsString()
  @MaxLength(128)
  clientScanId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
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

  @Post(':id/scan')
  @ApiOperation({
    summary: 'Escanear caja o unidad física de forma idempotente',
  })
  scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanCountDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.scan(id, dto, userId, tenantId);
  }

  @Get(':id/session')
  @ApiOperation({ summary: 'Progreso y lecturas recientes del conteo' })
  session(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.getSession(id, tenantId);
  }

  @Get(':id/differences')
  @ApiOperation({ summary: 'Diferencias entre lo contado y el sistema' })
  differences(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.getDifferences(id, tenantId);
  }

  @Get(':id/physical-differences')
  @ApiOperation({ summary: 'Faltantes, sobrantes y novedades por código' })
  physicalDifferences(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.getPhysicalDifferences(id, tenantId);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Exportar novedades individuales en CSV' })
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ) {
    const csv = await this.counts.exportCsv(id, tenantId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="conteo-${id}.csv"`,
    );
    res.send(csv);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Cerrar el conteo, ajustando el inventario o no' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCountDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.counts.close(
      id,
      dto.adjust ?? false,
      dto.confirmation,
      dto.acknowledgeExceptions ?? false,
      userId,
      tenantId,
    );
  }
}
