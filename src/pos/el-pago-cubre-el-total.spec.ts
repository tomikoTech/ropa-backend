import { aCentavos, cubreElTotal, sePasaDe } from './el-pago-cubre-el-total.js';

/**
 * El descuento que no dejaba vender.
 *
 * En AMAWAD no se podía cobrar una venta con 33% de descuento: el servidor
 * respondía «Pago insuficiente. Total: $30753, Pagado: $30752.999999999996».
 * Las dos cifras son la misma plata; lo que difería era el camino aritmético.
 *
 * Estas pruebas reproducen **los dos caminos tal como son** —el del carrito y
 * el del servidor— en vez de escribir a mano los números que salieron. Si
 * mañana alguien cambia cualquiera de los dos y vuelven a separarse, esto se
 * entera.
 */

/** Como lo calcula el carrito: un solo producto, sin redondear. */
const comoElCarrito = (precio: number, cantidad: number, desc: number) =>
  precio * cantidad * (1 - desc / 100);

/** Como lo calcula el servidor: descuento aparte y cada renglón a 2 decimales. */
const comoElServidor = (precio: number, cantidad: number, desc: number) => {
  const subtotal = precio * cantidad;
  const descuento = subtotal * (desc / 100);
  return Math.round((subtotal - descuento) * 100) / 100;
};

describe('cubreElTotal', () => {
  it('deja cobrar la venta exacta del incidente de AMAWAD', () => {
    // 45.900 con 33% de descuento. Este es el caso que el vendedor no pudo
    // cobrar, con los números que salieron en el mensaje de error.
    const delCarrito = comoElCarrito(45_900, 1, 33);
    const delServidor = comoElServidor(45_900, 1, 33);

    // La prueba de que el problema existe: los dos números NO son iguales...
    expect(delCarrito).not.toBe(delServidor);
    expect(delCarrito).toBeLessThan(delServidor);
    // ...y comparados a pelo, la venta se caía.
    expect(delCarrito < delServidor).toBe(true);

    // En centavos son la misma plata, y la venta pasa.
    expect(cubreElTotal(delCarrito, delServidor)).toBe(true);
  });

  it('ningún precio, cantidad ni descuento del mostrador bloquea la venta', () => {
    const precios = [7_500, 15_900, 33_333, 45_900, 89_900, 120_000, 250_000];
    const descuentos = [0, 3, 5, 7, 10, 11, 13, 15, 17, 20, 23, 25, 33, 37, 41, 50];
    const cantidades = [1, 2, 3, 6, 12, 24];

    const rotos: string[] = [];
    for (const precio of precios) {
      for (const desc of descuentos) {
        for (const cantidad of cantidades) {
          const pagado = comoElCarrito(precio, cantidad, desc);
          const total = comoElServidor(precio, cantidad, desc);
          if (!cubreElTotal(pagado, total)) {
            rotos.push(`${precio} x${cantidad} -${desc}%`);
          }
        }
      }
    }
    expect(rotos).toEqual([]);
  });

  it('el descuento del incidente era uno de 32 casos, no una rareza', () => {
    // Sin el arreglo, esta es la cuenta de cuántas combinaciones se caían.
    // Queda escrita para que nadie vuelva a tratarlo como «un caso raro».
    const precios = [33_333, 45_900, 89_900, 120_000, 15_900, 7_500, 250_000];
    const descuentos = [3, 7, 11, 13, 17, 23, 33, 37, 41];
    const cantidades = [1, 2, 3];

    let seCaian = 0;
    for (const precio of precios) {
      for (const desc of descuentos) {
        for (const cantidad of cantidades) {
          const pagado = comoElCarrito(precio, cantidad, desc);
          const total = comoElServidor(precio, cantidad, desc);
          if (pagado < total) seCaian += 1; // la comparación vieja
          expect(cubreElTotal(pagado, total)).toBe(true); // la nueva
        }
      }
    }
    expect(seCaian).toBe(32);
  });

  it('un pago realmente corto sigue sin pasar', () => {
    // Lo que este arreglo NO puede hacer es dejar cobrar de menos.
    expect(cubreElTotal(30_000, 30_753)).toBe(false);
  });

  it('un centavo de menos es un centavo de menos', () => {
    // Un centavo sí es plata: por debajo del centavo es donde vive el ruido.
    expect(cubreElTotal(30_752.99, 30_753)).toBe(false);
  });

  it('pagar de más siempre alcanza', () => {
    expect(cubreElTotal(50_000, 30_753)).toBe(true);
  });

  it('una venta en cero se cubre con cero', () => {
    expect(cubreElTotal(0, 0)).toBe(true);
  });
});

describe('aCentavos', () => {
  it('redondea el ruido hacia la plata que de verdad es', () => {
    expect(aCentavos(30_752.999999999996)).toBe(3_075_300);
    expect(aCentavos(30_753)).toBe(3_075_300);
  });

  it('no trunca: truncar convertiría el ruido en deuda', () => {
    // Con `Math.trunc` esto daría 3.075.299 y la venta se seguiría cayendo.
    expect(aCentavos(30_752.999999999996)).not.toBe(3_075_299);
  });

  it('conserva los centavos que sí existen', () => {
    expect(aCentavos(10.5)).toBe(1_050);
    expect(aCentavos(0.01)).toBe(1);
  });

  it('un valor ilegible vale cero, no NaN', () => {
    // Un NaN colándose a una comparación de plata la vuelve siempre falsa, y
    // el vendedor ve «pago insuficiente» sin ninguna explicación posible.
    expect(aCentavos(Number('no es plata'))).toBe(0);
  });
});

describe('sePasaDe', () => {
  it('el ruido de punto flotante no se pasa de ningún tope', () => {
    expect(sePasaDe(30_753.000000000004, 30_753)).toBe(false);
  });

  it('un centavo de más sí se pasa', () => {
    expect(sePasaDe(30_753.01, 30_753)).toBe(true);
  });

  it('quedarse por debajo nunca se pasa', () => {
    expect(sePasaDe(30_000, 30_753)).toBe(false);
  });
});
