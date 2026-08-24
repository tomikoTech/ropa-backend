import { puedeRechazarse, ESTADO_RECHAZADA } from './rechazar-solicitud.js';
import { estaPendiente } from './ventas-por-autorizar.js';

describe('rechazar una venta que espera autorización', () => {
  it.each(['DRAFT', 'SENT', 'APPROVED'])(
    'una que todavía espera (%s) se puede rechazar',
    (estado) => {
      expect(puedeRechazarse(estado).permitido).toBe(true);
    },
  );

  // Rechazar algo que ya descontó inventario y cobró plata no es rechazar: es
  // devolver, y eso tiene su propio camino.
  it('una ya convertida en venta no se rechaza', () => {
    const r = puedeRechazarse('CONVERTED');
    expect(r.permitido).toBe(false);
    expect(r.porque).toMatch(/ya es una venta/i);
  });

  it('una vencida no se rechaza: ya no espera a nadie', () => {
    expect(puedeRechazarse('EXPIRED').permitido).toBe(false);
  });

  it('rechazar dos veces no hace nada nuevo y lo dice', () => {
    const r = puedeRechazarse(ESTADO_RECHAZADA);
    expect(r.permitido).toBe(false);
    expect(r.porque).toMatch(/ya (está|fue) rechazada/i);
  });

  it('el motivo del rechazo llega al vendedor, así que no puede ir vacío', () => {
    expect(puedeRechazarse('SENT', '   ').permitido).toBe(false);
    expect(puedeRechazarse('SENT', '   ').porque).toMatch(/motivo/i);
  });

  it('con motivo, pasa', () => {
    expect(puedeRechazarse('SENT', 'No hay talla').permitido).toBe(true);
  });

  // Una rechazada no puede seguir contando en el número del menú: si contara,
  // el contador no bajaría nunca.
  it('una rechazada deja de estar pendiente', () => {
    expect(estaPendiente(ESTADO_RECHAZADA)).toBe(false);
  });
});
