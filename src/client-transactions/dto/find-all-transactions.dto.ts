import { IsOptional, IsISO8601, IsString } from 'class-validator';

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
}
