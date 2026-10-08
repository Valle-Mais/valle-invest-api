/* eslint-disable prettier/prettier */
// src/fund-operations/dto/find-all-fund-operations.dto.ts

import { Type } from 'class-transformer';
import { IsOptional, IsISO8601, IsIn, IsNumberString, IsInt, Min } from 'class-validator';

export class FindAllFundOperationsDto {
  @IsOptional()
  @IsISO8601({}, { message: 'A data de início deve estar no formato ISO 8601 (YYYY-MM-DD).' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'A data final deve estar no formato ISO 8601 (YYYY-MM-DD).' })
  endDate?: string;

  @IsOptional()
  @IsIn(['Entrada', 'Saída'], { message: 'O tipo deve ser "Entrada" ou "Saída".' })
  tipo?: 'Entrada' | 'Saída';

  @IsOptional()
  @IsNumberString({}, { message: 'O valor mínimo deve ser um número.'})
  valorMin?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'O valor máximo deve ser um número.'})
  valorMax?: string;

  @IsOptional()
  @IsIn(['data', 'valor'], { message: "O campo de ordenação deve ser 'data' ou 'valor'."})
  sortBy?: 'data' | 'valor';
  
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: "A ordem de ordenação deve ser 'asc' ou 'desc'."})
  sortOrder?: 'asc' | 'desc';


  @IsOptional()
  @Type(() => Number) // Converte a string da URL para número
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}