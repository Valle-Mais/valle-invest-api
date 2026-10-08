import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita a validação automática para todos os DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Adicione esta opção
    }),
  );

  // --- CONFIGURAÇÃO DE CORS PARA PRODUÇÃO ---

  // 1. Lê as URLs permitidas a partir de uma variável de ambiente.
  // Em produção, você definirá FRONTEND_URLS="https://www.seusite.com"
  // Em desenvolvimento, ele usará o valor padrão 'http://localhost:4200'.
  const allowedOrigins = process.env.FRONTEND_URLS?.split(',') || [
    'http://localhost:4200',
  ];

  // 2. Habilita o CORS com a lista de origens permitidas.
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,OPTIONS,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
