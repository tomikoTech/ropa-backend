import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VouchersService } from './vouchers.service.js';
import { VoucherStatus } from './entities/voucher.entity.js';
import { CreateVoucherDto, RedeemVoucherDto } from './dto/voucher.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';

@ApiTags('Bonos / cupones')
@ApiBearerAuth()
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar bonos' })
  findAll(@TenantId() tenantId: string) {
    return this.vouchers.findAll(tenantId);
  }

  @Get('check/:barcode')
  @ApiOperation({
    summary: 'Comprobar un bono antes de aplicarlo (valor y validez)',
  })
  check(@Param('barcode') barcode: string, @TenantId() tenantId: string) {
    return this.vouchers.findUsable(barcode, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Emitir uno o varios bonos' })
  create(
    @Body() dto: CreateVoucherDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.vouchers.create(dto, userId, tenantId);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'Canjear un bono (un solo uso)' })
  redeem(@Body() dto: RedeemVoucherDto, @TenantId() tenantId: string) {
    return this.vouchers.redeem(dto.barcode, dto.saleId, tenantId);
  }

  @Patch(':id/disable')
  @ApiOperation({ summary: 'Desactivar un bono' })
  disable(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.vouchers.setStatus(id, VoucherStatus.DISABLED, tenantId);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Reactivar un bono' })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.vouchers.setStatus(id, VoucherStatus.ACTIVE, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un bono no canjeado' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.vouchers.remove(id, tenantId);
  }
}
