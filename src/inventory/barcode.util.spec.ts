import {
  buildStockBarcode,
  calculateCheckDigit,
  isValidBarcode,
  parseStockBarcode,
  withCheckDigit,
} from './barcode.util.js';

describe('códigos de barras del inventario', () => {
  const date = new Date(2026, 7, 7); // 7 de agosto de 2026

  describe('buildStockBarcode', () => {
    // Formato heredado del sistema anterior, para que los lectores y las
    // plantillas de etiqueta que el cliente ya tiene sigan sirviendo.
    it('arma el código con el formato AAMMDD+orden+renglón+secuencia', () => {
      expect(
        buildStockBarcode({
          date,
          orderSequence: 29,
          lineConsecutive: 1,
          unitSequence: 1,
        }),
      ).toBe('2608070029001001');
    });

    it('rellena cada tramo con ceros a la izquierda', () => {
      expect(
        buildStockBarcode({
          date: new Date(2026, 0, 5),
          orderSequence: 7,
          lineConsecutive: 2,
          unitSequence: 3,
        }),
      ).toBe('2601050007002003');
    });

    it('numera los bultos de un mismo renglón en secuencia', () => {
      const codes = [1, 2, 3].map((unitSequence) =>
        buildStockBarcode({
          date,
          orderSequence: 29,
          lineConsecutive: 1,
          unitSequence,
        }),
      );
      expect(codes).toEqual([
        '2608070029001001',
        '2608070029001002',
        '2608070029001003',
      ]);
      expect(new Set(codes).size).toBe(3);
    });

    it('distingue renglones distintos de la misma orden', () => {
      const a = buildStockBarcode({
        date,
        orderSequence: 29,
        lineConsecutive: 1,
        unitSequence: 1,
      });
      const b = buildStockBarcode({
        date,
        orderSequence: 29,
        lineConsecutive: 2,
        unitSequence: 1,
      });
      expect(a).not.toBe(b);
    });

    it('siempre son 16 dígitos', () => {
      expect(
        buildStockBarcode({
          date,
          orderSequence: 9999,
          lineConsecutive: 999,
          unitSequence: 999,
        }),
      ).toHaveLength(16);
    });

    // Si el número no cabe, el código se desbordaría y colisionaría con otro:
    // mejor fallar con un mensaje claro que emitir etiquetas duplicadas.
    it('avisa cuando un consecutivo no cabe en su tramo', () => {
      expect(() =>
        buildStockBarcode({
          date,
          orderSequence: 10_000,
          lineConsecutive: 1,
          unitSequence: 1,
        }),
      ).toThrow(/no cabe/);

      expect(() =>
        buildStockBarcode({
          date,
          orderSequence: 1,
          lineConsecutive: 1,
          unitSequence: 1000,
        }),
      ).toThrow(/no cabe/);
    });
  });

  describe('dígito verificador', () => {
    // Es el mismo algoritmo EAN que usa el sistema anterior; sin él, los
    // lectores no pueden descartar una lectura mal hecha.
    it('calcula el dígito con el algoritmo EAN', () => {
      // Comprobación independiente: pesos 1 y 3 alternados.
      const body = '2608070029001001';
      let odd = 0;
      let even = 0;
      for (let i = 0; i < body.length; i++) {
        const n = Number(body[i]);
        if (i % 2 === 0) odd += n;
        else even += n;
      }
      const esperado = (10 - ((odd + even * 3) % 10)) % 10;
      expect(calculateCheckDigit(body)).toBe(esperado);
    });

    it('valida un código con su dígito correcto', () => {
      const code = withCheckDigit('2608070029001001');
      expect(isValidBarcode(code)).toBe(true);
    });

    it('rechaza un código con un dígito equivocado', () => {
      const code = withCheckDigit('2608070029001001');
      const alterado =
        code.slice(0, -1) + String((Number(code.slice(-1)) + 1) % 10);
      expect(isValidBarcode(alterado)).toBe(false);
    });

    // El caso real: el operario teclea mal un dígito del medio.
    it('detecta un dígito cambiado en medio del código', () => {
      const code = withCheckDigit('2608070029001001');
      const pos = 8;
      const alterado =
        code.slice(0, pos) +
        String((Number(code[pos]) + 1) % 10) +
        code.slice(pos + 1);
      expect(isValidBarcode(alterado)).toBe(false);
    });

    it('rechaza lo que no sea numérico', () => {
      expect(isValidBarcode('ABC123')).toBe(false);
      expect(isValidBarcode('')).toBe(false);
    });
  });

  describe('parseStockBarcode', () => {
    it('recupera la información codificada', () => {
      expect(parseStockBarcode('2608070029001002')).toEqual({
        year: 2026,
        month: 8,
        day: 7,
        orderSequence: 29,
        lineConsecutive: 1,
        unitSequence: 2,
      });
    });

    it('acepta el código con dígito verificador', () => {
      const conDigito = withCheckDigit('2608070029001002');
      expect(parseStockBarcode(conDigito)?.orderSequence).toBe(29);
    });

    it('devuelve null si no tiene el formato esperado', () => {
      expect(parseStockBarcode('123')).toBeNull();
      expect(parseStockBarcode('no-es-un-codigo')).toBeNull();
    });
  });
});
