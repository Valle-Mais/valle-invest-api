// Em src/client-transactions/dto/create-client-transaction.dto.ts

import {
  IsDateString,
  IsNotEmpty,
  IsString,
  IsIn,
  IsNumber,
  IsPositive,
} from 'class-validator';

export class CreateClientTransactionDto {
  @IsDateString()
  @IsNotEmpty()
  data: string;

  @IsString()
  clientId: string;

  // ATUALIZE AQUI para incluir 'Rendimento'
  @IsIn(['Aporte', 'Resgate', 'Rendimento'])
  tipo: 'Aporte' | 'Resgate' | 'Rendimento';

  @IsNumber()
  @IsPositive()
  valor: number;
}
