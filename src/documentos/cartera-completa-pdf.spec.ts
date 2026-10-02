import { pdfDeCarteraCompleta } from './cartera-completa-pdf.js';
import { armarCarteraCompleta } from '../cartera/cartera-completa.js';

const tienda = { nombre: 'Distri Amber', muestraCodigos: false };
const filas = (clientes: number, porCliente = 3) =>
  Array.from({ length: clientes * porCliente }, (_, i) => ({
    clienteId: `c${Math.floor(i / porCliente)}`,
    cliente: `Cliente ${Math.floor(i / porCliente)}`,
    telefono: '3001234567',
    facturaId: `f${i}`,
    numero: `FAC-${700 + i}`,
    fecha: `2026-0${1 + (i % 9)}-15T12:00:00.000Z`,
    vence: i % 2 ? '2026-09-01' : null,
    total: 100_000,
    pagado: i % 3 === 0 ? 40_000 : 0,
  }));
const esPdf = (b: Buffer) => b.subarray(0, 5).toString() === '%PDF-';
const paginas = (b: Buffer) =>
  (b.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;

describe('pdfDeCarteraCompleta', () => {
  it('sale un PDF con pocos clientes', async () => {
    const b = await pdfDeCarteraCompleta(
      tienda,
      armarCarteraCompleta(filas(3), '2026-10-02'),
      '2026-10-02T15:00:00Z',
    );
    expect(esPdf(b)).toBe(true);
    expect(paginas(b)).toBe(1);
  });

  it('cuarenta clientes pasan de una hoja con el encabezado repetido', async () => {
    const b = await pdfDeCarteraCompleta(
      tienda,
      armarCarteraCompleta(filas(40), '2026-10-02'),
      '2026-10-02T15:00:00Z',
    );
    expect(paginas(b)).toBeGreaterThan(2);
  });

  it('sin deuda no se cae', async () => {
    const b = await pdfDeCarteraCompleta(
      tienda,
      armarCarteraCompleta([], '2026-10-02'),
      '2026-10-02T15:00:00Z',
    );
    expect(esPdf(b)).toBe(true);
  });
});
