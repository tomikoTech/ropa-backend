import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CajaService } from './caja.service.js';
import { CerrarTurnoDto, ReabrirTurnoDto } from './dto/cerrar-turno.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';

@ApiTags('caja')
@ApiBearerAuth()
@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get('cuadre')
  @ApiOperation({
    summary: 'Cuadre del día: cuánto entró, por local y por vendedor',
    description:
      'Separa efectivo de transferencia, suma las ventas y los abonos de ' +
      'cartera del mismo día, y lista cada movimiento con su método, su banco ' +
      'y su comprobante. Las ventas anuladas se muestran aparte y no suman.',
  })
  @ApiQuery({
    name: 'dia',
    required: false,
    description: 'YYYY-MM-DD; por defecto hoy',
  })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  cuadre(
    @TenantId() tenantId: string,
    @Query('dia') dia?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.caja.cuadre(tenantId, { dia, warehouseId, userId });
  }

  @Get('turno')
  @ApiOperation({ summary: '¿Tengo el turno abierto en este local?' })
  @ApiQuery({ name: 'warehouseId', required: false })
  estadoDelTurno(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.caja.estadoDelTurno(tenantId, userId, warehouseId);
  }

  @Post('cierres')
  @ApiOperation({ summary: 'Cerrar el turno de un vendedor en un local' })
  cerrar(
    @TenantId() tenantId: string,
    @UserId() quienCierra: string,
    @Body() dto: CerrarTurnoDto,
  ) {
    return this.caja.cerrarTurno(tenantId, quienCierra, dto);
  }

  @Post('cierres/:id/reabrir')
  @ApiOperation({
    summary: 'Reabrir un turno cerrado',
    description:
      'La válvula de escape: un cierre mal hecho deja a alguien sin poder ' +
      'vender. No borra el cierre, lo marca con quién lo reabrió y por qué.',
  })
  reabrir(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
    @UserId() quienReabre: string,
    @Body() dto: ReabrirTurnoDto,
  ) {
    return this.caja.reabrirTurno(tenantId, id, quienReabre, dto?.motivo);
  }
}
