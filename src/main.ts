import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
