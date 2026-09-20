import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CarteraService } from './cartera.service.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@ApiTags('Cartera')
@ApiBearerAuth()
@Controller('cartera')
export class CarteraController {
  constructor(private readonly cartera: CarteraService) {}

  @Get('abonos')
  @ApiOperation({
    summary: 'Historial de abonos de clientes: cuándo, cuánto y de quién',
    description:
      'Por día, del más reciente al más viejo, con el método, quién lo ' +
      'recibió y a qué factura entró. Un abono deshecho aparece con su ' +
      'contra-abono y no suma.',
  })
  @ApiQuery({ name: 'clienteId', required: false })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  abonos(
    @TenantId() tenantId: string,
    @Query('clienteId') clienteId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.cartera.abonosDeClientes(tenantId, {
      terceroId: clienteId,
      desde,
      hasta,
    });
  }

  @Get('pagos')
  // Lo que se le paga a los proveedores es lo mismo que Cuentas por pagar:
  // solo el administrador.
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Historial de pagos a proveedores: cuándo, cuánto y a quién',
  })
  @ApiQuery({ name: 'proveedorId', required: false })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  pagos(
    @TenantId() tenantId: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.cartera.pagosAProveedores(tenantId, {
      terceroId: proveedorId,
      desde,
      hasta,
    });
  }
}
