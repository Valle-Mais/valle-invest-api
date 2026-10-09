import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_POLICY_MESSAGE,
} from '../password';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual.' })
  currentPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;
}
