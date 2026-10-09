/**
 * Templates de email em HTML simples, com as cores da marca.
 * Todo texto em pt-BR. Nenhum template recebe token ou senha em claro
 * além do link já montado.
 */

const BRAND_GREEN = '#1e462e';
const BRAND_CREAM = '#f0ead6';

function layout(
  title: string,
  paragraphs: string[],
  cta?: { label: string; href: string },
  footer?: string,
): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px 0;">${p}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:24px 0;"><a href="${cta.href}" style="background-color:${BRAND_GREEN};color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:bold;">${cta.label}</a></p>
       <p style="margin:0 0 12px 0;font-size:12px;color:#64748b;">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${cta.href}</p>`
    : '';
  return `
  <div style="background:${BRAND_CREAM};padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px 0;font-size:22px;color:${BRAND_GREEN};">${title}</h1>
      ${body}
      ${button}
      <p style="margin:24px 0 0 0;">Atenciosamente,<br>Equipe Valle Consultoria</p>
      ${footer ? `<p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">${footer}</p>` : ''}
    </div>
  </div>`;
}

export function magicLinkTemplate(
  name: string,
  link: string,
): { subject: string; html: string } {
  return {
    subject: 'Seu link de acesso à Valle Consultoria',
    html: layout(
      `Olá, ${name}!`,
      [
        'Recebemos um pedido de acesso à sua conta.',
        'Clique no botão abaixo para entrar. Este link vale por 15 minutos.',
      ],
      { label: 'Entrar na minha conta', href: link },
      'Se você não solicitou este acesso, pode ignorar este email com segurança.',
    ),
  };
}

export function inviteTemplate(
  name: string,
  link: string,
): { subject: string; html: string } {
  return {
    subject: 'Defina sua senha de acesso à Valle Consultoria',
    html: layout(
      `Bem-vindo, ${name}!`,
      [
        'Sua conta na plataforma Valle Consultoria está pronta.',
        'Para começar, defina uma senha de acesso pelo botão abaixo. Este link vale por 7 dias.',
        'Depois disso, você entra com seu email e a senha escolhida.',
      ],
      { label: 'Definir minha senha', href: link },
      'Se você não esperava este email, fale com a Valle Consultoria.',
    ),
  };
}

export function passwordResetTemplate(
  name: string,
  link: string,
): { subject: string; html: string } {
  return {
    subject: 'Redefinição de senha na Valle Consultoria',
    html: layout(
      `Olá, ${name}!`,
      [
        'Recebemos um pedido para redefinir a senha da sua conta.',
        'Clique no botão abaixo para escolher uma nova senha. Este link vale por 1 hora.',
      ],
      { label: 'Redefinir minha senha', href: link },
      'Se você não pediu a redefinição, ignore este email. Sua senha atual continua valendo.',
    ),
  };
}
