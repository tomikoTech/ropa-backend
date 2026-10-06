/**
 * Qué texto quedó en cada hoja de un PDF **sin comprimir** de pdfkit.
 *
 * Solo para pruebas: no se puede mirar un PDF en una prueba, pero sí leer
 * sus flujos de contenido (uno por hoja, en orden) y sacar lo que escribió
 * `text()`. Las fuentes estándar van en WinAnsi, que para lo nuestro es
 * latin1. Nació porque la factura salía con el TOTAL en otra hoja y nadie
 * lo vio hasta que Andrea mandó la foto.
 */
export function textoPorPagina(pdf: Buffer): string[] {
  const crudo = pdf.toString('latin1');
  const hojas: string[] = [];
  const flujos = crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);
  for (const [, flujo] of flujos) {
    if (!flujo.includes('BT')) continue;
    const partes: string[] = [];
    // Una palabra con kerning («TOTAL») va en un arreglo `[<54> -20 <4F>] TJ`:
    // los pedazos de un mismo arreglo se pegan, los de distintos `text()` no.
    for (const [, arreglo] of flujo.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const hexes = [...arreglo.matchAll(/<([0-9a-fA-F]+)>/g)].map(([, h]) =>
        Buffer.from(h, 'hex').toString('latin1'),
      );
      partes.push(hexes.join(''));
    }
    for (const [, hex] of flujo.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      partes.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
    hojas.push(partes.join(' '));
  }
  return hojas;
}
