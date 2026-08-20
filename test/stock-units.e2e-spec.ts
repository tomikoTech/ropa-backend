import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { isValidBarcode } from '../src/inventory/barcode.util';

describe('Recepción por cajas y apertura de cajas (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let orderId: string;
  let boxLineId: string;
  let boxIds: string[] = [];
  let warehouseId: string;
  let returnWarehouseId: string;
  let curveSizeIds: string[] = [];
  let productId: string;
  let curveId: string;
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
    const returnWh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Retorno WH ${ts}`,
        code: `RT-${ts.toString().slice(-5)}`,
      })
      .expect(201);
    returnWarehouseId = returnWh.body.id;

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
    productId = prod.body.id;
    const curve = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva bulto ${ts}`,
        items: sizeIds.map((sizeId) => ({ sizeId, quantity: 2 })),
      });

    curveId = curve.body.id;

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

  it('recibe parte de las cajas y crea una fila por caja', async () => {
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

  it('encuentra una caja por su código de barras', async () => {
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

    const remitted = await request(app.getHttpServer())
      .post(`/api/returns/${result.body.id}/remit`)
      .set(auth())
      .send({ destinationWarehouseId: returnWarehouseId })
      .expect(201);
    expect(remitted.body.remittanceWarehouse.id).toBe(returnWarehouseId);
    expect(remitted.body.remittedAt).toBeTruthy();

    const afterRemit = await request(app.getHttpServer())
      .get(`/api/returns/scan/${returned.barcode}`)
      .set(auth())
      .expect(200);
    expect(afterRemit.body.unit.warehouseId).toBe(returnWarehouseId);
    await request(app.getHttpServer())
      .post(`/api/returns/${result.body.id}/remit`)
      .set(auth())
      .send({ destinationWarehouseId: warehouseId })
      .expect(400);
  });

  it('aplica una devolución a la cartera aunque la venta ya tenga un abono', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);
    const unit = list.body.find(
      (candidate: { kind: string; status: string; warehouseId: string }) =>
        candidate.kind === 'UNIT' &&
        candidate.status === 'IN_STOCK' &&
        candidate.warehouseId === returnWarehouseId,
    );
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth())
      .send({
        firstName: `Cliente crédito ${ts}`,
        lastName: 'B4',
        documentNumber: `B4-${ts}`,
        phone: '3000000000',
      })
      .expect(201);
    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${unit.barcode}`)
      .set(auth())
      .expect(200);
    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId: client.body.id,
        warehouseId: returnWarehouseId,
        items: [
          {
            variantId: scan.body.variantId,
            stockUnitId: unit.id,
            quantity: 1,
            unitPrice: 100000,
          },
        ],
        payments: [{ method: 'CREDITO', amount: 100000 }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
    const receivables = await request(app.getHttpServer())
      .get('/api/pos/accounts-receivable')
      .set(auth())
      .expect(200);
    const receivable = receivables.body.find(
      (row: { saleId: string }) => row.saleId === sale.body.id,
    );
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${receivable.id}/payment`)
      .set(auth())
      .send({ amount: 20000, method: 'EFECTIVO' })
      .expect(201);

    const result = await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({
        saleId: sale.body.id,
        reason: 'Devolución sobre venta abonada',
        destinationWarehouseId: returnWarehouseId,
        settlementMethod: 'CREDITO',
        items: [
          {
            saleItemId: sale.body.items[0].id,
            returnedBarcode: unit.barcode,
          },
        ],
      })
      .expect(201);
    expect(Number(result.body.priceDifference)).toBe(-100000);
    expect(Number(result.body.refundAmount)).toBe(20000);
    expect(result.body.creditNotes[0].isApplied).toBe(true);

    const adjusted = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${receivable.id}`)
      .set(auth())
      .expect(200);
    expect(Number(adjusted.body.totalAmount)).toBe(0);
    expect(Number(adjusted.body.paidAmount)).toBe(20000);
    expect(adjusted.body.isFullyPaid).toBe(true);
  });

  it('genera las etiquetas en ZPL, una por caja', async () => {
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
    expect(String(partial.body.message)).toMatch(/se vende completa/i);

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

  it('anexa cajas recibidas, continúa su número y etiqueta caja/par sin cambiar el barcode', async () => {
    const appended = await Promise.all(
      [1, 1].map(() =>
        request(app.getHttpServer())
          .post(`/api/purchases/box-lines/${boxLineId}/append`)
          .set(auth())
          .send({ additionalBoxes: 1 })
          .expect(201),
      ),
    );
    expect(appended.map((result) => result.body.boxes).sort()).toEqual([4, 5]);
    expect(appended.every((result) => result.body.boxesReceived === 3)).toBe(
      true,
    );

    const partialOrder = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}`)
      .set(auth())
      .expect(200);
    expect(partialOrder.body.status).toBe('PARTIAL');
    expect(Number(partialOrder.body.total)).toBe(500000);
    if (partialOrder.body.accountsPayable?.[0]) {
      expect(Number(partialOrder.body.accountsPayable[0].amount)).toBe(500000);
    }

    const received = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({ boxes: 2 })
      .expect(201);
    expect(
      received.body.map((box: { boxSequence: number }) => box.boxSequence),
    ).toEqual([4, 5]);

    const allBeforeSplit = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);
    const barcodes = allBeforeSplit.body.map(
      (unit: { barcode: string }) => unit.barcode,
    );
    expect(new Set(barcodes).size).toBe(barcodes.length);

    const split = await request(app.getHttpServer())
      .post(`/api/stock-units/${received.body[0].id}/split`)
      .set(auth())
      .expect(201);
    expect(
      split.body.units.map(
        (unit: { boxSequence: number; pairSequence: number }) => [
          unit.boxSequence,
          unit.pairSequence,
        ],
      ),
    ).toEqual([
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
    ]);

    try {
      await request(app.getHttpServer())
        .patch('/api/store-settings')
        .set(auth())
        .send({ showBoxPairSequenceOnLabels: true })
        .expect(200);
      const boxLabel = await request(app.getHttpServer())
        .post('/api/labels/zpl')
        .set(auth())
        .send({ ids: [received.body[1].id] })
        .expect(201);
      expect(boxLabel.text).toContain('CAJA 5');

      const pairLabel = await request(app.getHttpServer())
        .post('/api/labels/zpl')
        .set(auth())
        .send({ ids: [split.body.units[0].id] })
        .expect(201);
      expect(pairLabel.text).toContain('CAJA 4 · PAR 01');
    } finally {
      await request(app.getHttpServer())
        .patch('/api/store-settings')
        .set(auth())
        .send({ showBoxPairSequenceOnLabels: false });
    }
  });

  it('editar el precio de la venta no le quita el código físico', async () => {
    // Al recrear las líneas se perdía el `stockUnitId`: el código quedaba
    // vendido pero sin venta que lo respaldara, y ya no se podía devolver
    // escaneándolo.
    const { unit, sale } = await sellAvailableUnit();

    const editada = await request(app.getHttpServer())
      .patch(`/api/pos/sales/${sale.id}`)
      .set(auth())
      .send({
        items: [
          {
            variantId: sale.items[0].variantId,
            quantity: 1,
            unitPrice: 120000,
          },
        ],
      })
      .expect(200);
    expect(editada.body.items[0].stockUnitId).toBe(unit.id);

    // Y sigue siendo devolvible por su código.
    const scan = await request(app.getHttpServer())
      .get(`/api/returns/scan/${unit.barcode}`)
      .set(auth())
      .expect(200);
    expect(scan.body.returnEligible).toBe(true);
    expect(scan.body.saleItem.id).toBe(editada.body.items[0].id);

    // Y una vez que la venta tiene devolución, ya no se le pueden cambiar los
    // productos: la devolución apunta a esa línea y recrearla la dejaría
    // colgando de una fila que ya no existe.
    await request(app.getHttpServer())
      .post('/api/returns')
      .set(auth())
      .send({
        saleId: sale.id,
        reason: 'Cambio de talla',
        destinationWarehouseId: warehouseId,
        settlementMethod: 'EFECTIVO',
        items: [
          { saleItemId: sale.items[0].id, returnedBarcode: unit.barcode },
        ],
      })
      .expect(201);

    const rechazo = await request(app.getHttpServer())
      .patch(`/api/pos/sales/${sale.id}`)
      .set(auth())
      .send({
        items: [
          { variantId: sale.items[0].variantId, quantity: 2, unitPrice: 90000 },
        ],
      })
      .expect(400);
    expect(String(rechazo.body.message)).toMatch(/devoluciones/i);
  });

  it('anular la venta devuelve el código a disponible', async () => {
    // El inventario agregado ya se revertía; el código físico no. Quedaba
    // VENDIDO para siempre: no se podía volver a vender ni a escanear.
    const { unit, sale } = await sellAvailableUnit();

    const vendido = await request(app.getHttpServer())
      .get(`/api/stock-units/by-barcode/${unit.barcode}`)
      .set(auth())
      .expect(200);
    expect(vendido.body.status).toBe('SOLD');

    await request(app.getHttpServer())
      .post(`/api/pos/sales/${sale.id}/cancel`)
      .set(auth())
      .expect(201);

    const despues = await request(app.getHttpServer())
      .get(`/api/stock-units/by-barcode/${unit.barcode}`)
      .set(auth())
      .expect(200);
    expect(despues.body.status).toBe('IN_STOCK');

    // Y queda el rastro de por qué volvió.
    const trace = await request(app.getHttpServer())
      .get(`/api/stock-units/trace/${unit.barcode}`)
      .set(auth())
      .expect(200);
    expect(
      trace.body.events.some(
        (event: { referenceType: string }) =>
          event.referenceType === 'SALE_CANCEL',
      ),
    ).toBe(true);

    // Se puede volver a vender, que es la prueba de que quedó libre de verdad.
    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${unit.barcode}`)
      .set(auth())
      .expect(200);
    expect(scan.body.stockUnitId).toBe(unit.id);
  });

  /**
   * Lo que preguntó una tienda mirando su bodega llena: «¿cómo veo las cajas
   * que tengo y cómo ingreso las que ya están acá?». Ver cajas se podía a
   * medias —sin separarlas de los pares— e ingresarlas no se podía: una caja
   * solo nacía de una orden de compra.
   */
  describe('ver e ingresar cajas', () => {
    const habilitarCajas = (enabled: boolean) =>
      request(app.getHttpServer())
        .patch('/api/store-settings')
        .set(auth())
        .send({ unitTrackingEnabled: enabled })
        .expect(200);

    it('separa las cajas de los pares y cuenta las dos cosas', async () => {
      const cajas = await request(app.getHttpServer())
        .get('/api/stock-units/search')
        .query({ kind: 'BOX', productId, limit: 100 })
        .set(auth())
        .expect(200);
      const pares = await request(app.getHttpServer())
        .get('/api/stock-units/search')
        .query({ kind: 'UNIT', productId, limit: 100 })
        .set(auth())
        .expect(200);

      expect(cajas.body.data.length).toBeGreaterThan(0);
      expect(pares.body.data.length).toBeGreaterThan(0);
      expect(
        cajas.body.data.every((u: { kind: string }) => u.kind === 'BOX'),
      ).toBe(true);
      expect(
        pares.body.data.every((u: { kind: string }) => u.kind === 'UNIT'),
      ).toBe(true);

      // El resumen no cambia al conmutar de pestaña: es justo lo que permite
      // decidir a cuál ir sin tener que probar las dos.
      expect(cajas.body.resumen).toEqual(pares.body.resumen);
      expect(cajas.body.resumen.cajas).toBe(cajas.body.meta.total);
      expect(cajas.body.resumen.pares).toBe(pares.body.meta.total);
      expect(cajas.body.resumen.unidades).toBeGreaterThan(0);
    });

    it('una caja abierta dice cuántos pares salieron de ella', async () => {
      const cajas = await request(app.getHttpServer())
        .get('/api/stock-units/search')
        .query({ kind: 'BOX', productId, status: 'SPLIT', limit: 100 })
        .set(auth())
        .expect(200);
      expect(cajas.body.data.length).toBeGreaterThan(0);
      expect(cajas.body.data[0].childCount).toBeGreaterThan(0);
    });

    it('rechaza un tipo que no existe', async () => {
      await request(app.getHttpServer())
        .get('/api/stock-units/search')
        .query({ kind: 'PALETA' })
        .set(auth())
        .expect(400);
    });

    it('no deja ingresar cajas si la tienda no trabaja por cajas', async () => {
      await habilitarCajas(false);
      const res = await request(app.getHttpServer())
        .post('/api/stock-units/intake')
        .set(auth())
        .send({ productId, sizeCurveId: curveId, boxes: 1, warehouseId })
        .expect(400);
      expect(res.body.message).toMatch(/apagado|Configuración/i);
      await habilitarCajas(true);
    });

    it('ingresa cajas que ya están en la bodega, sin orden de compra', async () => {
      await habilitarCajas(true);
      const antes = await request(app.getHttpServer())
        .get(`/api/inventory/products/${productId}/history`)
        .set(auth())
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/api/stock-units/intake')
        .set(auth())
        .send({
          productId,
          sizeCurveId: curveId,
          boxes: 2,
          warehouseId,
          unitCost: 30000,
          notes: 'Inventario inicial de la bodega',
        })
        .expect(201);

      expect(res.body).toHaveLength(2);
      for (const caja of res.body) {
        expect(caja.kind).toBe('BOX');
        expect(caja.purchaseBoxLineId).toBeNull();
        // La curva manda: 2 tallas × 2 pares.
        expect(caja.quantity).toBe(4);
        expect(isValidBarcode(caja.barcode)).toBe(true);
      }
      const codigos = res.body.map((u: { barcode: string }) => u.barcode);
      expect(new Set(codigos).size).toBe(2);

      // El inventario sube por las 8 unidades que entraron dentro de las cajas.
      const despues = await request(app.getHttpServer())
        .get(`/api/inventory/products/${productId}/history`)
        .set(auth())
        .expect(200);
      expect(despues.body.currentStock).toBe(antes.body.currentStock + 8);

      // Y el movimiento dice por qué entró, no solo que entró.
      const movimiento = despues.body.movements.find(
        (m: { referenceType: string | null }) =>
          m.referenceType === 'STOCK_UNIT_INTAKE',
      );
      expect(movimiento).toBeDefined();
      expect(movimiento.notes).toContain('Inventario inicial de la bodega');

      // La caja sabe qué trae, igual que si hubiera venido de una compra.
      const trace = await request(app.getHttpServer())
        .get(`/api/stock-units/trace/${codigos[0]}`)
        .set(auth())
        .expect(200);
      expect(trace.body.unit.contents).toHaveLength(2);
      expect(trace.body.purchase).toBeNull();
    });

    it('sin curva hay que decir cuántas unidades trae la caja', async () => {
      await habilitarCajas(true);
      const res = await request(app.getHttpServer())
        .post('/api/stock-units/intake')
        .set(auth())
        .send({ productId, boxes: 1, warehouseId })
        .expect(400);
      expect(res.body.message).toMatch(/unidades|curva/i);

      const ok = await request(app.getHttpServer())
        .post('/api/stock-units/intake')
        .set(auth())
        .send({ productId, boxes: 1, unitsPerBox: 6, warehouseId })
        .expect(201);
      expect(ok.body[0].quantity).toBe(6);
    });

    it('las cajas ingresadas a mano aparecen en el listado sin orden de compra', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stock-units/search')
        .query({ kind: 'BOX', productId, status: 'IN_STOCK', limit: 100 })
        .set(auth())
        .expect(200);
      const sinOrden = res.body.data.filter(
        (u: { orderNumber: string | null }) => u.orderNumber === null,
      );
      expect(sinOrden.length).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * El traslado de siempre movía el inventario agregado y **no tocaba el
   * bulto**: la caja seguía figurando en la bodega de origen, que quedaba en
   * cero con una caja encima, y al intentar abrirla saltaba «el stock
   * agregado de la caja no alcanza».
   */
  describe('trasladar cajas a otra bodega', () => {
    const stockDeVariante = async (variantId: string, warehouseId: string) => {
      const res = await request(app.getHttpServer())
        .get(`/api/inventory/stock/warehouse/${warehouseId}`)
        .set(auth())
        .expect(200);
      const fila = res.body.find(
        (row: { variant: { id: string } }) => row.variant.id === variantId,
      );
      return Number(fila?.quantity ?? 0);
    };

    const ingresarCaja = async () => {
      const res = await request(app.getHttpServer())
        .post('/api/stock-units/intake')
        .set(auth())
        .send({ productId, sizeCurveId: curveId, boxes: 1, warehouseId })
        .expect(201);
      return res.body[0] as {
        id: string;
        barcode: string;
        variantId: string;
        quantity: number;
      };
    };

    it('mueve la caja y su inventario juntos', async () => {
      const caja = await ingresarCaja();
      const antesOrigen = await stockDeVariante(caja.variantId, warehouseId);
      const antesDestino = await stockDeVariante(
        caja.variantId,
        returnWarehouseId,
      );

      const res = await request(app.getHttpServer())
        .post('/api/stock-units/transfer')
        .set(auth())
        .send({
          ids: [caja.id],
          toWarehouseId: returnWarehouseId,
          notes: 'Se llevó el camión',
        })
        .expect(201);
      expect(res.body[0].warehouseId).toBe(returnWarehouseId);
      // Sigue disponible: un traslado directo llega en el mismo acto, no va
      // «en camino» como una remisión con confirmación.
      expect(res.body[0].status).toBe('IN_STOCK');

      expect(await stockDeVariante(caja.variantId, warehouseId)).toBe(
        antesOrigen - caja.quantity,
      );
      expect(await stockDeVariante(caja.variantId, returnWarehouseId)).toBe(
        antesDestino + caja.quantity,
      );

      // Y queda contado como traslado en las dos bodegas.
      const historial = await request(app.getHttpServer())
        .get(`/api/inventory/products/${productId}/history?limit=100`)
        .set(auth())
        .expect(200);
      const movimientos = historial.body.movements.filter(
        (m: { referenceType: string | null }) =>
          m.referenceType === 'STOCK_UNIT_TRANSFER',
      );
      expect(movimientos.length).toBeGreaterThanOrEqual(2);
      expect(
        movimientos.some((m: { notes: string }) =>
          m.notes.includes('Se llevó el camión'),
        ),
      ).toBe(true);
    });

    it('la caja trasladada se puede abrir en su nueva bodega', async () => {
      // Ésta es la prueba de que se acabó el descuadre: antes el inventario se
      // quedaba en la bodega vieja y abrirla era imposible.
      const caja = await ingresarCaja();
      await request(app.getHttpServer())
        .post('/api/stock-units/transfer')
        .set(auth())
        .send({ ids: [caja.id], toWarehouseId: returnWarehouseId })
        .expect(201);

      const abierta = await request(app.getHttpServer())
        .post(`/api/stock-units/${caja.id}/split`)
        .set(auth())
        .expect(201);
      expect(abierta.body.units.length).toBe(caja.quantity);
      for (const par of abierta.body.units) {
        expect(par.warehouseId).toBe(returnWarehouseId);
      }
    });

    it('no deja trasladar a la bodega en la que ya está', async () => {
      const caja = await ingresarCaja();
      const res = await request(app.getHttpServer())
        .post('/api/stock-units/transfer')
        .set(auth())
        .send({ ids: [caja.id], toWarehouseId: warehouseId })
        .expect(400);
      expect(res.body.message).toMatch(/ya está en esa bodega/i);
    });

    it('explica por qué una caja abierta no se traslada', async () => {
      const caja = await ingresarCaja();
      await request(app.getHttpServer())
        .post(`/api/stock-units/${caja.id}/split`)
        .set(auth())
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/stock-units/transfer')
        .set(auth())
        .send({ ids: [caja.id], toWarehouseId: returnWarehouseId })
        .expect(400);
      expect(res.body.message).toMatch(/ya se abrió|sus pares/i);
    });

    it('no manda la caja a un estante de otra bodega', async () => {
      const caja = await ingresarCaja();
      const shelf = await request(app.getHttpServer())
        .post(`/api/inventory/warehouses/${warehouseId}/shelves`)
        .set(auth())
        .send({ name: `Estante origen ${ts}` });
      const stand = await request(app.getHttpServer())
        .post(`/api/inventory/shelves/${shelf.body.id}/stands`)
        .set(auth())
        .send({ name: `A${ts.toString().slice(-4)}` });

      const res = await request(app.getHttpServer())
        .post('/api/stock-units/transfer')
        .set(auth())
        .send({
          ids: [caja.id],
          toWarehouseId: returnWarehouseId,
          toStandId: stand.body.id,
        })
        .expect(400);
      expect(res.body.message).toMatch(/no pertenece a la bodega destino/i);
    });
  });

  /**
   * «El cálculo bueno del precio según los pares y cantidades de la caja, y
   * que se diferencie de los productos normales». Antes la caja se cobraba a
   * precio de mostrador y la línea guardaba la talla de la variante
   * equivalente: una caja 36-39 quedaba facturada como «talla 36».
   */
  describe('vender una caja: precio y descripción', () => {
    const ingresarCaja = async () => {
      const res = await request(app.getHttpServer())
        .post('/api/stock-units/intake')
        .set(auth())
        .send({ productId, sizeCurveId: curveId, boxes: 1, warehouseId })
        .expect(201);
      return res.body[0] as { id: string; barcode: string; quantity: number };
    };

    it('cobra la caja al por mayor y por todos sus pares', async () => {
      await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set(auth())
        .send({ basePrice: 100000, wholesalePrice: 70000 })
        .expect(200);
      const caja = await ingresarCaja();

      const scan = await request(app.getHttpServer())
        .get(`/api/pos/scan/${caja.barcode}`)
        .set(auth())
        .expect(200);

      expect(scan.body.kind).toBe('BOX');
      expect(scan.body.priceSource).toBe('WHOLESALE');
      expect(scan.body.unitPrice).toBe(70000);
      expect(scan.body.quantity).toBe(caja.quantity);
      // El total de la línea: precio por par × pares de la caja.
      expect(scan.body.suggestedPrice).toBe(70000 * caja.quantity);
      // Y dice qué trae, para que el cajero sepa qué está entregando.
      expect(scan.body.contents.length).toBeGreaterThan(1);
      expect(
        scan.body.contents.reduce(
          (suma: number, fila: { quantity: number }) => suma + fila.quantity,
          0,
        ),
      ).toBe(caja.quantity);
    });

    it('la factura dice el surtido, no una talla que no existe', async () => {
      const caja = await ingresarCaja();
      const scan = await request(app.getHttpServer())
        .get(`/api/pos/scan/${caja.barcode}`)
        .set(auth())
        .expect(200);

      const venta = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set(auth())
        .send({
          warehouseId,
          items: [
            {
              variantId: scan.body.variantId,
              stockUnitId: caja.id,
              quantity: caja.quantity,
              unitPrice: scan.body.unitPrice,
            },
          ],
          payments: [
            {
              method: 'EFECTIVO',
              amount: scan.body.unitPrice * caja.quantity,
            },
          ],
        })
        .expect(201);

      const linea = venta.body.items[0];
      expect(linea.unitKind).toBe('BOX');
      // Ni «36» ni ninguna talla suelta: es un surtido.
      expect(linea.variantSize).toMatch(/^Surtido /);
      expect(linea.boxContents.length).toBeGreaterThan(1);
      expect(
        linea.boxContents.reduce(
          (suma: number, fila: { quantity: number }) => suma + fila.quantity,
          0,
        ),
      ).toBe(caja.quantity);
    });

    it('editar la factura no le borra el surtido a la caja', async () => {
      const caja = await ingresarCaja();
      const scan = await request(app.getHttpServer())
        .get(`/api/pos/scan/${caja.barcode}`)
        .set(auth())
        .expect(200);
      const venta = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set(auth())
        .send({
          warehouseId,
          items: [
            {
              variantId: scan.body.variantId,
              stockUnitId: caja.id,
              quantity: caja.quantity,
              unitPrice: 50000,
            },
          ],
          payments: [{ method: 'EFECTIVO', amount: 50000 * caja.quantity }],
        })
        .expect(201);

      const editada = await request(app.getHttpServer())
        .patch(`/api/pos/sales/${venta.body.id}`)
        .set(auth())
        .send({
          items: [
            {
              variantId: scan.body.variantId,
              quantity: caja.quantity,
              unitPrice: 45000,
            },
          ],
        })
        .expect(200);

      const linea = editada.body.items[0];
      expect(linea.stockUnitId).toBe(caja.id);
      expect(linea.unitKind).toBe('BOX');
      expect(linea.boxContents.length).toBeGreaterThan(1);
    });

    it('un producto suelto no se disfraza de caja', async () => {
      const detalle = await request(app.getHttpServer())
        .get(`/api/products/${productId}`)
        .set(auth())
        .expect(200);
      const variante = detalle.body.variants[0];
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth())
        .send({
          variantId: variante.id,
          warehouseId,
          movementType: 'IN',
          quantity: 5,
          notes: 'Para vender suelto',
        });

      const venta = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set(auth())
        .send({
          warehouseId,
          items: [
            { variantId: variante.id, quantity: 1, unitPrice: 100000 },
          ],
          payments: [{ method: 'EFECTIVO', amount: 100000 }],
        })
        .expect(201);

      const linea = venta.body.items[0];
      expect(linea.unitKind).toBeNull();
      expect(linea.boxContents).toBeNull();
      expect(linea.variantSize).not.toMatch(/Surtido/);
    });
  });
});
