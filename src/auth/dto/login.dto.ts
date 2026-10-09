import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um email válido.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a senha.' })
  password: string;
}
