import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  inviteTemplate,
  magicLinkTemplate,
  passwordResetTemplate,
} from './mail.templates';

/**
 * Envio de email pelo Resend. Único ponto da API que fala com o provedor.
 *
 * O remetente vem de MAIL_FROM e precisa ser de um domínio verificado no Resend.
 * Sem MAIL_FROM, usa o remetente de testes, que só entrega para a conta Resend.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from =
      this.config.get<string>('MAIL_FROM') ||
      'Valle Consultoria <onboarding@resend.dev>';
    this.frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:4200';
  }

  /** Monta o link para uma rota do front com o token na query. */
  linkTo(path: string, token: string, origin?: string): string {
    const base = (origin || this.frontendUrl).replace(/\/+$/, '');
    return `${base}/${path}?token=${encodeURIComponent(token)}`;
  }

  async sendMagicLink(to: string, name: string, link: string): Promise<void> {
    const { subject, html } = magicLinkTemplate(name, link);
    await this.send(to, subject, html);
  }

  async sendInvite(to: string, name: string, link: string): Promise<void> {
    const { subject, html } = inviteTemplate(name, link);
    await this.send(to, subject, html);
  }

  async sendPasswordReset(
    to: string,
    name: string,
    link: string,
  ): Promise<void> {
    const { subject, html } = passwordResetTemplate(name, link);
    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (error) {
        throw new Error(`${error.name}: ${error.message}`);
      }
    } catch (err) {
      // Loga destinatário e assunto, nunca o corpo (que contém o link com token).
      this.logger.error(
        `Falha ao enviar "${subject}" para ${to}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Não foi possível enviar o email. Tente novamente em instantes.',
      );
    }
  }
}
