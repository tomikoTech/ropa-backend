/**
 * «Busco el código y no sale.»
 *
 * Un bulto que no está disponible desaparece de todas las pantallas: no se
 * escanea, no aparece en la búsqueda de cajas, no se puede vender. Desde el
 * mostrador eso se lee como «el sistema perdió la mercancía» o «el código está
 * malo», y la reacción es volver a escanear diez veces.
 *
 * El sistema siempre sabe dónde está: vendida en tal factura, trasladada a tal
 * bodega, abierta, dada de baja. Callárselo es lo que convierte un dato en un
 * incidente. Este módulo arma la frase —qué le pasó y qué hacer— para que la
 * misma respuesta salga en el punto de venta, en la búsqueda por código y en
 * la pantalla de cajas.
 *
 * Puro y sin base de datos: quien lo llama trae el rastro ya leído.
 */

export interface VentaDelBulto {
  numero: string;
  /** El día, ya en texto legible (`8 de septiembre`). */
  fecha: string;
  cliente?: string | null;
  anulada: boolean;
}

export interface RastroDelBulto {
  codigo: string;
  esCaja: boolean;
  /** El estado tal como lo guarda el inventario. */
  estado: string;
  bodega?: string | null;
  /** La factura que lo reclama, si alguna. */
  venta?: VentaDelBulto | null;
}

/** «La caja 26…19» / «El par 26…19». */
function nombre(rastro: RastroDelBulto): string {
  return `${rastro.esCaja ? 'La caja' : 'El par'} ${rastro.codigo}`;
}

function enLaFactura(venta: VentaDelBulto): string {
  const aQuien = venta.cliente ? ` a ${venta.cliente}` : '';
  return `la factura ${venta.numero} del ${venta.fecha}${aQuien}`;
}

/**
 * Qué le pasó a este código, en una frase, y qué se puede hacer.
 *
 * La segunda parte importa tanto como la primera: «ya fue vendida» deja al
 * cajero con la caja en la mano y sin salida. Con la factura a la vista, la
 * salida es evidente —si esa caja no salió de la tienda, se quita de esa
 * factura y el código queda libre—.
 */
export function dondeEstaElBulto(rastro: RastroDelBulto): string {
  const quien = nombre(rastro);
  const donde = rastro.bodega ? ` en ${rastro.bodega}` : '';

  switch (rastro.estado) {
    case 'IN_STOCK':
      return `${quien} está disponible${donde}.`;

    case 'SOLD': {
      if (!rastro.venta) {
        // Pasa de verdad, y es lo que hay que poder ver: una edición a medias
        // deja el bulto vendido sin factura que lo reclame.
        return (
          `${quien} figura vendida, pero ninguna factura la reclama. ` +
          'Quedó así por una edición a medias: avísale a soporte para liberarla.'
        );
      }
      if (rastro.venta.anulada) {
        return (
          `${quien} estaba en ${enLaFactura(rastro.venta)}, que fue anulada. ` +
          'El código debería estar libre: avísale a soporte para liberarlo.'
        );
      }
      return (
        `${quien} se vendió en ${enLaFactura(rastro.venta)}. ` +
        'Si no salió de la tienda, quítala de esa factura y el código queda libre.'
      );
    }

    case 'SPLIT':
      return (
        `${quien} ya se abrió: sus pares salieron con códigos propios. ` +
        'Escanea el del par, no el de la caja.'
      );

    case 'CONSIGNED':
      return `${quien} está entregada en consignación${donde ? `, desde ${rastro.bodega}` : ''}.`;

    case 'TRANSFERRED':
      return rastro.bodega
        ? `${quien} fue trasladada a ${rastro.bodega}.`
        : `${quien} fue trasladada a otra bodega.`;

    case 'WRITTEN_OFF':
      return `${quien} fue dada de baja.`;

    default:
      return `${quien} no está disponible para la venta (estado: ${rastro.estado}).`;
  }
}

/** Cuando el código no existe en ninguna parte. */
export function noExisteEseCodigo(codigo: string): string {
  return (
    `No hay ningún producto ni caja con el código ${codigo}. ` +
    'Revisa que sea el código impreso completo.'
  );
}
