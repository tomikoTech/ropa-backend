import {
  armarBalance,
  type MovimientoDelBalance,
  type SaldosDelBalance,
} from './balance.js';

/**
 * El balance del negocio: lo que quedó, después de todo.
 *
 * Sale de lo que un dueño de tres locales enumeró mirando su aplicación:
 * «ganancia, recuperación, gastos, inversiones… ahí ya salen las ganancias,
 * salen como las inversiones, cuánto se ha recuperado el capital», más «lo que
 * uno debe» y los abonos que lo van bajando.
 *
 * Y una advertencia suya sobre lo que **no** hay que construir: de las
 * estadísticas del día de su app dijo «eso casi no se usa, no es relevante, yo
 * eso lo quitaría».
 *
 * Todo en **centavos enteros**, como el cuadre de caja: sumar plata en float
 * deja totales que en pantalla se ven bien y contra el papel no dan.
 */

const mov = (
  extra: Partial<MovimientoDelBalance> = {},
): MovimientoDelBalance => ({
  tipo: 'VENTA',
  centavos: 0,
  costoCentavos: 0,
  localId: 'local-1',
  anulado: false,
  ...extra,
});

const saldos = (extra: Partial<SaldosDelBalance> = {}): SaldosDelBalance => ({
  inventarioCentavos: 0,
  porCobrarCentavos: 0,
  porPagarCentavos: 0,
  ...extra,
});

describe('armarBalance', () => {
  it('sin movimientos, todo en cero y sin dividir por cero', () => {
    const b = armarBalance([], saldos());
    expect(b.ventas).toBe(0);
    expect(b.recuperacion).toBe(0);
    expect(b.ganancia).toBe(0);
    expect(b.gastos).toBe(0);
    expect(b.inversion).toBe(0);
    expect(b.utilidadNeta).toBe(0);
    expect(b.margen).toBe(0);
  });

  it('parte la venta en lo que costó y lo que se ganó', () => {
    // «Recuperación» es el capital que vuelve: lo que esa mercancía costó.
    // Lo demás es ganancia. Sin separarlos, una venta grande de mercancía
    // cara parece un mes bueno.
    const b = armarBalance(
      [mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 })],
      saldos(),
    );
    expect(b.ventas).toBe(100_000);
    expect(b.recuperacion).toBe(60_000);
    expect(b.ganancia).toBe(40_000);
  });

  it('lo anulado no entra en ninguna parte', () => {
    // Una venta anulada devolvió la mercancía y devolvió la plata: contarla
    // infla las ventas y la ganancia del mes al mismo tiempo.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({
          tipo: 'VENTA',
          centavos: 500_000,
          costoCentavos: 300_000,
          anulado: true,
        }),
      ],
      saldos(),
    );
    expect(b.ventas).toBe(100_000);
    expect(b.recuperacion).toBe(60_000);
  });

  it('los gastos bajan la utilidad, no las ventas', () => {
    // «El pago de nómina, el pago del arriendo, el control de los gastos
    // menores». Restarlos de las ventas escondería cuánto se vendió.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({ tipo: 'GASTO', centavos: 15_000 }),
      ],
      saldos(),
    );
    expect(b.ventas).toBe(100_000);
    expect(b.ganancia).toBe(40_000);
    expect(b.gastos).toBe(15_000);
    expect(b.utilidadNeta).toBe(25_000);
  });

  it('la inversión no es un gasto', () => {
    // Comprar mercancía no empobrece: cambia plata por inventario. Meterla
    // en gastos haría que un mes de reposición fuerte se leyera como pérdida.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({ tipo: 'COMPRA', centavos: 400_000 }),
      ],
      saldos(),
    );
    expect(b.inversion).toBe(400_000);
    expect(b.gastos).toBe(0);
    expect(b.utilidadNeta).toBe(40_000);
  });

  it('la utilidad puede ser negativa, y se dice', () => {
    // Un mes malo se muestra en rojo, no en cero. Recortarlo a cero es
    // mentirle a quien tiene que decidir si cierra un local.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 50_000, costoCentavos: 40_000 }),
        mov({ tipo: 'GASTO', centavos: 90_000 }),
      ],
      saldos(),
    );
    expect(b.utilidadNeta).toBe(-80_000);
  });

  it('el margen es sobre las ventas, en porcentaje con un decimal', () => {
    const b = armarBalance(
      [mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 65_000 })],
      saldos(),
    );
    expect(b.margen).toBe(35);
  });

  it('sin ventas el margen es cero, no infinito', () => {
    const b = armarBalance(
      [mov({ tipo: 'GASTO', centavos: 10_000 })],
      saldos(),
    );
    expect(b.margen).toBe(0);
  });

  it('el capital es lo que hay menos lo que se debe', () => {
    // «Lo que uno debe y lo que uno tiene de capital»: inventario y cartera
    // son plata de la tienda aunque no esté en el cajón; la deuda con el
    // proveedor la resta.
    const b = armarBalance(
      [],
      saldos({
        inventarioCentavos: 900_000,
        porCobrarCentavos: 200_000,
        porPagarCentavos: 300_000,
      }),
    );
    expect(b.inventario).toBe(900_000);
    expect(b.porCobrar).toBe(200_000);
    expect(b.porPagar).toBe(300_000);
    expect(b.capital).toBe(800_000);
  });

  it('el capital puede ser negativo: se debe más de lo que hay', () => {
    const b = armarBalance(
      [],
      saldos({ inventarioCentavos: 100_000, porPagarCentavos: 400_000 }),
    );
    expect(b.capital).toBe(-300_000);
  });

  it('abre el balance por local, y los locales suman el total', () => {
    // «Puedes filtrar también por cada local». Y lo de cada uno tiene que
    // sumar lo mismo que el total, o la pantalla se contradice sola.
    const b = armarBalance(
      [
        mov({
          tipo: 'VENTA',
          centavos: 100_000,
          costoCentavos: 60_000,
          localId: 'a',
        }),
        mov({
          tipo: 'VENTA',
          centavos: 300_000,
          costoCentavos: 200_000,
          localId: 'b',
        }),
        mov({ tipo: 'GASTO', centavos: 20_000, localId: 'a' }),
      ],
      saldos(),
    );
    expect(b.ventas).toBe(400_000);
    expect(b.porLocal).toHaveLength(2);

    const a = b.porLocal.find((l) => l.localId === 'a')!;
    expect(a.ventas).toBe(100_000);
    expect(a.gastos).toBe(20_000);
    expect(a.utilidadNeta).toBe(20_000);

    const suma = b.porLocal.reduce((n, l) => n + l.ventas, 0);
    expect(suma).toBe(b.ventas);
  });

  it('un gasto sin local no se pierde: entra al total', () => {
    // El arriendo de la bodega o la nómina de administración no son de ningún
    // local. Descartarlos haría que la utilidad total saliera de más.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({ tipo: 'GASTO', centavos: 30_000, localId: null }),
      ],
      saldos(),
    );
    expect(b.gastos).toBe(30_000);
    expect(b.utilidadNeta).toBe(10_000);
    // Y no inventa un local para él.
    expect(b.porLocal.map((l) => l.localId)).toEqual(['local-1']);
  });

  it('los locales salen del que más vendió al que menos', () => {
    // Lo primero que se mira es cuál va bien y cuál va mal.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 10_000, localId: 'flojo' }),
        mov({ tipo: 'VENTA', centavos: 90_000, localId: 'fuerte' }),
        mov({ tipo: 'VENTA', centavos: 50_000, localId: 'medio' }),
      ],
      saldos(),
    );
    expect(b.porLocal.map((l) => l.localId)).toEqual([
      'fuerte',
      'medio',
      'flojo',
    ]);
  });

  it('a igualdad de ventas el orden no cambia entre corridas', () => {
    // Determinístico como el resto: una lista que se reordena sola al
    // recargar hace dudar de los números.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 10_000, localId: 'zeta' }),
        mov({ tipo: 'VENTA', centavos: 10_000, localId: 'alfa' }),
      ],
      saldos(),
    );
    expect(b.porLocal.map((l) => l.localId)).toEqual(['alfa', 'zeta']);
  });

  it('un costo sin registrar no se inventa: se avisa', () => {
    // Las ventas importadas de sistemas viejos no traen costo. Tratarlas como
    // costo cero dispara la ganancia y nadie entiende por qué el mes fue
    // buenísimo. Se cuentan aparte para poder decirlo en pantalla.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({ tipo: 'VENTA', centavos: 80_000, costoCentavos: null }),
      ],
      saldos(),
    );
    expect(b.ventas).toBe(180_000);
    expect(b.recuperacion).toBe(60_000);
    expect(b.ventasSinCosto).toBe(1);
  });

  it('una venta sin costo tampoco ensucia el margen del local', () => {
    const b = armarBalance(
      [mov({ tipo: 'VENTA', centavos: 80_000, costoCentavos: null })],
      saldos(),
    );
    expect(b.porLocal[0].ventasSinCosto).toBe(1);
    expect(b.porLocal[0].recuperacion).toBe(0);
  });

  it('los abonos de cartera no son ventas nuevas', () => {
    // «Se va quitando de la deuda y se va sumando como el capital.» El abono
    // es plata que entra, pero la venta ya se contó el día que se hizo:
    // contarla otra vez duplicaría el mes.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({ tipo: 'ABONO', centavos: 40_000 }),
      ],
      saldos(),
    );
    expect(b.ventas).toBe(100_000);
    expect(b.recaudo).toBe(40_000);
    expect(b.utilidadNeta).toBe(40_000);
  });

  it('los abonos a proveedores tampoco son gastos', () => {
    // Pagarle al proveedor baja la deuda; el costo ya se contó al vender.
    const b = armarBalance(
      [
        mov({ tipo: 'VENTA', centavos: 100_000, costoCentavos: 60_000 }),
        mov({ tipo: 'PAGO_PROVEEDOR', centavos: 70_000 }),
      ],
      saldos(),
    );
    expect(b.gastos).toBe(0);
    expect(b.pagosAProveedores).toBe(70_000);
    expect(b.utilidadNeta).toBe(40_000);
  });
});
