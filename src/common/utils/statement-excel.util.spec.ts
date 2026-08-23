import { fmtDate } from './statement-excel.util.js';

/**
 * La fecha del estado de cuenta que se le manda al cliente.
 *
 * Era `toISOString().slice(0, 10)`, que es el día en **UTC**: una venta hecha
 * a las ocho de la noche en Colombia salía fechada al día siguiente, y el
 * cliente que revisaba el archivo no encontraba su factura donde debía estar.
 */
describe('fmtDate', () => {
  it('una venta de la noche queda en el día en que se hizo', () => {
    // 21 de agosto, 9 de la noche en Colombia = 22 en UTC. La venta es del 21.
    expect(fmtDate(new Date('2026-08-22T02:00:00.000Z'))).toBe('2026-08-21');
  });

  it('un día ya escrito como día se respeta', () => {
    // La fecha de vencimiento llega así desde la columna `date`.
    expect(fmtDate('2026-12-25')).toBe('2026-12-25');
  });

  it('el mediodía cae igual en los dos lados', () => {
    expect(fmtDate(new Date('2026-08-22T12:00:00.000Z'))).toBe('2026-08-22');
  });

  it('sin fecha, celda en blanco', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('una fecha ilegible deja la celda vacía y no tumba el archivo', () => {
    // Reventar acá dejaría al cliente sin el estado de cuenta completo por
    // una sola fila vieja.
    expect(fmtDate('no es una fecha')).toBe('');
  });
});
