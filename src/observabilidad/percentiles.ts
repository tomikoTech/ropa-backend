/**
 * La aritmética de «cuánto tarda esto», aparte y probada.
 *
 * El promedio miente: una pantalla que responde en 80 ms nueve veces y en
 * cuatro segundos la décima tiene un promedio de 470 ms, que no se parece a
 * ninguna de las dos experiencias. Quien se queja de lentitud está viviendo la
 * décima, así que lo que hay que mirar es el p95 —lo que sufre uno de cada
 * veinte— y el máximo.
 */

/** El valor por debajo del cual quedan el `p`% de las muestras. */
export function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  // Método del más cercano por rango: sin interpolar, para que el número que
  // se lee sea una medición real y no un promedio de dos.
  const indice = Math.ceil((p / 100) * ordenados.length) - 1;
  return ordenados[Math.min(Math.max(indice, 0), ordenados.length - 1)];
}

export interface ResumenDeRuta {
  veces: number;
  p50: number;
  p95: number;
  max: number;
  /** Milisegundos totales gastados en esta ruta: lo que más rinde arreglar. */
  total: number;
}

export function resumirMuestras(muestras: number[]): ResumenDeRuta {
  return {
    veces: muestras.length,
    p50: percentil(muestras, 50),
    p95: percentil(muestras, 95),
    max: muestras.length ? Math.max(...muestras) : 0,
    total: Math.round(muestras.reduce((suma, ms) => suma + ms, 0)),
  };
}

/**
 * La ruta, sin los identificadores.
 *
 * `/api/pos/sales/9f2c…` y `/api/pos/sales/3a11…` son la misma pantalla: sin
 * agrupar, cada factura sería su propia fila y no se vería nada. Se sustituyen
 * los uuid y los números largos, que es lo que distingue una de otra.
 */
export function rutaSinIdentificadores(ruta: string): string {
  return ruta
    .split('/')
    .map((parte) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parte)) {
        return ':id';
      }
      if (/^\d{4,}$/.test(parte)) return ':codigo';
      return parte;
    })
    .join('/');
}
