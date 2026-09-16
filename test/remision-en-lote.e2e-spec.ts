import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Una remisión con varios renglones.**
 *
 * AMAWAD mandaba mercancía a LOCAL 214 y el traslado era de una talla por
 * vez: tres cajas y cinco pares eran ocho remisiones. Acá se manda una caja
 * escaneada, un par escaneado y dos pares sueltos de otra talla en una sola
 * remisión, y se fija que salgan juntos, con un solo número, que cada bulto
 * termine donde se quería, y que si un renglón falla no se vaya ninguno.
 */
describe('Remisión en lote (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let origenId: string;
  let destinoId: string;
  let cajas: { id: string; barcode: string; variantId: string; quantity: number }[];
  let par: { id: string; barcode: string; variantId: string; quantity: number };
  let otraTallaId: string;

  const existencia = async (variantId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(auth())
      .expect(200);
    const filas = r.body as { warehouseId: string; quantity: number }[];
    const en = (id: string) =>
      filas.filter((f) => f.warehouseId === id).reduce((t, f) => t + Number(f.quantity), 0);
    return { origen: en(origenId), destino: en(destinoId) };
  };

  const dondeEsta = async (barcode: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${barcode}`)
      .set(auth())
      .expect(200);
    return { status: r.body.unit.status as string, warehouseId: r.body.unit.warehouseId as string };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const bodega = async (nombre: string, code: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({ name: `${nombre} ${ts}`, code: `${code}${ts.toString().slice(-5)}`, isPosLocation: true })
        .expect(201);
      return r.body.id as string;
    };
    origenId = await bodega('E2E Lote Origen', 'LO-');
    destinoId = await bodega('E2E Lote Destino', 'LD-');

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ELOTE Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [
          { size: '40', color: 'Negro' },
          { size: '41', color: 'Negro' },
        ],
      })
      .expect(201);
    const variantes = prod.body.variants as { id: string; size?: string; sizeName?: string }[];
    otraTallaId = variantes.find((v) => (v.sizeName ?? v.size) === '41')!.id;

    // Dos cajas de la 40 y pares sueltos de la 41.
    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId: prod.body.id, boxes: 2, unitsPerBox: 12, warehouseId: origenId, unitCost: 40000 })
      .expect(201);
    cajas = ingreso.body;
    expect(cajas).toHaveLength(2);

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({ variantId: otraTallaId, warehouseId: origenId, quantity: 5, movementType: 'IN', notes: 'e2e' })
      .expect(201);
    // Un bulto de un solo par con su código, para escanearlo.
    const suelto = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId: prod.body.id, boxes: 1, unitsPerBox: 1, warehouseId: origenId, unitCost: 40000 })
      .expect(201);
    par = suelto.body[0];
    expect(par).toBeDefined();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('una caja, un par escaneado y pares sueltos salen juntos con un solo número', async () => {
    const [, segunda] = cajas;
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer/lote')
      .set(auth())
      .send({
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        requireConfirmation: false,
        notes: 'reposición',
        items: [
          { variantId: segunda.variantId, quantity: segunda.quantity, stockUnitId: segunda.id },
          { variantId: par.variantId, quantity: 1, stockUnitId: par.id },
          { variantId: otraTallaId, quantity: 2 },
        ],
      })
      .expect(201);
    expect(res.body.status).toBe('RECEIVED');
    expect(res.body.transferNumber).toMatch(/^TR-\d{5}$/);
    const numeros = (res.body.transfers as { transferNumber: string; loteId: string }[]).map((t) => t.transferNumber);
    expect(numeros).toEqual([
      `${res.body.transferNumber}-1`,
      `${res.body.transferNumber}-2`,
      `${res.body.transferNumber}-3`,
    ]);
    expect(new Set(res.body.transfers.map((t: { loteId: string }) => t.loteId)).size).toBe(1);

    // La caja escaneada está en el destino y la otra —más vieja— sigue en el origen.
    expect(await dondeEsta(segunda.barcode)).toEqual({ status: 'IN_STOCK', warehouseId: destinoId });
    expect(await dondeEsta(cajas[0].barcode)).toEqual({ status: 'IN_STOCK', warehouseId: origenId });
    expect(await dondeEsta(par.barcode)).toEqual({ status: 'IN_STOCK', warehouseId: destinoId });
    expect(await existencia(segunda.variantId)).toEqual({ origen: 12, destino: 13 });
    expect(await existencia(otraTallaId)).toEqual({ origen: 3, destino: 2 });
  });

  it('si un renglón falla no se va ninguno', async () => {
    const [primera, segunda] = cajas; // la segunda ya está en el destino
    const antes = await existencia(primera.variantId);
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer/lote')
      .set(auth())
      .send({
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        requireConfirmation: false,
        items: [
          { variantId: primera.variantId, quantity: primera.quantity, stockUnitId: primera.id },
          { variantId: segunda.variantId, quantity: segunda.quantity, stockUnitId: segunda.id },
        ],
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(/no está en la bodega de origen/i);
    expect(await existencia(primera.variantId)).toEqual(antes);
    expect(await dondeEsta(primera.barcode)).toEqual({ status: 'IN_STOCK', warehouseId: origenId });
  });

  it('la misma caja dos veces se rechaza', async () => {
    const [primera] = cajas;
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer/lote')
      .set(auth())
      .send({
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        requireConfirmation: false,
        items: [
          { variantId: primera.variantId, quantity: primera.quantity, stockUnitId: primera.id },
          { variantId: primera.variantId, quantity: primera.quantity, stockUnitId: primera.id },
        ],
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(/repetido/i);
  });

  it('con confirmación, la remisión sale en tránsito y se recibe completa de una', async () => {
    const [primera] = cajas;
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer/lote')
      .set(auth())
      .send({
        fromWarehouseId: origenId,
        toWarehouseId: destinoId,
        requireConfirmation: true,
        items: [
          { variantId: primera.variantId, quantity: primera.quantity, stockUnitId: primera.id },
          { variantId: otraTallaId, quantity: 2 },
        ],
      })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    expect((await dondeEsta(primera.barcode)).status).toBe('TRANSFERRED');
    expect(await existencia(primera.variantId)).toEqual({ origen: 0, destino: 13 });
    expect(await existencia(otraTallaId)).toEqual({ origen: 1, destino: 2 });

    // El siguiente número no repite el de la remisión en lote.
    const nuevo = Number(res.body.transferNumber.slice(3));
    const anterior = await request(app.getHttpServer())
      .get(`/api/inventory/transfers?q=${encodeURIComponent(res.body.transferNumber)}&limit=10`)
      .set(auth())
      .expect(200);
    expect(anterior.body.data.length).toBeGreaterThanOrEqual(2);
    expect(nuevo).toBeGreaterThan(0);

    const recibo = await request(app.getHttpServer())
      .post(`/api/inventory/transfers/lote/${res.body.loteId}/receive`)
      .set(auth())
      .expect(201);
    expect(recibo.body.recibidos).toBe(2);
    expect(await dondeEsta(primera.barcode)).toEqual({ status: 'IN_STOCK', warehouseId: destinoId });
    expect(await existencia(primera.variantId)).toEqual({ origen: 0, destino: 25 });
    expect(await existencia(otraTallaId)).toEqual({ origen: 1, destino: 4 });

    // Un renglón siguiente numera después del lote, no encima.
    const solo = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId: otraTallaId,
        fromWarehouseId: destinoId,
        toWarehouseId: origenId,
        quantity: 1,
        requireConfirmation: false,
      })
      .expect(201);
    const numeroSolo = solo.body.transfer?.transferNumber ?? solo.body.transferNumber;
    expect(Number(numeroSolo.slice(3))).toBe(nuevo + 1);
  });
});
