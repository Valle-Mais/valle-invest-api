import { IsDateString, IsNotEmpty } from 'class-validator';

export class CloseDayDto {
  @IsDateString({}, { message: 'A data deve estar no formato ISO 8601 (YYYY-MM-DD).' })
  @IsNotEmpty({ message: 'A data não pode estar vazia.' })
  date: string;
}