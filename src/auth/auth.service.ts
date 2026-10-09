import {
  Injectable,
  Inject,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service'; // ou ClientsService
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { Firestore, Timestamp } from '@google-cloud/firestore'; // <-- Importação corrigida

@Injectable()
export class AuthService {
  private readonly resend: Resend;
  private readonly mailFrom: string;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('FIRESTORE') private readonly db: Firestore, // <-- Injeção padronizada
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'A variável de ambiente RESEND_API_KEY não está definida.',
      );
    }
    this.resend = new Resend(apiKey);
    // Remetente precisa ser de um domínio verificado no Resend.
    // Sem MAIL_FROM, usa o remetente de testes do Resend (só entrega para o email da conta).
    this.mailFrom =
      this.configService.get<string>('MAIL_FROM') ||
      'Valle Consultoria <onboarding@resend.dev>';
  }

  async requestLoginLink(email: string, origin?: string): Promise<void> {
    const user = await this.usersService.findOneByEmail(email); // Garanta que este método existe no seu UsersService
    if (!user) {
      throw new UnauthorizedException('Utilizador não encontrado.');
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await this.db.collection('loginTokens').doc(token).set({
      userId: user.id,
      expires,
    });

    const frontendUrl =
      origin ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:4200';

    const loginLink = `${frontendUrl}/verify-login?token=${token}`;

    const html = `
        <h1>Olá, ${user.name}!</h1>
        <p>Recebemos um pedido de acesso à sua conta.</p>
        <p>Para continuar, por favor clique no link abaixo. Este link é válido por 15 minutos.</p>
        <a href="${loginLink}" style="background-color: #1e462e; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">Entrar na Minha Conta</a>
        <p>Se não solicitou este acesso, pode ignorar este email com segurança.</p>
        <p>Obrigado,<br>Equipa Valle Consultoria</p>
      `;

    try {
      const { error } = await this.resend.emails.send({
        from: this.mailFrom,
        to: email,
        subject: 'Seu Link de Acesso para a Valle Consultoria',
        html,
      });
      if (error) {
        throw new Error(`${error.name}: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao enviar email pelo Resend:', error);
      throw new InternalServerErrorException(
        'Não foi possível enviar o link de login.',
      );
    }
  }

  async verifyLoginToken(token: string): Promise<any> {
    const tokenRef = this.db.collection('loginTokens').doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      throw new UnauthorizedException('Token de login inválido.');
    }

    const { userId, expires } = tokenDoc.data() as {
      userId: string;
      expires: Timestamp;
    }; // <-- Tipo corrigido

    if (new Date() > expires.toDate()) {
      await tokenRef.delete();
      throw new UnauthorizedException(
        'O seu link de login expirou. Por favor, solicite um novo.',
      );
    }

    await tokenRef.delete();

    const userSnapshot = await this.db.collection('users').doc(userId).get();
    if (!userSnapshot.exists) {
      throw new UnauthorizedException(
        'Utilizador associado ao token não encontrado.',
      );
    }

    const user = { id: userSnapshot.id, ...userSnapshot.data() };
    return this.login(user);
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
