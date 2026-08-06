import 'dotenv/config';
import { DataSource } from 'typeorm';

// DataSource standalone para el CLI de TypeORM (migration:generate/run/revert).
// La app en runtime usa getDatabaseConfig (TypeOrmModule.forRootAsync); este
// archivo solo lo consume el CLI. Lee la misma config por variables de entorno.
const host = process.env.DB_HOST || 'localhost';
const isLocal = host === 'localhost' || host === '127.0.0.1';
const sslEnabled = process.env.DB_SSL === 'true' || !isLocal;

export const AppDataSource = new DataSource({
  type: 'postgres',
  host,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME || 'dylanbc1',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'ropa_pos',
  // Globs relativos a este archivo (src/config en ts-node, dist/config compilado).
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
  migrations: [__dirname + '/../migrations/*.{js,ts}'],
  ...(sslEnabled && { ssl: { rejectUnauthorized: false } }),
});
