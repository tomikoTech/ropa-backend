import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { AdminTokenGuard } from '../common/guards/admin-token.guard.js';
import { AdminProductsService } from './admin-products.service.js';
import { CreateAdminProductDto } from './dto/create-admin-product.dto.js';
import { SetAvailabilityDto } from './dto/set-availability.dto.js';

/**
 * Endpoints de escritura para el agente Canario (WhatsApp).
 * Protegidos por AdminTokenGuard (Bearer MIPINTA_ADMIN_TOKEN). Se marcan
 * @Public() para saltar el JwtAuthGuard global; el AdminTokenGuard hace la auth.
 */
@ApiTags('admin')
@ApiSecurity('admin-token')
@Public()
@UseGuards(AdminTokenGuard)
@Controller('admin/:tenantSlug/products')
export class AdminProductsController {
  constructor(private readonly adminProductsService: AdminProductsService) {}

  @Post()
  create(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: CreateAdminProductDto,
  ) {
    return this.adminProductsService.createProduct(tenantSlug, dto);
  }

  @Patch(':id')
  setAvailabilityById(
    @Param('tenantSlug') tenantSlug: string,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.adminProductsService.setAvailability(
      tenantSlug,
      { id },
      dto.available,
    );
  }

  @Patch('by-slug/:slug')
  setAvailabilityBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('slug') slug: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.adminProductsService.setAvailability(
      tenantSlug,
      { slug },
      dto.available,
    );
  }
}
