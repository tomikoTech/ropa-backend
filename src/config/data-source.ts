import 'dotenv/config';
import { DataSource } from 'typeorm';
import { esHostLocal } from '../common/utils/host-local.js';

// DataSource standalone para el CLI de TypeORM (migration:generate/run/revert).
// La app en runtime usa getDatabaseConfig (TypeOrmModule.forRootAsync); este
// archivo solo lo consume el CLI. Lee la misma config por variables de entorno.
const host = process.env.DB_HOST || 'localhost';
const databaseUrl =
  process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || undefined;
const isLocal = esHostLocal(host, databaseUrl);
// `DB_SSL=false` manda: sin esto no había forma de apagar SSL a mano, y contra
// un Postgres local sin TLS la conexión moría con "server does not support SSL".
const sslEnabled =
  process.env.DB_SSL === 'false'
    ? false
    : process.env.DB_SSL === 'true' || !isLocal;

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host,
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME || 'dylanbc1',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'ropa_pos',
      }),
  // Globs relativos a este archivo (src/config en ts-node, dist/config compilado).
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
  migrations: [__dirname + '/../migrations/*.{js,ts}'],
  ...(sslEnabled && { ssl: { rejectUnauthorized: false } }),
});
