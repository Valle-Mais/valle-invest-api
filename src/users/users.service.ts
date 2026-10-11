import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Firestore } from '@google-cloud/firestore';
import { CreateClientDto } from 'src/clients/dto/create-client.dto';
import { UpdateClientDto } from 'src/clients/dto/update-client.dto';
import { Client } from 'src/clients/entities/client.entity';
import { PublicUser, stripSensitive } from './user.sanitizer';

/** Campos de autenticação que só este serviço escreve. */
export interface AuthFields {
  passwordHash?: string;
  passwordSetAt?: Date;
  mustSetPassword?: boolean;
}

/**
 * Acesso à coleção `users`.
 *
 * Métodos `findRaw*` devolvem o documento inteiro, com `passwordHash`,
 * e são de uso interno (AuthService). Todos os outros devolvem o usuário
 * sem campos sensíveis.
 */
@Injectable()
export class UsersService {
  private readonly collectionName = 'users';

  constructor(@Inject('FIRESTORE') private readonly firestore: Firestore) {}

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

    const newUser: Omit<Client, 'id'> = {
      ...createClientDto,
      joinDate: new Date(),
      status: 'Ativo',
      totalInvestido: createClientDto.totalInvestido || 0,
      mustSetPassword: true,
    };

    const docRef = await this.firestore
      .collection(this.collectionName)
      .add(newUser);
    return stripSensitive({ id: docRef.id, ...newUser });
  }

  async findAll(): Promise<PublicUser<Client>[]> {
    const snapshot = await this.firestore
      .collection(this.collectionName)
      .orderBy('name')
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) =>
      stripSensitive({ id: doc.id, ...doc.data() } as Client),
    );
  }

  async findOne(id: string): Promise<PublicUser<Client>> {
    const user = await this.findRawById(id);
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
    }
    return stripSensitive(user);
  }

  /** Uso interno: inclui passwordHash. */
  async findRawById(id: string): Promise<Client | undefined> {
    const doc = await this.firestore
      .collection(this.collectionName)
      .doc(id)
      .get();
    if (!doc.exists) return undefined;
    return { id: doc.id, ...doc.data() } as Client;
  }

  /** Uso interno: inclui passwordHash. */
  async findRawByEmail(email: string): Promise<Client | undefined> {
    const snapshot = await this.firestore
      .collection(this.collectionName)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) return undefined;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Client;
  }

  /** @deprecated use findRawByEmail (nome antigo mantido para o legado). */
  async findOneByEmail(email: string): Promise<Client | undefined> {
    return this.findRawByEmail(email);
  }

  /** Grava só os campos de autenticação. Não passa pelo DTO público de update. */
  async setAuthFields(id: string, fields: AuthFields): Promise<void> {
    await this.firestore
      .collection(this.collectionName)
      .doc(id)
      .update({ ...fields });
  }

  /** Campos de perfil que o próprio usuário pode alterar. */
  async setProfileFields(
    id: string,
    fields: { phone?: string },
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (fields.phone !== undefined) payload.phone = fields.phone.trim();
    if (Object.keys(payload).length === 0) return;
    await this.firestore
      .collection(this.collectionName)
      .doc(id)
      .update(payload);
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
