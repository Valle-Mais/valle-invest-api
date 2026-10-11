export interface ClientTransaction {
  id?: string; // ID do Firestore
  data: Date;
  clientId: string;
  clientName: string; // Para facilitar a exibição no frontend
  tipo: 'Aporte' | 'Resgate' | 'Rendimento';
  valor: number;
  status: 'Pendente' | 'Aprovado' | 'Negado';
  /** Operação do fundo que gerou o rendimento. */
  operationId?: string;
  /** Taxa da operação (resultado / patrimônio base), só em rendimentos. Fase 1.5. */
  taxa?: number;
  /** Momento em que passou a contar para o rateio (criação já aprovada ou aprovação). */
  approvedAt?: Date;
  /** Saldo do cliente após esta transação. Só em listagens por cliente, só para aprovadas. */
  saldoApos?: number | null;
  /** Operação do fundo resumida, quando pedido com include=operation. */
  operation?: { id: string; descricao: string; data: Date } | null;
}
