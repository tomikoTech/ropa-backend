import { buildLabelZpl, buildLabelBatchZpl, escapeZpl } from './zpl.util.js';

const label = {
  barcode: '26080700290010013',
  productName: 'Tenis Running Pro',
  detail: 'Negro · Talla 40',
  highlight: 'CAJA x24',
};

describe('etiquetas ZPL', () => {
  describe('buildLabelZpl', () => {
    it('abre y cierra el formato de etiqueta', () => {
      const zpl = buildLabelZpl(label);
      expect(zpl.startsWith('^XA')).toBe(true);
      expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
    });

    it('incluye el código de barras y el texto', () => {
      const zpl = buildLabelZpl(label);
      expect(zpl).toContain('^FD26080700290010013^FS');
      expect(zpl).toContain('Tenis Running Pro');
      expect(zpl).toContain('Negro');
      expect(zpl).toContain('CAJA x24');
    });

    // Sin ^CI28 los acentos y la ñ salen como basura en la etiqueta.
    it('declara UTF-8 para que los acentos salgan bien', () => {
      expect(
        buildLabelZpl({ ...label, productName: 'Camiseta Niño' }),
      ).toContain('^CI28');
    });

    // `^` y `~` son los caracteres de control de ZPL: si llegan crudos desde
    // el nombre de un producto, la impresora interpreta basura.
    it('neutraliza los caracteres de control de ZPL', () => {
      const zpl = buildLabelZpl({
        ...label,
        productName: 'Producto ^XA raro ~JA',
      });
      const cuerpo = zpl.split('^FD')[1] ?? '';
      expect(cuerpo).not.toContain('^XA');
      expect(zpl).toContain('Producto');
    });

    it('recorta un nombre demasiado largo sin cortar la palabra', () => {
      const zpl = buildLabelZpl({
        ...label,
        productName:
          'Zapatilla deportiva de altísimo rendimiento para maratón profesional',
      });
      const campo = zpl.match(/\^FD(Zapatilla[^^]*)\^FS/)?.[1] ?? '';
      expect(campo.length).toBeLessThanOrEqual(26);
      expect(campo.endsWith(' ')).toBe(false);
    });

    it('omite los campos opcionales que no vienen', () => {
      const zpl = buildLabelZpl({
        barcode: '123',
        productName: 'Simple',
      });
      expect(zpl).toContain('Simple');
      expect(zpl).not.toContain('undefined');
    });

    it('escala las medidas con los puntos por milímetro', () => {
      const a = buildLabelZpl(label, { dpmm: 8, widthMm: 50 });
      const b = buildLabelZpl(label, { dpmm: 12, widthMm: 50 });
      expect(a).toContain('^PW400'); // 50mm x 8
      expect(b).toContain('^PW600'); // 50mm x 12
    });

    it('pide varias copias solo cuando se piden', () => {
      expect(buildLabelZpl(label, { copies: 3 })).toContain('^PQ3');
      expect(buildLabelZpl(label, { copies: 1 })).not.toContain('^PQ');
    });
  });

  describe('buildLabelBatchZpl', () => {
    it('encadena una etiqueta por bulto', () => {
      const zpl = buildLabelBatchZpl([label, { ...label, barcode: '999' }]);
      expect(zpl.match(/\^XA/g)).toHaveLength(2);
      expect(zpl.match(/\^XZ/g)).toHaveLength(2);
      expect(zpl).toContain('999');
    });

    it('con lista vacía no emite nada', () => {
      expect(buildLabelBatchZpl([])).toBe('');
    });
  });

  describe('escapeZpl', () => {
    it('quita los caracteres de control y recorta espacios', () => {
      expect(escapeZpl('  ^hola~  ')).toBe('hola');
    });

    it('tolera texto vacío', () => {
      expect(escapeZpl('')).toBe('');
    });
  });
});
