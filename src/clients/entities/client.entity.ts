export class Client {
  id?: string;
  name: string;
  email: string;
  joinDate: Date;
  status: 'Ativo' | 'Inativo';
  role: 'admin' | 'client';
  totalInvestido: number;
  participationPercent?: number;
  /** Telefone de contato, opcional. Editável pelo próprio usuário em PATCH /auth/profile. */
  phone?: string;

  /** Hash bcrypt da senha. Nunca sai em resposta da API (ver user.sanitizer.ts). */
  passwordHash?: string;
  passwordSetAt?: Date;
  /** true enquanto o usuário ainda não definiu senha (convite pendente). */
  mustSetPassword?: boolean;
}
