import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Atrás do proxy da Vercel, o IP real vem em X-Forwarded-For.
  // Necessário para o rate limit por IP funcionar.
  app.set('trust proxy', 1);

  // Validação automática de todos os DTOs.
  // whitelist + forbidNonWhitelisted: campos fora do DTO viram 400,
  // em vez de chegarem ao serviço.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS: em produção, FRONTEND_URLS="https://app.exemplo.com,https://outro.com".
  const allowedOrigins = process.env.FRONTEND_URLS?.split(',').map((o) =>
    o.trim(),
  ) || ['http://localhost:4200'];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,OPTIONS,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
