import { IsEmail, IsOptional, IsUrl } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Informe um email válido.' })
  email: string;

  /** Origem do front que fez o pedido, para montar o link. Opcional. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  origin?: string;
}
