import { PosService } from './pos.service.js';

/**
 * El listado de ventas se pagina **en el servidor**.
 *
 * Antes devolvía la historia completa —la pantalla filtraba y paginaba en el
 * navegador— y una tienda con un año de facturación recibía veinte megas por
 * petición: no alcanzaba a llegar antes de que el navegador cortara.
 */
describe('PosService.findAll', () => {
  const buildService = (ids: { id: string }[] = []) => {
    const qb: Record<string, jest.Mock> = {};
    for (const metodo of [
      'leftJoin',
      'where',
      'andWhere',
      'select',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'limit',
      'offset',
    ]) {
      qb[metodo] = jest.fn(() => qb);
    }
    qb.getCount = jest.fn(() => Promise.resolve(ids.length));
    qb.getRawOne = jest.fn(() => Promise.resolve({ suma: '150000' }));
    qb.getRawMany = jest.fn(() => Promise.resolve(ids));

    const find = jest.fn(() =>
      Promise.resolve(ids.map((row) => ({ id: row.id }))),
    );
    const saleRepository = {
      createQueryBuilder: jest.fn(() => qb),
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
      unused,
    );
    return { service, qb, find };
  };

  it('pide solo una página aunque nadie lo pida', async () => {
    // El valor por defecto es lo que protege a la tienda: sin él, un consumidor
    // que olvide el parámetro se vuelve a traer la historia entera.
    const { service, qb } = buildService();

    await service.findAll(undefined, 'tenant-1');

    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(qb.offset).toHaveBeenCalledWith(0);
  });

  it('respeta la página y el tamaño pedidos', async () => {
    const { service, qb } = buildService();

    await service.findAll({ page: 3, limit: 50 }, 'tenant-1');

    expect(qb.limit).toHaveBeenCalledWith(50);
    expect(qb.offset).toHaveBeenCalledWith(100);
  });

  it('le pone techo al tamaño de página', async () => {
    // Sin tope, `?limit=999999` reabre el mismo agujero.
    const { service, qb } = buildService();

    await service.findAll({ limit: 5000 }, 'tenant-1');

    expect(qb.limit).toHaveBeenCalledWith(200);
  });

  it('devuelve el total y las páginas, no solo las filas', async () => {
    const { service } = buildService([{ id: 'a' }, { id: 'b' }]);

    const res = await service.findAll({ limit: 1 }, 'tenant-1');

    expect(res.total).toBe(2);
    expect(res.totalPages).toBe(2);
    expect(res.page).toBe(1);
  });

  it('el vendido sale de todo el filtro, no de la página', async () => {
    // Es el número que se cuadra con la caja: si dependiera de la página,
    // cambiaría al pasar de hoja.
    const { service } = buildService([{ id: 'a' }]);

    const res = await service.findAll({ page: 2 }, 'tenant-1');

    expect(res.soldTotal).toBe(150000);
  });

  it('una página vacía no va a buscar filas', async () => {
    const { service, find } = buildService([]);

    const res = await service.findAll({ page: 9 }, 'tenant-1');

    expect(res.data).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
