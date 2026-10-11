import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateClientTransactionDto {
  @IsDateString()
  @IsNotEmpty()
  data: string;

  /**
   * Obrigatório quando o admin registra (POST /client-transactions).
   * Ignorado na solicitação do cliente (POST /client-transactions/request): vem do token.
   */
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsIn(['Aporte', 'Resgate', 'Rendimento'])
  tipo: 'Aporte' | 'Resgate' | 'Rendimento';

  @IsNumber()
  @IsPositive()
  valor: number;
}
