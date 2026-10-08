import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateFundOperationDto {
  @IsDateString({}, { message: 'A data deve ser uma data válida.' })
  @IsNotEmpty()
  data: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  // Os campos financeiros agora são opcionais
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorInvestido?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorVenda?: number;

  @IsOptional()
  @IsNumber()
  resultado?: number;
}
