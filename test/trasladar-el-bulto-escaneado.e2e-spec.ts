import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Trasladar la caja que se escaneó, no otra del mismo modelo.**
 *
 * AMAWAD escaneó una caja en Traslados para mandarla a LOCAL 214 y «se
 * trasladó todo el modelo»: el traslado era «N unidades de la talla» y el
 * ledger elegía qué bultos se iban por antigüedad. Con dos cajas iguales, se
 * iba la otra —o la existencia se movía y la caja se quedaba—.
 *
 * Con `stockUnitId` se va **esa** caja, con su código, entera. Y lo que se
 * fija acá es que después del traslado las dos cuentas —la existencia por
 * bodega y dónde está cada caja— digan lo mismo.
 */
describe('Trasladar el bulto escaneado (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let origenId: string;
  let destinoId: string;
  let cajas: {
    id: string;
    barcode: string;
    variantId: string;
    quantity: number;
  }[];

  const existencia = async (variantId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(auth())
      .expect(200);
    const filas = r.body as { warehouseId: string; quantity: number }[];
    const en = (id: string) =>
      filas
        .filter((f) => f.warehouseId === id)
        .reduce((t, f) => t + Number(f.quantity), 0);
    return { origen: en(origenId), destino: en(destinoId) };
  };

  const dondeEsta = async (barcode: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${barcode}`)
      .set(auth())
      .expect(200);
    return {
      status: r.body.unit.status as string,
      warehouseId: r.body.unit.warehouseId as string,
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const bodega = async (nombre: string, code: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({
          name: `${nombre} ${ts}`,
          code: `${code}${ts.toString().slice(-5)}`,
          isPosLocation: true,
        })
        .expect(201);
      return r.body.id as string;
    };
    origenId = await bodega('E2E Traslado Origen', 'TO-');
    destinoId = await bodega('E2E Traslado Destino', 'TD-');

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ETRAS Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ size: '40', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;

    // Dos cajas iguales del mismo modelo: la trampa que hacía que se fuera
    // la otra.
    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({
        productId,
        boxes: 2,
        unitsPerBox: 12,
        warehouseId: origenId,
        unitCost: 40000,
      })
      .expect(201);
    cajas = ingreso.body;
    expect(cajas).toHaveLength(2);
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('se va la caja escaneada, entera, y la existencia baja en el origen y sube en el destino', async () => {
    const [, segunda] = cajas;
    const antes = await existencia(segunda.variantId);
    expect(antes).toEqual({ origen: 24, destino: 0 });

    await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId: segunda.variantId,
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        quantity: segunda.quantity,
        stockUnitId: segunda.id,
        requireConfirmation: false,
      })
      .expect(201);

    expect(await existencia(segunda.variantId)).toEqual({
      origen: 12,
      destino: 12,
    });
    // La segunda está en el destino; la primera —más vieja, la que el ledger
    // habría elegido solo— sigue en el origen.
    expect(await dondeEsta(segunda.barcode)).toEqual({
      status: 'IN_STOCK',
      warehouseId: destinoId,
    });
    expect(await dondeEsta(cajas[0].barcode)).toEqual({
      status: 'IN_STOCK',
      warehouseId: origenId,
    });
  });

  it('la caja no se parte: la cantidad tiene que ser la suya', async () => {
    const [primera] = cajas;
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId: primera.variantId,
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        quantity: 3,
        stockUnitId: primera.id,
        requireConfirmation: false,
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(/entero/i);
  });

  it('una caja que no está en la bodega de origen elegida no se traslada desde ahí', async () => {
    const [, segunda] = cajas; // ya está en el destino
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId: segunda.variantId,
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        quantity: segunda.quantity,
        stockUnitId: segunda.id,
        requireConfirmation: false,
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(/no está en la bodega de origen/i);
  });

  it('con confirmación de recepción, la caja sale en tránsito y llega al recibir', async () => {
    const [primera] = cajas;
    const remision = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId: primera.variantId,
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        quantity: primera.quantity,
        stockUnitId: primera.id,
        requireConfirmation: true,
      })
      .expect(201);
    expect((await dondeEsta(primera.barcode)).status).toBe('TRANSFERRED');
    expect(await existencia(primera.variantId)).toEqual({
      origen: 0,
      destino: 12,
    });

    const id = remision.body.id ?? remision.body.transfer?.id;
    await request(app.getHttpServer())
      .post(`/api/inventory/transfers/${id}/receive`)
      .set(auth())
      .expect(201);
    expect(await dondeEsta(primera.barcode)).toEqual({
      status: 'IN_STOCK',
      warehouseId: destinoId,
    });
    expect(await existencia(primera.variantId)).toEqual({
      origen: 0,
      destino: 24,
    });
  });
});
