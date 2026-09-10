/**
 * Distribución (layout) de la etiqueta, **pura** y en milímetros.
 *
 * Aquí se decide dónde va cada cosa y de qué tamaño, garantizando que **todo
 * cabe dentro del sticker** con un margen de seguridad — así el borde de arriba
 * no se corta (fue lo que le pasó al cliente: el contenido pegado al borde y la
 * térmica no imprime el primer/último milímetro).
 *
 * Dos formatos según el tipo:
 *  - **Par** (rectángulo): la **talla en grande** es lo que más se ve.
 *  - **Caja** (más cuadrada): el realce "CAJA x24" es lo que más se ve.
 *
 * Sin PDF ni ZPL: solo geometría, para poder probarla sin impresora.
 */

export interface LayoutInput {
  widthMm: number;
  heightMm: number;
  isBox: boolean;
  hasLogo: boolean;
}

export interface Caja {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  /** Tamaño de fuente sugerido (mm) para el texto de esa zona. */
  fontMm: number;
}

export interface LabelLayout {
  marginMm: number;
  /** Marco (borde) de la etiqueta. */
  marco: Caja;
  logo: Caja | null;
  nombre: Caja;
  marca: Caja;
  barcode: Caja;
  /** Dígitos del código, debajo del símbolo. */
  digitos: Caja;
  /** Zona destacada: talla grande (par) o "CAJA x24" (caja). */
  destacado: Caja;
  /** Pie: detalle · desglose. */
  pie: Caja;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export function computeLabelLayout(input: LayoutInput): LabelLayout {
  const { widthMm: W, heightMm: H, isBox, hasLogo } = input;

  // Margen seguro: la térmica no imprime bien el borde. Escala con el tamaño
  // pero nunca baja de ~1.2 mm ni pasa de 2.5 mm.
  const margin = clamp(Math.min(W, H) * 0.05, 1.2, 2.5);

  const innerX = margin;
  const innerY = margin;
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;

  // Pesos verticales de cada fila (suman 1). El par le da MUCHo a la talla;
  // la caja reparte más parejo y engorda el realce.
  const pesos = isBox
    ? { header: 0.2, barcode: 0.3, digitos: 0.12, destacado: 0.22, pie: 0.16 }
    : { header: 0.2, barcode: 0.28, digitos: 0.1, destacado: 0.28, pie: 0.14 };

  const hHeader = innerH * pesos.header;
  const hBarcode = innerH * pesos.barcode;
  const hDigitos = innerH * pesos.digitos;
  const hDestacado = innerH * pesos.destacado;
  const hPie = innerH * pesos.pie;

  let y = innerY;

  // Encabezado: logo a la izquierda (cuadrado del alto de la fila) y a su
  // derecha el nombre; la marca va en una segunda mini-línea dentro del header.
  const logoLado = hasLogo ? Math.min(hHeader, innerW * 0.22) : 0;
  const logo: Caja | null = hasLogo
    ? { xMm: innerX, yMm: y, wMm: logoLado, hMm: logoLado, fontMm: 0 }
    : null;
  const textX = innerX + (hasLogo ? logoLado + margin * 0.6 : 0);
  const textW = W - margin - textX;

  const nombre: Caja = {
    xMm: textX,
    yMm: y,
    wMm: textW,
    hMm: hHeader * 0.6,
    fontMm: clamp(hHeader * 0.55, 2.2, 4.2),
  };
  const marca: Caja = {
    xMm: textX,
    yMm: y + hHeader * 0.62,
    wMm: textW,
    hMm: hHeader * 0.38,
    fontMm: clamp(hHeader * 0.32, 1.8, 3),
  };
  y += hHeader;

  const barcode: Caja = {
    xMm: innerX,
    yMm: y,
    wMm: innerW,
    hMm: hBarcode,
    fontMm: 0,
  };
  y += hBarcode;

  const digitos: Caja = {
    xMm: innerX,
    yMm: y,
    wMm: innerW,
    hMm: hDigitos,
    fontMm: clamp(hDigitos * 0.85, 1.8, 3),
  };
  y += hDigitos;

  // El destacado: en el par la talla enorme (fuente casi de toda la fila);
  // en la caja el "CAJA x24" en negrita, algo más chico porque es texto.
  const destacado: Caja = {
    xMm: innerX,
    yMm: y,
    wMm: innerW,
    hMm: hDestacado,
    fontMm: isBox
      ? clamp(hDestacado * 0.55, 2.6, 5)
      : clamp(hDestacado * 0.9, 4, 14),
  };
  y += hDestacado;

  const pie: Caja = {
    xMm: innerX,
    yMm: y,
    wMm: innerW,
    hMm: hPie,
    fontMm: clamp(hPie * 0.7, 1.8, 2.8),
  };

  // **En la caja, el pedido va arriba y el producto abajo.**
  //
  // Llega la importación, hay cuarenta cajas apiladas y lo que se busca es el
  // embarque: el rótulo tiene que leerse de lejos, en el primer renglón, sin
  // agacharse a mirar el resto. El nombre del producto se queda con el puesto
  // que ocupaba el pedido —sigue estando, pero no es lo que se busca primero—.
  //
  // Se intercambian los **recuadros**, no los textos: quien dibuja (PDF y ZPL)
  // sigue pidiendo `lay.nombre` para el nombre y `lay.destacado` para el
  // rótulo, y no tiene que enterarse. Y los dos van del **mismo tamaño de
  // letra**: son las dos cosas que se leen de lejos, ninguna manda sobre la
  // otra.
  if (isBox) {
    const letra = Math.min(nombre.fontMm, destacado.fontMm);
    return {
      marginMm: margin,
      marco: { xMm: margin * 0.4, yMm: margin * 0.4, wMm: W - margin * 0.8, hMm: H - margin * 0.8, fontMm: 0 },
      logo,
      nombre: { ...destacado, fontMm: letra },
      marca,
      barcode,
      digitos,
      destacado: { ...nombre, fontMm: letra },
      pie,
    };
  }

  return {
    marginMm: margin,
    marco: { xMm: margin * 0.4, yMm: margin * 0.4, wMm: W - margin * 0.8, hMm: H - margin * 0.8, fontMm: 0 },
    logo,
    nombre,
    marca,
    barcode,
    digitos,
    destacado,
    pie,
  };
}
