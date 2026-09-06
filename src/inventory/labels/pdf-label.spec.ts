import { buildLabelsPdf } from './pdf-label.js';
import type { LabelData } from './zpl.util.js';

const caja: LabelData = {
  barcode: '26090600010010018', productName: 'AMA MAYLU 41/42 NEW BALANCE H',
  detail: 'MULTICOLOR', brand: 'NEW BALANCE', reference: 'AMAMAY5',
  desglose: '06/09/26 · Pedido 1 · N.º 1', isBox: true, highlight: 'CAJA x24',
};
const par: LabelData = {
  barcode: '26090100000010023', productName: 'AMA MAYLU 02 FORCE ONE AAA H',
  detail: 'GRIS BLANCO', brand: 'NIKE', reference: 'AMAMAY2', size: '40',
  desglose: '06/09/26 · Pedido 1 · N.º 23', isBox: false,
};

const mediaBox = (buf: Buffer) => {
  const m = buf
    .toString('latin1')
    .match(/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};
const pt = (mm: number) => (mm * 72) / 25.4;

describe('buildLabelsPdf (lo que sale a la impresora)', () => {
  it('genera un PDF válido con la página del tamaño pedido', async () => {
    const buf = await buildLabelsPdf([caja], { widthMm: 50, heightMm: 40 });
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    const mb = mediaBox(buf)!;
    expect(mb.w).toBeCloseTo(pt(50), 0);
    expect(mb.h).toBeCloseTo(pt(40), 0);
  });

  it('respeta el tamaño del par (58 x 30) — otro tamaño que la caja', async () => {
    const buf = await buildLabelsPdf([par], { widthMm: 58, heightMm: 30 });
    const mb = mediaBox(buf)!;
    expect(mb.w).toBeCloseTo(pt(58), 0);
    expect(mb.h).toBeCloseTo(pt(30), 0);
  });

  it('no falla en el tamaño chico que antes se cortaba (50 x 25), caja y par juntos', async () => {
    const buf = await buildLabelsPdf([caja, par], { widthMm: 50, heightMm: 25 });
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });

  it('funciona sin logo', async () => {
    const buf = await buildLabelsPdf([par], { widthMm: 58, heightMm: 30, logoPng: null });
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('no se cae con un código de barras vacío', async () => {
    const buf = await buildLabelsPdf([{ ...par, barcode: '' }], { widthMm: 58, heightMm: 30 });
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});
