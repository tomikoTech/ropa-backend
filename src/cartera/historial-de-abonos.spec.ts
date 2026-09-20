import {
  aCentavos,
  historialDeAbonos,
  marcarReversos,
  resumirAbonos,
  type AbonoCrudo,
} from './historial-de-abonos.js';

/**
 * El historial de abonos.
 *
 * Lo pidió la tienda así: «deseamos ver el historial de abonos claro y
 * conciso: cuándo se abonó, cuánto se abonó». Lo que se fija acá es el
 * relato: por día, lo último arriba, con el abono deshecho visible pero sin
 * inflar ni el total ni el conteo.
 */

const abono = (p: Partial<AbonoCrudo> & { id: string }): AbonoCrudo => ({
  fecha: new Date('2026-09-12T15:00:00Z'),
  centavos: 100_000,
  metodo: 'EFECTIVO',
  terceroId: 'cliente-1',
  terceroNombre: 'Tienda La 70',
  documento: 'FV-001',
  cuentaId: 'ar-1',
  referencia: null,
  bancoNombre: null,
  quien: 'Andrés',
  nota: null,
  reversaDe: null,
  loteId: null,
  comprobanteUrl: null,
  ...p,
});

describe('historialDeAbonos', () => {
  it('agrupa por día, del más reciente al más viejo', () => {
    const { dias } = historialDeAbonos([
      abono({ id: 'a', fecha: new Date('2026-09-10T15:00:00Z') }),
      abono({ id: 'b', fecha: new Date('2026-09-12T15:00:00Z') }),
      abono({ id: 'c', fecha: new Date('2026-09-11T15:00:00Z') }),
    ]);
    expect(dias.map((d) => d.dia)).toEqual([
      '2026-09-12',
      '2026-09-11',
      '2026-09-10',
    ]);
  });

  it('dentro del día, lo último arriba', () => {
    // Se entra a mirar «¿qué me abonaron hoy?», no a leer el libro diario.
    const { dias } = historialDeAbonos([
      abono({ id: 'manana', fecha: new Date('2026-09-12T14:00:00Z') }),
      abono({ id: 'tarde', fecha: new Date('2026-09-12T21:00:00Z') }),
    ]);
    expect(dias[0].renglones.map((r) => r.id)).toEqual(['tarde', 'manana']);
  });

  it('un abono de las 9 de la noche es del mismo día, no del siguiente', () => {
    // El servidor corre en UTC: las 21:00 de Colombia son las 02:00 UTC del
    // día siguiente. Sin la zona de la tienda, el abono del viernes aparecía
    // el sábado y el cliente juraba que había abonado el viernes.
    const { dias } = historialDeAbonos([
      abono({ id: 'nocturno', fecha: new Date('2026-09-13T02:00:00Z') }),
    ]);
    expect(dias[0].dia).toBe('2026-09-12');
  });

  it('el día trae su propio total', () => {
    const { dias } = historialDeAbonos([
      abono({ id: 'a', centavos: 50_000 }),
      abono({ id: 'b', centavos: 30_000 }),
    ]);
    expect(dias[0].centavos).toBe(80_000);
  });

  it('sin abonos, no hay días ni totales', () => {
    const { dias, resumen } = historialDeAbonos([]);
    expect(dias).toEqual([]);
    expect(resumen.centavos).toBe(0);
    expect(resumen.cuantos).toBe(0);
    expect(resumen.desde).toBeNull();
  });
});

describe('marcarReversos', () => {
  it('marca el contra-abono y deja tachado al que deshizo', () => {
    const r = marcarReversos([
      abono({ id: 'original' }),
      abono({ id: 'contra', centavos: -100_000, reversaDe: 'original' }),
    ]);
    expect(r.find((x) => x.id === 'original')).toMatchObject({
      anulado: true,
      esReverso: false,
    });
    expect(r.find((x) => x.id === 'contra')).toMatchObject({
      anulado: false,
      esReverso: true,
    });
  });

  it('un abono normal no queda marcado de nada', () => {
    const [r] = marcarReversos([abono({ id: 'solo' })]);
    expect(r.anulado).toBe(false);
    expect(r.esReverso).toBe(false);
  });
});

describe('resumirAbonos', () => {
  const resumen = (abonos: AbonoCrudo[]) => resumirAbonos(marcarReversos(abonos));

  it('el neto descuenta lo que se deshizo', () => {
    // Se abonaron 100.000 y se deshicieron: en el periodo entraron 0, aunque
    // en pantalla se vean los dos renglones.
    const r = resumen([
      abono({ id: 'original' }),
      abono({ id: 'contra', centavos: -100_000, reversaDe: 'original' }),
    ]);
    expect(r.centavos).toBe(0);
  });

  it('el abono deshecho y su contra-abono no cuentan como dos abonos más', () => {
    // Hubo un abono, no tres: contarlos haría ver un día de cobranza que no
    // existió.
    const r = resumen([
      abono({ id: 'vivo', centavos: 20_000 }),
      abono({ id: 'original' }),
      abono({ id: 'contra', centavos: -100_000, reversaDe: 'original' }),
    ]);
    expect(r.cuantos).toBe(1);
    expect(r.anulados).toBe(1);
    expect(r.centavos).toBe(20_000);
  });

  it('separa por método, de lo que más entra a lo que menos', () => {
    // «¿Cómo me están pagando?» se contesta en la primera línea.
    const r = resumen([
      abono({ id: 'a', metodo: 'EFECTIVO', centavos: 10_000 }),
      abono({ id: 'b', metodo: 'TRANSFERENCIA', centavos: 90_000 }),
      abono({ id: 'c', metodo: 'EFECTIVO', centavos: 5_000 }),
    ]);
    expect(r.porMetodo).toEqual([
      { metodo: 'TRANSFERENCIA', centavos: 90_000, cuantos: 1 },
      { metodo: 'EFECTIVO', centavos: 15_000, cuantos: 2 },
    ]);
  });

  it('el método del abono anulado no queda sumado', () => {
    const r = resumen([
      abono({ id: 'original', metodo: 'TRANSFERENCIA' }),
      abono({
        id: 'contra',
        metodo: 'TRANSFERENCIA',
        centavos: -100_000,
        reversaDe: 'original',
      }),
    ]);
    expect(r.porMetodo).toEqual([]);
  });

  it('cuenta terceros distintos, no renglones', () => {
    // Un cliente que abonó tres veces es un cliente, no tres.
    const r = resumen([
      abono({ id: 'a', terceroId: 'c1' }),
      abono({ id: 'b', terceroId: 'c1' }),
      abono({ id: 'c', terceroId: 'c2' }),
    ]);
    expect(r.terceros).toBe(2);
  });

  it('el abono sin tercero no rompe el conteo', () => {
    // Hay facturas viejas sin cliente: se muestran igual, pero no son «un
    // cliente más».
    const r = resumen([
      abono({ id: 'a', terceroId: null, terceroNombre: 'Sin cliente' }),
    ]);
    expect(r.terceros).toBe(0);
    expect(r.cuantos).toBe(1);
  });

  it('dice desde cuándo y hasta cuándo va lo que se está viendo', () => {
    const r = resumen([
      abono({ id: 'a', fecha: new Date('2026-09-01T15:00:00Z') }),
      abono({ id: 'b', fecha: new Date('2026-09-20T15:00:00Z') }),
    ]);
    expect(r.desde).toBe('2026-09-01');
    expect(r.hasta).toBe('2026-09-20');
  });
});

describe('aCentavos', () => {
  it('convierte el decimal en texto que manda Postgres', () => {
    expect(aCentavos('79999.99')).toBe(7_999_999);
  });

  it('redondea en vez de arrastrar el float', () => {
    // 1.1 * 100 en coma flotante es 110.00000000000001.
    expect(aCentavos('1.1')).toBe(110);
  });

  it('lo que no viene vale cero, no NaN', () => {
    expect(aCentavos(null)).toBe(0);
    expect(aCentavos(undefined)).toBe(0);
  });
});

describe('resumirAbonos con abonos repartidos', () => {
  const resumen = (abonos: AbonoCrudo[]) => resumirAbonos(marcarReversos(abonos));

  it('un abono al saldo repartido en tres facturas cuenta como uno', () => {
    // Quien abonó 150.000 pagó una vez. Contar las aplicaciones mostraba tres
    // abonos y hacía ver un día de cobranza que no existió.
    const r = resumen([
      abono({ id: 'a', loteId: 'L1', centavos: 10_000_000 }),
      abono({ id: 'b', loteId: 'L1', centavos: 3_000_000 }),
      abono({ id: 'c', loteId: 'L1', centavos: 2_000_000 }),
    ]);
    expect(r.cuantos).toBe(1);
    expect(r.centavos).toBe(15_000_000);
    expect(r.porMetodo).toEqual([
      { metodo: 'EFECTIVO', centavos: 15_000_000, cuantos: 1 },
    ]);
  });

  it('dos repartos distintos son dos abonos', () => {
    const r = resumen([
      abono({ id: 'a', loteId: 'L1' }),
      abono({ id: 'b', loteId: 'L1' }),
      abono({ id: 'c', loteId: 'L2' }),
    ]);
    expect(r.cuantos).toBe(2);
  });
});
