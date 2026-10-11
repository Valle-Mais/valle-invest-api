// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './auth-user.interface';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResendInviteDto } from './dto/resend-invite.dto';
import { RequestLinkDto } from './dto/request-link.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** 5 tentativas por minuto por IP nas rotas públicas de autenticação. */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // --- Login com senha -------------------------------------------------

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email, dto.origin);
    return {
      message:
        'Se o email estiver cadastrado, você receberá um link para definir a senha.',
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Senha definida com sucesso. Você já pode entrar.' };
  }

  // --- Área autenticada -------------------------------------------------

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.userId);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.userId, dto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: 'Senha alterada com sucesso.' };
  }

  @Roles('admin')
  @Post('invite/resend')
  @HttpCode(HttpStatus.OK)
  async resendInvite(@Body() dto: ResendInviteDto) {
    await this.authService.sendInvite(dto.userId, dto.origin);
    return { message: 'Convite reenviado.' };
  }

  // --- Magic link (transição) ------------------------------------------

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('request-link')
  async requestLoginLink(@Body() dto: RequestLinkDto) {
    await this.authService.requestLoginLink(dto.email, dto.origin);
    return { message: 'Link de login enviado para o seu email.' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('verify-token')
  async verifyLoginToken(@Body('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Token de verificação ausente.');
    }
    return this.authService.verifyLoginToken(token);
  }
}
