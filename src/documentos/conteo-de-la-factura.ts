/**
 * Cuántos pares y cuántas cajas lleva una factura.
 *
 * Lo pidió un cliente de AMAWAD y la tienda lo pasó tal cual: «en la factura
 * que uno le envía, ¿me puedes ayudar a colocar el total de los pares?… la
 * verdad yo no me he dado cuenta de eso». Quien compra al por mayor cuenta
 * pares, no renglones: una factura de catorce líneas no dice de un vistazo si
 * llegaron 24 o 36, y esa es justo la cifra que se verifica al recibir la
 * mercancía.
 *
 * La caja cuenta doble a propósito: **sus pares suman al total** —el renglón
 * guarda los pares que trae, no «una caja»— y además se dice cuántas cajas
 * son, porque el que descarga el camión cuenta bultos.
 *
 * Vive aparte del dibujo del PDF porque es aritmética que se prueba sola, y
 * porque la misma cuenta va en la factura impresa del mostrador
 * (`invoice-print.ts` en el frontend): si difieren, el cliente recibe por
 * WhatsApp una factura que no cuadra con la de papel.
 */

export interface RenglonContable {
  cantidad: number;
  /** El renglón salió de una caja cerrada. */
  esCaja?: boolean;
}

export interface ConteoDeLaFactura {
  /** Pares (o unidades) en total, cajas incluidas. */
  unidades: number;
  /** Cuántas cajas cerradas. */
  cajas: number;
  /** Cuántos de esos pares venían dentro de cajas. */
  unidadesEnCajas: number;
}

export function contarLaFactura(
  renglones: RenglonContable[],
): ConteoDeLaFactura {
  let unidades = 0;
  let cajas = 0;
  let unidadesEnCajas = 0;
  for (const r of renglones) {
    // Una cantidad rara no puede tumbar la factura: se ignora en el conteo en
    // vez de dejar «NaN pares» impreso en el papel del cliente.
    const n = Number(r.cantidad);
    if (!Number.isFinite(n) || n <= 0) continue;
    unidades += n;
    if (r.esCaja) {
      cajas += 1;
      unidadesEnCajas += n;
    }
  }
  return { unidades, cajas, unidadesEnCajas };
}

/**
 * El texto que va en la factura: «24 pares · 2 cajas».
 *
 * `rotulo` distingue a quien vende calzado de quien vende frascos: la misma
 * cuenta, la palabra que usa cada tienda.
 */
export function textoDelConteo(
  conteo: ConteoDeLaFactura,
  rotulo: 'pares' | 'unidades' = 'unidades',
): string {
  if (!conteo.unidades) return '';
  const singular = rotulo === 'pares' ? 'par' : 'unidad';
  const partes = [
    `${conteo.unidades} ${conteo.unidades === 1 ? singular : rotulo}`,
  ];
  if (conteo.cajas > 0) {
    partes.push(`${conteo.cajas} ${conteo.cajas === 1 ? 'caja' : 'cajas'}`);
  }
  return partes.join(' · ');
}
