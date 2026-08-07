import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabelsService } from './labels.service.js';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';

class PrintLabelsDto {
  @ApiProperty({ type: [String], description: 'Bultos a etiquetar, en orden' })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(10)
  widthMm?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @IsInt()
  @Min(10)
  heightMm?: number;

  @ApiPropertyOptional({
    enum: [8, 12],
    description: '8 = 203dpi, 12 = 300dpi',
  })
  @IsOptional()
  @IsIn([8, 12])
  dpmm?: 8 | 12;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  copies?: number;
}

/**
 * Impresión de etiquetas. Dos formatos del mismo contenido:
 * ZPL para las impresoras térmicas que el cliente ya tiene, y PDF para
 * imprimir desde cualquier parte sin instalar nada.
 */
@ApiTags('Inventario - Etiquetas')
@ApiBearerAuth()
@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Post('zpl')
  @ApiOperation({ summary: 'Etiquetas en ZPL (impresoras Zebra)' })
  async zpl(
    @Body() dto: PrintLabelsDto,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ) {
    const zpl = await this.labels.buildZpl(dto.ids, tenantId, {
      widthMm: dto.widthMm,
      heightMm: dto.heightMm,
      dpmm: dto.dpmm,
      copies: dto.copies,
    });
    // Texto plano y no binario: así se puede previsualizar y copiar al
    // portapapeles, además de descargarse o mandarse al puerto 9100.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="etiquetas.zpl"',
    );
    res.send(zpl);
  }

  @Post('pdf')
  @ApiOperation({ summary: 'Etiquetas en PDF (cualquier impresora)' })
  async pdf(
    @Body() dto: PrintLabelsDto,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.labels.buildPdf(dto.ids, tenantId, {
      widthMm: dto.widthMm,
      heightMm: dto.heightMm,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiquetas.pdf"');
    res.send(pdf);
  }
}
