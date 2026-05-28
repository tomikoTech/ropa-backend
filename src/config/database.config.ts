import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const host = configService.get<string>('database.host') || 'localhost';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const sslEnabled =
    configService.get<string>('DB_SSL') === 'true' || !isLocal;

  return {
    type: 'postgres',
    host,
    port: configService.get<number>('database.port'),
    username: configService.get<string>('database.username'),
    password: configService.get<string>('database.password'),
    database: configService.get<string>('database.database'),
    autoLoadEntities: true,
    synchronize: isLocal,
    logging: configService.get<string>('NODE_ENV') === 'development',
    ...(sslEnabled && { ssl: { rejectUnauthorized: false } }),
  };
};
