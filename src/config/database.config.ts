import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { esHostLocal } from '../common/utils/host-local.js';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const host = configService.get<string>('database.host') || 'localhost';
  const isLocal = esHostLocal(host);
  const dbSsl = configService.get<string>('DB_SSL');
  // `DB_SSL=false` manda: contra un Postgres sin TLS, forzar SSL tumba el arranque.
  const sslEnabled = dbSsl === 'false' ? false : dbSsl === 'true' || !isLocal;

  return {
    type: 'postgres',
    host,
    port: configService.get<number>('database.port'),
    username: configService.get<string>('database.username'),
    password: configService.get<string>('database.password'),
    database: configService.get<string>('database.database'),
    autoLoadEntities: true,
    // Local: auto-sincroniza el esquema (dev rápido). Prod: no sincroniza y
    // corre las migraciones pendientes automáticamente al bootear (Railway).
    synchronize: isLocal,
    migrations: [__dirname + '/../migrations/*.{js,ts}'],
    migrationsRun: !isLocal,
    logging: configService.get<string>('NODE_ENV') === 'development',
    ...(sslEnabled && { ssl: { rejectUnauthorized: false } }),
  };
};
