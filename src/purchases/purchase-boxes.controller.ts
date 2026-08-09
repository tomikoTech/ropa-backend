import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PurchaseBoxesService } from './purchase-boxes.service.js';
import {
  CreateBoxLineDto,
  UpdateBoxLineDto,
  AppendBoxesDto,
  UpdateImportCostsDto,
} from './dto/purchase-box.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

/**
 * Compra por cajas y costeo de importación.
 * Cuelga de la orden de compra existente: una orden puede tener líneas
 * clásicas (por variante), líneas por caja, o ambas.
 */
@ApiTags('Compras - Cajas e importación')
@ApiBearerAuth()
@Controller('purchases')
export class PurchaseBoxesController {
  constructor(private readonly boxes: PurchaseBoxesService) {}

  @Get('box-lines/import-template')
  @ApiOperation({ summary: 'Plantilla XLSX para importar cajas' })
  async importTemplate(@Res() res: Response) {
    const file = await this.boxes.buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla-cajas.xlsx"',
    );
    res.send(file);
  }

  @Get(':id/box-lines')
  @ApiOperation({ summary: 'Renglones por caja de la orden' })
  findLines(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.findLines(id, tenantId);
  }

  @Post(':id/box-lines')
  @ApiOperation({ summary: 'Agregar renglón por cajas' })
  addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBoxLineDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.addLine(id, dto, tenantId);
  }

  @Post(':id/box-lines/import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Importar renglones por caja desde XLSX o CSV' })
  importLines(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.importLines(id, file, tenantId);
  }

  @Patch('box-lines/:lineId')
  @ApiOperation({ summary: 'Actualizar renglón por cajas' })
  updateLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateBoxLineDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.updateLine(lineId, dto, tenantId);
  }

  @Post('box-lines/:lineId/append')
  @ApiOperation({
    summary: 'Anexar cajas conservando la numeración del renglón',
  })
  appendBoxes(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: AppendBoxesDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.appendBoxes(lineId, dto.additionalBoxes, tenantId);
  }

  @Delete('box-lines/:lineId')
  @ApiOperation({ summary: 'Eliminar renglón por cajas' })
  removeLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.removeLine(lineId, tenantId);
  }

  @Patch(':id/import-costs')
  @ApiOperation({ summary: 'Tasa de cambio, fletes y fecha de llegada' })
  updateImportCosts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportCostsDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.updateImportCosts(id, dto, tenantId);
  }

  @Get(':id/landed-cost')
  @ApiOperation({
    summary: 'Costo puesto en bodega, con los fletes ya repartidos',
  })
  getLandedCost(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.getLandedCost(id, tenantId);
  }
}
