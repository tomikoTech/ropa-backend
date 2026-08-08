/**
 * Smoke de reportes: corre TODOS los reportes, en TODOS sus modos, para TODOS
 * los tenants de la base a la que apunte, e imprime cuántas filas devolvió cada
 * uno y cuánto tardó.
 *
 * Para qué: un reporte con un JOIN mal puesto no falla, devuelve **cero filas**.
 * Un test que solo comprueba la forma de la respuesta pasa igual. Esto se corre
 * contra una base con datos de verdad para ver que los números aparecen.
 *
 *   npm run build
 *   DB_HOST=localhost DB_PORT=5432 DB_USERNAME=dylanbc1 DB_PASSWORD= \
 *     DB_DATABASE=ropa_pos node dist/seeds/smoke-reports.js
 *
 * ⚠️ Hay que pasar TODAS las variables de conexión: `.env` apunta a la base de
 * **producción**, así que cambiar solo `DB_DATABASE` intenta conectarse allá.
 *
 * Solo lee. No escribe nada (pero al levantar el AppModule contra localhost,
 * TypeORM sincroniza el esquema, igual que `npm run start:dev`).
 */

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { ReportEngineService } from '../reports/report-engine.service.js';
import { REPORT_DEFINITIONS } from '../reports/engine/report-catalog.js';

/** Cada reporte con la lista de variantes que hay que recorrer. */
const COMBOS: Record<string, Record<string, string>[]> = {
  inventario: [
    'variante',
    'producto',
    'bodega',
    'categoria',
    'marca',
    'ubicacion',
  ].map((groupBy) => ({ groupBy })),
  valorizacion: ['existencias', 'ingresos'].map((mode) => ({ mode })),
  utilidad: [
    'linea',
    'venta',
    'dia',
    'vendedor',
    'producto',
    'categoria',
    'marca',
    'bodega',
  ].map((groupBy) => ({ groupBy })),
  'control-precios': ['debajo', 'encima', 'perdida', 'descuentos'].flatMap(
    (mode) => [
      { mode, reference: 'base' },
      { mode, reference: 'mayorista' },
    ],
  ),
  cartera: ['cobrar', 'pagar', 'bancos'].map((mode) => ({ mode })),
  movimientos: [
    'ajustes',
    'traslados',
    'devoluciones',
    'conteos',
    'consignaciones',
    'bonos',
  ].map((mode) => ({ mode })),
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const engine = app.get(ReportEngineService);
  const dataSource = app.get(DataSource);

  const tenants: { id: string; name: string }[] = await dataSource.query(
    'SELECT id, name FROM tenants ORDER BY name',
  );
  console.log(`Tenants: ${tenants.length}\n`);

  // Ventana amplia a propósito: se quiere ver si HAY datos, no medir un mes.
  const range = { from: '2020-01-01', to: '2030-12-31' };

  let vacios = 0;
  let total = 0;
  let errores = 0;

  for (const tenant of tenants) {
    console.log(`━━ ${tenant.name}`);
    for (const def of REPORT_DEFINITIONS) {
      for (const combo of COMBOS[def.key] ?? [{}]) {
        const etiqueta = `${def.key}${
          Object.keys(combo).length
            ? ` (${Object.values(combo).join('/')})`
            : ''
        }`;
        const started = process.hrtime.bigint();
        total += 1;
        try {
          const result = await engine.run(
            def.key,
            { ...range, ...combo },
            tenant.id,
          );
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          if (result.rows.length === 0) vacios += 1;
          const avisos = result.warnings?.length
            ? ` · ${result.warnings.length} aviso(s)`
            : '';
          console.log(
            `   ${result.rows.length === 0 ? '·' : '✓'} ${etiqueta.padEnd(38)}` +
              `${String(result.rows.length).padStart(6)} filas` +
              `${ms.toFixed(0).padStart(6)} ms${avisos}`,
          );
        } catch (error) {
          errores += 1;
          console.log(
            `   ✗ ${etiqueta.padEnd(38)} ERROR: ${(error as Error).message}`,
          );
        }
      }
    }
    console.log('');
  }

  console.log(
    `Consultas: ${total} · vacías: ${vacios} · con error: ${errores}`,
  );
  await app.close();
  process.exit(errores > 0 ? 1 : 0);
}

void main();
