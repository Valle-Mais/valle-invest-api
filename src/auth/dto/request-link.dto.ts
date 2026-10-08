// src/auth/dto/request-link.dto.ts
import { IsEmail, IsUrl, IsOptional } from 'class-validator';

export class RequestLinkDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  origin?: string;
}
