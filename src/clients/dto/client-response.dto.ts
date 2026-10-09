// src/clients/dto/client-response.dto.ts

/** Objeto devolvido em GET /clients. Sem nenhum campo de autenticação além de mustSetPassword. */
export class ClientResponseDto {
  id: string;
  name: string;
  email: string;
  joinDate: Date;
  status: 'Ativo' | 'Inativo';
  role: 'admin' | 'client';
  totalInvestido: number;
  participationPercent: number;
  /** true enquanto o usuário não definiu senha; o admin pode reenviar o convite. */
  mustSetPassword: boolean;
}
