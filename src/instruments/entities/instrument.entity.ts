export interface Instrument {
  id?: string; // ID do Firestore
  name: string;
  type: string; // Campo agora é um texto livre
  description?: string; // Novo campo opcional
}