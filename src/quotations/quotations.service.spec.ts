import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuotationsService } from './quotations.service.js';
import { Quotation } from './entities/quotation.entity.js';
import { QuotationItem } from './entities/quotation-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { TaxService } from '../pos/services/tax.service.js';
import { PosService } from '../pos/pos.service.js';

// Query builder encadenable que devuelve el valor dado en getRawOne().
function mockQueryBuilder(rawOne: unknown) {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
  };
  return qb;
}

describe('QuotationsService', () => {
  let service: QuotationsService;
  let quotationRepo: Record<string, jest.Mock>;
  let variantRepo: Record<string, jest.Mock>;
  let settingsRepo: Record<string, jest.Mock>;
  const tenantId = 'tenant-1';

  const variant = {
    id: 'v1',
    sku: 'SKU-1',
    size: '40',
    color: 'Negro',
    priceOverride: null,
    product: { name: 'Tenis', basePrice: 100000 },
  };

  beforeEach(async () => {
    quotationRepo = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => mockQueryBuilder({ maxnum: null })),
      create: jest.fn().mockImplementation((d) => d),
      save: jest
        .fn()
        .mockImplementation((d) => Promise.resolve({ ...d, id: 'q1' })),
      findOne: jest.fn().mockResolvedValue({ id: 'q1', items: [] }),
    };
    variantRepo = {
      find: jest.fn().mockResolvedValue([variant]),
    };
    settingsRepo = {
      findOne: jest.fn().mockResolvedValue({
        quotationsEnabled: true,
        ivaEnabled: true,
        ivaRate: 19,
        ivaMode: 'included',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        TaxService,
        { provide: getRepositoryToken(Quotation), useValue: quotationRepo },
        {
          provide: getRepositoryToken(QuotationItem),
          useValue: { create: (d: unknown) => d },
        },
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getRepositoryToken(StoreSettings), useValue: settingsRepo },
        { provide: PosService, useValue: { createSale: jest.fn() } },
      ],
    }).compile();

    service = module.get(QuotationsService);
  });

  it('crea una cotización con totales correctos (IVA incluido) y número secuencial', async () => {
    await service.create(
      { warehouseId: 'w1', items: [{ variantId: 'v1', quantity: 2 }] },
      'user-1',
      tenantId,
    );
    const saved = quotationRepo.save.mock.calls[0][0];
    expect(saved.quoteNumber).toBe('COT-000001');
    expect(saved.status).toBe('DRAFT');
    // 100000 * 2 = 200000; IVA incluido → total no cambia.
    expect(saved.total).toBe(200000);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].unitPrice).toBe(100000);
  });

  // Regresión: el consecutivo salía del conteo de cotizaciones, así que borrar
  // una cotización hacía que la siguiente reutilizara un número ya emitido.
  it('continúa desde el número más alto emitido, no desde el conteo', async () => {
    quotationRepo.count.mockResolvedValue(3);
    quotationRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder({ maxnum: '7' }),
    );

    await service.create(
      { warehouseId: 'w1', items: [{ variantId: 'v1', quantity: 1 }] },
      'user-1',
      tenantId,
    );

    const saved = quotationRepo.save.mock.calls[0][0];
    expect(saved.quoteNumber).toBe('COT-000008');
  });

  it('respeta el precio unitario cotizado cuando se envía', async () => {
    await service.create(
      {
        warehouseId: 'w1',
        items: [{ variantId: 'v1', quantity: 1, unitPrice: 80000 }],
      },
      'user-1',
      tenantId,
    );
    const saved = quotationRepo.save.mock.calls[0][0];
    expect(saved.total).toBe(80000);
  });

  it('bloquea la creación si el tenant no tiene el módulo habilitado', async () => {
    settingsRepo.findOne.mockResolvedValueOnce({ quotationsEnabled: false });
    await expect(
      service.create(
        { warehouseId: 'w1', items: [{ variantId: 'v1', quantity: 1 }] },
        'user-1',
        tenantId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
