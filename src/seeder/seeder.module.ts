import { Module } from '@nestjs/common';
import { SeederService } from './seeder.service';
import { ClientTransactionsModule } from 'src/client-transactions/client-transactions.module';
import { ClientsModule } from 'src/clients/clients.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { FundOperationsModule } from 'src/fund-operations/fund-operations.module';
import { PerformanceModule } from 'src/performance/performance.module';

@Module({
  imports: [
    FirebaseModule, // Para acesso direto ao DB, se necessário
    ClientsModule,
    ClientTransactionsModule,
    FundOperationsModule,
    ClientsModule,
    PerformanceModule,
  ],
  providers: [SeederService],
})
export class SeederModule {}
