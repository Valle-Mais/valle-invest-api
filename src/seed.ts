// src/seed.ts
//
// Tarefas de manutenção. Uso: npm run seed -- --task=<nome>
//   cleanup      remove clientes de teste
//   backfill     recalcula lucroPercentual
//   validate     valida o cálculo de performance
//   deleteFluxos apaga aportes e resgates
//   invite-all   migração para login com senha: convida todos os usuários
//   (sem task)   popula o banco com dados de exemplo

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { SeederService } from './seeder/seeder.service';
import { AuthService } from './auth/auth.service';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule);

  const logger = new Logger('Bootstrap');
  const seeder = appContext.get(SeederService);

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
    } else if (task === 'invite-all') {
      const auth = appContext.get(AuthService, { strict: false });
      const result = await auth.inviteAll();
      logger.log(`Convites: ${result.sent}/${result.total} enviados.`);
      if (result.failed.length) {
        logger.warn(`Falharam: ${result.failed.join(', ')}`);
      }
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
