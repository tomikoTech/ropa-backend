import { PosService } from './pos.service.js';

describe('PosService.findAll', () => {
  const buildService = () => {
    type FindOptions = {
      take?: number;
      where: Record<string, unknown>;
    };
    const find = jest.fn((_options: FindOptions) => Promise.resolve([]));
    const saleRepository = {
      find,
    };
    const unused = undefined as never;
    const service = new PosService(
      saleRepository as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    return { service, find };
  };

  it('returns the complete sales history when no limit is requested', async () => {
    const { service, find } = buildService();

    await service.findAll(undefined, 'tenant-1');

    const options = find.mock.calls[0][0];
    expect(options).not.toHaveProperty('take');
    expect(options.where).toEqual({ tenantId: 'tenant-1' });
  });

  it('honors an explicit limit for consumers that request one', async () => {
    const { service, find } = buildService();

    await service.findAll({ limit: 25 }, 'tenant-1');

    expect(find.mock.calls[0][0]).toHaveProperty('take', 25);
  });
});
