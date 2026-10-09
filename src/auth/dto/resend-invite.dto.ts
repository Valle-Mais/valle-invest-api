import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class ResendInviteDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  origin?: string;
}
