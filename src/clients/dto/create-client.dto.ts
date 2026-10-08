import { IsString, IsNotEmpty, IsEmail, IsIn, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateClientDto {
  @IsString({ message: 'O nome deve ser um texto.' })
  @IsNotEmpty({ message: 'O nome não pode estar vazio.' })
  name: string;

  @IsEmail({}, { message: 'Por favor, insira um email válido.' })
  @IsNotEmpty({ message: 'O email não pode estar vazio.' })
  email: string;

  @IsIn(['admin', 'client'], { message: 'O cargo deve ser "admin" ou "client".' })
  role: 'admin' | 'client';

  @IsNumber({}, { message: 'O saldo deve ser um número.' })
  @Min(0, { message: 'O saldo não pode ser negativo.' })
  @IsOptional() // O saldo é opcional na criação, pode começar com 0
  totalInvestido?: number;
}