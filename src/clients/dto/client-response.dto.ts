// src/clients/dto/client-response.dto.ts

// Este DTO representa o objeto que será enviado na resposta da API
export class ClientResponseDto {
  id: string;
  name: string;
  email: string;
  joinDate: Date;
  status: 'Ativo' | 'Inativo';
  role: 'admin' | 'client';
  totalInvestido: number;
  participationPercent: number; // O novo campo
}
