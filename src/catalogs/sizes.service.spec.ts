import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SizesService, deriveSortOrder } from './sizes.service.js';
import { Size } from './entities/size.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';

const TENANT = 'tenant-1';

describe('deriveSortOrder', () => {
  // El orden alfabético rompe las tallas numéricas ("10" antes que "9"),
  // que es exactamente el bug que este orden derivado evita.
  it('ordena las tallas numéricas por su valor, no alfabéticamente', () => {
    const sizes = ['9', '10', '38', '40'];
    const ordered = [...sizes].sort(
      (a, b) => deriveSortOrder(a) - deriveSortOrder(b),
    );
    expect(ordered).toEqual(['9', '10', '38', '40']);
  });

  it('soporta medias tallas y coma decimal', () => {
    expect(deriveSortOrder('38')).toBeLessThan(deriveSortOrder('38.5'));
    expect(deriveSortOrder('38,5')).toBe(deriveSortOrder('38.5'));
  });

  it('ordena las tallas de letra en su secuencia natural', () => {
    const letters = ['XL', 'S', 'XXL', 'M', 'XS'];
    const ordered = [...letters].sort(
      (a, b) => deriveSortOrder(a) - deriveSortOrder(b),
    );
    expect(ordered).toEqual(['XS', 'S', 'M', 'XL', 'XXL']);
  });

  it('pone las numéricas antes que las de letra', () => {
    expect(deriveSortOrder('45')).toBeLessThan(deriveSortOrder('S'));
  });

  it('manda al final lo que no reconoce', () => {
    expect(deriveSortOrder('TALLA ÚNICA')).toBeGreaterThan(
      deriveSortOrder('XXXL'),
    );
  });

  it('es indiferente a mayúsculas y espacios', () => {
    expect(deriveSortOrder(' m ')).toBe(deriveSortOrder('M'));
  });
});

describe('SizesService', () => {
  let service: SizesService;
  let sizeRepo: any;
  let variantRepo: any;
  let dataSource: any;
  let managerUpdate: jest.Mock;

  beforeEach(async () => {
    managerUpdate = jest.fn();
    sizeRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve({ id: 'size-1', ...x })),
      delete: jest.fn(),
    };
    variantRepo = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };
    dataSource = {
      transaction: jest.fn(
        async (cb: (m: unknown) => Promise<unknown>) =>
          await cb({
            getRepository: (entity: unknown) =>
              entity === Size ? sizeRepo : { update: managerUpdate },
          }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SizesService,
        { provide: getRepositoryToken(Size), useValue: sizeRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SizesService>(SizesService);
  });

  describe('create', () => {
    it('deriva el orden cuando no se envía', async () => {
      sizeRepo.findOne.mockResolvedValue(null);
      await service.create({ name: '38' }, TENANT);
      expect(sizeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: '38', sortOrder: 380 }),
      );
    });

    it('respeta el orden explícito', async () => {
      sizeRepo.findOne.mockResolvedValue(null);
      await service.create({ name: 'Única', sortOrder: 5 }, TENANT);
      expect(sizeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 5 }),
      );
    });

    it('rechaza duplicados en el mismo tenant', async () => {
      sizeRepo.findOne.mockResolvedValue({ id: 'x', name: '38' });
      await expect(service.create({ name: '38' }, TENANT)).rejects.toThrow(
        ConflictException,
      );
    });

    it('recorta espacios del nombre', async () => {
      sizeRepo.findOne.mockResolvedValue(null);
      await service.create({ name: '  40  ' }, TENANT);
      expect(sizeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: '40' }),
      );
    });
  });

  describe('update', () => {
    // El catálogo aporta el id estable, pero la variante guarda TEXTO:
    // si el rename no sincroniza, las variantes quedan huérfanas del catálogo.
    it('sincroniza las variantes al renombrar', async () => {
      sizeRepo.findOne
        .mockResolvedValueOnce({
          id: 'size-1',
          name: '38',
          sortOrder: 380,
          tenantId: TENANT,
        })
        .mockResolvedValueOnce(null); // no hay duplicado

      await service.update('size-1', { name: '39' }, TENANT);

      expect(dataSource.transaction).toHaveBeenCalled();
      // Con FK, el filtro es por id (una sola escritura), no por el texto viejo.
      expect(managerUpdate).toHaveBeenCalledWith(
        { tenantId: TENANT, sizeId: 'size-1' },
        { size: '39' },
      );
    });

    it('recalcula el orden si venía derivado del nombre anterior', async () => {
      sizeRepo.findOne
        .mockResolvedValueOnce({
          id: 'size-1',
          name: '38',
          sortOrder: 380,
          tenantId: TENANT,
        })
        .mockResolvedValueOnce(null);

      const updated = await service.update('size-1', { name: '41' }, TENANT);

      expect(updated.sortOrder).toBe(410);
    });

    it('respeta un orden personalizado al renombrar', async () => {
      sizeRepo.findOne
        .mockResolvedValueOnce({
          id: 'size-1',
          name: '38',
          sortOrder: 7,
          tenantId: TENANT,
        })
        .mockResolvedValueOnce(null);

      const updated = await service.update('size-1', { name: '41' }, TENANT);

      expect(updated.sortOrder).toBe(7);
    });

    it('rechaza renombrar a un nombre ya existente', async () => {
      sizeRepo.findOne
        .mockResolvedValueOnce({ id: 'size-1', name: '38', tenantId: TENANT })
        .mockResolvedValueOnce({ id: 'size-2', name: '39' });

      await expect(
        service.update('size-1', { name: '39' }, TENANT),
      ).rejects.toThrow(ConflictException);
    });

    it('no abre transacción si el nombre no cambia', async () => {
      sizeRepo.findOne.mockResolvedValue({
        id: 'size-1',
        name: '38',
        tenantId: TENANT,
      });

      await service.update('size-1', { isActive: false }, TENANT);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('elimina la talla cuando no está en uso', async () => {
      sizeRepo.findOne.mockResolvedValue({
        id: 'size-1',
        name: '38',
        tenantId: TENANT,
      });
      variantRepo.count.mockResolvedValue(0);

      await service.remove('size-1', TENANT);

      expect(sizeRepo.delete).toHaveBeenCalledWith({
        id: 'size-1',
        tenantId: TENANT,
      });
    });

    // La FK es ON DELETE RESTRICT: sin este chequeo el usuario vería un error
    // de integridad en vez de saber qué hacer.
    it('rechaza eliminar una talla en uso, diciendo cuántas variantes la usan', async () => {
      sizeRepo.findOne.mockResolvedValue({
        id: 'size-1',
        name: '38',
        tenantId: TENANT,
      });
      variantRepo.count.mockResolvedValue(12);

      await expect(service.remove('size-1', TENANT)).rejects.toThrow(
        /12 variante/,
      );
      expect(sizeRepo.delete).not.toHaveBeenCalled();
    });

    it('falla si la talla no existe', async () => {
      sizeRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('nope', TENANT)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('ensure', () => {
    it('no crea nada con nombre vacío', async () => {
      expect(await service.ensure('   ', TENANT)).toBeNull();
      expect(sizeRepo.save).not.toHaveBeenCalled();
    });

    it('devuelve la existente sin duplicar', async () => {
      const existing = { id: 'size-1', name: '38' };
      sizeRepo.findOne.mockResolvedValue(existing);
      expect(await service.ensure('38', TENANT)).toBe(existing);
      expect(sizeRepo.save).not.toHaveBeenCalled();
    });

    it('crea la talla con su orden derivado si falta', async () => {
      sizeRepo.findOne.mockResolvedValue(null);
      await service.ensure('42', TENANT);
      expect(sizeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: '42', sortOrder: 420 }),
      );
    });
  });
});
