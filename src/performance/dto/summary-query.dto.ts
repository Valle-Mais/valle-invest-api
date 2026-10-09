import { IsIn, IsOptional } from 'class-validator';

export class SummaryQueryDto {
  @IsIn(['Dia', 'Mês', '6 meses', 'Ano'])
  @IsOptional()
  period?: string = 'Ano';
}
