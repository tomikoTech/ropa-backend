import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientsService } from './clients.service.js';
import { Client } from './entities/client.entity.js';

describe('ClientsService.create (cliente rápido)', () => {
  let service: ClientsService;
  let repo: Record<string, jest.Mock>;
  const tenantId = 'tenant-1';

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, id: 'c1' })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: getRepositoryToken(Client), useValue: repo },
      ],
    }).compile();
    service = module.get(ClientsService);
  });

  it('crea un cliente con solo teléfono, rellenando el nombre con el número', async () => {
    const result = await service.create({ phone: '3001234567' }, tenantId);
    expect(repo.save).toHaveBeenCalled();
    expect(result.firstName).toBe('3001234567');
    expect(result.lastName).toBe('');
    expect(result.phone).toBe('3001234567');
    expect(result.tenantId).toBe(tenantId);
  });

  it('respeta el nombre cuando se proporciona', async () => {
    const result = await service.create(
      { firstName: 'Ana', lastName: 'Pérez', phone: '3009999999' },
      tenantId,
    );
    expect(result.firstName).toBe('Ana');
    expect(result.lastName).toBe('Pérez');
  });

  it('rechaza crear un cliente sin ningún identificador', async () => {
    await expect(service.create({}, tenantId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
