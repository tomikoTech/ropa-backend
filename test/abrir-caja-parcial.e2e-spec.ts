import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Sacar unos pares de la caja y dejar el resto adentro.**
 *
 * Llega una caja de 24 y se sacan tres para la vitrina. Hasta ahora había que
 * abrirla entera —24 etiquetas para imprimir y pegar— o no abrirla: la razón
 * por la que en demachine se marcaban unos hijos del árbol y se dejaban los
 * otros.
 *
 * Lo que se fija acá es que la caja que queda **siga siendo una caja**: con su
 * código, con menos pares adentro, y que las dos cuentas del inventario —el
 * agregado por talla y los bultos— sigan dando lo mismo después de cada saque.
 */
describe('Abrir una caja por partes (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let warehouseId: string;
  let cajaId: string;
  let cajaBarcode: string;
  let tallas: { sizeId: string; name: string }[] = [];

  const contenido = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/${cajaId}/contents`)
      .set(auth())
      .expect(200);
    return r.body as {
      box: { quantity: number; status: string };
      items: { sizeId: string; actualQuantity: number }[];
      availableSizes: { sizeId: string; name: string }[];
    };
  };

  const bultos = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&limit=100`)
      .set(auth())
      .expect(200);
    return r.body.data as {
      id: string;
      kind: string;
      status: string;
      quantity: number;
      barcode: string;
      size: { name: string } | null;
      pairSequence: number | null;
    }[];
  };

  /** Lo que dice el agregado por variante, sumando el producto entero. */
  const existenciaTotal = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock/warehouse/${warehouseId}?resumido=1`)
      .set(auth())
      .expect(200);
    const filas = r.body as { variantId: string; quantity: number }[];
    const variantes = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set(auth())
      .expect(200);
    const mias = new Set(
      (variantes.body.variants as { id: string }[]).map((v) => v.id),
    );
    return filas
      .filter((f) => mias.has(f.variantId))
      .reduce((total, f) => total + Number(f.quantity), 0);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Parcial WH ${ts}`,
        code: `PA-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EPAR Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [
          { size: '40', color: 'Negro' },
          { size: '41', color: 'Negro' },
          { size: '42', color: 'Negro' },
        ],
      })
      .expect(201);
    productId = prod.body.id;

    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({
        productId,
        boxes: 1,
        unitsPerBox: 12,
        warehouseId,
        unitCost: 40000,
      })
      .expect(201);
    cajaId = ingreso.body[0].id;
    cajaBarcode = ingreso.body[0].barcode;

    // 4 + 4 + 4: el surtido real de la caja.
    const { availableSizes } = await contenido();
    tallas = availableSizes.slice(0, 3);
    expect(tallas).toHaveLength(3);
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/contents`)
      .set(auth())
      .send({ items: tallas.map((t) => ({ sizeId: t.sizeId, quantity: 4 })) })
      .expect(201);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('saca tres pares y la caja se queda con los nueve', async () => {
    const antes = await existenciaTotal();

    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({ items: [{ sizeId: tallas[0].sizeId, quantity: 3 }] })
      .expect(201);

    expect(res.body.units).toHaveLength(3);
    // Sigue siendo una caja: mismo código, menos pares.
    expect(res.body.parent.status).toBe('IN_STOCK');
    expect(res.body.parent.quantity).toBe(9);

    const { box, items } = await contenido();
    expect(box.quantity).toBe(9);
    expect(box.status).toBe('IN_STOCK');
    const deLaTalla = items.find((i) => i.sizeId === tallas[0].sizeId);
    expect(deLaTalla?.actualQuantity).toBe(1);

    // El total no cambia: los tres pares salieron de la caja, no del aire.
    expect(await existenciaTotal()).toBe(antes);
  });

  it('la caja abierta a medias se puede volver a abrir, y los pares no repiten número', async () => {
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({ items: [{ sizeId: tallas[1].sizeId, quantity: 2 }] })
      .expect(201);

    const pares = (await bultos()).filter((b) => b.kind === 'UNIT');
    expect(pares).toHaveLength(5);
    const codigos = new Set(pares.map((p) => p.barcode));
    expect(codigos.size).toBe(5);
    const puestos = pares.map((p) => p.pairSequence);
    expect(new Set(puestos).size).toBe(5);
  });

  it('no deja sacar más pares de los que quedan', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({ items: [{ sizeId: tallas[0].sizeId, quantity: 5 }] })
      .expect(400);
    expect(String(res.body.message)).toMatch(/tiene 1 pares de esa talla/i);
  });

  it('no deja sacar una talla que no está adentro', async () => {
    const { availableSizes } = await contenido();
    const ajena = availableSizes.find(
      (s) => !tallas.some((t) => t.sizeId === s.sizeId),
    );
    if (!ajena) return; // el producto solo tiene esas tres tallas
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({ items: [{ sizeId: ajena.sizeId, quantity: 1 }] })
      .expect(400);
  });

  it('sacar lo último la cierra: la caja deja de existir como caja', async () => {
    const { items } = await contenido();
    const restantes = items
      .filter((i) => i.actualQuantity > 0)
      .map((i) => ({ sizeId: i.sizeId, quantity: i.actualQuantity }));
    const cuantos = restantes.reduce((t, r) => t + r.quantity, 0);
    expect(cuantos).toBe(7);

    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({ items: restantes })
      .expect(201);
    expect(res.body.parent.status).toBe('SPLIT');

    const caja = (await bultos()).find((b) => b.barcode === cajaBarcode);
    expect(caja?.status).toBe('SPLIT');

    // Y ya no se le puede sacar nada más.
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({})
      .expect(400);
  });

  it('los doce pares están, cada uno con su talla', async () => {
    const pares = (await bultos()).filter((b) => b.kind === 'UNIT');
    expect(pares).toHaveLength(12);
    const porTalla = pares.reduce<Record<string, number>>((acc, p) => {
      const nombre = p.size?.name ?? 'sin talla';
      acc[nombre] = (acc[nombre] ?? 0) + 1;
      return acc;
    }, {});
    for (const talla of tallas) {
      expect(porTalla[talla.name]).toBe(4);
    }
  });

  it('abrir entera sigue funcionando igual', async () => {
    const otra = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({
        productId,
        boxes: 1,
        unitsPerBox: 6,
        warehouseId,
        unitCost: 40000,
      })
      .expect(201);
    const id = otra.body[0].id;

    await request(app.getHttpServer())
      .post(`/api/stock-units/${id}/contents`)
      .set(auth())
      .send({ items: tallas.map((t) => ({ sizeId: t.sizeId, quantity: 2 })) })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${id}/split`)
      .set(auth())
      .send({})
      .expect(201);
    expect(res.body.units).toHaveLength(6);
    expect(res.body.parent.status).toBe('SPLIT');
  });
});
