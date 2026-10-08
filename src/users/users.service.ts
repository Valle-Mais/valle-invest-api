import { Injectable, NotFoundException, Inject, ConflictException } from '@nestjs/common';
import { Firestore } from '@google-cloud/firestore';
import { CreateClientDto } from 'src/clients/dto/create-client.dto'; // Ajuste o caminho se necessário
import { UpdateClientDto } from 'src/clients/dto/update-client.dto'; // Ajuste o caminho se necessário
import { Client } from 'src/clients/entities/client.entity'; // Ajuste o caminho se necessário

@Injectable()
export class UsersService {
  private readonly collectionName = 'users';

  constructor(@Inject('FIRESTORE') private readonly firestore: Firestore) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    const existingUser = await this.firestore.collection(this.collectionName)
        .where('email', '==', createClientDto.email)
        .limit(1)
        .get();

    if (!existingUser.empty) {
        throw new ConflictException(`O email ${createClientDto.email} já está em uso.`);
    }

    const newUser: Omit<Client, 'id'> = {
      ...createClientDto,
      joinDate: new Date(),
      status: 'Ativo',
      totalInvestido: createClientDto.totalInvestido || 0,
    };

    const docRef = await this.firestore.collection(this.collectionName).add(newUser);
    
    return {
      id: docRef.id,
      ...newUser
    };
  }

  async findAll(): Promise<Client[]> {
    const snapshot = await this.firestore.collection(this.collectionName).orderBy('name').get();
    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Client));
  }

  async findOne(id: string): Promise<Client> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
    }

    return { id: doc.id, ...doc.data() } as Client;
  }

  // MÉTODO ADICIONADO AQUI
  async findOneByEmail(email: string): Promise<Client | undefined> {
    const snapshot = await this.firestore.collection(this.collectionName)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    const doc = snapshot.docs[0];
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
