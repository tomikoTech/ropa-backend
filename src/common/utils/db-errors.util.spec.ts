import {
  asPgError,
  describePgError,
  isUniqueViolation,
  retryOnUniqueViolation,
} from './db-errors.util.js';

// Réplica del error que emite el driver pg a través de TypeORM.
function pgError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error('query failed'), { code, ...extra });
}

describe('db-errors util', () => {
  describe('asPgError', () => {
    it('lee el código del error del driver', () => {
      expect(asPgError(pgError('23505'))?.code).toBe('23505');
    });

    it('lee el código anidado en driverError (QueryFailedError)', () => {
      const wrapped = Object.assign(new Error('QueryFailedError'), {
        driverError: pgError('23503'),
      });
      expect(asPgError(wrapped)?.code).toBe('23503');
    });

    it('devuelve null para errores que no son de base de datos', () => {
      expect(asPgError(new Error('boom'))).toBeNull();
      expect(asPgError(null)).toBeNull();
      expect(asPgError('texto')).toBeNull();
    });
  });

  describe('isUniqueViolation', () => {
    it('reconoce 23505 y descarta el resto', () => {
      expect(isUniqueViolation(pgError('23505'))).toBe(true);
      expect(isUniqueViolation(pgError('23503'))).toBe(false);
      expect(isUniqueViolation(new Error('boom'))).toBe(false);
    });
  });

  describe('describePgError', () => {
    it('traduce un duplicado a 409 nombrando el campo', () => {
      const described = describePgError(
        pgError('23505', {
          detail: 'Key (tenant_id, sku_prefix)=(t1, ESENCI) already exists.',
          constraint: 'UQ_products_tenant_sku_prefix',
        }),
      );
      expect(described?.status).toBe(409);
      expect(described?.message).toContain('código interno del producto');
    });

    it('traduce un duplicado sin detalle reconocible con mensaje genérico', () => {
      const described = describePgError(pgError('23505'));
      expect(described?.status).toBe(409);
      expect(described?.message).toContain('Ya existe un registro');
    });

    it('traduce violación de llave foránea a 409', () => {
      expect(describePgError(pgError('23503'))?.status).toBe(409);
    });

    it('traduce dato obligatorio faltante a 400 con el nombre de la columna', () => {
      const described = describePgError(
        pgError('23502', { column: 'base_price' }),
      );
      expect(described?.status).toBe(400);
      expect(described?.message).toContain('base_price');
    });

    it('traduce UUID/número mal formado a 400', () => {
      expect(describePgError(pgError('22P02'))?.status).toBe(400);
    });

    it('traduce texto demasiado largo a 400', () => {
      expect(describePgError(pgError('22001'))?.status).toBe(400);
    });

    it('traduce deadlock a 409 pidiendo reintentar', () => {
      const described = describePgError(pgError('40P01'));
      expect(described?.status).toBe(409);
      expect(described?.message).toContain('Intenta de nuevo');
    });

    it('devuelve null cuando no es un error de base de datos conocido', () => {
      expect(describePgError(new Error('boom'))).toBeNull();
      expect(describePgError(pgError('XX000'))).toBeNull();
    });
  });

  describe('retryOnUniqueViolation', () => {
    it('devuelve el resultado sin reintentar cuando no hay error', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      await expect(retryOnUniqueViolation(fn)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('reintenta ante un duplicado y devuelve el resultado del reintento', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(pgError('23505'))
        .mockResolvedValue('ok');
      await expect(retryOnUniqueViolation(fn)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('no reintenta errores que no son duplicados', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('boom'));
      await expect(retryOnUniqueViolation(fn)).rejects.toThrow('boom');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('relanza el duplicado tras agotar los intentos', async () => {
      const fn = jest.fn().mockRejectedValue(pgError('23505'));
      await expect(retryOnUniqueViolation(fn, 3)).rejects.toMatchObject({
        code: '23505',
      });
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
