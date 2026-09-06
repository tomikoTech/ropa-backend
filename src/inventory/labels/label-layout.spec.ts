import { computeLabelLayout, type LabelLayout, type Caja } from './label-layout.js';

const TAMANOS: [number, number][] = [
  [50, 25], // el que salió cortado
  [50, 30],
  [50, 40], // caja "cuadrada"
  [58, 30], // par "alargado"
  [60, 40],
  [40, 25],
];

const EPS = 0.01;

function todasLasCajas(l: LabelLayout): Caja[] {
  return [
    l.nombre,
    l.marca,
    l.barcode,
    l.digitos,
    l.destacado,
    l.pie,
    ...(l.logo ? [l.logo] : []),
  ];
}

describe('computeLabelLayout: nada se sale del sticker (no se corta)', () => {
  for (const [W, H] of TAMANOS) {
    for (const isBox of [true, false]) {
      const tipo = isBox ? 'caja' : 'par';
      for (const hasLogo of [true, false]) {
        it(`${W}x${H} ${tipo} ${hasLogo ? 'con' : 'sin'} logo: todo dentro del margen`, () => {
          const l = computeLabelLayout({ widthMm: W, heightMm: H, isBox, hasLogo });
          const m = l.marginMm;
          for (const c of todasLasCajas(l)) {
            expect(c.xMm).toBeGreaterThanOrEqual(m - EPS);
            expect(c.yMm).toBeGreaterThanOrEqual(m - EPS);
            expect(c.xMm + c.wMm).toBeLessThanOrEqual(W - m + EPS);
            expect(c.yMm + c.hMm).toBeLessThanOrEqual(H - m + EPS);
          }
        });
      }
    }
  }

  it('las filas no se enciman y van de arriba hacia abajo', () => {
    const l = computeLabelLayout({ widthMm: 50, heightMm: 25, isBox: false, hasLogo: true });
    expect(l.nombre.yMm).toBeLessThan(l.barcode.yMm);
    expect(l.barcode.yMm + l.barcode.hMm).toBeLessThanOrEqual(l.digitos.yMm + EPS);
    expect(l.digitos.yMm + l.digitos.hMm).toBeLessThanOrEqual(l.destacado.yMm + EPS);
    expect(l.destacado.yMm + l.destacado.hMm).toBeLessThanOrEqual(l.pie.yMm + EPS);
  });

  it('el código de barras tiene alto legible (>= 5 mm) hasta en el sticker chico', () => {
    for (const [W, H] of TAMANOS) {
      const l = computeLabelLayout({ widthMm: W, heightMm: H, isBox: true, hasLogo: true });
      expect(l.barcode.hMm).toBeGreaterThanOrEqual(5);
    }
  });

  it('el par muestra la talla en GRANDE (fuente destacada mayor que la de la caja)', () => {
    const par = computeLabelLayout({ widthMm: 58, heightMm: 30, isBox: false, hasLogo: true });
    const caja = computeLabelLayout({ widthMm: 58, heightMm: 30, isBox: true, hasLogo: true });
    expect(par.destacado.fontMm).toBeGreaterThan(caja.destacado.fontMm);
    expect(par.destacado.fontMm).toBeGreaterThanOrEqual(4);
  });

  it('el texto del nombre no es diminuto (>= 2.2 mm) y el margen es seguro (>= 1.2 mm)', () => {
    const l = computeLabelLayout({ widthMm: 50, heightMm: 25, isBox: true, hasLogo: true });
    expect(l.nombre.fontMm).toBeGreaterThanOrEqual(2.2);
    expect(l.marginMm).toBeGreaterThanOrEqual(1.2);
  });

  it('sin logo, el texto arranca en el margen izquierdo (no deja el hueco del logo)', () => {
    const l = computeLabelLayout({ widthMm: 50, heightMm: 30, isBox: false, hasLogo: false });
    expect(l.logo).toBeNull();
    expect(l.nombre.xMm).toBeCloseTo(l.marginMm, 5);
  });
});
