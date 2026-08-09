import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StockUnitsService } from './stock-units.service.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';
import {
  ReceiveBoxesDto,
  MarkPrintedDto,
  UpdateBoxContentsDto,
} from './dto/stock-unit.dto.js';

/**
 * Inventario por unidades etiquetadas: recibir cajas, abrirlas y buscarlas
 * por código de barras.
 */
@ApiTags('Inventario - Bultos')
@ApiBearerAuth()
@Controller('stock-units')
export class StockUnitsController {
  constructor(private readonly units: StockUnitsService) {}

  @Get('by-barcode/:barcode')
  @ApiOperation({ summary: 'Buscar un bulto por su código de barras' })
  findByBarcode(
    @Param('barcode') barcode: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.findByBarcode(barcode, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Bultos de un renglón de compra' })
  findByBoxLine(
    @Query('boxLineId', ParseUUIDPipe) boxLineId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.findByBoxLine(boxLineId, tenantId);
  }

  @Post('receive/:boxLineId')
  @ApiOperation({
    summary: 'Recibir cajas de un renglón: crea los bultos y suma inventario',
  })
  receive(
    @Param('boxLineId', ParseUUIDPipe) boxLineId: string,
    @Body() dto: ReceiveBoxesDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.receiveBoxLine(boxLineId, dto, userId, tenantId);
  }

  @Post(':id/split')
  @ApiOperation({ summary: 'Abrir una caja en sus unidades, según su curva' })
  split(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.units.splitBox(id, tenantId);
  }

  @Get(':id/contents')
  @ApiOperation({ summary: 'Contenido esperado y real de una caja física' })
  contents(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.getBoxContents(id, tenantId);
  }

  @Post(':id/contents')
  @ApiOperation({ summary: 'Detallar el contenido real de una caja física' })
  updateContents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoxContentsDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.updateBoxContents(id, dto.items, userId, tenantId);
  }

  @Post('mark-printed')
  @ApiOperation({ summary: 'Registrar que se imprimieron estas etiquetas' })
  markPrinted(@Body() dto: MarkPrintedDto, @TenantId() tenantId: string) {
    return this.units.markPrinted(dto.ids, tenantId);
  }
}
