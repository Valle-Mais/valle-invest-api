// src/auth/auth.controller.ts
import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RequestLinkDto } from './dto/request-link.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('request-link')
  async requestLoginLink(@Body() requestLinkDto: RequestLinkDto) {
    // CORREÇÃO: Agora passamos tanto o email como a origem para o serviço.
    await this.authService.requestLoginLink(requestLinkDto.email, requestLinkDto.origin);
    return { message: 'Link de login enviado para o seu email.' };
  }
  
  @Post('verify-token')
  async verifyLoginToken(@Body('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Token de verificação em falta.');
    }
    return this.authService.verifyLoginToken(token);
  }
}
