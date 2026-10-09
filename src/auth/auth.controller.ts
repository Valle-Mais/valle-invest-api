// src/auth/auth.controller.ts
import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RequestLinkDto } from './dto/request-link.dto';
import { Public } from './decorators/public.decorator';

/**
 * Rotas de autenticação. Todas públicas e com rate limit mais apertado
 * que o resto da API (5 requisições por minuto por IP).
 *
 * O registro público foi removido: usuários são criados por um admin
 * em POST /clients.
 */
@Public()
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-link')
  async requestLoginLink(@Body() requestLinkDto: RequestLinkDto) {
    await this.authService.requestLoginLink(
      requestLinkDto.email,
      requestLinkDto.origin,
    );
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
