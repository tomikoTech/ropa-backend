import { armarCarteraCompleta, diasVencida } from './cartera-completa.js';

const f = (
  clienteId: string,
  numero: string,
  fecha: string,
  total: number,
  pagado: number,
  vence: string | null = null,
) => ({
  clienteId,
  cliente: `Cliente ${clienteId}`,
  facturaId: `${clienteId}-${numero}`,
  numero,
  fecha,
  vence,
  total,
  pagado,
});

describe('diasVencida', () => {
  it('cuenta días de calendario desde el vencimiento, nunca negativos', () => {
    expect(diasVencida('2026-09-20', '2026-10-02')).toBe(12);
    expect(diasVencida('2026-10-20', '2026-10-02')).toBe(0);
    expect(diasVencida(null, '2026-10-02')).toBe(0);
  });
});

describe('armarCarteraCompleta', () => {
  it('agrupa por cliente, suma en centavos y deja fuera lo pagado', () => {
    const c = armarCarteraCompleta(
      [
        f('a', 'F-1', '2026-08-01', 100_000, 30_000, '2026-09-01'),
        f('a', 'F-2', '2026-09-01', 50_000.1, 0),
        f('b', 'F-3', '2026-07-01', 200_000, 200_000),
        f('b', 'F-4', '2026-09-10', 80_000, 20_000, '2026-10-10'),
      ],
      '2026-10-02',
    );
    expect(c.clientes.map((x) => x.clienteId)).toEqual(['a', 'b']);
    const a = c.clientes[0];
    expect(a.facturas.map((x) => x.numero)).toEqual(['F-1', 'F-2']);
    expect(a.saldo).toBe(120_000.1);
    expect(a.diasVencidaMax).toBe(31);
    expect(a.facturas[0].diasVencida).toBe(31);
    expect(c.clientes[1].facturas).toHaveLength(1);
    expect(c.facturas).toBe(3);
    expect(c.facturado).toBe(230_000.1);
    expect(c.pagado).toBe(50_000);
    expect(c.saldo).toBe(180_000.1);
    expect(c.vencido).toBe(70_000);
  });

  it('el que más debe va primero; a igual deuda, por nombre', () => {
    const c = armarCarteraCompleta(
      [
        f('z', 'F-1', '2026-09-01', 10_000, 0),
        f('m', 'F-2', '2026-09-01', 10_000, 0),
        f('k', 'F-3', '2026-09-01', 50_000, 0),
      ],
      '2026-10-02',
    );
    expect(c.clientes.map((x) => x.clienteId)).toEqual(['k', 'm', 'z']);
  });

  it('sin deuda, cartera vacía y en cero', () => {
    const c = armarCarteraCompleta(
      [f('a', 'F-1', '2026-09-01', 10_000, 10_000)],
      '2026-10-02',
    );
    expect(c.clientes).toEqual([]);
    expect(c.saldo).toBe(0);
  });
});
