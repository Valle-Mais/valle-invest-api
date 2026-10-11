import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Firestore } from '@google-cloud/firestore';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from './entities/client.entity';
import { ClientResponseDto } from './dto/client-response.dto';
import { ClientTransactionsService } from 'src/client-transactions/client-transactions.service';
import { AuthService } from 'src/auth/auth.service';
import { PublicUser, stripSensitive } from 'src/users/user.sanitizer';

/**
 * Clientes da plataforma. Opera na coleção `users` (mesma do UsersService).
 * Nenhum método devolve `passwordHash`.
 */
@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);
  private readonly collectionName = 'users';

  constructor(
    @Inject('FIRESTORE') private readonly firestore: Firestore,
    @Inject(forwardRef(() => ClientTransactionsService))
    private readonly transactionsService: ClientTransactionsService,
    private readonly authService: AuthService,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<PublicUser<Client>> {
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

    const initialInvestment = createClientDto.totalInvestido || 0;

    // Saldo começa em zero; o aporte inicial vira transação aprovada abaixo.
    const newUser: Omit<Client, 'id'> = {
      ...createClientDto,
      joinDate: new Date(),
      status: 'Ativo',
      totalInvestido: 0,
      mustSetPassword: true,
    };
    const docRef = await this.firestore
      .collection(this.collectionName)
      .add(newUser);

    if (initialInvestment > 0) {
      await this.transactionsService.create(
        {
          clientId: docRef.id,
          data: todayInSaoPaulo(newUser.joinDate),
          tipo: 'Aporte',
          valor: initialInvestment,
        },
        'Aprovado',
      );
    }

    // Convite de primeiro acesso. Falha de email não desfaz o cadastro:
    // o admin pode reenviar pela tela de clientes.
    try {
      await this.authService.sendInvite(docRef.id);
    } catch (err) {
      this.logger.warn(
        `Cliente ${docRef.id} criado, mas o convite não foi enviado: ${(err as Error).message}`,
      );
    }

    const finalUserDoc = await docRef.get();
    return stripSensitive({
      id: finalUserDoc.id,
      ...finalUserDoc.data(),
    } as Client);
  }

  async findByEmail(email: string): Promise<PublicUser<Client> | null> {
    const query = await this.firestore
      .collection(this.collectionName)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (query.empty) return null;

    const doc = query.docs[0];
    const data = doc.data();
    return stripSensitive({
      id: doc.id,
      ...data,
      joinDate: data.joinDate?.toDate
        ? data.joinDate.toDate()
        : new Date(data.joinDate),
    } as Client);
  }

  async findAll(): Promise<ClientResponseDto[]> {
    const snapshot = await this.firestore.collection(this.collectionName).get();
    if (snapshot.empty) return [];

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

    const response = allClients.map((client) => {
      let participationPercent = 0;
      if (totalPortfolio > 0 && client.totalInvestido > 0) {
        participationPercent = (client.totalInvestido / totalPortfolio) * 100;
      }

      // Campos explícitos: nunca espalhar o documento inteiro aqui.
      return {
        id: client?.id || '',
        name: client.name,
        email: client.email,
        joinDate: client.joinDate,
        status: client.status,
        role: client.role,
        totalInvestido: client.totalInvestido,
        participationPercent,
        mustSetPassword: client.mustSetPassword ?? !client.passwordHash,
      };
    });

    return response.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findOne(id: string): Promise<PublicUser<Client>> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
    }

    return stripSensitive({ id: doc.id, ...doc.data() } as Client);
  }

  async update(
    id: string,
    updateClientDto: UpdateClientDto,
  ): Promise<PublicUser<Client>> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    await docRef.update({ ...updateClientDto });

    const updatedDoc = await docRef.get();
    return stripSensitive({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    } as Client);
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

/**
 * Data civil em Brasília (YYYY-MM-DD). O servidor roda em UTC: depois das 21h
 * no Brasil, toISOString() já cairia no dia seguinte.
 */
function todayInSaoPaulo(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
