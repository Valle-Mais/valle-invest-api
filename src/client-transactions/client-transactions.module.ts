/* eslint-disable prettier/prettier */
import { forwardRef, Module } from '@nestjs/common';
import { ClientTransactionsService } from './client-transactions.service';
import { ClientTransactionsController } from './client-transactions.controller';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { ClientsModule } from 'src/clients/clients.module';
import { FundOperationsModule } from 'src/fund-operations/fund-operations.module';

@Module({
  imports: [FirebaseModule,
     forwardRef(() => ClientsModule),
     forwardRef(() => FundOperationsModule)
  ],
  controllers: [ClientTransactionsController],
  providers: [ClientTransactionsService],
  exports: [ClientTransactionsService], 
})
export class ClientTransactionsModule {}