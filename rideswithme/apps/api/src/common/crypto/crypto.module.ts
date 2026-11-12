import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { FieldEncryption } from './field-encryption';
import { LookupHash } from './lookup-hash';

@Global()
@Module({
  providers: [
    {
      provide: FieldEncryption,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        new FieldEncryption(c.FIELD_ENCRYPTION_KEYS, c.FIELD_ENCRYPTION_ACTIVE_KEY_ID),
    },
    LookupHash,
  ],
  exports: [FieldEncryption, LookupHash],
})
export class CryptoModule {}
