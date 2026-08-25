/**
 * Reconvertir a WebP las fotos que se subieron antes de la optimizacion.
 *
 * Cada foto que entra hoy sale en WebP a 1400 px. Las de antes entraron tal
 * cual: JPEG y PNG que pesan tres o cuatro veces lo que deberian. No es un
 * problema de almacenamiento —eso son centavos— sino de quien mira desde el
 * telefono, que descarga todo eso con datos moviles.
 *
 * **No se toca la base de datos.** La foto optimizada se sube con la **misma
 * clave**, cambiando el `Content-Type`: el navegador dibuja por el tipo, no
 * por la extension del nombre. Asi ninguna de las doce columnas que guardan
 * URLs de imagen —en nueve tablas— necesita cambiar, que es justo donde se
 * rompen las cosas.
 *
 * El original se copia antes a `originales/`, del lado del servidor y sin
 * descargarlo: si algo sale mal, esta ahi.
 *
 * Por defecto **no escribe nada**: dice cuanto se ahorraria.
 *
 *     MODE=apply node dist/seeds/reoptimizar-imagenes-r2.js
 *
 * `LIMITE` procesa solo unas cuantas, para probar con calma.
 */
import 'dotenv/config';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { optimizarImagen } from '../uploads/optimizar-imagen.js';

const CACHE = 'public, max-age=31536000, immutable';
const RESPALDO = 'originales/';

/** Lo que se puede recomprimir sin estropearlo. El gif suele ser animado. */
const RECONVERTIBLES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

function cliente(): { s3: S3Client; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Faltan las variables de R2.');
  }
  return {
    s3: new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

const enMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const limite = process.env.LIMITE ? Number(process.env.LIMITE) : Infinity;
  const { s3, bucket } = cliente();

  let token: string | undefined;
  let vistos = 0;
  let convertidas = 0;
  let antes = 0;
  let despues = 0;
  const saltadas = new Map<string, number>();
  const fallos: string[] = [];
  const anotar = (motivo: string) =>
    saltadas.set(motivo, (saltadas.get(motivo) ?? 0) + 1);

  do {
    const pagina = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    token = pagina.NextContinuationToken;

    for (const objeto of pagina.Contents ?? []) {
      const Key = objeto.Key;
      if (!Key || convertidas >= limite) continue;
      // Los respaldos no se reconvierten: son el original a proposito.
      if (Key.startsWith(RESPALDO)) continue;
      vistos += 1;

      const cabeza = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key }),
      );
      const tipo = (cabeza.ContentType ?? '').toLowerCase();
      if (!RECONVERTIBLES.has(tipo)) {
        anotar(tipo || 'sin tipo');
        continue;
      }

      try {
        const original = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key }),
        );
        const bytes = Buffer.from(await original.Body!.transformToByteArray());
        const listo = await optimizarImagen(bytes, tipo, 'jpg');
        if (
          listo.mime !== 'image/webp' ||
          listo.buffer.length >= bytes.length
        ) {
          // Si no baja de peso, dejarla como esta: cambiarla por algo igual o
          // mas pesado no tiene sentido.
          anotar('no bajaba de peso');
          continue;
        }

        antes += bytes.length;
        despues += listo.buffer.length;
        convertidas += 1;
        if (!aplicar) continue;

        // El original, a salvo. Copia del lado del servidor: no se descarga.
        await s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: `${RESPALDO}${Key}`,
            CopySource: `${bucket}/${encodeURIComponent(Key)}`,
            MetadataDirective: 'COPY',
          }),
        );
        // Y la nueva bajo la **misma clave**: ninguna URL guardada cambia.
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key,
            Body: listo.buffer,
            ContentType: listo.mime,
            CacheControl: CACHE,
          }),
        );
      } catch (e) {
        fallos.push(`${Key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } while (token && convertidas < limite);

  console.log(`Archivos mirados:   ${vistos}`);
  console.log(`Se reconvierten:    ${convertidas}`);
  if (convertidas > 0) {
    const ahorro = antes - despues;
    console.log(`  pesaban:          ${enMb(antes)}`);
    console.log(`  pesarian:         ${enMb(despues)}`);
    console.log(
      `  se ahorra:        ${enMb(ahorro)} (${Math.round((ahorro / antes) * 100)}%)`,
    );
  }
  if (saltadas.size) {
    console.log('\nSaltadas:');
    for (const [motivo, n] of saltadas) console.log(`  ${motivo}: ${n}`);
  }
  if (fallos.length) {
    console.log(`\nFallaron ${fallos.length}:`);
    for (const f of fallos.slice(0, 10)) console.log(`  ${f}`);
  }
  if (!aplicar && convertidas > 0) {
    console.log('\nENSAYO: no se escribio nada. Para aplicarlo:');
    console.log('  MODE=apply node dist/seeds/reoptimizar-imagenes-r2.js');
    console.log('Probar con unas pocas primero:');
    console.log(
      '  MODE=apply LIMITE=5 node dist/seeds/reoptimizar-imagenes-r2.js',
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
