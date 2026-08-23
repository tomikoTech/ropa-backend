/**
 * Si esta mercancía se etiqueta par por par.
 *
 * De esto depende que exista el código único que el cliente ve impreso en la
 * caja y que el vendedor escanea con la pistola. Sin él, dos líneas de la
 * misma referencia en una factura son indistinguibles.
 *
 * Antes la regla era `producto OR tienda`, y tenía un agujero: **un producto
 * no podía decir que no**. Mientras el interruptor de la tienda estuvo apagado
 * por defecto daba igual; al encenderlo para todas, una esencia de perfumería
 * que se mide en gramos habría recibido una etiqueta por gramo —cargar cinco
 * kilos habría creado cinco mil filas en una sola transacción—.
 *
 * Tres estados, y el producto manda:
 *   - `true`  → se etiqueta, diga lo que diga la tienda
 *   - `false` → no se etiqueta, diga lo que diga la tienda
 *   - `null`  → lo que diga la tienda
 *
 * `false` y `null` dejaron de significar lo mismo, y por eso la migración que
 * abre el tercer estado convierte los `false` de antes en `null`: así era como
 * se comportaban.
 */
export function llevaUnidades(
  productoDice: boolean | null | undefined,
  tiendaDice: boolean | null | undefined,
): boolean {
  if (productoDice === true || productoDice === false) return productoDice;
  return tiendaDice === true;
}
