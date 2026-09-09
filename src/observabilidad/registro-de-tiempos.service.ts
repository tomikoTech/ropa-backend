import { Injectable } from '@nestjs/common';
import { resumirMuestras, type ResumenDeRuta } from './percentiles.js';

/**
 * Cuánto tarda cada pantalla, medido en el propio servidor.
 *
 * «A veces se demora cuatro o cinco segundos» no se arregla adivinando: hay
 * que saber **qué** tarda. Sin esto, la única forma de mirarlo en producción
 * era reproducirlo a mano y con suerte.
 *
 * Vive en memoria y acotado —las últimas doscientas mediciones de cada ruta—
 * porque el objetivo es contestar «¿dónde se va el tiempo hoy?», no guardar
 * historia: para eso está el reinicio, que además permite medir un antes y un
 * después sin esperar a que las muestras viejas se diluyan.
 */
const MUESTRAS_POR_RUTA = 200;
const RUTAS_MAXIMAS = 300;

export interface FilaDeTiempos extends ResumenDeRuta {
  ruta: string;
}

@Injectable()
export class RegistroDeTiempos {
  private readonly muestras = new Map<string, number[]>();
  private desde = new Date();

  anotar(clave: string, ms: number): void {
    let lista = this.muestras.get(clave);
    if (!lista) {
      // Un tope de rutas: un cliente que invente rutas no puede hacer crecer
      // esto sin fin.
      if (this.muestras.size >= RUTAS_MAXIMAS) return;
      lista = [];
      this.muestras.set(clave, lista);
    }
    lista.push(ms);
    if (lista.length > MUESTRAS_POR_RUTA) lista.shift();
  }

  /**
   * El resumen, **ordenado por tiempo total**: la ruta que más suma es la que
   * más rinde arreglar, aunque cada llamada suya sea rápida. Una que tarda 80
   * ms pero se llama mil veces pesa más que una de dos segundos que se llama
   * una vez.
   */
  resumen(): { desde: Date; rutas: FilaDeTiempos[] } {
    const rutas = [...this.muestras.entries()]
      .map(([ruta, lista]) => ({ ruta, ...resumirMuestras(lista) }))
      .sort((a, b) => b.total - a.total);
    return { desde: this.desde, rutas };
  }

  reiniciar(): void {
    this.muestras.clear();
    this.desde = new Date();
  }
}
