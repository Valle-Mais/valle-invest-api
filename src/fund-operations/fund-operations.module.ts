// -------------------------------------------------------------------
// 6. Module - Agrupa todos os arquivos do recurso
// Arquivo: src/fund-operations/fund-operations.module.ts
// -------------------------------------------------------------------
import { forwardRef, Module } from '@nestjs/common';
import { FundOperationsService } from './fund-operations.service';
import { FundOperationsController } from './fund-operations.controller';
// Importe seu módulo do Firebase aqui
import { FirebaseModule } from '../firebase/firebase.module';
import { ClientTransactionsModule } from 'src/client-transactions/client-transactions.module';
import { ClientsModule } from 'src/clients/clients.module';

@Module({
  imports: [
    FirebaseModule,
    forwardRef(() => ClientTransactionsModule),
    forwardRef(() => ClientsModule),
  ], // Importe o módulo que provê o Firestore
  controllers: [FundOperationsController],
  providers: [FundOperationsService],
  exports: [FundOperationsService],
})
export class FundOperationsModule {}
