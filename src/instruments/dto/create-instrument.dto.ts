import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateInstrumentDto {
  @IsString({ message: 'O nome deve ser um texto.' })
  @IsNotEmpty({ message: 'O nome não pode estar vazio.' })
  name: string; // Ex: "PETR4", "BTC/USD"

  @IsString({ message: 'O tipo deve ser um texto.' })
  @IsNotEmpty({ message: 'O tipo não pode estar vazio.' })
  type: string; // Campo agora é um texto livre

  @IsString({ message: 'A descrição deve ser um texto.' })
  @IsOptional() // Descrição é opcional
  description?: string;
}
