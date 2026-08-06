import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/products',
        user: { tenantId: 'tenant-1', id: 'user-1' },
      }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function pgError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error('query failed'), { code, ...extra });
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    // Los logs de error son ruido en la salida de los tests.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('respeta el status y mensaje de una HttpException', () => {
    const { host, status, json } = makeHost();

    filter.catch(new NotFoundException('Producto no encontrado'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Producto no encontrado' }),
    );
  });

  it('conserva la lista de mensajes de validación', () => {
    const { host, json } = makeHost();

    filter.catch(new BadRequestException(['name no puede estar vacío']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['name no puede estar vacío'] }),
    );
  });

  // Regresión: un duplicado en base de datos llegaba al cliente como
  // "Error interno del servidor" (500), sin pista de qué corregir.
  it('convierte un duplicado de base de datos en 409 con mensaje accionable', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      pgError('23505', {
        detail: 'Key (tenant_id, sku_prefix)=(t1, ESENCI) already exists.',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body.message).not.toBe('Error interno del servidor');
    expect(body.message).toContain('código interno del producto');
  });

  it('convierte un UUID mal formado en 400', () => {
    const { host, status } = makeHost();

    filter.catch(pgError('22P02'), host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('convierte una violación de llave foránea en 409', () => {
    const { host, status } = makeHost();

    filter.catch(pgError('23503'), host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('responde 413 cuando el body excede el límite', () => {
    const { host, status } = makeHost();

    filter.catch({ type: 'entity.too.large' }, host);

    expect(status).toHaveBeenCalledWith(413);
  });

  it('mantiene el 500 genérico para errores no reconocidos y los loguea', () => {
    const { host, status, json } = makeHost();
    const logError = jest.spyOn(filter['logger'], 'error');

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
    // El contexto del request debe quedar en el log para poder diagnosticar.
    expect(logError.mock.calls[0][0]).toContain('POST /api/products');
    expect(logError.mock.calls[0][0]).toContain('tenant=tenant-1');
  });
});
