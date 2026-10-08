// src/seed.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SeederService } from './seeder/seeder.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule);

  const logger = new Logger('Bootstrap');
  const seeder = appContext.get(SeederService);

  // Verifica se passamos um argumento para a tarefa
  const args = process.argv.slice(2);
  const task = args.find((arg) => arg.startsWith('--task='))?.split('=')[1];

  try {
      if (task === 'cleanup') {
      await seeder.cleanupClients();
    } else if (task === 'backfill') {
      await seeder.backfillLucroPercentual();
    } else if (task === 'validate') {
      await seeder.validatePerformanceCalculation();
    } else if (task === 'deleteFluxos') {
      await seeder.deleteAllAportesResgates();
    } else {
      await seeder.seed();
    }
  } catch (error) {
    logger.error(
      `Falha ao executar a tarefa '${task || 'seed'}'!`,
      error.stack,
    );
  } finally {
    await appContext.close();
  }
}

bootstrap();
