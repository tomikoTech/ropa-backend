/**
 * Codificador Code 128 (variante B) para dibujar el símbolo en el PDF.
 *
 * El PDF de etiquetas antes imprimía el código **solo como texto**: si se
 * imprimía en una impresora normal (no Zebra), la etiqueta salía sin barras y
 * el lector del mostrador no tenía nada que leer. Acá se generan las barras de
 * verdad, sin depender de ninguna librería de imagen.
 *
 * Devolvemos la lista de anchos de los módulos (barra, espacio, barra, …),
 * empezando siempre por barra. Quien dibuja solo tiene que recorrerla pintando
 * un rectángulo por cada barra. El lector lee el mismo valor sin importar si el
 * símbolo lo generó esta función, JsBarcode o la impresora Zebra.
 */

/** Patrones de anchura de cada símbolo Code 128 (índices 0..106). */
// prettier-ignore
const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312',
  '132212','221213','221312','231212','112232','122132','122231','113222',
  '123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321',
  '232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321',
  '331121','312113','312311','332111','314111','221411','431111','111224',
  '111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112',
  '421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412',
  '211214','211232','2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Convierte el valor a la lista de anchos de módulo del símbolo Code 128-B.
 *
 * Solo se usan caracteres ASCII imprimibles (32..126), que es lo único que
 * traen nuestros códigos (dígitos). Un carácter fuera de rango se ignora en
 * vez de romper el símbolo.
 */
export function code128Widths(value: string): number[] {
  const codes: number[] = [START_B];
  let sum = START_B;
  let position = 1;
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) continue; // fuera de Code 128-B
    const v = c - 32;
    codes.push(v);
    sum += v * position;
    position += 1;
  }
  codes.push(sum % 103); // dígito de control
  codes.push(STOP);

  const widths: number[] = [];
  for (const code of codes) {
    for (const d of PATTERNS[code]) widths.push(Number(d));
  }
  return widths;
}

/** Suma de módulos del símbolo (para calcular el ancho de barra que cabe). */
export function code128ModuleCount(value: string): number {
  return code128Widths(value).reduce((a, b) => a + b, 0);
}
