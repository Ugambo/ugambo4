import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config';

/**
 * Keyed hash for finding equal values without storing them in plain text
 * (e.g. "is this NIN already registered?"). Same input gives the same hash, so
 * it supports unique indexes; without the key it cannot be reversed by guessing.
 */
@Injectable()
export class LookupHash {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  hash(kind: string, value: string): Buffer {
    return createHmac('sha256', this.config.LOOKUP_HASH_SECRET).update(`${kind}:${value}`).digest();
  }
}
