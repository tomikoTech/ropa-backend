import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { StorefrontService } from './storefront.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CalculateCheckoutDto } from './dto/calculate-checkout.dto.js';

@ApiTags('Storefront (Público)')
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Public()
  @Get('stores')
  @ApiOperation({ summary: 'Listar tiendas activas' })
  async getActiveStores() {
    return this.storefrontService.getActiveStores();
  }

  @Public()
  @Get('hub/products')
  @ApiOperation({ summary: 'Productos destacados del hub multi-tienda' })
  @ApiQuery({ name: 'limit', required: false })
  async getHubProducts(@Query('limit') limit?: string) {
    return this.storefrontService.getHubProducts(
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Public()
  @Get('resolve-domain')
  @ApiOperation({ summary: 'Resolver dominio personalizado a slug de tienda' })
  @ApiQuery({ name: 'domain', required: true })
  resolveDomain(@Query('domain') domain: string) {
    return this.storefrontService.resolveByDomain(domain);
  }

  @Public()
  @Get(':tenantSlug/settings')
  @ApiOperation({ summary: 'Obtener info de la tienda' })
  getSettings(@Param('tenantSlug') tenantSlug: string) {
    return this.storefrontService.getSettings(tenantSlug);
  }

  @Public()
  @Get(':tenantSlug/products')
  @ApiOperation({ summary: 'Listar productos publicados' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'gender', required: false })
  @ApiQuery({ name: 'search', required: false })
  getProducts(
    @Param('tenantSlug') tenantSlug: string,
    @Query('category') categorySlug?: string,
    @Query('gender') gender?: string,
    @Query('search') search?: string,
  ) {
    return this.storefrontService.getProducts(tenantSlug, {
      categorySlug,
      gender,
      search,
    });
  }

  @Public()
  @Get(':tenantSlug/products/:productSlug')
  @ApiOperation({ summary: 'Detalle de producto por slug' })
  getProductBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.storefrontService.getProductBySlug(tenantSlug, productSlug);
  }

  @Public()
  @Get(':tenantSlug/categories')
  @ApiOperation({ summary: 'Categorías con conteo de productos publicados' })
  getCategories(@Param('tenantSlug') tenantSlug: string) {
    return this.storefrontService.getCategories(tenantSlug);
  }

  @Public()
  @Get(':tenantSlug/promotions')
  @ApiOperation({ summary: 'Promociones activas' })
  getPromotions(@Param('tenantSlug') tenantSlug: string) {
    return this.storefrontService.getPromotions(tenantSlug);
  }

  @Public()
  @Post(':tenantSlug/checkout/calculate')
  @ApiOperation({
    summary: 'Preview de totales de checkout (incluye COD pricing)',
  })
  calculateCheckout(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: CalculateCheckoutDto,
  ) {
    return this.storefrontService.calculateCheckout(tenantSlug, dto);
  }

  @Public()
  @Post(':tenantSlug/orders')
  @ApiOperation({
    summary: 'Crear pedido e-commerce (deducción de stock + WhatsApp URL)',
  })
  createOrder(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.storefrontService.createOrder(tenantSlug, dto);
  }
}
