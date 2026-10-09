import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateFundOperationDto {
  @IsOptional() @IsDateString() data?: string;
  @IsOptional() @IsString() descricao?: string;
  @IsOptional() @IsNumber() @Min(0) valorInvestido?: number;
  @IsOptional() @IsNumber() @Min(0) valorVenda?: number;

  @IsOptional()
  @IsNumber({}, { message: 'O resultado deve ser um número.' })
  resultado?: number; // CAMPO ADICIONADO
}
