import { pdfDeFactura, plata, type DatosDeLaTienda } from './factura-pdf.js';
import { pdfDeEstadoDeCuenta } from './estado-de-cuenta-pdf.js';

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
  b.subarray(0, 5).toString() === '%PDF-' && b.toString('latin1').trimEnd().endsWith('%%EOF');

/** Cuántas páginas: pdfkit escribe un objeto `/Type /Page` por hoja. */
const paginas = (b: Buffer) => (b.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;

describe('pdfDeFactura', () => {
  it('produce un PDF de verdad', async () => {
    const b = await pdfDeFactura(tienda, factura());
    expect(esPdf(b)).toBe(true);
    expect(b.length).toBeGreaterThan(1500);
  });

  it('sin logo, sin lema y sin notas sigue saliendo', async () => {
    // Una tienda recién creada no tiene nada de eso configurado: la factura
    // no puede depender de que lo tenga.
    const b = await pdfDeFactura({ nombre: 'Nueva', muestraCodigos: false }, factura(1));
    expect(esPdf(b)).toBe(true);
  });

  it('una factura de sesenta renglones ocupa más de una hoja', async () => {
    const chica = await pdfDeFactura(tienda, factura(3));
    const grande = await pdfDeFactura(tienda, factura(60));
    expect(paginas(chica)).toBe(1);
    expect(paginas(grande)).toBeGreaterThan(1);
  });

  it('con saldo pendiente y vencimiento no se cae', async () => {
    const f = { ...factura(2), pagado: 20_000, saldo: 57_800, vence: '2026-12-12' };
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
      renglones: [{ nombre: 'Tenis Runner', detalle: '38 / Negro', cantidad: 2, total: 100_000 }],
    })),
    totalFacturado: 100_000 * facturas,
    totalPagado: 100_000 + 30_000 * (facturas - 1),
    deuda: 70_000 * (facturas - 1),
  });

  it('produce un PDF de verdad', async () => {
    expect(esPdf(await pdfDeEstadoDeCuenta(tienda, estado()))).toBe(true);
  });

  it('sin facturas no se cae', async () => {
    const b = await pdfDeEstadoDeCuenta(tienda, { ...estado(0), deuda: 0, totalFacturado: 0, totalPagado: 0 });
    expect(esPdf(b)).toBe(true);
  });

  it('cuarenta facturas con saldo ocupan más de una hoja', async () => {
    expect(paginas(await pdfDeEstadoDeCuenta(tienda, estado(40)))).toBeGreaterThan(1);
  });
});

describe('plata', () => {
  it('sin código de moneda, punto de miles, sin centavos', () => {
    expect(plata(195000)).toBe('$ 195.000');
    expect(plata(38900.4)).toBe('$ 38.900');
    expect(plata(0)).toBe('$ 0');
  });
});
