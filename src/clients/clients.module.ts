/* eslint-disable prettier/prettier */
import { forwardRef, Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { ClientTransactionsModule } from 'src/client-transactions/client-transactions.module';

@Module({
  imports: [FirebaseModule,   forwardRef(() => ClientTransactionsModule) // Use forwardRef aqui
],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}