import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class FindAllTransactionsDto {
  @IsOptional()
  @IsISO8601(
    {},
    {
      message: 'A data de início deve estar no formato ISO 8601 (YYYY-MM-DD).',
    },
  )
  startDate?: string;

  @IsOptional()
  @IsISO8601(
    {},
    { message: 'A data final deve estar no formato ISO 8601 (YYYY-MM-DD).' },
  )
  endDate?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsIn(['Pendente', 'Aprovado', 'Negado'])
  status?: 'Pendente' | 'Aprovado' | 'Negado';

  /** `operation` anexa a operação do fundo aos rendimentos. */
  @IsOptional()
  @IsIn(['operation'])
  include?: 'operation';

  /** Máximo de itens. Com clientId, o saldo é calculado antes do corte. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
