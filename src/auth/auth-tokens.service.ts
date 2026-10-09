import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { createHash, randomBytes } from 'crypto';

export type AuthTokenType = 'invite' | 'reset' | 'magic';

const TTL_MS: Record<AuthTokenType, number> = {
  invite: 7 * 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  magic: 15 * 60 * 1000,
};

interface AuthTokenDoc {
  userId: string;
  type: AuthTokenType;
  expires: Timestamp | Date;
  usedAt: Timestamp | Date | null;
  createdAt: Timestamp | Date;
}

/**
 * Tokens de uso único enviados por email (convite, redefinição de senha, magic link).
 *
 * O valor em claro só existe no link do email. No Firestore fica o SHA-256,
 * usado como id do documento: vazar a coleção não permite usar os tokens.
 */
@Injectable()
export class AuthTokensService {
  private readonly collectionName = 'authTokens';

  constructor(@Inject('FIRESTORE') private readonly db: Firestore) {}

  /** Gera um token novo e devolve o valor em claro para ir no email. */
  async issue(userId: string, type: AuthTokenType): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.db
      .collection(this.collectionName)
      .doc(this.hash(raw))
      .set({
        userId,
        type,
        expires: new Date(Date.now() + TTL_MS[type]),
        usedAt: null,
        createdAt: new Date(),
      } satisfies AuthTokenDoc);
    return raw;
  }

  /**
   * Valida e marca como usado. Lança 401 se não existir, já tiver sido usado,
   * for de outro tipo ou tiver expirado. A mensagem não distingue os casos.
   */
  async consume(
    raw: string,
    allowed: AuthTokenType[],
  ): Promise<{ userId: string; type: AuthTokenType }> {
    const ref = this.db.collection(this.collectionName).doc(this.hash(raw));
    const snap = await ref.get();
    const invalid = new UnauthorizedException(
      'Link inválido ou já utilizado. Solicite um novo.',
    );

    if (!snap.exists) throw invalid;
    const data = snap.data() as AuthTokenDoc;
    if (!allowed.includes(data.type) || data.usedAt) throw invalid;

    if (toDate(data.expires).getTime() < Date.now()) {
      throw new UnauthorizedException('Este link expirou. Solicite um novo.');
    }

    await ref.update({ usedAt: new Date() });
    return { userId: data.userId, type: data.type };
  }

  /** Invalida todos os tokens ativos de um usuário, opcionalmente só de alguns tipos. */
  async invalidateAll(userId: string, types?: AuthTokenType[]): Promise<void> {
    const snap = await this.db
      .collection(this.collectionName)
      .where('userId', '==', userId)
      .get();
    if (snap.empty) return;

    const batch = this.db.batch();
    const now = new Date();
    snap.docs.forEach((doc) => {
      const data = doc.data() as AuthTokenDoc;
      if (data.usedAt) return;
      if (types && !types.includes(data.type)) return;
      batch.update(doc.ref, { usedAt: now });
    });
    await batch.commit();
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}

function toDate(value: Timestamp | Date): Date {
  return value instanceof Date ? value : value.toDate();
}
