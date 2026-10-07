import { pdfDeFactura, plata, type DatosDeLaTienda } from './factura-pdf.js';
import { pdfDeEstadoDeCuenta } from './estado-de-cuenta-pdf.js';
import { textoPorPagina } from './texto-del-pdf.js';

/**
 * Los PDF que se mandan por WhatsApp.
 *
 * No se puede probar cómo se ven —eso se mira—, pero sí que sean PDF de
 * verdad, que no se caigan con los casos raros y que crezcan cuando toca:
 * una factura de sesenta renglones tiene que ocupar más de una hoja, y sin
 * encabezado repetido la segunda es una lista de números sin columnas.
 */

const tienda: DatosDeLaTienda = {
  nombre: 'Tu Chapato',
  direccion: 'Calle 10 # 5-20',
  ciudad: 'Cali, Valle',
  whatsapp: '3001234567',
  lema: 'Calzado al por mayor',
  notaAlPie: 'Garantía de 30 días por defectos de fábrica.',
  notaDeVencimiento: 'Pague antes de la fecha de vencimiento.',
  agradecimiento: '¡Gracias por su compra!',
  muestraCodigos: true,
};

const renglon = (n: number) => ({
  nombre: `Tenis Runner ${n}`,
  detalle: '38 / Negro',
  codigo: `7806589324799${n % 10}`,
  cantidad: 1,
  precioUnitario: 38_900,
  total: 38_900,
});

const factura = (renglones = 3) => ({
  numero: 'VTA-20260913-0066',
  fecha: '2026-09-13T15:00:00.000Z',
  cliente: 'Marcela Ruiz',
  documento: '1234567',
  telefono: '3001112233',
  renglones: Array.from({ length: renglones }, (_, i) => renglon(i + 1)),
  subtotal: 38_900 * renglones,
  descuento: 0,
  iva: 0,
  total: 38_900 * renglones,
  pagado: 38_900 * renglones,
  saldo: 0,
});

/** Un PDF empieza con `%PDF-` y termina con `%%EOF`. */
const esPdf = (b: Buffer) =>
  b.subarray(0, 5).toString() === '%PDF-' &&
  b.toString('latin1').trimEnd().endsWith('%%EOF');

/** Cuántas páginas: pdfkit escribe un objeto `/Type /Page` por hoja. */
const paginas = (b: Buffer) =>
  (b.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;

describe('pdfDeFactura', () => {
  it('la nota al pie se puede reservar para facturas sin descuento', async () => {
    const conDescuento = {
      ...factura(2),
      renglones: [
        {
          ...renglon(1),
          precioDeLista: 38_900,
          descuentoPorcentaje: 20,
          total: 31_120,
        },
        {
          ...renglon(2),
          precioDeLista: 38_900,
          descuentoPorcentaje: 20,
          total: 31_120,
        },
      ],
      descuento: 15_560,
      total: 62_240,
      pagado: 62_240,
    };
    const texto = async (t: DatosDeLaTienda, f: typeof conDescuento) =>
      textoPorPagina(await pdfDeFactura(t, f, { comprimir: false })).join(' ');
    // Por defecto sale siempre.
    expect(await texto(tienda, conDescuento)).toContain('Garantía de 30 días');
    const reservada = { ...tienda, notaAlPieSoloSinDescuento: true };
    expect(await texto(reservada, conDescuento)).not.toContain(
      'Garantía de 30 días',
    );
    expect(await texto(reservada, factura(2))).toContain('Garantía de 30 días');
  });

  it('el total nunca queda partido entre dos hojas (la foto de Andrea, 6 oct 2026)', async () => {
    // Renglones como los de Distri Amber: con descuento (más altos) y nota.
    const conDescuento = (n: number) => ({
      nombre: `PERFUME ${n}`,
      detalle: null,
      codigo: null,
      cantidad: 6,
      precioUnitario: 38_000,
      precioDeLista: 38_000,
      descuentoPorcentaje: 20,
      total: 6 * 30_400,
    });
    for (let n = 8; n <= 40; n++) {
      const sub = n * 6 * 38_000;
      const b = await pdfDeFactura(
        tienda,
        {
          ...factura(),
          renglones: Array.from({ length: n }, (_, i) => conDescuento(i + 1)),
          subtotal: sub,
          descuento: sub * 0.2,
          total: sub * 0.8,
          pagado: 0,
          saldo: sub * 0.8,
          notas: 'DESCUENTO INCLUIDO',
        },
        { comprimir: false },
      );
      const hojas = textoPorPagina(b);
      const donde = (t: string) => hojas.findIndex((h) => h.includes(t)) + 1;
      // «TOTAL» a secas también casa con el encabezado «TOTAL PRODUCTOS»: se
      // busca el valor, que solo está en la línea del total y en el saldo.
      const totales = [
        'Subtotal',
        'Descuento',
        plata(sub * 0.8),
        'Saldo pendiente',
        'Se te aplic',
      ].map(donde);
      expect({ n, totales }).toEqual({ n, totales: Array(5).fill(totales[0]) });
      expect(totales[0]).toBeGreaterThan(0);
      // Y sin hojas de más (antes, 18 renglones daban cuatro hojas): el
      // bloque de totales pasa entero a la hoja 2 desde los 14 renglones.
      expect({ n, hojas: hojas.length }).toEqual({
        n,
        hojas: n <= 13 ? 1 : n <= 38 ? 2 : 3,
      });
      expect(donde('¡Gracias por su compra!')).toBe(hojas.length);
    }
  });

  it('produce un PDF de verdad', async () => {
    const b = await pdfDeFactura(tienda, factura());
    expect(esPdf(b)).toBe(true);
    expect(b.length).toBeGreaterThan(1500);
  });

  it('sin logo, sin lema y sin notas sigue saliendo', async () => {
    // Una tienda recién creada no tiene nada de eso configurado: la factura
    // no puede depender de que lo tenga.
    const b = await pdfDeFactura(
      { nombre: 'Nueva', muestraCodigos: false },
      factura(1),
    );
    expect(esPdf(b)).toBe(true);
  });

  it('una factura de sesenta renglones ocupa más de una hoja', async () => {
    const chica = await pdfDeFactura(tienda, factura(3));
    const grande = await pdfDeFactura(tienda, factura(60));
    expect(paginas(chica)).toBe(1);
    expect(paginas(grande)).toBeGreaterThan(1);
  });

  it('con saldo pendiente y vencimiento no se cae', async () => {
    const f = {
      ...factura(2),
      pagado: 20_000,
      saldo: 57_800,
      vence: '2026-12-12',
    };
    expect(esPdf(await pdfDeFactura(tienda, f))).toBe(true);
  });

  it('un logo que pdfkit no entiende no tumba la factura', async () => {
    // Un WebP, un SVG, o basura: sale sin logo, que es lo que había antes.
    const b = await pdfDeFactura(
      { ...tienda, logo: Buffer.from('esto no es una imagen') },
      factura(),
    );
    expect(esPdf(b)).toBe(true);
  });
});

describe('pdfDeEstadoDeCuenta', () => {
  const estado = (facturas = 2) => ({
    cliente: 'Marcela Ruiz',
    documento: '1234567',
    telefono: '3001112233',
    generadoEl: '2026-09-13T15:00:00.000Z',
    facturas: Array.from({ length: facturas }, (_, i) => ({
      numero: `VTA-20260913-00${i + 1}`,
      fecha: '2026-09-01T15:00:00.000Z',
      vence: '2026-10-01',
      total: 100_000,
      pagado: i === 0 ? 100_000 : 30_000,
      saldo: i === 0 ? 0 : 70_000,
      estado: (i === 0 ? 'PAID' : 'PARTIAL') as 'PAID' | 'PARTIAL',
      renglones: [
        {
          nombre: 'Tenis Runner',
          detalle: '38 / Negro',
          cantidad: 2,
          total: 100_000,
        },
      ],
    })),
    totalFacturado: 100_000 * facturas,
    totalPagado: 100_000 + 30_000 * (facturas - 1),
    deuda: 70_000 * (facturas - 1),
  });

  it('produce un PDF de verdad', async () => {
    expect(esPdf(await pdfDeEstadoDeCuenta(tienda, estado()))).toBe(true);
  });

  it('sin facturas no se cae', async () => {
    const b = await pdfDeEstadoDeCuenta(tienda, {
      ...estado(0),
      deuda: 0,
      totalFacturado: 0,
      totalPagado: 0,
    });
    expect(esPdf(b)).toBe(true);
  });

  it('con cajas de por medio sigue saliendo, con sus totales arriba', async () => {
    // Los recuadros de «total pares / cajas / ítems» se dibujan antes de la
    // tabla; lo que se comprueba acá es que no tumban el documento.
    const base = estado(1);
    const b = await pdfDeEstadoDeCuenta(
      { ...tienda, rotuloDeUnidades: 'pares' },
      {
        ...base,
        rotuloDeUnidades: 'pares' as const,
        facturas: base.facturas.map((f) => ({
          ...f,
          renglones: [
            ...f.renglones,
            {
              nombre: 'Caja surtida',
              detalle: '38-42',
              cantidad: 24,
              total: 1_920_000,
              esCaja: true,
            },
          ],
        })),
      },
    );
    expect(esPdf(b)).toBe(true);
  });

  it('cuarenta facturas con saldo ocupan más de una hoja', async () => {
    expect(
      paginas(await pdfDeEstadoDeCuenta(tienda, estado(40))),
    ).toBeGreaterThan(1);
  });
});

describe('plata', () => {
  it('sin código de moneda, punto de miles, sin centavos', () => {
    expect(plata(195000)).toBe('$ 195.000');
    expect(plata(38900.4)).toBe('$ 38.900');
    expect(plata(0)).toBe('$ 0');
  });
});

/**
 * El total de pares en la factura.
 *
 * Acá solo se puede comprobar que el PDF se arma y no se cae con la línea
 * nueva; que el número sea el correcto lo fija `conteo-de-la-factura.spec.ts`,
 * que es donde vive la cuenta.
 */
describe('la factura dice cuántos pares lleva', () => {
  const conCaja = () => ({
    ...factura(2),
    renglones: [
      { ...renglon(1), cantidad: 24, esCaja: true, total: 24 * 38_900 },
      renglon(2),
    ],
  });

  it('sale un PDF con el conteo de pares y cajas', async () => {
    const pdf = await pdfDeFactura(
      { ...tienda, rotuloDeUnidades: 'pares' },
      conCaja(),
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('una factura sin renglones sigue saliendo', async () => {
    // Pasa de verdad: una venta de solo terceros no trae renglones propios.
    const pdf = await pdfDeFactura(tienda, { ...factura(0), renglones: [] });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

/**
 * El descuento se ve renglón por renglón.
 *
 * Que el número sea el correcto lo fija `descuento-de-la-factura.spec.ts`;
 * acá se comprueba que un PDF con precio tachado, porcentaje y frase al pie
 * se arma y sale, con los tres caminos: por línea, a mano y general.
 */
describe('la factura enseña el descuento tachado', () => {
  it('sale un PDF con rebajas por línea, a mano y general', async () => {
    const f = {
      ...factura(0),
      renglones: [
        {
          ...renglon(1),
          precioUnitario: 60_000,
          descuentoPorcentaje: 15,
          total: 51_000,
        },
        {
          ...renglon(2),
          precioUnitario: 27_000,
          precioDeLista: 30_000,
          total: 27_000,
        },
        { ...renglon(3), precioUnitario: 10_000, total: 10_000 },
      ],
      subtotal: 97_000,
      descuento: 5_000,
      total: 83_000,
      pagado: 83_000,
      saldo: 0,
    };
    const b = await pdfDeFactura(tienda, f);
    expect(esPdf(b)).toBe(true);
    // Hay más tinta que en la misma factura sin descuentos.
    const sin = await pdfDeFactura(tienda, {
      ...f,
      renglones: f.renglones.map((r) => ({
        ...r,
        descuentoPorcentaje: 0,
        precioDeLista: null,
      })),
      descuento: 0,
    });
    expect(b.length).toBeGreaterThan(sin.length);
  });
});
