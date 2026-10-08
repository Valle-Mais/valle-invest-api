/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  Inject,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from './entities/client.entity';
import { Firestore } from '@google-cloud/firestore';
import { ClientResponseDto } from './dto/client-response.dto';
import { ClientTransactionsService } from 'src/client-transactions/client-transactions.service';

@Injectable()
export class ClientsService {
  private readonly collectionName = 'users'; // A coleção no Firestore é 'users'

constructor(
    @Inject('FIRESTORE') private readonly firestore: Firestore,
    // Injete o serviço de transações
    @Inject(forwardRef(() => ClientTransactionsService))
    private readonly transactionsService: ClientTransactionsService,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    // 1. Verificar se o email já existe (sem alteração)
    const existingUser = await this.firestore
      .collection(this.collectionName)
      .where('email', '==', createClientDto.email)
      .limit(1)
      .get();

    if (!existingUser.empty) {
      throw new ConflictException(
        `O email ${createClientDto.email} já está em uso.`,
      );
    }

    // Guarda o valor do investimento inicial
    const initialInvestment = createClientDto.totalInvestido || 0;

    // 2. CRIA O USUÁRIO COM SALDO ZERO INICIALMENTE
    const newUser: Omit<Client, 'id'> = {
      ...createClientDto,
      joinDate: new Date(),
      status: 'Ativo',
      totalInvestido: 0, // Começa com zero!
    };
    const docRef = await this.firestore
      .collection(this.collectionName)
      .add(newUser);

    // 3. SE HOUVER UM INVESTIMENTO INICIAL, CRIA A TRANSAÇÃO DE APORTE
    if (initialInvestment > 0) {
      
      await this.transactionsService.create(
        {
          clientId: docRef.id,
          data: newUser.joinDate.toISOString(), // Usa a data de cadastro
          tipo: 'Aporte',
          valor: initialInvestment,
        },
        'Aprovado',
      );
    }

    // 4. Busca e retorna o cliente com o saldo já atualizado pela transação
    const finalUserDoc = await docRef.get();
    return {
      id: finalUserDoc.id,
      ...finalUserDoc.data(),
    } as Client;
  }

  async findByEmail(email: string): Promise<Client | null> {
    const query = await this.firestore
      .collection(this.collectionName)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (query.empty) {
      return null; // Retorna nulo se nenhum cliente for encontrado
    }

    const doc = query.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      // Converte o Timestamp do Firestore para um objeto Date do JS
      joinDate: data.joinDate?.toDate
        ? data.joinDate.toDate()
        : new Date(data.joinDate),
    } as Client;
  }

  async findAll(): Promise<ClientResponseDto[]> {
    const snapshot = await this.firestore.collection(this.collectionName).get();
    if (snapshot.empty) {
      return [];
    }

    const allClients = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        joinDate: data.joinDate?.toDate
          ? data.joinDate.toDate()
          : new Date(data.joinDate),
      } as Client;
    });

    const totalPortfolio = allClients
      .filter((client) => client.role === 'client' && client.status === 'Ativo')
      .reduce((sum, client) => sum + (client.totalInvestido || 0), 0);

    // MODIFIQUE O MAP ABAIXO
    const response = allClients.map((client) => {
      let participationPercent = 0;
      if (totalPortfolio > 0 && client.totalInvestido > 0) {
        participationPercent = (client.totalInvestido / totalPortfolio) * 100;
      }

      return {
        id: client?.id || '',
        name: client.name,
        email: client.email,
        joinDate: client.joinDate,
        status: client.status,
        role: client.role,
        totalInvestido: client.totalInvestido,
        participationPercent: participationPercent,
      };
    });

    return response.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findOne(id: string): Promise<Client> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
    }

    return { id: doc.id, ...doc.data() } as Client;
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    await docRef.update({ ...updateClientDto });

    const updatedDoc = await docRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Client;
  }

  async remove(id: string): Promise<void> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
    }

    await docRef.delete();
  }
}
