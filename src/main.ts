import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor.js';
import { revisarSecretos } from './config/revisar-secretos.js';
import { esHostLocal } from './common/utils/host-local.js';

async function bootstrap() {
  // Antes de levantar nada: si esto es producción y los secretos de firma son
  // débiles o son el default del repositorio, no se arranca. Un backend que
  // firma con un secreto público deja entrar a cualquiera con el `sub` del
  // admin; es preferible caerse ruidosamente a servir así.
  const esProduccion = !esHostLocal(
    process.env.DB_HOST,
    process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL,
  );
  const revision = revisarSecretos(process.env, esProduccion);
  for (const aviso of revision.advertencias) console.warn(`⚠️  ${aviso}`);
  if (!revision.ok) {
    console.error('No se puede arrancar: los secretos de firma no son válidos.');
    for (const err of revision.errores) console.error(`  • ${err}`);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás del proxy de Railway, `req.ip` sería siempre la del proxy y el
  // límite por IP contaría a todo el mundo como uno solo. Con esto Express lee
  // la IP real del `X-Forwarded-For`. Un solo salto de proxy: el de Railway.
  app.set('trust proxy', 1);

  // Serve uploaded files test
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Límite de body a 20MB: los productos del agente Canario llegan con fotos
  // en base64 dentro del JSON (images_base64), que superan el default ~100KB.
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));

  app.setGlobalPrefix('api');

  // Orígenes permitidos por CORS. Lista fija + cualquier subdominio de
  // mipinta.shop (dashboard.mipinta.shop, tienda.mipinta.shop, etc. — así
  // agregar un dominio nuevo no requiere tocar código) + override por env
  // CORS_ORIGINS (lista separada por comas) para casos puntuales.
  const staticOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://ecommerce-frontend-production-964f.up.railway.app',
    'https://ropa-frontend-production.up.railway.app',
    'https://mipintapos.up.railway.app',
  ];
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = [...staticOrigins, ...envOrigins];
  // Apex y cualquier subdominio de mipinta.shop, solo https.
  const mipintaShopRegex = /^https:\/\/([a-z0-9-]+\.)*mipinta\.shop$/i;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Peticiones sin Origin (curl, health checks, apps móviles) se permiten.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || mipintaShopRegex.test(origin)) {
        return callback(null, true);
      }
      // Denegar sin lanzar: el navegador bloquea igual, pero evitamos un 500
      // (y ruido en logs) por cada origen desconocido (bots, escáneres, etc.).
      return callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('MiPinta API')
    .setDescription('Sistema POS + E-commerce para tiendas de ropa - Colombia')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
