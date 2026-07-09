import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description:
      'Filtra por categoría: acepta slug O nombre (case-insensitive) e incluye subcategorías.',
  })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Búsqueda parcial (case-insensitive) sobre nombre, descripción, categoría y prefijo de SKU.',
  })
  @ApiQuery({
    name: 'inStock',
    required: false,
    type: Boolean,
    description:
      'Si es true, solo productos con al menos una variante activa con stock > 0. No recorta el array de variantes.',
  })
  @ApiQuery({
    name: 'onlyAvailable',
    required: false,
    type: Boolean,
    description:
      'Si es true, solo productos con disponibilidad activa (is_available = true).',
  })
  @ApiQuery({
    name: 'size',
    required: false,
    type: String,
    description:
      'Filtra por talla (case-insensitive, match por token: "42" matchea "Eur 42"). Acepta varias separadas por coma: "40,41".',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Página (default 1). Solo aplica si se envía limit.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Tamaño de página. Default: sin límite (devuelve todos). Metadatos en headers X-Total-Count, X-Page, X-Limit.',
  })
  async getProducts(
    @Param('tenantSlug') tenantSlug: string,
    @Res({ passthrough: true }) res: Response,
    @Query('category') category?: string,
    @Query('gender') gender?: string,
    @Query('search') search?: string,
    @Query('inStock') inStock?: string,
    @Query('onlyAvailable') onlyAvailable?: string,
    @Query('size') size?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const sizes = size
      ? size
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const { products, total, page: usedPage, limit: usedLimit } =
      await this.storefrontService.getProducts(tenantSlug, {
        category,
        gender,
        search,
        inStock: inStock === 'true',
        onlyAvailable: onlyAvailable === 'true',
        sizes,
        page: pageNum,
        limit: limitNum,
      });

    // Expose pagination metadata via headers only when paginating, so the
    // default response (and its body shape) stays byte-identical to before.
    if (usedLimit != null) {
      res.setHeader('X-Total-Count', String(total));
      res.setHeader('X-Page', String(usedPage));
      res.setHeader('X-Limit', String(usedLimit));
    }

    return products;
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
