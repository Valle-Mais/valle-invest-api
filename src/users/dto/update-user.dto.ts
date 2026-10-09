import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['Ativo', 'Inativo'])
  status?: 'Ativo' | 'Inativo';

  // Adicione esta propriedade
  @IsOptional()
  @IsIn(['admin', 'client'])
  role?: 'admin' | 'client';
}
