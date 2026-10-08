export interface ClientTransaction {
  id?: string; // ID do Firestore
  data: Date;
  clientId: string;
  clientName: string; // Para facilitar a exibição no frontend
  tipo: 'Aporte' | 'Resgate' | 'Rendimento';
  valor: number;
  status: 'Pendente' | 'Aprovado' | 'Negado';
  operationId?: string; // <-- ADICIONE ESTA LINHA
}