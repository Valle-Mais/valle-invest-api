import { IsDateString, IsNumber, IsOptional } from 'class-validator';

export class PreviewFundOperationDto {
  @IsNumber()
  resultado: number;

  /** Data da operação (YYYY-MM-DD). A base do rateio são as transações até essa data, inclusive. */
  @IsOptional()
  @IsDateString()
  data?: string;
}
