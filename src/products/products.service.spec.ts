import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductsService } from './products.service.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { ProductEssence } from './entities/product-essence.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { RecipeService } from './services/recipe.service.js';
import { BrandsService } from '../brands/brands.service.js';
import { SizesService } from '../catalogs/sizes.service.js';
import { ColorsService } from '../catalogs/colors.service.js';

// Query builder encadenable: getRawMany() devuelve las filas configuradas.
function mockQueryBuilder(rows: unknown[] = []) {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    setParameter: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    offset: jest.fn(() => qb),
    getRawMany: jest.fn().mockResolvedValue(rows),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue(rows),
    getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
  };
  return qb;
}

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepository: Record<string, jest.Mock>;
  let variantRepository: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';

  // SKU prefijos ya usados en el tenant, para el query builder de unicidad.
  let takenPrefixes: string[];
  let takenSkus: string[];

  const mockProduct: Partial<Product> = {
    id: 'product-uuid-1',
    name: 'Camiseta Básica',
    skuPrefix: 'CAMISE',
    slug: 'camiseta-basica',
    description: 'Una camiseta básica',
    basePrice: 50000,
    costPrice: 25000,
    taxRate: 19,
    tenantId,
    variants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    takenPrefixes = [];
    takenSkus = [];

    productRepository = {
      create: jest
        .fn()
        .mockImplementation((dto) => ({ ...dto, id: 'product-uuid-1' })),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
      find: jest.fn().mockResolvedValue([mockProduct]),
      // Búsqueda por id (findOne del servicio) → producto; búsqueda por slug
      // (chequeo de unicidad) → libre.
      findOne: jest
        .fn()
        .mockImplementation(({ where }: { where: { id?: string } }) =>
          Promise.resolve(where?.id ? mockProduct : null),
        ),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() =>
        mockQueryBuilder(takenPrefixes.map((prefix) => ({ prefix }))),
      ),
    };

    variantRepository = {
      create: jest
        .fn()
        .mockImplementation((dto) => ({ ...dto, id: 'variant-uuid-1' })),
      save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() =>
        mockQueryBuilder(takenSkus.map((sku) => ({ sku }))),
      ),
    };

    const emptyRepo = () => ({
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepository },
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: variantRepository,
        },
        { provide: getRepositoryToken(StoreSettings), useValue: emptyRepo() },
        { provide: getRepositoryToken(Category), useValue: emptyRepo() },
        { provide: getRepositoryToken(Warehouse), useValue: emptyRepo() },
        { provide: getRepositoryToken(Stock), useValue: emptyRepo() },
        { provide: getRepositoryToken(ProductEssence), useValue: emptyRepo() },
        {
          provide: RecipeService,
          useValue: {
            replaceRecipe: jest.fn(),
            replaceUsedIn: jest.fn(),
            getRecipe: jest.fn().mockResolvedValue([]),
            getUsedIn: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: BrandsService, useValue: { ensure: jest.fn() } },
        // El catálogo devuelve null: las variantes quedan sin FK, que es
        // exactamente el caso "talla/color vacíos" que el servicio debe tolerar.
        {
          provide: SizesService,
          useValue: { ensure: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: ColorsService,
          useValue: { ensure: jest.fn().mockResolvedValue(null) },
        },
        { provide: DataSource, useValue: { manager: {} } },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a product with variants', async () => {
      const dto = {
        name: 'Camiseta Básica',
        basePrice: 50000,
        variants: [
          { size: 'M', color: 'Negro' },
          { size: 'L', color: 'Blanco' },
        ],
      };

      const result = await service.create(dto as any, tenantId);

      expect(productRepository.create).toHaveBeenCalled();
      expect(productRepository.save).toHaveBeenCalled();
      expect(variantRepository.create).toHaveBeenCalledTimes(2);
      expect(variantRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('usa el prefijo base cuando está libre', async () => {
      await service.create(
        { name: 'Camiseta Básica', basePrice: 1000, variants: [] } as any,
        tenantId,
      );
      expect(productRepository.create.mock.calls[0][0].skuPrefix).toBe(
        'CAMISE',
      );
    });

    // Regresión del error 500 al crear esencias en Distri Amber: el prefijo se
    // trunca a 6 caracteres, así que toda "Esencia X" comparte "ESENCI". El
    // fallback anterior era "ESENCI" + total de productos del tenant, que con
    // productos borrados apuntaba a un prefijo ya existente y reventaba contra
    // el índice único (tenant_id, sku_prefix).
    it('no reutiliza un prefijo existente aunque el nombre se trunque igual', async () => {
      takenPrefixes = ['ESENCI', 'ESENCI2', 'ESENCI377'];
      productRepository.count.mockResolvedValue(377);

      await service.create(
        {
          name: 'Esencia Versace Bright Crystal',
          basePrice: 0,
          variants: [],
        } as any,
        tenantId,
      );

      const used = productRepository.create.mock.calls[0][0].skuPrefix;
      expect(takenPrefixes).not.toContain(used);
      expect(used).toBe('ESENCI3');
    });

    it('no deriva el prefijo del número de productos del tenant', async () => {
      takenPrefixes = ['ESENCI'];
      productRepository.count.mockResolvedValue(50);

      await service.create(
        { name: 'Esencia Amber', basePrice: 0, variants: [] } as any,
        tenantId,
      );

      expect(productRepository.create.mock.calls[0][0].skuPrefix).not.toBe(
        'ESENCI50',
      );
    });

    it('usa un prefijo por defecto cuando el nombre no tiene letras ni números', async () => {
      await service.create(
        { name: '★★★', basePrice: 1000, variants: [] } as any,
        tenantId,
      );
      expect(productRepository.create.mock.calls[0][0].skuPrefix).toBe('PROD');
    });

    it('reintenta cuando dos creaciones simultáneas eligen el mismo prefijo', async () => {
      const duplicate = Object.assign(new Error('duplicate key'), {
        code: '23505',
        detail: 'Key (tenant_id, sku_prefix)=(t1, CAMISE) already exists.',
      });
      productRepository.save
        .mockRejectedValueOnce(duplicate)
        .mockImplementation((p) => Promise.resolve(p));

      await expect(
        service.create(
          { name: 'Camiseta Básica', basePrice: 1000, variants: [] } as any,
          tenantId,
        ),
      ).resolves.toBeDefined();

      expect(productRepository.save).toHaveBeenCalledTimes(2);
    });

    it('rechaza con 404 una categoría que no pertenece al tenant', async () => {
      await expect(
        service.create(
          {
            name: 'Producto',
            basePrice: 1000,
            variants: [],
            categoryId: 'categoria-inexistente',
          } as any,
          tenantId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('genera SKUs distintos para variantes con la misma talla y color', async () => {
      takenSkus = ['CAMISE-M-NEG'];

      await service.create(
        {
          name: 'Camiseta Básica',
          basePrice: 1000,
          variants: [{ size: 'M', color: 'Negro' }],
        } as any,
        tenantId,
      );

      expect(variantRepository.create.mock.calls[0][0].sku).toBe(
        'CAMISE-M-NEG-2',
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of products', async () => {
      const result = await service.findAll(tenantId);

      expect(result).toEqual([mockProduct]);
      expect(productRepository.find).toHaveBeenCalledWith({
        where: { tenantId },
        relations: ['category', 'variants'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('inventory ordering', () => {
    it('orders paginated products by highest stock by default', async () => {
      const qb = mockQueryBuilder([]);
      productRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findPaginated(tenantId, {});

      expect(qb.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('FROM stock stock_sort'),
        'inventory_quantity',
      );
      expect(qb.orderBy).toHaveBeenCalledWith('inventory_quantity', 'DESC');
    });

    it('allows changing variant ordering to product name', async () => {
      const qb = mockQueryBuilder([]);
      variantRepository.createQueryBuilder.mockReturnValue(qb);

      await service.searchVariants('', tenantId, { sort: 'name-asc' });

      expect(qb.orderBy).toHaveBeenCalledWith('p.name', 'ASC');
    });

    it('can order POS variants by stock in the selected warehouse', async () => {
      const qb = mockQueryBuilder([]);
      variantRepository.createQueryBuilder.mockReturnValue(qb);

      await service.searchVariants('', tenantId, {
        sort: 'stock-desc',
        warehouseId: 'warehouse-1',
      });

      expect(qb.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('stock_sort.warehouse_id = :sortWarehouseId'),
        'inventory_quantity',
      );
      expect(qb.setParameter).toHaveBeenCalledWith(
        'sortWarehouseId',
        'warehouse-1',
      );
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      productRepository.findOne.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-uuid-1', tenantId);

      expect(result).toEqual(mockProduct);
      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'product-uuid-1', tenantId },
        relations: ['category', 'variants'],
      });
    });

    it('should throw NotFoundException for invalid id', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      const updatedProduct = { ...mockProduct, name: 'Camiseta Premium' };

      productRepository.findOne
        .mockResolvedValueOnce(mockProduct) // findOne inicial dentro de update
        .mockResolvedValueOnce(null) // ensureUniqueSlug
        .mockResolvedValueOnce(updatedProduct); // findOne final

      const result = await service.update(
        'product-uuid-1',
        { name: 'Camiseta Premium' } as any,
        tenantId,
      );

      expect(result).toEqual(updatedProduct);
      expect(productRepository.save).toHaveBeenCalled();
    });
  });
});
