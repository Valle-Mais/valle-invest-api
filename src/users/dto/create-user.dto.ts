import { IsEmail, IsString, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsIn(['admin', 'client'])
  role: 'admin' | 'client';
}