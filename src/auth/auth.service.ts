import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuthTokensService } from './auth-tokens.service';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { Client } from '../clients/entities/client.entity';
import { PublicUser, stripSensitive } from '../users/user.sanitizer';

export interface SessionResponse {
  access_token: string;
  user: PublicUser<Client>;
}

/** Código devolvido no 403 de login quando o usuário ainda não definiu senha. */
export const MUST_SET_PASSWORD = 'MUST_SET_PASSWORD';

const INVALID_CREDENTIALS = 'Email ou senha inválidos.';

/**
 * Autenticação: login com senha, primeiro acesso por convite, recuperação
 * e troca de senha. O magic link continua disponível durante a transição.
 *
 * Nenhum método loga senha, hash ou token em claro.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly tokens: AuthTokensService,
  ) {}

  // ---------------------------------------------------------------------
  // Login com senha
  // ---------------------------------------------------------------------

  async login(email: string, password: string): Promise<SessionResponse> {
    const user = await this.usersService.findRawByEmail(email);

    if (!user) {
      // Mesmo custo de tempo de "senha errada", para não revelar se o email existe.
      await verifyAgainstDummy(password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!user.passwordHash || user.mustSetPassword) {
      throw new ForbiddenException({
        statusCode: 403,
        code: MUST_SET_PASSWORD,
        message:
          'Você ainda não definiu uma senha. Use o link enviado por email ou peça um novo.',
      });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.issueSession(user);
  }

  // ---------------------------------------------------------------------
  // Convite (primeiro acesso)
  // ---------------------------------------------------------------------

  /**
   * Marca o usuário como "precisa definir senha", invalida convites anteriores
   * e envia um link novo. Usado na criação de cliente, no reenvio pelo admin
   * e na migração em lote.
   */
  async sendInvite(userId: string, origin?: string): Promise<void> {
    const user = await this.usersService.findRawById(userId);
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    await this.usersService.setAuthFields(userId, { mustSetPassword: true });
    await this.tokens.invalidateAll(userId, ['invite']);

    const raw = await this.tokens.issue(userId, 'invite');
    await this.mail.sendInvite(
      user.email,
      user.name,
      this.mail.linkTo('definir-senha', raw, origin),
    );
    this.logger.log(`Convite enviado para ${user.email}`);
  }

  /** Migração: convida todos os usuários. Pausa entre envios por causa do rate limit do Resend. */
  async inviteAll(
    delayMs = 700,
  ): Promise<{ total: number; sent: number; failed: string[] }> {
    const users = await this.usersService.findAll();
    const failed: string[] = [];
    let sent = 0;

    for (const user of users) {
      try {
        await this.sendInvite(user.id);
        sent++;
      } catch (err) {
        failed.push(user.email);
        this.logger.warn(
          `Falha ao convidar ${user.email}: ${(err as Error).message}`,
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    return { total: users.length, sent, failed };
  }

  // ---------------------------------------------------------------------
  // Recuperação e definição de senha
  // ---------------------------------------------------------------------

  /** Sempre resolve, exista o email ou não. */
  async forgotPassword(email: string, origin?: string): Promise<void> {
    const user = await this.usersService.findRawByEmail(email);
    if (!user) {
      this.logger.log('Pedido de redefinição para email desconhecido.');
      return;
    }

    await this.tokens.invalidateAll(user.id, ['reset']);
    const raw = await this.tokens.issue(user.id, 'reset');

    // Quem nunca definiu senha recebe o convite; o link e a tela são os mesmos.
    const link = this.mail.linkTo('definir-senha', raw, origin);
    if (!user.passwordHash || user.mustSetPassword) {
      await this.mail.sendInvite(user.email, user.name, link);
    } else {
      await this.mail.sendPasswordReset(user.email, user.name, link);
    }
  }

  /** Aceita token de convite ou de redefinição. Uso único. */
  async resetPassword(rawToken: string, password: string): Promise<void> {
    const { userId } = await this.tokens.consume(rawToken, ['invite', 'reset']);

    await this.usersService.setAuthFields(userId, {
      passwordHash: await hashPassword(password),
      passwordSetAt: new Date(),
      mustSetPassword: false,
    });

    // Qualquer outro link pendente deixa de valer.
    await this.tokens.invalidateAll(userId);
    this.logger.log(`Senha definida para o usuário ${userId}`);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findRawById(userId);
    if (!user?.passwordHash) {
      throw new ForbiddenException(
        'Defina uma senha pelo link enviado por email antes de alterá-la.',
      );
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    await this.usersService.setAuthFields(userId, {
      passwordHash: await hashPassword(newPassword),
      passwordSetAt: new Date(),
      mustSetPassword: false,
    });
    await this.tokens.invalidateAll(userId);
  }

  // ---------------------------------------------------------------------
  // Sessão
  // ---------------------------------------------------------------------

  async updateProfile(
    userId: string,
    fields: { phone?: string },
  ): Promise<PublicUser<Client>> {
    await this.usersService.setProfileFields(userId, fields);
    return this.me(userId);
  }

  async me(userId: string): Promise<PublicUser<Client>> {
    const user = await this.usersService.findRawById(userId);
    if (!user) throw new UnauthorizedException();
    return stripSensitive(user);
  }

  issueSession(user: Client): SessionResponse {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: stripSensitive(user),
    };
  }

  // ---------------------------------------------------------------------
  // Magic link (transição; remover ao fim da Fase 5)
  // ---------------------------------------------------------------------

  async requestLoginLink(email: string, origin?: string): Promise<void> {
    const user = await this.usersService.findRawByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    const raw = await this.tokens.issue(user.id, 'magic');
    await this.mail.sendMagicLink(
      user.email,
      user.name,
      this.mail.linkTo('verify-login', raw, origin),
    );
  }

  async verifyLoginToken(rawToken: string): Promise<SessionResponse> {
    const { userId } = await this.tokens.consume(rawToken, ['magic']);
    const user = await this.usersService.findRawById(userId);
    if (!user) {
      throw new UnauthorizedException(
        'Usuário associado ao link não encontrado.',
      );
    }
    return this.issueSession(user);
  }
}
