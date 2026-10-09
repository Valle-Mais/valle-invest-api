import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { HttpModule } from '@nestjs/axios';
import { FirebaseModule } from '../firebase/firebase.module';
import { CdiModule } from 'src/cdi/cdi.module';
import { ClientTransactionsModule } from 'src/client-transactions/client-transactions.module';
import { FundOperationsModule } from 'src/fund-operations/fund-operations.module';
import { ClientsModule } from 'src/clients/clients.module';
import { IbovespaModule } from 'src/ibovespa/ibovespa.module';

@Module({
  imports: [
    HttpModule,
    FirebaseModule,
    ClientTransactionsModule,
    CdiModule,
    FundOperationsModule,
    ClientsModule,
    IbovespaModule,
  ],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
