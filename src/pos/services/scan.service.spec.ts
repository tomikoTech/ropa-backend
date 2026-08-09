import { ScanService } from './scan.service.js';
import {
  StockUnitKind,
  StockUnitStatus,
} from '../../inventory/entities/stock-unit.entity.js';

describe('ScanService', () => {
  it('does not expose pairs inside closed mixed boxes as loose size stock', async () => {
    const variantRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'variant-40',
        productId: 'product-1',
        sku: 'AMA-40',
        sizeName: '40',
        colorName: 'Blanco',
        product: { name: 'AMA 15', basePrice: 100000, taxRate: 19 },
      }),
    };
    const unitRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([
        {
          variantId: 'variant-40',
          warehouseId: 'warehouse-1',
          kind: StockUnitKind.BOX,
          status: StockUnitStatus.IN_STOCK,
          quantity: 24,
        },
      ]),
    };
    const stockRepo = {
      find: jest.fn().mockResolvedValue([
        { variantId: 'variant-40', warehouseId: 'warehouse-1', quantity: 126 },
      ]),
    };
    const boxLineRepo = { findOne: jest.fn() };
    const service = new ScanService(
      variantRepo as any,
      unitRepo as any,
      stockRepo as any,
      boxLineRepo as any,
    );

    const result = await service.resolve('AMA-40', 'tenant-1');

    expect(result.available).toBe(102);
    expect(result.warehouseId).toBe('warehouse-1');
  });
});
