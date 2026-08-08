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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';
import { AccessService } from '../access/access.service.js';

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly access: AccessService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear producto con variantes' })
  create(@Body() dto: CreateProductDto, @TenantId() tenantId: string) {
    return this.productsService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar productos (paginado si se envían filtros/paginación)',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'categoryIds',
    required: false,
    description: 'IDs separados por coma',
  })
  @ApiQuery({ name: 'gender', required: false })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'STANDARD | ESSENCE | FRASCO',
  })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('gender') gender?: string,
    @Query('type') type?: string,
  ) {
    // Backward-compatible: sin ningún param devuelve el array completo
    // (POS, gestión de storefront, etc. lo siguen consumiendo igual).
    if (
      page === undefined &&
      limit === undefined &&
      search === undefined &&
      categoryIds === undefined &&
      gender === undefined &&
      type === undefined
    ) {
      return this.productsService.findAll(tenantId);
    }
    return this.productsService.findPaginated(tenantId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 30,
      search,
      categoryIds: categoryIds
        ? categoryIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      gender,
      type,
    });
  }

  @Get('search')
  @ApiOperation({
    summary: 'Buscar variantes por SKU, código de barras o nombre',
  })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'type', required: false })
  async searchVariants(
    @Query('q') query: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('type') type?: string,
  ) {
    const variants = await this.productsService.searchVariants(
      query,
      tenantId,
      {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        type: type || undefined,
      },
    );

    // Esta búsqueda es la que usa el POS para saber qué vender, así que la
    // puede llamar quien tenga permiso de Ventas. Pero trae el producto
    // completo, **con su costo**: si quien pregunta no tiene permiso de ver
    // Productos, el costo no viaja. Un cajero necesita encontrar la mercancía;
    // no necesita saber en cuánto se compró.
    const seesCost = await this.access.userCan(user, 'products', 'list');
    if (seesCost) return variants;

    return variants.map((v) => ({
      ...v,
      product: v.product ? { ...v.product, costPrice: undefined } : v.product,
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener producto por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.findOne(id, tenantId);
  }

  @Get(':id/recipe')
  @ApiOperation({ summary: 'Receta de esencias del producto (perfumería)' })
  getRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.getRecipe(id, tenantId);
  }

  @Get(':id/used-in')
  @ApiOperation({
    summary: 'Productos finales que usan esta esencia (relación inversa)',
  })
  getUsedIn(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.getUsedIn(id, tenantId);
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

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publicar producto en e-commerce' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.publish(id, tenantId);
  }

  @Patch(':id/unpublish')
  @ApiOperation({ summary: 'Despublicar producto del e-commerce' })
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.unpublish(id, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar producto' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.productsService.remove(id, tenantId);
  }

  @Get('variants/:variantId')
  @ApiOperation({ summary: 'Obtener variante por ID' })
  findVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @TenantId() tenantId: string,
  ) {
    return this.productsService.findVariant(variantId, tenantId);
  }
}
