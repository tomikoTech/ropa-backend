"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const path_1 = require("path");
const app_module_js_1 = require("./app.module.js");
const http_exception_filter_js_1 = require("./common/filters/http-exception.filter.js");
const transform_response_interceptor_js_1 = require("./common/interceptors/transform-response.interceptor.js");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_js_1.AppModule);
    app.useStaticAssets((0, path_1.join)(process.cwd(), 'uploads'), { prefix: '/uploads/' });
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: ['http://localhost:3001', 'http://localhost:3000'],
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.useGlobalFilters(new http_exception_filter_js_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new transform_response_interceptor_js_1.TransformResponseInterceptor());
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Tomiko Ropa POS API')
        .setDescription('Sistema POS para tiendas de ropa - Colombia')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map