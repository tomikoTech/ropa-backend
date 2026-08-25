/**
 * Ponerle caché a las fotos que ya estaban.
 *
 * Cada foto que se sube hoy sale con `Cache-Control: public, max-age=1 año,
 * immutable`, y con la URL única que hace eso seguro. Pero las **migradas**
 * —las que venían de Supabase— se subieron sin ese encabezado, y sin él el
 * navegador vuelve a preguntar por cada una en cada visita: no se descarga
 * otra vez, pero es un viaje de ida y vuelta por foto, en un catálogo de
 * treinta.
 *
 * No se vuelve a subir el contenido: se copia el objeto sobre sí mismo
 * reemplazando solo los metadatos. Ni un byte de imagen viaja.
 *
 * Por defecto **no escribe nada**: cuenta cuántas están sin caché.
 *
 *     MODE=apply node dist/seeds/cachear-imagenes-r2.js
 */
import 'dotenv/config';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

const CACHE = 'public, max-age=31536000, immutable';

function cliente(): { s3: S3Client; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Faltan las variables de R2 (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).',
    );
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

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const { s3, bucket } = cliente();

  let token: string | undefined;
  let total = 0;
  let yaTenian = 0;
  let arreglados = 0;
  const fallos: string[] = [];

  do {
    const pagina = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
      }),
    );
    token = pagina.NextContinuationToken;

    for (const objeto of pagina.Contents ?? []) {
      const Key = objeto.Key;
      if (!Key) continue;
      total += 1;

      const cabeza = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key }),
      );
      if (cabeza.CacheControl) {
        yaTenian += 1;
        continue;
      }
      if (!aplicar) {
        arreglados += 1;
        continue;
      }
      try {
        await s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key,
            CopySource: `${bucket}/${encodeURIComponent(Key)}`,
            // Solo los metadatos: el contenido no se toca.
            MetadataDirective: 'REPLACE',
            CacheControl: CACHE,
            // Se conserva, porque REPLACE lo borraria y las fotos dejarian de
            // servirse como imagen.
            ContentType: cabeza.ContentType,
          }),
        );
        arreglados += 1;
      } catch (e) {
        fallos.push(`${Key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } while (token);

  console.log(`Archivos en el bucket:   ${total}`);
  console.log(`Ya tenian cache:         ${yaTenian}`);
  console.log(
    aplicar
      ? `Arreglados:              ${arreglados}`
      : `Sin cache (se arreglarian): ${arreglados}`,
  );
  if (fallos.length) {
    console.log(`\nFallaron ${fallos.length}:`);
    for (const f of fallos.slice(0, 10)) console.log(`  ${f}`);
  }
  if (!aplicar && arreglados > 0) {
    console.log('\nENSAYO: no se escribio nada. Para aplicarlo:');
    console.log('  MODE=apply node dist/seeds/cachear-imagenes-r2.js');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
