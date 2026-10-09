// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FundOperationsModule } from './fund-operations/fund-operations.module';
import { ClientsModule } from './clients/clients.module';
import { ClientTransactionsModule } from './client-transactions/client-transactions.module';
import { PerformanceModule } from './performance/performance.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { CdiModule } from './cdi/cdi.module';
import { SeederModule } from './seeder/seeder.module';
import { IbovespaModule } from './ibovespa/ibovespa.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Limite global generoso; /auth/* tem limite próprio via @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    FirebaseModule,
    AuthModule,
    UsersModule,
    FundOperationsModule,
    ClientsModule,
    ClientTransactionsModule,
    PerformanceModule,
    InstrumentsModule,
    CdiModule,
    SeederModule,
    IbovespaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Ordem importa: rate limit antes de autenticar, papel depois de autenticar.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
