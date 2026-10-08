/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, Inject, Logger, BadRequestException, forwardRef } from '@nestjs/common';
import { CreateClientTransactionDto } from './dto/create-client-transaction.dto';
import { UpdateClientTransactionDto } from './dto/update-client-transaction.dto';
import { ClientTransaction } from './entities/client-transaction.entity';
import { Firestore } from '@google-cloud/firestore';
import { FindAllTransactionsDto } from './dto/find-all-transactions.dto';
import { FundOperationsService } from 'src/fund-operations/fund-operations.service';

@Injectable()
export class ClientTransactionsService {
    private readonly logger = new Logger(ClientTransactionsService.name);

  private readonly collectionName = 'client_transactions';
  private readonly usersCollectionName = 'users';

  constructor(@Inject('FIRESTORE') private readonly firestore: Firestore, 
  @Inject(forwardRef(() => FundOperationsService))
    private readonly fundOperationsService: FundOperationsService,) {}

  private _normalizeDateString(dateInput: string | Date): string {
    if (dateInput instanceof Date) {
      return dateInput.toISOString().split('T')[0];
    }
    if (typeof dateInput === 'string' && dateInput.includes('T')) {
      return dateInput.split('T')[0];
    }
    // Assume que já está no formato 'YYYY-MM-DD'
    return dateInput;
  }
  
  /**
   * Método principal que converte uma string de data para um objeto Date à meia-noite UTC.
   * Agora usa a subfunção de normalização para ser mais robusto.
   */
  private parseDateAsUTC(dateInput: string | Date): Date {
    const normalizedDateString = this._normalizeDateString(dateInput);
    
    const [year, month, day] = normalizedDateString.split('-').map(Number);
    
    // Validação extra para garantir que a string era válida
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        throw new BadRequestException(`Formato de data inválido fornecido: ${dateInput}`);
    }

    return new Date(Date.UTC(year, month - 1, day));
  }

 private async recalculateClientBalance(
    transaction: FirebaseFirestore.Transaction,
    clientId: string,
    userDoc: FirebaseFirestore.DocumentSnapshot, // <-- Recebe o snapshot do cliente
    options: { 
      excludeId?: string; 
      simulateUpdate?: { id: string; dto: Partial<ClientTransaction> };
      simulateCreate?: Omit<ClientTransaction, 'id'>; // <-- ADIÇÃO
    } = {},
  ): Promise<void> {
    
    // 1. Validar dados do cliente (como antes)
    if (!userDoc.exists) {
        throw new NotFoundException(`Cliente com ID ${clientId} não encontrado durante o recálculo.`);
    }
    const userData = userDoc.data();

    // 2. Consultar transações aprovadas (como antes)
    const allTransQuery = this.firestore.collection(this.collectionName)
      .where('clientId', '==', clientId)
      .where('status', '==', 'Aprovado');

    const allTransSnapshot = await transaction.get(allTransQuery);

    // 3. Calcular novo saldo (como antes)
    let newTotalInvestido = 0;
    allTransSnapshot.docs.forEach(doc => {
      if (options.excludeId && doc.id === options.excludeId) {
        return; // Pula a transação que está sendo removida
      }

      let transData = doc.data();

      // Simula a atualização de uma transação existente
      if (options.simulateUpdate && doc.id === options.simulateUpdate.id) {
        transData = { ...transData, ...options.simulateUpdate.dto };
      }
      
      if (transData.status === 'Aprovado') {
        if (transData.tipo === 'Aporte' || transData.tipo === 'Rendimento') {
          newTotalInvestido += transData.valor;
        } else if (transData.tipo === 'Resgate') {
          newTotalInvestido -= transData.valor;
        }
      }
    });
    
    // --- INÍCIO DA ADIÇÃO ---
    // 4. Simular a nova transação (se for 'create' e 'Aprovado')
    if (options.simulateCreate && options.simulateCreate.status === 'Aprovado') {
      const transData = options.simulateCreate;
      if (transData.tipo === 'Aporte' || transData.tipo === 'Rendimento') {
        newTotalInvestido += transData.valor;
      } else if (transData.tipo === 'Resgate') {
        newTotalInvestido -= transData.valor;
      }
    }
    // --- FIM DA ADIÇÃO ---

    // 5. PREPARAR PAYLOAD DE ATUALIZAÇÃO (LÓGICA NOVA)
    const updatePayload: any = { totalInvestido: newTotalInvestido };

    // 6. ATUALIZAR STATUS DO CLIENTE (LÓGICA NOVA)
    if (userData.role === 'client') {
        const newStatus = (newTotalInvestido > 0) ? 'Ativo' : 'Inativo';
        
        if (newStatus !== userData.status) {
            updatePayload.status = newStatus;
        }
    }

    this.logger.log(`Recalculando saldo/status para ${clientId}. Novo total: ${newTotalInvestido}. Payload: ${JSON.stringify(updatePayload)}`);
    
    // 7. Atualizar o documento do cliente
    transaction.update(userDoc.ref, updatePayload);
  }

  /**
   * MÉTODO CREATE (Refatorado para usar recalculateClientBalance)
   */
  async create(createDto: CreateClientTransactionDto, status: 'Pendente' | 'Aprovado'): Promise<ClientTransaction> {
    const userDocRef = this.firestore.collection(this.usersCollectionName).doc(createDto.clientId);
    const newTransactionRef = this.firestore.collection(this.collectionName).doc();

    const newTransactionData: Omit<ClientTransaction, 'id'> = {
      ...createDto,
      data: this.parseDateAsUTC(createDto.data),
      clientName: '', // Será preenchido na transação
      status,
    };

    await this.firestore.runTransaction(async (t) => {
      // --- FASE DE LEITURA ---
      const userDoc = await t.get(userDocRef);
      if (!userDoc.exists) throw new NotFoundException(`Cliente com ID ${createDto.clientId} não encontrado.`);
      
      // Lê todas as transações (necessário para o recalculateClientBalance)
      const allTransQuery = this.firestore.collection(this.collectionName)
          .where('clientId', '==', createDto.clientId)
          .where('status', '==', 'Aprovado');
      await t.get(allTransQuery); // Garante a leitura
      
      // --- FASE DE CÁLCULO ---
      const clientData = userDoc.data();
      newTransactionData.clientName = clientData.name || 'Nome não encontrado';
      
      // Roda o recálculo unificado (Ponto 1 da regra de negócio)
      await this.recalculateClientBalance(t, createDto.clientId, userDoc, {
          simulateCreate: newTransactionData // Passa a transação a ser criada
      });

      // --- FASE DE ESCRITA ---
      t.set(newTransactionRef, newTransactionData);
      // A atualização do cliente é feita dentro do recalculateClientBalance
    });

      const isFluxo =
      newTransactionData.tipo === 'Aporte' ||
      newTransactionData.tipo === 'Resgate';

    // Se a transação foi aprovada E é um Aporte/Resgate
    if (status === 'Aprovado' && isFluxo) {
      this.logger.warn(
        `CREATE: Transação de fluxo aprovada (${newTransactionData.tipo}). Acionando verificação de reprocessamento...`,
      );
      // Ponto 2 da regra de negócio:
      // Esta função (trigger...) JÁ FAZ a verificação de retroatividade
      await this.fundOperationsService.triggerReprocessingIfNecessary(
        newTransactionData.data, // A data da transação
      );
    }

    return { id: newTransactionRef.id, ...newTransactionData };
  }

  /**
   * MÉTODO UPDATE (Corrigido para acionar reprocessamento)
   */
  async update(id: string, updateDto: UpdateClientTransactionDto): Promise<ClientTransaction> {
    const transactionRef = this.firestore.collection(this.collectionName).doc(id);
    
    const initialDoc = await transactionRef.get();
    if (!initialDoc.exists) {
        throw new NotFoundException(`Transação com ID ${id} não encontrada.`);
    }
    const initialData = initialDoc.data() as ClientTransaction;
    const clientId = initialData.clientId;
    const userDocRef = this.firestore.collection(this.usersCollectionName).doc(clientId);

    const updatePayload: Partial<ClientTransaction> = {};
    if (updateDto.data) updatePayload.data = this.parseDateAsUTC(updateDto.data);
    if (updateDto.tipo) updatePayload.tipo = updateDto.tipo;
    if (updateDto.valor !== undefined) updatePayload.valor = updateDto.valor;
    if (updateDto.status) updatePayload.status = updateDto.status;

    // 1. Executar a transação (Atualiza o saldo - Ponto 1 da regra)
    await this.firestore.runTransaction(async (t) => {
        const userDoc = await t.get(userDocRef); 
        
        const allTransQuery = this.firestore.collection(this.collectionName)
            .where('clientId', '==', clientId)
            .where('status', '==', 'Aprovado');
        await t.get(allTransQuery); 

        // Roda o recálculo unificado
        await this.recalculateClientBalance(t, clientId, userDoc, { simulateUpdate: { id, dto: updatePayload } });

        t.update(transactionRef, updatePayload); 
    });

    // 2. Acionar verificação de reprocessamento (Ponto 2 da regra)
    const updatedDoc = await transactionRef.get();
    const finalData = updatedDoc.data() as ClientTransaction;

    const wasApproved = initialData.status === 'Aprovado';
    const isNowApproved = finalData.status === 'Aprovado';
    
    const initialTipo = initialData.tipo;
    const finalTipo = finalData.tipo;

    const wasFluxo = initialTipo === 'Aporte' || initialTipo === 'Resgate';
    const isNowFluxo = finalTipo === 'Aporte' || finalTipo === 'Resgate';

    // Firestore Timestamps precisam ser convertidos para Date
    const initialDataDate = (initialData.data as any).toDate ? (initialData.data as any).toDate() : new Date(initialData.data);
    const finalDataDate = (finalData.data as any).toDate ? (finalData.data as any).toDate() : new Date(finalData.data);

    // Cenário 1: Tornou-se aprovada (Pendente -> Aprovado)
    const becameApproved = !wasApproved && isNowApproved && isNowFluxo;
    
    // Cenário 2: Já estava aprovada e foi editada (valor, data ou tipo mudou)
    const wasEditedWhileApproved = wasApproved && isNowApproved && (wasFluxo || isNowFluxo) && 
        (initialDataDate.getTime() !== finalDataDate.getTime() || 
         initialData.valor !== finalData.valor || 
         initialData.tipo !== finalData.tipo);
    
    if (becameApproved || wasEditedWhileApproved) {
        this.logger.warn(`UPDATE: Transação de fluxo (${finalData.tipo}) APROVADA/MODIFICADA. Acionando verificação...`, { id, becameApproved, wasEditedWhileApproved });
        
        // Devemos reprocessar a partir da data MAIS ANTIGA afetada
        const reprocessDate = (wasEditedWhileApproved && initialDataDate.getTime() < finalDataDate.getTime()) 
            ? initialDataDate // Use a data antiga se ela for anterior
            : finalDataDate;  // Use a data nova em todos os outros casos
            
        await this.fundOperationsService.triggerReprocessingIfNecessary(reprocessDate);
    }

    return { id: updatedDoc.id, ...finalData, data: finalDataDate } as ClientTransaction;
  }

 /**
   * MÉTODO REMOVE (Corrigido para acionar reprocessamento)
   */
  async remove(id: string): Promise<void> {
    const transactionRef = this.firestore.collection(this.collectionName).doc(id);

    const initialDoc = await transactionRef.get();
    if (!initialDoc.exists) {
        throw new NotFoundException(`Transação com ID ${id} não encontrada.`);
    }
    
    const initialData = initialDoc.data() as ClientTransaction;
    const clientId = initialData.clientId;
    const userDocRef = this.firestore.collection(this.usersCollectionName).doc(clientId);

    // 1. Executar a transação (Atualiza o saldo - Ponto 1 da regra)
    await this.firestore.runTransaction(async (t) => {
        const userDoc = await t.get(userDocRef); 

        // Roda o recálculo unificado
        await this.recalculateClientBalance(t, clientId, userDoc, { excludeId: id });

        t.delete(transactionRef); 
    });

    // 2. Acionar verificação de reprocessamento (Ponto 2 da regra)
    const wasApproved = initialData.status === 'Aprovado';
    const wasFluxo = initialData.tipo === 'Aporte' || initialData.tipo === 'Resgate';

    if (wasApproved && wasFluxo) {
      // Firestore Timestamps precisam ser convertidos para Date
      const initialDataDate = (initialData.data as any).toDate ? (initialData.data as any).toDate() : new Date(initialData.data);
      this.logger.warn(
        `REMOVE: Transação de fluxo APROVADA (${initialData.tipo}) removida. Acionando verificação de reprocessamento...`, { id }
      );
      await this.fundOperationsService.triggerReprocessingIfNecessary(
        initialDataDate, // Use a data da transação removida
      );
    }
  }
  
  
  async findAll(queryDto?: FindAllTransactionsDto): Promise<ClientTransaction[]> {
    let query: FirebaseFirestore.Query = this.firestore
      .collection(this.collectionName)
      .orderBy('data', 'desc');

    if (queryDto?.startDate) query = query.where('data', '>=', new Date(queryDto.startDate));
    if (queryDto?.endDate) {
      const end = new Date(queryDto.endDate);
      end.setHours(23, 59, 59, 999);
      query = query.where('data', '<=', end);
    }
    if (queryDto?.clientId) query = query.where('clientId', '==', queryDto.clientId);

    const snapshot = await query.get();
    if (snapshot.empty) return [];
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        data: data.data && typeof data.data.toDate === 'function' 
            ? data.data.toDate() 
            : new Date(data.data),
      } as ClientTransaction;
    });
  }

  async findOne(id: string): Promise<ClientTransaction> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException(`Transação com ID ${id} não encontrada.`);
    }

    return { id: doc.id, ...doc.data() } as ClientTransaction;
  }


async findAllByClientId(clientId: string): Promise<ClientTransaction[]> {
    const snapshot = await this.firestore.collection(this.collectionName)
        .where('clientId', '==', clientId)
        .where('status', '==', 'Aprovado')
        .orderBy('data', 'asc')
        .get();
    
    if (snapshot.empty) {
        return [];
    }

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            data: data.data && typeof data.data.toDate === 'function' 
            ? data.data.toDate() 
            : new Date(data.data),
        } as ClientTransaction
    });
}
async getPendingCount(): Promise<{ count: number }> {
    const query = this.firestore
      .collection(this.collectionName)
      .where('status', '==', 'Pendente');
      
    const snapshot = await query.count().get();
    
    return { count: snapshot.data().count };
  }
}