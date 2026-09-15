/**
 * Los filtros del mostrador —talla, marca, género— se resuelven en el servidor.
 *
 * Los chips del punto de venta se armaban con lo que **ya estaba cargado en
 * pantalla**: la primera página del catálogo, treinta referencias ordenadas
 * por existencias. La talla 37 vive en las referencias de dama, que tienen
 * pocos pares y caen al final: no estaba en la página y por eso no había chip
 * «37», y las marcas salían a medias. AMAWAD lo reportó como «no aparecen las
 * tallas ni las marcas». Y aunque el chip hubiera estado, filtrar la página
 * cargada habría escondido las referencias de las páginas siguientes.
 *
 * Acá vive lo que no necesita base de datos: cómo llegan los filtros por la
 * URL y cómo se limpian.
 */

export interface FiltrosDelMostrador {
  tallas: string[];
  marcas: string[];
  generos: string[];
}

/** «37,40, 41» → ['37', '40', '41']: sin vacíos ni repetidos, con espacios fuera. */
export function listaDelParametro(valor: string | undefined): string[] {
  if (!valor) return [];
  return [
    ...new Set(
      valor
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}

export function filtrosDeLaConsulta(query: {
  talla?: string;
  marca?: string;
  genero?: string;
}): FiltrosDelMostrador {
  return {
    tallas: listaDelParametro(query.talla),
    marcas: listaDelParametro(query.marca),
    // El género se guarda en mayúsculas (HOMBRE, MUJER, UNISEX).
    generos: listaDelParametro(query.genero).map((g) => g.toUpperCase()),
  };
}

export function hayFiltros(f: FiltrosDelMostrador | undefined): boolean {
  return (
    !!f && (f.tallas.length > 0 || f.marcas.length > 0 || f.generos.length > 0)
  );
}
