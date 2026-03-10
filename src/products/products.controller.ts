import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear producto con variantes' })
  create(@Body() dto: CreateProductDto, @TenantId() tenantId: string) {
    return this.productsService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los productos' })
  findAll(@TenantId() tenantId: string) {
    return this.productsService.findAll(tenantId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar variantes por SKU, código de barras o nombre' })
  @ApiQuery({ name: 'q', required: true })
  searchVariants(@Query('q') query: string, @TenantId() tenantId: string) {
    return this.productsService.searchVariants(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener producto por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.productsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar producto y variantes' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar producto' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.productsService.remove(id, tenantId);
  }

  @Get('variants/:variantId')
  @ApiOperation({ summary: 'Obtener variante por ID' })
  findVariant(@Param('variantId', ParseUUIDPipe) variantId: string, @TenantId() tenantId: string) {
    return this.productsService.findVariant(variantId, tenantId);
  }
}
