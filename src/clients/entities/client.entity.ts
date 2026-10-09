export class Client {
  id?: string;
  name: string;
  email: string;
  joinDate: Date;
  status: 'Ativo' | 'Inativo';
  role: 'admin' | 'client';
  totalInvestido: number;
  participationPercent?: number;
}
