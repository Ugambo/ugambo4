import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FieldEncryption } from './field-encryption';

describe('FieldEncryption', () => {
  const k1 = randomBytes(32);
  const k2 = randomBytes(32);

  it('round-trips and uses a fresh IV each time', () => {
    const fe = new FieldEncryption(new Map([['k1', k1]]), 'k1');
    const a = fe.encrypt('secret', 'users.totp:1');
    const b = fe.encrypt('secret', 'users.totp:1');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret');
    expect(fe.decrypt(a, 'users.totp:1')).toBe('secret');
  });

  it('fails when the context differs (value moved to another row)', () => {
    const fe = new FieldEncryption(new Map([['k1', k1]]), 'k1');
    const a = fe.encrypt('secret', 'users.totp:1');
    expect(() => fe.decrypt(a, 'users.totp:2')).toThrow();
  });

  it('fails when the ciphertext is tampered with', () => {
    const fe = new FieldEncryption(new Map([['k1', k1]]), 'k1');
    const parts = fe.encrypt('secret', 'ctx').split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => fe.decrypt(parts.join('.'), 'ctx')).toThrow();
  });

  it('decrypts values written with an older key after rotation', () => {
    const old = new FieldEncryption(new Map([['k1', k1]]), 'k1');
    const value = old.encrypt('secret', 'ctx');
    const rotated = new FieldEncryption(
      new Map([
        ['k1', k1],
        ['k2', k2],
      ]),
      'k2',
    );
    expect(rotated.decrypt(value, 'ctx')).toBe('secret');
    expect(rotated.encrypt('x', 'ctx').split('.')[1]).toBe('k2');
  });
});
