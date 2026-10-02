import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { libroDeCarteraCompleta } from './cartera-completa-excel.js';
import { pdfDeCarteraCompleta } from '../documentos/cartera-completa-pdf.js';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiQuery({
    name: 'cuentaId',
    required: false,
    description: 'Una cuenta por cobrar: trae todos sus abonos, sin periodo',
  })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  abonos(
    @TenantId() tenantId: string,
    @Query('clienteId') clienteId?: string,
    @Query('cuentaId') cuentaId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.cartera.abonosDeClientes(tenantId, {
      terceroId: clienteId,
      cuentaId,
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
  @ApiQuery({
    name: 'cuentaId',
    required: false,
    description: 'Una cuenta por pagar: trae todos sus pagos, sin periodo',
  })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  pagos(
    @TenantId() tenantId: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('cuentaId') cuentaId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.cartera.pagosAProveedores(tenantId, {
      terceroId: proveedorId,
      cuentaId,
      desde,
      hasta,
    });
  }

  /**
   * La cartera de todos los clientes, para uso interno: PDF, Excel o JSON.
   * Se abre con ticket de descarga (`?token=`), como el estado de cuenta.
   */
  @Get('completa')
  @ApiOperation({ summary: 'Cartera completa: todos los clientes con saldo' })
  @ApiQuery({
    name: 'formato',
    required: false,
    description: 'pdf | xlsx | json (por defecto json)',
  })
  async completa(
    @TenantId() tenantId: string,
    @Res() res: Response,
    @Query('formato') formato?: string,
  ) {
    const cartera = await this.cartera.carteraCompleta(tenantId);
    const generadoEl = new Date().toISOString();
    const fecha = generadoEl.slice(0, 10);
    if (formato === 'pdf') {
      const tienda = await this.cartera.nombreDeLaTienda(tenantId);
      const pdf = await pdfDeCarteraCompleta(
        { nombre: tienda, muestraCodigos: false },
        cartera,
        generadoEl,
      );
      // Se escribe directo: el interceptor de respuestas envolvía el archivo
      // en JSON y la descarga llegaba de 96 bytes.
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cartera-completa-${fecha}.pdf"`,
      );
      res.end(pdf);
      return;
    }
    if (formato === 'xlsx') {
      const tienda = await this.cartera.nombreDeLaTienda(tenantId);
      const buffer = await libroDeCarteraCompleta(
        tienda,
        cartera,
        generadoEl,
      ).xlsx.writeBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cartera-completa-${fecha}.xlsx"`,
      );
      res.end(Buffer.from(buffer));
      return;
    }
    res.json(cartera);
  }
}
