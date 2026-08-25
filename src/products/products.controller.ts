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
import {
  parseNonNegativeInt,
  parsePositiveInt,
} from '../common/utils/query-number.util.js';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

/** Tope de filas por página: ninguna consulta de catálogo puede pedir más. */
const MAX_PAGE_SIZE = 200;

/** Un precio del filtro: número o nada. `?minPrice=abc` no se cuela como NaN. */
function precio(valor?: string): number | undefined {
  if (valor === undefined || valor.trim() === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

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
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'STANDARD | ESSENCE | FRASCO',
  })
  @ApiQuery({
    name: 'brands',
    required: false,
    description: 'Marcas separadas por coma',
  })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({
    name: 'inStock',
    required: false,
    description: 'true = solo lo que tiene existencias',
  })
  @ApiQuery({
    name: 'warehouseId',
    required: false,
    description:
      'Mira el inventario de una sola bodega: cambia el conteo, el orden y, ' +
      'junto con inStock, deja solo lo que hay ahí.',
  })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('gender') gender?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
    @Query('brands') brands?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStock') inStock?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    // Backward-compatible: sin ningún param devuelve el array completo
    // (POS, gestión de storefront, etc. lo siguen consumiendo igual).
    if (
      page === undefined &&
      limit === undefined &&
      search === undefined &&
      categoryIds === undefined &&
      gender === undefined &&
      type === undefined &&
      sort === undefined &&
      brands === undefined &&
      minPrice === undefined &&
      maxPrice === undefined &&
      inStock === undefined &&
      warehouseId === undefined
    ) {
      return this.productsService.findAll(tenantId);
    }
    return this.productsService.findPaginated(tenantId, {
      // `?page=abc` o `?limit=99999` no pueden decidir cuánta base se lee.
      page: parsePositiveInt(page) ?? 1,
      limit: parsePositiveInt(limit, { max: MAX_PAGE_SIZE }) ?? 30,
      search,
      categoryIds: categoryIds
        ? categoryIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      gender,
      type,
      sort,
      brands: brands
        ? brands
            .split(',')
            .map((b) => b.trim())
            .filter(Boolean)
        : undefined,
      minPrice: precio(minPrice),
      maxPrice: precio(maxPrice),
      inStock: inStock === 'true',
      warehouseId: warehouseId || undefined,
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
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  searchVariants(
    @Query('q') query: string,
    @TenantId() tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    // Esta búsqueda es la que usa el POS para saber qué vender, así que la puede
    // llamar quien tenga permiso de Ventas (ver `module-registry.ts`). Trae el
    // producto completo, **con su costo**, pero de eso se encarga
    // `CostVisibilityInterceptor`: si quien pregunta no puede ver Productos, el
    // costo no sale — aquí ni en ningún otro endpoint.
    return this.productsService.searchVariants(query, tenantId, {
      limit: parsePositiveInt(limit, { max: MAX_PAGE_SIZE }),
      offset: parseNonNegativeInt(offset),
      type: type || undefined,
      sort,
      warehouseId,
    });
  }

  @Get('search/pos-catalog')
  @ApiOperation({
    summary:
      'Catálogo POS agrupado por producto, con todas sus variantes y existencias',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  searchPosCatalog(
    @TenantId() tenantId: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.productsService.searchPosCatalog(query ?? '', tenantId, {
      limit: parsePositiveInt(limit, { max: MAX_PAGE_SIZE }),
      offset: parseNonNegativeInt(offset),
      type: type || undefined,
      sort,
      warehouseId,
    });
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
