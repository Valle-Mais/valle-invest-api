export class Client {
  id?: string;
  name: string;
  email: string;
  joinDate: Date;
  status: 'Ativo' | 'Inativo';
  role: 'admin' | 'client';
  totalInvestido: number;
  participationPercent?: number;

  /** Hash bcrypt da senha. Nunca sai em resposta da API (ver user.sanitizer.ts). */
  passwordHash?: string;
  passwordSetAt?: Date;
  /** true enquanto o usuário ainda não definiu senha (convite pendente). */
  mustSetPassword?: boolean;
}
