import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { Firestore } from '@google-cloud/firestore';

const firestoreProvider = {
  provide: 'FIRESTORE',
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    if (admin.apps.length === 0) {
      const firebaseCredentialsBase64 = configService.get<string>('FIREBASE_CREDENTIALS_BASE64');
      if (!firebaseCredentialsBase64) {
        throw new Error('A variável de ambiente FIREBASE_CREDENTIALS_BASE64 não está definida.');
      }
      const decodedCredentials = Buffer.from(firebaseCredentialsBase64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decodedCredentials);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    return admin.firestore();
  },
};

@Module({
  imports: [ConfigModule],
  providers: [firestoreProvider],
  exports: ['FIRESTORE'],
})
export class FirebaseModule {}