import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { isValidBarcode } from '../src/inventory/barcode.util';

describe('Recepción por cajas y apertura de bultos (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let orderId: string;
  let boxLineId: string;
  let boxIds: string[] = [];
  let warehouseId: string;
  let curveSizeIds: string[] = [];
  let productName: string;
  let orderNumber: string;
  let soldUnitBarcode: string;
  let soldSaleId: string;
  let soldSaleItemId: string;

  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const sellAvailableUnit = async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);
    const unit = list.body.find(
      (candidate: { kind: string; status: string }) =>
        candidate.kind === 'UNIT' && candidate.status === 'IN_STOCK',
    );
    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${unit.barcode}`)
      .set(auth())
      .expect(200);
    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: scan.body.variantId,
            stockUnitId: unit.id,
            quantity: 1,
            unitPrice: 100000,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 100000 }],
      })
      .expect(201);
    return { unit, sale: sale.body };
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = await tryLogin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Bulto WH ${ts}`,
        code: `BU-${ts.toString().slice(-5)}`,
      });
    warehouseId = wh.body.id;

    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Bulto Prov ${ts}`,
        nit: `902${ts.toString().slice(-6)}-3`,
      });

    // Curva 2+2 = 4 unidades por caja (pequeña, para poder contarlas a mano).
    const sizeIds: string[] = [];
    const sizeNames = [`B40-${ts}`, `B41-${ts}`];
    for (const name of sizeNames) {
      const s = await request(app.getHttpServer())
        .post('/api/sizes')
        .set(auth())
        .send({ name });
      sizeIds.push(s.body.id);
    }
    curveSizeIds = sizeIds;
    productName = `E2E Bulto Producto ${ts}`;
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: productName,
        basePrice: 120000,
        costPrice: 50000,
        variants: sizeNames.map((size) => ({ size, color: 'Negro' })),
      });
    const curve = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva bulto ${ts}`,
        items: sizeIds.map((sizeId) => ({ sizeId, quantity: 2 })),
      });

    const order = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({ supplierId: sup.body.id, warehouseId: wh.body.id, items: [] });
    orderId = order.body.id;
    orderNumber = order.body.orderNumber;

    const line = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({
        productId: prod.body.id,
        sizeCurveId: curve.body.id,
        boxes: 3,
        unitsPerBox: 4,
        unitCost: 25000,
        salePrice: 100000,
      });
    boxLineId = line.body.id;
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('recibe parte de las cajas y crea un bulto por caja', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({ boxes: 2 })
      .expect(201);

    expect(res.body).toHaveLength(2);
    expect(res.body.every((u: { kind: string }) => u.kind === 'BOX')).toBe(
      true,
    );
    // Cada caja "contiene" sus unidades: es lo que la hace vendible como bulto.
    expect(res.body.every((u: { quantity: number }) => u.quantity === 4)).toBe(
      true,
    );
    boxIds = res.body.map((u: { id: string }) => u.id);

    const order = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}`)
      .set(auth())
      .expect(200);
    expect(order.body.status).toBe('PARTIAL');
  });

  it('los códigos son válidos y no se repiten', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);

    const codes = res.body.map((u: { barcode: string }) => u.barcode);
    expect(new Set(codes).size).toBe(codes.length);
    // El dígito verificador es lo que permite al lector descartar una mala
    // lectura; si no cuadra, la etiqueta no sirve.
    expect(codes.every((c: string) => isValidBarcode(c))).toBe(true);
  });

  it('no deja recibir más cajas de las pendientes', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({ boxes: 5 });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/quedan 1 caja/i);
  });

  it('recibe el resto y deja el renglón completo', async () => {
    await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .expect(200);

    expect(res.body[0].boxesReceived).toBe(3);

    const order = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}`)
      .set(auth())
      .expect(200);
    expect(order.body.status).toBe('RECEIVED');
  });

  it('avisa cuando ya no queda nada por recibir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({});

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/no hay cajas pendientes/i);
  });

  it('encuentra un bulto por su código de barras', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const code = list.body[0].barcode;

    const res = await request(app.getHttpServer())
      .get(`/api/stock-units/by-barcode/${code}`)
      .set(auth())
      .expect(200);

    expect(res.body.barcode).toBe(code);
  });

  it('consulta el origen y el primer evento del código físico', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const box = list.body[0];
    const trace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${box.barcode}`)
      .set(auth())
      .expect(200);

    expect(trace.body.unit.id).toBe(box.id);
    expect(trace.body.purchase.orderId).toBe(orderId);
    expect(trace.body.events[0].eventType).toBe('RECEIVED');
    expect(trace.body.events[0].user).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
    });
    expect(trace.body.events[0].user).not.toHaveProperty('passwordHash');
    expect(trace.body.events[0].user).not.toHaveProperty('email');
    expect(trace.body.sale).toBeNull();
  });

  it('busca códigos por producto, referencia, estado, bodega y fecha', async () => {
    const byProduct = await request(app.getHttpServer())
      .get('/api/stock-units/search')
      .query({
        q: productName,
        status: 'IN_STOCK',
        warehouseId,
        from: new Date().toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      })
      .set(auth())
      .expect(200);

    expect(byProduct.body.meta.total).toBe(3);
    expect(byProduct.body.data).toHaveLength(3);
    expect(
      byProduct.body.data.every(
        (unit: { product: { name: string }; warehouse: { id: string } }) =>
          unit.product.name === productName &&
          unit.warehouse.id === warehouseId,
      ),
    ).toBe(true);

    const byOrder = await request(app.getHttpServer())
      .get('/api/stock-units/search')
      .query({ q: orderNumber, limit: 2 })
      .set(auth())
      .expect(200);
    expect(byOrder.body.meta.total).toBe(3);
    expect(byOrder.body.data).toHaveLength(2);
    expect(byOrder.body.data[0].orderNumber).toBe(orderNumber);
  });

  it('rechaza filtros inválidos en la búsqueda operativa', async () => {
    await request(app.getHttpServer())
      .get('/api/stock-units/search')
      .query({ status: 'PERDIDO' })
      .set(auth())
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/stock-units/search')
      .query({ from: '2026-13-90' })
      .set(auth())
      .expect(400);
  });

  it('la búsqueda agrupada del POS encuentra el producto por el código físico', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const code = list.body[0].barcode;

    const res = await request(app.getHttpServer())
      .get('/api/products/search/pos-catalog')
      .query({ q: `  ${code}  ` })
      .set(auth())
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].variants.length).toBeGreaterThan(0);
  });

  it('cada caja conserva su propio contenido esperado y permite detallar el real', async () => {
    const initial = await request(app.getHttpServer())
      .get(`/api/stock-units/${boxIds[0]}/contents`)
      .set(auth())
      .expect(200);

    expect(initial.body.items).toHaveLength(2);
    expect(
      initial.body.items.map(
        (item: { expectedQuantity: number; actualQuantity: number }) => [
          item.expectedQuantity,
          item.actualQuantity,
        ],
      ),
    ).toEqual([
      [2, 2],
      [2, 2],
    ]);

    const detailed = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[0]}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: curveSizeIds[0], quantity: 1 },
          { sizeId: curveSizeIds[1], quantity: 3 },
        ],
      })
      .expect(201);

    expect(
      detailed.body.items.map(
        (item: { actualQuantity: number }) => item.actualQuantity,
      ),
    ).toEqual([1, 3]);
    // La caja hermana sigue con su propia copia 2+2.
    const sibling = await request(app.getHttpServer())
      .get(`/api/stock-units/${boxIds[1]}/contents`)
      .set(auth())
      .expect(200);
    expect(
      sibling.body.items.map(
        (item: { actualQuantity: number }) => item.actualQuantity,
      ),
    ).toEqual([2, 2]);
  });

  it('ajusta el total físico de una caja y permite restaurarlo sin afectar las demás', async () => {
    const changed = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[1]}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: curveSizeIds[0], quantity: 1 },
          { sizeId: curveSizeIds[1], quantity: 2 },
        ],
      })
      .expect(201);
    expect(changed.body.box.quantity).toBe(3);

    const restored = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[1]}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: curveSizeIds[0], quantity: 2 },
          { sizeId: curveSizeIds[1], quantity: 2 },
        ],
      })
      .expect(201);
    expect(restored.body.box.quantity).toBe(4);
  });

  it('serializa dos detalles simultáneos de la misma caja sin mezclar tallas', async () => {
    const payloads = [
      [
        { sizeId: curveSizeIds[0], quantity: 1 },
        { sizeId: curveSizeIds[1], quantity: 2 },
      ],
      [
        { sizeId: curveSizeIds[0], quantity: 4 },
        { sizeId: curveSizeIds[1], quantity: 1 },
      ],
    ];
    const responses = await Promise.all(
      payloads.map((items) =>
        request(app.getHttpServer())
          .post(`/api/stock-units/${boxIds[1]}/contents`)
          .set(auth())
          .send({ items }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201]);

    const final = await request(app.getHttpServer())
      .get(`/api/stock-units/${boxIds[1]}/contents`)
      .set(auth())
      .expect(200);
    const actual = final.body.items.map(
      (item: { actualQuantity: number }) => item.actualQuantity,
    );
    expect(
      JSON.stringify(actual) === JSON.stringify([1, 2]) ||
        JSON.stringify(actual) === JSON.stringify([4, 1]),
    ).toBe(true);
    expect(final.body.box.quantity).toBe(
      actual.reduce((sum: number, quantity: number) => sum + quantity, 0),
    );

    await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[1]}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: curveSizeIds[0], quantity: 2 },
          { sizeId: curveSizeIds[1], quantity: 2 },
        ],
      })
      .expect(201);
  });

  it('abre una caja y crea una unidad por par de la curva', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[0]}/split`)
      .set(auth())
      .expect(201);

    // La curva reparte 2+2, así que salen 4 unidades.
    expect(res.body.units).toHaveLength(4);
    expect(
      res.body.units.every((u: { kind: string }) => u.kind === 'UNIT'),
    ).toBe(true);
    // Cada unidad queda con su talla; la caja no tenía ninguna.
    expect(
      res.body.units.every((u: { sizeId: string | null }) => u.sizeId),
    ).toBe(true);
    expect(
      res.body.units.every((u: { variantId: string | null }) => u.variantId),
    ).toBe(true);
    // La caja no se borra: queda marcada como abierta para no perder la
    // trazabilidad del código ya impreso.
    expect(res.body.parent.status).toBe('SPLIT');
    const quantitiesBySize = new Map<string, number>();
    for (const unit of res.body.units as { sizeId: string }[]) {
      quantitiesBySize.set(
        unit.sizeId,
        (quantitiesBySize.get(unit.sizeId) ?? 0) + 1,
      );
    }
    expect(quantitiesBySize.get(curveSizeIds[0])).toBe(1);
    expect(quantitiesBySize.get(curveSizeIds[1])).toBe(3);

    const parentTrace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${res.body.parent.barcode}`)
      .set(auth())
      .expect(200);
    expect(parentTrace.body.children).toHaveLength(4);
    expect(
      parentTrace.body.events.some(
        (event: { eventType: string }) => event.eventType === 'SPLIT',
      ),
    ).toBe(true);

    const childTrace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${res.body.units[0].barcode}`)
      .set(auth())
      .expect(200);
    expect(childTrace.body.parent.id).toBe(res.body.parent.id);
    expect(childTrace.body.events[0].eventType).toBe('CREATED_FROM_BOX');
  });

  // Regresión: la secuencia de las unidades debe continuar después de la de
  // las cajas. Si empezara en 1, la primera unidad tendría el mismo código
  // que la primera caja.
  it('las unidades no repiten el código de ninguna caja', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);

    const codes = res.body.map((u: { barcode: string }) => u.barcode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c: string) => isValidBarcode(c))).toBe(true);
    // 3 cajas + 4 unidades de la que se abrió.
    expect(codes).toHaveLength(7);
  });

  it('no deja abrir dos veces la misma caja', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[0]}/split`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/en inventario/i);
  });

  it('no deja abrir una unidad suelta', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const unit = list.body.find((u: { kind: string }) => u.kind === 'UNIT');

    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${unit.id}/split`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/solo se pueden abrir cajas/i);
  });

  it('una unidad salida de la caja se puede escanear y vender por su talla real', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const unit = list.body.find((u: { kind: string }) => u.kind === 'UNIT');

    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${unit.barcode}`)
      .set(auth())
      .expect(200);

    expect(scan.body.kind).toBe('UNIT');
    expect(scan.body.variantId).toBe(unit.variantId);
    expect(scan.body.quantity).toBe(1);
    expect(scan.body.suggestedPrice).toBe(100000);

    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: scan.body.variantId,
            stockUnitId: unit.id,
            quantity: 1,
            unitPrice: scan.body.suggestedPrice,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 100000 }],
      })
      .expect(201);
    soldUnitBarcode = unit.barcode;
    soldSaleId = sale.body.id;
    soldSaleItemId = sale.body.items[0].id;

    const trace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${unit.barcode}`)
      .set(auth())
      .expect(200);
    expect(trace.body.sale.id).toBe(sale.body.id);
    expect(trace.body.sale.saleNumber).toBe(sale.body.saleNumber);
    expect(
      trace.body.events.some(
        (event: { eventType: string }) => event.eventType === 'SOLD',
      ),
    ).toBe(true);
  });

  it('resuelve el código vendido y permite cambiarlo por otro código disponible', async () => {
    const returnedScan = await request(app.getHttpServer())
      .get(`/api/returns/scan/${soldUnitBarcode}`)
      .set(auth())
      .expect(200);
    expect(returnedScan.body.returnEligible).toBe(true);
    expect(returnedScan.body.sale.id).toBe(soldSaleId);
    expect(returnedScan.body.saleItem.id).toBe(soldSaleItemId);

    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);
    const replacement = list.body.find(
      (candidate: { kind: string; status: string; barcode: string }) =>
        candidate.kind === 'UNIT' &&
        candidate.status === 'IN_STOCK' &&
        candidate.barcode !== soldUnitBarcode,
    );
    const replacementScan = await request(app.getHttpServer())
      .get(`/api/returns/scan/${replacement.barcode}`)
      .set(auth())
      .expect(200);
    expect(replacementScan.body.replacementEligible).toBe(true);

    const result = await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({
        saleId: soldSaleId,
        reason: 'Cambio de talla E2E',
        destinationWarehouseId: warehouseId,
        items: [
          {
            saleItemId: soldSaleItemId,
            returnedBarcode: soldUnitBarcode,
            replacementBarcode: replacement.barcode,
            replacementPrice: 100000,
          },
        ],
      })
      .expect(201);

    expect(Number(result.body.priceDifference)).toBe(0);
    expect(Number(result.body.refundAmount)).toBe(0);
    expect(result.body.items[0].stockUnit.barcode).toBe(soldUnitBarcode);
    expect(result.body.items[0].replacementStockUnit.barcode).toBe(
      replacement.barcode,
    );

    const returnedTrace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${soldUnitBarcode}`)
      .set(auth())
      .expect(200);
    expect(returnedTrace.body.unit.status).toBe('IN_STOCK');
    expect(
      returnedTrace.body.events.some(
        (event: { eventType: string }) => event.eventType === 'RETURNED',
      ),
    ).toBe(true);

    const replacementTrace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${replacement.barcode}`)
      .set(auth())
      .expect(200);
    expect(replacementTrace.body.unit.status).toBe('SOLD');
    expect(
      replacementTrace.body.events.some(
        (event: { eventType: string; referenceType: string }) =>
          event.eventType === 'SOLD' && event.referenceType === 'RETURN',
      ),
    ).toBe(true);
  });

  it('impide devolver dos veces el mismo código físico', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({
        saleId: soldSaleId,
        reason: 'Duplicada E2E',
        destinationWarehouseId: warehouseId,
        items: [
          {
            saleItemId: soldSaleItemId,
            returnedBarcode: soldUnitBarcode,
          },
        ],
        settlementMethod: 'EFECTIVO',
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(
      /no está vendido|saldo pendiente/i,
    );
  });

  it('calcula y exige el cobro cuando el reemplazo vale más', async () => {
    const { unit: returned, sale } = await sellAvailableUnit();
    const beforeSummary = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(auth())
      .expect(200);
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);
    const replacement = list.body.find(
      (candidate: { kind: string; status: string; id: string }) =>
        candidate.kind === 'UNIT' &&
        candidate.status === 'IN_STOCK' &&
        candidate.id !== returned.id,
    );
    const payload = {
      saleId: sale.id,
      reason: 'Cambio por producto más costoso',
      destinationWarehouseId: warehouseId,
      items: [
        {
          saleItemId: sale.items[0].id,
          returnedBarcode: returned.barcode,
          replacementBarcode: replacement.barcode,
          replacementPrice: 120000,
        },
      ],
    };
    await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send(payload)
      .expect(400);
    const result = await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({ ...payload, settlementMethod: 'EFECTIVO' })
      .expect(201);
    expect(Number(result.body.priceDifference)).toBe(20000);
    expect(Number(result.body.refundAmount)).toBe(0);
    expect(result.body.settlementMethod).toBe('EFECTIVO');
    const afterSummary = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(auth())
      .expect(200);
    expect(Number(afterSummary.body.totals.ventas)).toBe(
      Number(beforeSummary.body.totals.ventas) + 20000,
    );
  });

  it('calcula el reintegro cuando el reemplazo vale menos', async () => {
    const { unit: returned, sale } = await sellAvailableUnit();
    const beforeSummary = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(auth())
      .expect(200);
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);
    const replacement = list.body.find(
      (candidate: { kind: string; status: string; id: string }) =>
        candidate.kind === 'UNIT' &&
        candidate.status === 'IN_STOCK' &&
        candidate.id !== returned.id,
    );
    const result = await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({
        saleId: sale.id,
        reason: 'Cambio por producto menos costoso',
        destinationWarehouseId: warehouseId,
        settlementMethod: 'EFECTIVO',
        items: [
          {
            saleItemId: sale.items[0].id,
            returnedBarcode: returned.barcode,
            replacementBarcode: replacement.barcode,
            replacementPrice: 80000,
          },
        ],
      })
      .expect(201);
    expect(Number(result.body.priceDifference)).toBe(-20000);
    expect(Number(result.body.refundAmount)).toBe(20000);
    const afterSummary = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(auth())
      .expect(200);
    expect(Number(afterSummary.body.totals.ventas)).toBe(
      Number(beforeSummary.body.totals.ventas) - 20000,
    );
  });

  it('permite devolver sin reemplazo y deja el código disponible', async () => {
    const { unit: returned, sale } = await sellAvailableUnit();
    const result = await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({
        saleId: sale.id,
        reason: 'Devolución sin reemplazo',
        destinationWarehouseId: warehouseId,
        settlementMethod: 'EFECTIVO',
        items: [
          {
            saleItemId: sale.items[0].id,
            returnedBarcode: returned.barcode,
          },
        ],
      })
      .expect(201);
    expect(Number(result.body.priceDifference)).toBe(-100000);
    expect(Number(result.body.refundAmount)).toBe(100000);
    const scan = await request(app.getHttpServer())
      .get(`/api/returns/scan/${returned.barcode}`)
      .set(auth())
      .expect(200);
    expect(scan.body.unit.status).toBe('IN_STOCK');
    expect(scan.body.returnEligible).toBe(false);
    expect(scan.body.replacementEligible).toBe(true);
  });

  it('genera las etiquetas en ZPL, una por bulto', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/labels/zpl')
      .set(auth())
      .send({ ids: boxIds })
      .expect(201);

    const zpl = res.text;
    expect(zpl.match(/\^XA/g)).toHaveLength(boxIds.length);
    expect(zpl).toContain('^CI28'); // UTF-8, para los acentos
    // Las cajas se rotulan con lo que contienen: el bodeguero lo lee sin abrir.
    expect(zpl).toContain('CAJA x4');
  });

  it('genera las etiquetas en PDF', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/labels/pdf')
      .set(auth())
      .send({ ids: boxIds })
      .expect(201);

    expect(res.headers['content-type']).toContain('application/pdf');
    // Un PDF real empieza con la cabecera %PDF.
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  // ── Venta por caja (Fase 5) ──

  it('al escanear una caja devuelve todo su contenido como una sola línea', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const box = list.body.find(
      (u: { kind: string; status: string }) =>
        u.kind === 'BOX' && u.status === 'IN_STOCK',
    );

    const res = await request(app.getHttpServer())
      .get(`/api/pos/scan/${box.barcode}`)
      .set(auth())
      .expect(200);

    expect(res.body.source).toBe('STOCK_UNIT');
    expect(res.body.kind).toBe('BOX');
    // Un escaneo arrastra las 4 unidades: es lo que la hace vendible a granel.
    expect(res.body.quantity).toBe(4);
    expect(res.body.stockUnitId).toBe(box.id);
    expect(res.body.variantId).toBeTruthy();
    expect(res.body.warehouseId).toBe(warehouseId);
    expect(res.body.suggestedPrice).toBe(400000);

    // El servidor no permite vender una parte y marcar todo el bulto como
    // vendido: esa inconsistencia antes era posible llamando la API a mano.
    const partial = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: res.body.variantId,
            stockUnitId: box.id,
            quantity: 1,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 500000 }],
      });
    expect(partial.status).toBe(400);
    expect(String(partial.body.message)).toMatch(/se vende completo/i);

    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: res.body.variantId,
            stockUnitId: box.id,
            quantity: res.body.quantity,
            unitPrice: res.body.suggestedPrice / res.body.quantity,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 500000 }],
      })
      .expect(201);
  });

  it('explica por qué una caja ya abierta no se puede vender', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const abierta = res.body.find(
      (u: { status: string }) => u.status === 'SPLIT',
    );

    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${abierta.barcode}`)
      .set(auth());

    expect(scan.status).toBe(404);
    expect(String(scan.body.message)).toMatch(/ya se abrió/i);
  });

  it('avisa cuando el código no corresponde a nada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/scan/00000000000000000')
      .set(auth());

    expect(res.status).toBe(404);
    expect(String(res.body.message)).toMatch(/no se encontró/i);
  });

  it('registra qué etiquetas se imprimieron', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/stock-units/mark-printed')
      .set(auth())
      .send({ ids: boxIds })
      .expect(201);

    expect(res.body.count).toBe(boxIds.length);

    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const printed = list.body.find(
      (unit: { id: string }) => unit.id === boxIds[0],
    );
    const trace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${printed.barcode}`)
      .set(auth())
      .expect(200);
    expect(
      trace.body.events.some(
        (event: { eventType: string }) => event.eventType === 'PRINTED',
      ),
    ).toBe(true);
  });
});
