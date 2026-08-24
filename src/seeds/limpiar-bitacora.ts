/**
 * Borra de la bitácora lo que nunca debió entrar.
 *
 * El interceptor guardaba el cuerpo entero de cada petición. En producción eso
 * dejó, durante cinco meses: contraseñas en texto plano, tokens de sesión, los
 * secretos de la pasarela de pagos, el token de WhatsApp, y 90 MB de fotos de
 * productos en base64 —duplicadas de las que ya viven en R2—.
 *
 * El interceptor ya no las escribe (`limpiar-para-auditoria.ts`). Esto limpia
 * lo que quedó.
 *
 * **Conserva el registro.** No borra filas: la bitácora sigue diciendo quién
 * hizo qué y cuándo, que es para lo que existe. Lo que se va es el **valor**
 * de los campos sensibles, que se reemplaza por la misma marca que pone el
 * interceptor de ahora en adelante. Así una fila vieja y una nueva se leen
 * igual.
 *
 * Por defecto **no toca nada**: enseña lo que haría. Para aplicarlo hay que
 * pedirlo con nombre y apellido:
 *
 *     MODE=apply CONFIRM=limpiar-bitacora node dist/seeds/limpiar-bitacora.js
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda.
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { limpiarParaAuditoria } from '../audit/limpiar-para-auditoria.js';

interface Fila {
  id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

/** Cuántas filas se traen por vuelta: la tabla tiene payloads de casi 1 MB. */
const POR_TANDA = 200;

async function main() {
  const aplicar = process.env.MODE === 'apply';
  if (aplicar && process.env.CONFIRM !== 'limpiar-bitacora') {
    throw new Error(
      'Operación bloqueada: falta CONFIRM=limpiar-bitacora. Esto reescribe filas de auditoría.',
    );
  }

  await AppDataSource.initialize();
  try {
    const antes = await AppDataSource.query(
      `SELECT pg_size_pretty(pg_total_relation_size('audit_logs')) AS tamano,
              count(*)::int AS filas
         FROM audit_logs`,
    );
    console.log(
      `Bitácora: ${antes[0].filas} filas, ${antes[0].tamano} antes de empezar.`,
    );

    let revisadas = 0;
    let cambiadas = 0;
    let bytesAntes = 0;
    let bytesDespues = 0;
    let desde = '00000000-0000-0000-0000-000000000000';

    for (;;) {
      const filas = await AppDataSource.query(
        `SELECT id, old_values, new_values
           FROM audit_logs
          WHERE id > $1
          ORDER BY id
          LIMIT $2`,
        [desde, POR_TANDA],
      );
      if (filas.length === 0) break;
      desde = filas[filas.length - 1].id;

      for (const fila of filas) {
        revisadas++;
        const limpioNuevo = limpiarParaAuditoria(fila.new_values);
        const limpioViejo = limpiarParaAuditoria(fila.old_values);
        const originalN = JSON.stringify(fila.new_values ?? null);
        const originalV = JSON.stringify(fila.old_values ?? null);
        const finalN = JSON.stringify(limpioNuevo ?? null);
        const finalV = JSON.stringify(limpioViejo ?? null);
        if (originalN === finalN && originalV === finalV) continue;

        cambiadas++;
        bytesAntes += originalN.length + originalV.length;
        bytesDespues += finalN.length + finalV.length;

        if (aplicar) {
          await AppDataSource.query(
            `UPDATE audit_logs SET new_values = $2, old_values = $3 WHERE id = $1`,
            [fila.id, limpioNuevo ?? null, limpioViejo ?? null],
          );
        }
      }
      process.stdout.write(`  … ${revisadas} filas revisadas\r`);
    }

    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    console.log('');
    console.log(`Revisadas:  ${revisadas}`);
    console.log(`A limpiar:  ${cambiadas}`);
    console.log(`Payload:    ${mb(bytesAntes)} → ${mb(bytesDespues)}`);

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para aplicarlo:');
      console.log(
        '  MODE=apply CONFIRM=limpiar-bitacora node dist/seeds/limpiar-bitacora.js',
      );
      return;
    }

    // El espacio no se devuelve solo: Postgres marca las versiones viejas como
    // muertas y las reusa. `VACUUM FULL` lo devuelve al disco, pero bloquea la
    // tabla, así que se pide aparte y a conciencia.
    console.log('\nListo. Para devolver el espacio al disco:');
    console.log(
      '  VACUUM FULL audit_logs;   -- bloquea la tabla mientras corre',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
