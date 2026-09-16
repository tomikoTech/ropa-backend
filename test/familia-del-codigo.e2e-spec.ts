import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Los parientes de un código.** Con el sticker de un par en la mano:
 * qué otras tallas hay y dónde, de qué caja salió y dónde están sus
 * hermanos, y qué cajas del modelo quedan. Se arma con dos cajas de un
 * modelo, una abierta en tallas y trasladando un par al otro local.
 */
describe('Familia de un código (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let w1: string;
  let w2: string;
  let cajas: { id: string; barcode: string; variantId: string }[];
  let sizeIds: Record<string, string>;
  let pares: { id: string; barcode: string; sizeId: string }[];

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
    w1 = await bodega('E2E Fam Principal', 'FP-');
    w2 = await bodega('E2E Fam Local', 'FL-');
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EFAM Air Force ${ts}`,
        brand: 'Nike',
        basePrice: 300000,
        costPrice: 150000,
        variants: [
          { size: '41', color: 'Blanco' },
          { size: '42', color: 'Blanco' },
        ],
      })
      .expect(201);
    sizeIds = Object.fromEntries(
      (prod.body.variants as { sizeId: string; sizeName?: string; size?: string }[]).map((v) => [
        v.sizeName ?? v.size,
        v.sizeId,
      ]),
    );
    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId: prod.body.id, boxes: 2, unitsPerBox: 4, warehouseId: w1, unitCost: 150000 })
      .expect(201);
    cajas = ingreso.body;
    // La primera caja se detalla (dos 41, dos 42) y se abre.
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajas[0].id}/contents`)
      .set(auth())
      .send({ items: [{ sizeId: sizeIds['41'], quantity: 2 }, { sizeId: sizeIds['42'], quantity: 2 }] })
      .expect(201);
    const abierta = await request(app.getHttpServer())
      .post(`/api/stock-units/${cajas[0].id}/split`)
      .set(auth())
      .expect(201);
    pares = (abierta.body.units ?? abierta.body) as { id: string; barcode: string; sizeId: string }[];
    expect(pares.length).toBe(4);
    // Un par de la 41 se va al otro local.
    const par41 = pares.find((p) => p.sizeId === sizeIds['41'])!;
    const unidad = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${par41.barcode}`)
      .set(auth())
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId: unidad.body.unit.variantId,
        fromWarehouseId: w1,
        toWarehouseId: w2,
        quantity: 1,
        stockUnitId: par41.id,
        requireConfirmation: false,
      })
      .expect(201);
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('desde un par: sus tallas con existencia por bodega, su caja con los hermanos y la otra caja', async () => {
    const par42 = pares.find((p) => p.sizeId === sizeIds['42'])!;
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/familia/${par42.barcode}`)
      .set(auth())
      .expect(200);
    expect(r.body.producto.marca).toBe('Nike');
    expect(r.body.tallaDelCodigo).toBe('42');
    const t41 = r.body.tallas.find((t: { talla: string }) => t.talla === '41');
    const t42 = r.body.tallas.find((t: { talla: string }) => t.talla === '42');
    // Dos pares sueltos más la caja cerrada de cuatro, que cuenta en la 41.
    expect(t41.total).toBe(6);
    expect(t41.enCajas).toBe(4);
    expect(t41.porBodega.map((b: { bodega: string; cantidad: number }) => b.cantidad).sort()).toEqual([1, 5]);
    expect(t41.pares).toHaveLength(2);
    expect(t42.esLaDelCodigo).toBe(true);
    expect(t42.pares.find((p: { codigo: string }) => p.codigo === par42.barcode).esElCodigo).toBe(true);

    expect(r.body.cajaDeOrigen.codigo).toBe(cajas[0].barcode);
    expect(r.body.cajaDeOrigen.estado).toBe('SPLIT');
    expect(r.body.cajaDeOrigen.hermanos).toHaveLength(4);
    expect(r.body.cajaDeOrigen.hermanos.filter((h: { bodega: string }) => h.bodega.startsWith('E2E Fam Local'))).toHaveLength(1);

    // La caja abierta ya no es una caja; la cerrada sí.
    expect(r.body.cajas.map((c: { codigo: string }) => c.codigo)).toEqual([cajas[1].barcode]);
    expect(r.body.totales.pares).toBe(8);
  });

  it('desde la caja cerrada: ella es la de origen y no tiene hermanos', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/familia/${cajas[1].barcode}`)
      .set(auth())
      .expect(200);
    expect(r.body.cajaDeOrigen.codigo).toBe(cajas[1].barcode);
    expect(r.body.cajaDeOrigen.esElCodigo).toBe(true);
    expect(r.body.cajaDeOrigen.hermanos).toEqual([]);
  });

  it('desde el código de una talla o la referencia también se llega', async () => {
    const porRef = await request(app.getHttpServer())
      .get(`/api/stock-units/familia/${encodeURIComponent('no-existe-' + ts)}`)
      .set(auth())
      .expect(404);
    expect(porRef.body.message).toMatch(/ningún producto/);
    const par42 = pares.find((p) => p.sizeId === sizeIds['42'])!;
    const t = await request(app.getHttpServer()).get(`/api/stock-units/trace/${par42.barcode}`).set(auth()).expect(200);
    const variante = await request(app.getHttpServer())
      .get(`/api/products/search?q=${encodeURIComponent('E2EFAM Air Force ' + ts)}&limit=10`)
      .set(auth())
      .expect(200);
    const v42 = variante.body.find((v: { id: string }) => v.id === t.body.unit.variantId);
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/familia/${encodeURIComponent(v42.sku)}`)
      .set(auth())
      .expect(200);
    expect(r.body.tallaDelCodigo).toBe('42');
    expect(r.body.cajaDeOrigen).toBeNull();
  });
});
