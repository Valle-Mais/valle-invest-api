import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Campos que o próprio usuário pode alterar. Nome, email e papel ficam com o admin. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
