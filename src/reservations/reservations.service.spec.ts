import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service.js';
import { Reservation } from './entities/reservation.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let reservationRepo: Record<string, jest.Mock>;
  let stockRepo: Record<string, jest.Mock>;
  let settingsRepo: Record<string, jest.Mock>;
  const tenantId = 'tenant-1';

  beforeEach(async () => {
    reservationRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, id: 'r1' })),
    };
    stockRepo = {
      findOne: jest.fn().mockResolvedValue({ quantity: 5 }),
    };
    settingsRepo = {
      findOne: jest.fn().mockResolvedValue({ reservationsEnabled: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        { provide: getRepositoryToken(Stock), useValue: stockRepo },
        { provide: getRepositoryToken(StoreSettings), useValue: settingsRepo },
      ],
    }).compile();
    service = module.get(ReservationsService);
  });

  it('crea un apartado cuando hay disponible', async () => {
    const r = await service.create(
      { variantId: 'v1', warehouseId: 'w1', quantity: 2 },
      'user-1',
      tenantId,
    );
    expect(r.status).toBe('ACTIVE');
    expect(reservationRepo.save).toHaveBeenCalled();
  });

  it('bloquea si se aparta más que el disponible (stock − apartados activos)', async () => {
    stockRepo.findOne.mockResolvedValueOnce({ quantity: 3 });
    // Ya hay 2 apartados activos → disponible 1.
    reservationRepo.find.mockResolvedValueOnce([{ quantity: 2 }]);
    await expect(
      service.create(
        { variantId: 'v1', warehouseId: 'w1', quantity: 2 },
        'user-1',
        tenantId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloquea si el módulo no está habilitado', async () => {
    settingsRepo.findOne.mockResolvedValueOnce({ reservationsEnabled: false });
    await expect(
      service.create(
        { variantId: 'v1', warehouseId: 'w1', quantity: 1 },
        'user-1',
        tenantId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('summary agrupa cantidades activas por variante', async () => {
    reservationRepo.find.mockResolvedValueOnce([
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v1', quantity: 1 },
      { variantId: 'v2', quantity: 4 },
    ]);
    const map = await service.summary(tenantId);
    expect(map).toEqual({ v1: 3, v2: 4 });
  });
});
