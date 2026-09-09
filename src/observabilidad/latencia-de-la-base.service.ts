import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { percentil } from './percentiles.js';

/**
 * Cuánto tarda una consulta trivial en ir y volver de la base.
 *
 * Es el número que decide si una pantalla lenta es culpa del SQL o del camino.
 * Una petición que hace veinte consultas paga veinte veces esta cifra **antes**
 * de que la base haga ningún trabajo: con menos de un milisegundo no se nota,
 * con veinte son cuatrocientos milisegundos regalados.
 *
 * Se mide al arrancar y se deja en el log, que es lo que se puede leer en
 * producción sin credenciales de nadie.
 */
@Injectable()
export class LatenciaDeLaBase implements OnApplicationBootstrap {
  private readonly log = new Logger('LatenciaDeLaBase');

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const { p50, p95, muestras } = await this.medir();
      this.log.log(
        `Ida y vuelta a la base: p50=${p50} ms · p95=${p95} ms ` +
          `(${muestras} consultas triviales). ` +
          'Con más de 5 ms, cada pantalla paga esto por cada consulta que hace.',
      );
    } catch (error) {
      this.log.warn(
        `No se pudo medir la latencia a la base: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** `SELECT 1` unas cuantas veces, ya con la conexión caliente. */
  async medir(veces = 20): Promise<{
    p50: number;
    p95: number;
    muestras: number;
  }> {
    // La primera no cuenta: incluye abrir la conexión y el saludo TLS, que se
    // paga una vez y no por consulta.
    await this.dataSource.query('SELECT 1');

    const tiempos: number[] = [];
    for (let i = 0; i < veces; i++) {
      const empezo = process.hrtime.bigint();
      await this.dataSource.query('SELECT 1');
      tiempos.push(Number(process.hrtime.bigint() - empezo) / 1_000_000);
    }
    return {
      p50: Math.round(percentil(tiempos, 50) * 100) / 100,
      p95: Math.round(percentil(tiempos, 95) * 100) / 100,
      muestras: tiempos.length,
    };
  }
}
