import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';
import { cajaDelPar, numeroDelPar } from '../src/inventory/codigo-del-par';
import { isValidBarcode } from '../src/inventory/barcode.util';

/**
 * **El código de un par lleva el de su caja adentro, y va en orden de talla.**
 *
 * Antes los pares continuaban la numeración del renglón: compartían los trece
 * primeros dígitos con su caja pero, con tres cajas del mismo renglón, no
 * había cómo saber de un vistazo cuál venía de cuál. La relación estaba en la
 * base y no en el papel, que es donde hace falta: alguien con el sticker en la
 * mano, en la bodega, sin computador enfrente.
 */
describe('El código del par lleva su caja (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let warehouseId: string;
  let caja: { id: string; barcode: string };
  let talla40: string;
  let talla41: string;

  const paresDeLaCaja = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?parentId=${caja.id}&limit=100`)
      .set(auth())
      .expect(200);
    return r.body.data as {
      barcode: string;
      size: { name: string } | null;
      pairSequence: number | null;
    }[];
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E CodPar WH ${ts}`,
        code: `CP-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    // La 41 se crea PRIMERO a propósito: si el orden fuera el de creación, los
    // pares saldrían numerados al revés.
    const crearTalla = async (name: string, sortOrder: number) => {
      const r = await request(app.getHttpServer())
        .post('/api/sizes')
        .set(auth())
        .send({ name, sortOrder })
        .expect(201);
      return r.body.id as string;
    };
    talla41 = await crearTalla(`Z41-${ts}`, 410);
    talla40 = await crearTalla(`Z40-${ts}`, 400);

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ECOD Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;

    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 5, warehouseId, unitCost: 40000 })
      .expect(201);
    caja = ingreso.body[0];

    // 2 de la 40 y 3 de la 41.
    await request(app.getHttpServer())
      .post(`/api/stock-units/${caja.id}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: talla41, quantity: 3 },
          { sizeId: talla40, quantity: 2 },
        ],
      })
      .expect(201);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('cada par empieza con el código completo de su caja', async () => {
    await request(app.getHttpServer())
      .post(`/api/stock-units/${caja.id}/split`)
      .set(auth())
      .send({})
      .expect(201);

    const pares = await paresDeLaCaja();
    expect(pares).toHaveLength(5);
    for (const par of pares) {
      expect(par.barcode.startsWith(caja.barcode)).toBe(true);
      expect(cajaDelPar(par.barcode)).toBe(caja.barcode);
      // Y sigue siendo verificable: es lo que hace que un lector descarte una
      // lectura mal hecha.
      expect(isValidBarcode(par.barcode)).toBe(true);
    }
  });

  it('se numeran en orden de talla: 01 y 02 son la 40, 03 en adelante la 41', async () => {
    const pares = await paresDeLaCaja();
    const porNumero = pares
      .map((p) => ({ n: numeroDelPar(p.barcode)!, talla: p.size?.name }))
      .sort((a, b) => a.n - b.n);

    expect(porNumero.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    expect(porNumero.map((p) => p.talla)).toEqual([
      `Z40-${ts}`,
      `Z40-${ts}`,
      `Z41-${ts}`,
      `Z41-${ts}`,
      `Z41-${ts}`,
    ]);
  });

  it('ningún par repite código', async () => {
    const pares = await paresDeLaCaja();
    expect(new Set(pares.map((p) => p.barcode)).size).toBe(pares.length);
  });

  it('el par se sigue encontrando por su código', async () => {
    // Es lo único que de verdad importa el día de la garantía.
    const [par] = await paresDeLaCaja();
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/by-barcode/${par.barcode}`)
      .set(auth())
      .expect(200);
    expect(r.body.barcode).toBe(par.barcode);
  });

  it('una segunda tanda continúa la numeración, sin repetir', async () => {
    const otra = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 4, warehouseId, unitCost: 40000 })
      .expect(201);
    const dos = otra.body[0];
    await request(app.getHttpServer())
      .post(`/api/stock-units/${dos.id}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: talla40, quantity: 2 },
          { sizeId: talla41, quantity: 2 },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/stock-units/${dos.id}/split`)
      .set(auth())
      .send({ items: [{ sizeId: talla40, quantity: 2 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/stock-units/${dos.id}/split`)
      .set(auth())
      .send({ items: [{ sizeId: talla41, quantity: 2 }] })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?parentId=${dos.id}&limit=50`)
      .set(auth())
      .expect(200);
    const numeros = (r.body.data as { barcode: string }[])
      .map((p) => numeroDelPar(p.barcode)!)
      .sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4]);
  });
});
