// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module'; // Importe aqui
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import { FundOperationsModule } from './fund-operations/fund-operations.module';
import { ClientsModule } from './clients/clients.module';
import { ClientTransactionsModule } from './client-transactions/client-transactions.module';
import { PerformanceModule } from './performance/performance.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { CdiModule } from './cdi/cdi.module';
import { SeederModule } from './seeder/seeder.module';
import { IbovespaModule } from './ibovespa/ibovespa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ], // Adicione aqui
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
