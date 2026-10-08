import { Injectable, NotFoundException, Inject, ConflictException } from '@nestjs/common';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { Instrument } from './entities/instrument.entity';
import { Firestore } from '@google-cloud/firestore';

@Injectable()
export class InstrumentsService {
  private readonly collectionName = 'instruments';

  constructor(@Inject('FIRESTORE') private readonly firestore: Firestore) {}

  async create(createDto: CreateInstrumentDto): Promise<Instrument> {
    const existing = await this.firestore.collection(this.collectionName)
        .where('name', '==', createDto.name.toUpperCase())
        .limit(1)
        .get();

    if (!existing.empty) {
        throw new ConflictException(`O instrumento ${createDto.name} já existe.`);
    }

    const newInstrument = {
      ...createDto,
      name: createDto.name.toUpperCase(), // Padroniza para maiúsculas
    };

    const docRef = await this.firestore.collection(this.collectionName).add(newInstrument);
    
    return {
      id: docRef.id,
      ...newInstrument
    };
  }

  async findAll(): Promise<Instrument[]> {
    const snapshot = await this.firestore.collection(this.collectionName).orderBy('name').get();
    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Instrument));
  }

  async findOne(id: string): Promise<Instrument> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException(`Instrumento com ID ${id} não encontrado.`);
    }

    return { id: doc.id, ...doc.data() } as Instrument;
  }

  async update(id: string, updateDto: UpdateInstrumentDto): Promise<Instrument> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    
    if (updateDto.name) {
        updateDto.name = updateDto.name.toUpperCase();
    }

    await docRef.update({ ...updateDto });

    const updatedDoc = await docRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Instrument;
  }

  async remove(id: string): Promise<void> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
        throw new NotFoundException(`Instrumento com ID ${id} não encontrado.`);
    }

    await docRef.delete();
  }
}