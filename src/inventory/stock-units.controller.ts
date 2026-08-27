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
  IntakeBoxesDto,
  TransferUnitsDto,
  MarkPrintedDto,
  UpdateBoxContentsDto,
} from './dto/stock-unit.dto.js';
import { DarDeBajaDto } from './dto/dar-de-baja.dto.js';
import { RecostearDto } from './dto/recostear.dto.js';

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
  @ApiOperation({ summary: 'Buscar una caja o un par por su código de barras' })
  findByBarcode(
    @Param('barcode') barcode: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.findByBarcode(barcode, tenantId);
  }

  @Get('trace/:barcode')
  @ApiOperation({
    summary: 'Consulta operativa e historial de un código físico',
  })
  trace(@Param('barcode') barcode: string, @TenantId() tenantId: string) {
    return this.units.traceByBarcode(barcode, tenantId);
  }

  @Get('search')
  @ApiOperation({
    summary:
      'Buscar códigos por texto, tipo (caja o par), producto, estado, bodega, caja de origen y fecha',
  })
  search(
    @Query('q') q: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('productId') productId: string | undefined,
    @Query('variantId') variantId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('parentId') parentId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @TenantId() tenantId: string,
  ) {
    return this.units.search({
      q,
      kind,
      productId,
      variantId,
      status,
      warehouseId,
      parentId,
      from,
      to,
      page: Number(page),
      limit: Number(limit),
      tenantId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Cajas y pares de un renglón de compra' })
  findByBoxLine(
    @Query('boxLineId', ParseUUIDPipe) boxLineId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.findByBoxLine(boxLineId, tenantId);
  }

  @Post('receive/:boxLineId')
  @ApiOperation({
    summary: 'Recibir cajas de un renglón: las crea con su código y suma inventario',
  })
  receive(
    @Param('boxLineId', ParseUUIDPipe) boxLineId: string,
    @Body() dto: ReceiveBoxesDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.receiveBoxLine(boxLineId, dto, userId, tenantId);
  }

  @Post('intake')
  @ApiOperation({
    summary: 'Ingresar cajas que ya están en la bodega, sin orden de compra',
  })
  intake(
    @Body() dto: IntakeBoxesDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.intakeBoxes(dto, userId, tenantId);
  }

  @Post('transfer')
  @ApiOperation({
    summary: 'Trasladar cajas o pares a otra bodega, con su inventario',
  })
  transfer(
    @Body() dto: TransferUnitsDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.transferUnits(dto, userId, tenantId);
  }

  @Post(':id/split')
  @ApiOperation({ summary: 'Abrir una caja en sus unidades, según su curva' })
  split(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.splitBox(id, userId, tenantId);
  }

  @Post(':id/baja')
  @ApiOperation({ summary: 'Dar de baja un bulto por su código (sale del inventario)' })
  darDeBaja(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DarDeBajaDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.darDeBaja(id, dto.motivo, userId, tenantId);
  }

  @Post(':id/recostear')
  @ApiOperation({ summary: 'Cambiar el costo con alcance (este / vendidos / existencias / costo cero)' })
  recostear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecostearDto,
    @TenantId() tenantId: string,
  ) {
    return this.units.recostear(id, dto.nuevoCosto, dto.alcance, tenantId);
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
  markPrinted(
    @Body() dto: MarkPrintedDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.units.markPrinted(dto.ids, userId, tenantId);
  }
}
