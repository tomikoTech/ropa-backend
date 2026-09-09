import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Detallar individual: el costo, la referencia y la baja de un bulto.**
 *
 * Son las tres correcciones que se hacen con la caja en la mano y que en
 * demachine viven en «detallar individual»: *este par costó otra cosa*, *este
 * par se etiquetó como la talla que no era* y *este par ya no existe*.
 *
 * Los tres caminos mueven inventario o costo y **no tenían ninguna prueba**:
 * se descubrió revisando la paridad con demachine el 9 de septiembre de 2026,
 * el día en que AMAWAD empezó a detallar en MiPinta.
 *
 * Lo que se fija acá es sobre todo el **alcance**: recostear no es un botón,
 * son cuatro, y cada uno toca un conjunto distinto. Equivocarse de alcance
 * reescribe el costo histórico de un producto entero.
 */
describe('Detallar individual: costo, referencia y baja (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let varianteA: string;
  let varianteB: string;
  let warehouseId: string;
  /** Tres cajas de a 10 pares con costo, y una cuarta ingresada en cero. */
  let cajas: {
    id: string;
    barcode: string;
    cost: string | number;
    variantId: string;
  }[] = [];
  let cajaSinCosto: { id: string; barcode: string };
  let saleId: string;

  const bultos = async (status?: string) => {
    const r = await request(app.getHttpServer())
      .get(
        `/api/stock-units/search?productId=${productId}&limit=50` +
          (status ? `&status=${status}` : ''),
      )
      .set(auth())
      .expect(200);
    return r.body.data as {
      id: string;
      barcode: string;
      cost: string | number;
      status: string;
      variantId: string;
    }[];
  };

  const costoDe = async (id: string) => {
    const fila = (await bultos()).find((b) => b.id === id);
    return Number(fila?.cost ?? -1);
  };

  const existenciaDe = async (variantId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(auth())
      .expect(200);
    const filas = r.body as { warehouseId: string; quantity: number }[];
    return filas
      .filter((f) => f.warehouseId === warehouseId)
      .reduce((total, f) => total + Number(f.quantity), 0);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Detallar WH ${ts}`,
        code: `DT-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EDET Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [
          { size: '40', color: 'Negro' },
          { size: '41', color: 'Negro' },
        ],
      })
      .expect(201);
    productId = prod.body.id;

    const conCajas = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({
        productId,
        boxes: 3,
        unitsPerBox: 10,
        warehouseId,
        unitCost: 40000,
      })
      .expect(201);
    cajas = conCajas.body;
    expect(cajas).toHaveLength(3);

    const enCero = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 10, warehouseId, unitCost: 0 })
      .expect(201);
    cajaSinCosto = enCero.body[0];

    // La variante del agregado la elige el servidor; para reasignar hace falta
    // la **otra**, no la que ya tiene la caja. Sale de la respuesta del
    // ingreso: la búsqueda devuelve una forma resumida que no la trae.
    varianteA = cajas[0].variantId;
    varianteB = (
      prod.body.variants as { id: string }[]
    ).find((v) => v.id !== varianteA)!.id;
    expect(varianteB).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  describe('cambiar el costo, con alcance', () => {
    it('«esta» toca un solo bulto y deja quietos los demás', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[0].id}/recostear`)
        .set(auth())
        .send({ nuevoCosto: 55000, alcance: 'unidad' })
        .expect(201);
      expect(res.body.afectados).toBe(1);

      expect(await costoDe(cajas[0].id)).toBe(55000);
      expect(await costoDe(cajas[1].id)).toBe(40000);
    });

    it('«costo cero» corrige solo lo que entró sin costo', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajaSinCosto.id}/recostear`)
        .set(auth())
        .send({ nuevoCosto: 33000, alcance: 'costo_cero' })
        .expect(201);
      // Solo la caja que estaba en cero: las otras tres tienen costo.
      expect(res.body.afectados).toBe(1);

      expect(await costoDe(cajaSinCosto.id)).toBe(33000);
      expect(await costoDe(cajas[0].id)).toBe(55000);
      expect(await costoDe(cajas[1].id)).toBe(40000);
    });

    it('«vendidos» reescribe el costo histórico de las ventas del producto', async () => {
      const venta = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set(auth())
        .send({
          warehouseId,
          items: [
            {
              variantId: varianteA,
              quantity: 10,
              unitPrice: 100000,
              stockUnitId: cajas[1].id,
            },
          ],
          payments: [{ method: 'EFECTIVO', amount: 1000000 }],
        })
        .expect(201);
      saleId = venta.body.id;

      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[1].id}/recostear`)
        .set(auth())
        .send({ nuevoCosto: 12345, alcance: 'vendidos' })
        .expect(201);
      expect(res.body.afectados).toBeGreaterThanOrEqual(1);

      const detalle = await request(app.getHttpServer())
        .get(`/api/pos/sales/${saleId}`)
        .set(auth())
        .expect(200);
      expect(Number(detalle.body.items[0].unitCost)).toBe(12345);
    });

    it('«existencias» no toca lo que ya salió de la bodega', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[0].id}/recostear`)
        .set(auth())
        .send({ nuevoCosto: 77000, alcance: 'existencias' })
        .expect(201);
      // Las tres que quedan en inventario; la vendida no.
      expect(res.body.afectados).toBe(3);

      for (const caja of [cajas[0], cajas[2], cajaSinCosto]) {
        expect(await costoDe(caja.id)).toBe(77000);
      }
      // La vendida conserva el costo con el que se vendió.
      expect(await costoDe(cajas[1].id)).toBe(40000);
    });

    it('no acepta un costo negativo', async () => {
      await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[0].id}/recostear`)
        .set(auth())
        .send({ nuevoCosto: -1, alcance: 'unidad' })
        .expect(400);
    });
  });

  describe('reasignar a otra referencia', () => {
    it('cambia la talla conservando el código impreso, y mueve la existencia', async () => {
      const antesA = await existenciaDe(varianteA);
      const antesB = await existenciaDe(varianteB);

      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[0].id}/reasignar`)
        .set(auth())
        .send({ nuevaVariantId: varianteB })
        .expect(201);

      // El código es el que está impreso en la caja: reasignar no lo reinventa.
      expect(res.body.barcode).toBe(cajas[0].barcode);
      expect(res.body.variantId).toBe(varianteB);

      expect(await existenciaDe(varianteA)).toBe(antesA - 10);
      expect(await existenciaDe(varianteB)).toBe(antesB + 10);
    });

    it('no reasigna a la referencia en la que ya está', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[0].id}/reasignar`)
        .set(auth())
        .send({ nuevaVariantId: varianteB })
        .expect(400);
      expect(String(res.body.message)).toMatch(/ya está en esa referencia/i);
    });

    it('no reasigna algo que ya se vendió', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[1].id}/reasignar`)
        .set(auth())
        .send({ nuevaVariantId: varianteB })
        .expect(400);
      expect(String(res.body.message)).toMatch(/solo se reasigna/i);
    });
  });

  describe('dar de baja', () => {
    it('saca el bulto del inventario y deja el motivo en su historial', async () => {
      const antes = await existenciaDe(varianteA);

      await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[2].id}/baja`)
        .set(auth())
        .send({ motivo: 'Caja mojada en el transporte' })
        .expect(201);

      expect(await existenciaDe(varianteA)).toBe(antes - 10);

      const rastro = await request(app.getHttpServer())
        .get(`/api/stock-units/trace/${cajas[2].barcode}`)
        .set(auth())
        .expect(200);
      expect(rastro.body.unit.status).toBe('WRITTEN_OFF');
      const baja = (
        rastro.body.events as { eventType: string; metadata?: { motivo?: string } }[]
      ).find((e) => e.eventType === 'WRITTEN_OFF');
      expect(baja?.metadata?.motivo).toBe('Caja mojada en el transporte');
    });

    it('no se da de baja dos veces', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/stock-units/${cajas[2].id}/baja`)
        .set(auth())
        .send({ motivo: 'otra vez' })
        .expect(400);
      expect(String(res.body.message)).toMatch(/solo se da de baja/i);
    });
  });
});
