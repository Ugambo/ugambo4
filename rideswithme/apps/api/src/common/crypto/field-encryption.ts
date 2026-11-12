import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for sensitive columns (TOTP secrets now; national ID
 * numbers and payout details later). Format: v1.<keyId>.<iv>.<tag>.<ciphertext>
 * with base64url parts. The key id allows key rotation: new values use the
 * active key, old values stay readable while their key is still configured.
 *
 * `context` is bound as additional authenticated data, so a ciphertext copied
 * to another row or column fails to decrypt.
 */
export class FieldEncryption {
  constructor(
    private readonly keys: ReadonlyMap<string, Buffer>,
    private readonly activeKeyId: string,
  ) {
    if (!keys.has(activeKeyId)) throw new Error(`Unknown active encryption key "${activeKeyId}"`);
  }

  encrypt(plaintext: string, context: string): string {
    const key = this.keys.get(this.activeKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', this.activeKeyId, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join('.');
  }

  decrypt(payload: string, context: string): string {
    const [version, keyId, iv, tag, ct] = payload.split('.');
    if (version !== 'v1' || !keyId || !iv || !tag || ct === undefined) {
      throw new Error('Malformed encrypted value');
    }
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Encryption key "${keyId}" is not configured`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

const b64 = (b: Buffer) => b.toString('base64url');
