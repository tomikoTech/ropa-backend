import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LocationsService } from './locations.service.js';
import { Shelf } from './entities/shelf.entity.js';
import { Stand } from './entities/stand.entity.js';
import { Warehouse } from './entities/warehouse.entity.js';

const TENANT = 'tenant-1';
const WH = 'wh-1';

describe('LocationsService', () => {
  let service: LocationsService;
  let shelfRepo: any;
  let standRepo: any;
  let warehouseRepo: any;

  beforeEach(async () => {
    shelfRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve({ id: 'shelf-1', ...x })),
      delete: jest.fn(),
    };
    standRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve({ id: 'stand-1', ...x })),
      delete: jest.fn(),
    };
    warehouseRepo = {
      findOne: jest.fn().mockResolvedValue({ id: WH, tenantId: TENANT }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: getRepositoryToken(Shelf), useValue: shelfRepo },
        { provide: getRepositoryToken(Stand), useValue: standRepo },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
  });

  describe('findByWarehouse', () => {
    // Los stands se traen de una sola vez para todas las estanterías: hacerlo
    // por estantería sería un N+1 en bodegas con muchas ubicaciones.
    it('agrupa los stands bajo su estantería con una sola consulta', async () => {
      shelfRepo.find.mockResolvedValue([
        { id: 's1', name: 'A', tenantId: TENANT, warehouseId: WH },
        { id: 's2', name: 'B', tenantId: TENANT, warehouseId: WH },
      ]);
      standRepo.find.mockResolvedValue([
        { id: 'st1', name: '1', shelfId: 's1' },
        { id: 'st2', name: '2', shelfId: 's1' },
        { id: 'st3', name: '1', shelfId: 's2' },
      ]);

      const result = await service.findByWarehouse(WH, TENANT);

      expect(standRepo.find).toHaveBeenCalledTimes(1);
      expect(result[0].stands.map((s) => s.id)).toEqual(['st1', 'st2']);
      expect(result[1].stands.map((s) => s.id)).toEqual(['st3']);
    });

    it('devuelve arreglo vacío sin consultar stands si no hay estanterías', async () => {
      shelfRepo.find.mockResolvedValue([]);
      expect(await service.findByWarehouse(WH, TENANT)).toEqual([]);
      expect(standRepo.find).not.toHaveBeenCalled();
    });

    it('estantería sin stands queda con lista vacía, no undefined', async () => {
      shelfRepo.find.mockResolvedValue([
        { id: 's1', name: 'A', tenantId: TENANT, warehouseId: WH },
      ]);
      standRepo.find.mockResolvedValue([]);
      const result = await service.findByWarehouse(WH, TENANT);
      expect(result[0].stands).toEqual([]);
    });

    it('falla si la bodega no es del tenant', async () => {
      warehouseRepo.findOne.mockResolvedValue(null);
      await expect(service.findByWarehouse(WH, TENANT)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createShelf', () => {
    it('crea la estantería recortando el nombre', async () => {
      shelfRepo.findOne.mockResolvedValue(null);
      await service.createShelf(WH, '  Estantería A  ', TENANT);
      expect(shelfRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Estantería A', warehouseId: WH }),
      );
    });

    // El nombre es único por bodega, no por tenant: dos bodegas pueden tener
    // cada una su estantería "A".
    it('rechaza el nombre duplicado dentro de la misma bodega', async () => {
      shelfRepo.findOne.mockResolvedValue({ id: 'otra', name: 'A' });
      await expect(service.createShelf(WH, 'A', TENANT)).rejects.toThrow(
        ConflictException,
      );
    });

    it('valida la bodega antes de crear', async () => {
      warehouseRepo.findOne.mockResolvedValue(null);
      await expect(service.createShelf(WH, 'A', TENANT)).rejects.toThrow(
        NotFoundException,
      );
      expect(shelfRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('createStand', () => {
    it('crea el stand dentro de su estantería', async () => {
      shelfRepo.findOne.mockResolvedValue({ id: 's1', tenantId: TENANT });
      standRepo.findOne.mockResolvedValue(null);
      await service.createStand('s1', ' 1 ', TENANT);
      expect(standRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: '1', shelfId: 's1' }),
      );
    });

    it('rechaza duplicado dentro de la misma estantería', async () => {
      shelfRepo.findOne.mockResolvedValue({ id: 's1', tenantId: TENANT });
      standRepo.findOne.mockResolvedValue({ id: 'otro' });
      await expect(service.createStand('s1', '1', TENANT)).rejects.toThrow(
        ConflictException,
      );
    });

    it('falla si la estantería no existe en el tenant', async () => {
      shelfRepo.findOne.mockResolvedValue(null);
      await expect(service.createStand('s1', '1', TENANT)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateShelf', () => {
    it('permite renombrar a un nombre libre', async () => {
      shelfRepo.findOne
        .mockResolvedValueOnce({
          id: 's1',
          name: 'A',
          warehouseId: WH,
          tenantId: TENANT,
        })
        .mockResolvedValueOnce(null);
      const r = await service.updateShelf('s1', { name: 'B' }, TENANT);
      expect(r.name).toBe('B');
    });

    it('rechaza renombrar a uno ya usado en la bodega', async () => {
      shelfRepo.findOne
        .mockResolvedValueOnce({
          id: 's1',
          name: 'A',
          warehouseId: WH,
          tenantId: TENANT,
        })
        .mockResolvedValueOnce({ id: 's2', name: 'B' });
      await expect(
        service.updateShelf('s1', { name: 'B' }, TENANT),
      ).rejects.toThrow(ConflictException);
    });

    it('no comprueba duplicados si el nombre no cambia', async () => {
      shelfRepo.findOne.mockResolvedValue({
        id: 's1',
        name: 'A',
        warehouseId: WH,
        tenantId: TENANT,
      });
      await service.updateShelf('s1', { name: 'A', isActive: false }, TENANT);
      expect(shelfRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('elimina la estantería (sus stands se van en cascada)', async () => {
      shelfRepo.findOne.mockResolvedValue({ id: 's1', tenantId: TENANT });
      await service.removeShelf('s1', TENANT);
      expect(shelfRepo.delete).toHaveBeenCalledWith({
        id: 's1',
        tenantId: TENANT,
      });
    });

    it('no elimina una estantería de otro tenant', async () => {
      shelfRepo.findOne.mockResolvedValue(null);
      await expect(service.removeShelf('s1', TENANT)).rejects.toThrow(
        NotFoundException,
      );
      expect(shelfRepo.delete).not.toHaveBeenCalled();
    });
  });
});
