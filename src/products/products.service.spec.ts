import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepository: Record<string, jest.Mock>;
  let variantRepository: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';

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
    productRepository = {
      create: jest
        .fn()
        .mockImplementation((dto) => ({ ...dto, id: 'product-uuid-1' })),
      save: jest.fn().mockResolvedValue(mockProduct),
      find: jest.fn().mockResolvedValue([mockProduct]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    variantRepository = {
      create: jest
        .fn()
        .mockImplementation((dto) => ({ ...dto, id: 'variant-uuid-1' })),
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: productRepository,
        },
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: variantRepository,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a product with variants', async () => {
      // ensureUniqueSlug calls findOne - return null to indicate slug is unique
      productRepository.findOne
        .mockResolvedValueOnce(null) // skuPrefix check
        .mockResolvedValueOnce(null) // ensureUniqueSlug
        .mockResolvedValueOnce({ ...mockProduct, variants: [] }); // final findOne

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

      // findOne for the initial fetch in update()
      productRepository.findOne
        .mockResolvedValueOnce(mockProduct) // findOne inside update (initial)
        .mockResolvedValueOnce(null) // ensureUniqueSlug
        .mockResolvedValueOnce(updatedProduct); // findOne at the end of update

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
