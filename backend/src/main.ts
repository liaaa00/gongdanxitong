import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { traceIdMiddleware } from './common/middleware/trace-id.middleware';
import { AppConfig } from './config/configuration';
import { buildCorsOptions } from './config/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Keep portal JSON uploads below the Nginx 50 MB request limit.
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '50mb' });

  app.setGlobalPrefix('api');
  // CORS 白名单（治理计划 2-6 / G7）：允许本机与局域网来源，来源与端口口径由
  // config/env.ps1 通过环境变量注入，不硬编码单一 IP。见 src/config/cors.ts。
  app.enableCors(buildCorsOptions());

  app.use(traceIdMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const configService = app.get(ConfigService<AppConfig, true>);
  const port = configService.get<number>('app.port', { infer: true });
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen(port, host);
}

void bootstrap();
