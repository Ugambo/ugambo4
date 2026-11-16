import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backup, type BackupConfig, latestKey, verify } from './backup';
import { migrate } from './migrator';

const SERVER =
  process.env.TEST_DATABASE_URL ?? 'postgres://rwm:rwm@localhost:5432/rideswithme_test';
const SOURCE = SERVER.replace(/\/[^/?]+(\?|$)/, '/rwm_backup_source$1');
const S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const hasPgDump = (() => {
  try {
    return /\b1[6-9]\b|\b[2-9]\d\b/.test(execSync('pg_dump --version').toString());
  } catch {
    return false;
  }
})();

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'testtesttest',
  },
});
const config: BackupConfig = {
  bucket: `rwm-backups-${Date.now()}`,
  prefix: 'postgres/',
  key: randomBytes(32),
  s3,
  retentionDays: 30,
};

async function admin<T>(fn: (c: Client) => Promise<T>) {
  const c = new Client({ connectionString: SERVER.replace(/\/[^/?]+(\?|$)/, '/postgres$1') });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe.skipIf(!hasPgDump)('backups', () => {
  beforeAll(async () => {
    await admin(async (c) => {
      await c.query('DROP DATABASE IF EXISTS rwm_backup_source WITH (FORCE)');
      await c.query('CREATE DATABASE rwm_backup_source');
    });
    await migrate(SOURCE);
    const db = new Client({ connectionString: SOURCE });
    await db.connect();
    await db.query(`INSERT INTO users (phone_e164) VALUES ('+2348030000999')`);
    await db.end();
    await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
  });
  afterAll(async () => {
    await admin((c) => c.query('DROP DATABASE IF EXISTS rwm_backup_source WITH (FORCE)'));
  });

  it('backs up encrypted, restores into a scratch database and checks it', async () => {
    const key = await backup(SOURCE, config);
    expect(key).toMatch(/^postgres\/\d{4}-\d{2}-\d{2}\/rideswithme-.*\.dump\.enc$/);
    // The stored file is not a readable dump.
    const stored = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const bytes = Buffer.from(await stored.Body!.transformToByteArray());
    expect(bytes.subarray(0, 5).toString()).toBe('RWMB1');
    expect(bytes.includes(Buffer.from('PGDMP'))).toBe(false);

    const report = await verify(SERVER, config, path.join(__dirname, '..', 'migrations'));
    expect(report).toMatchObject({ key, ok: true, users: 1, mismatchedWallets: 0, ledgerSum: 0 });
    expect(report.migrations).toBe(report.expectedMigrations);
  });

  it('refuses a damaged backup before restoring anything', async () => {
    const good = await latestKey(config);
    const stored = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: good }));
    const bytes = Buffer.from(await stored.Body!.transformToByteArray());
    bytes[100] = bytes[100]! ^ 0xff;
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: 'postgres/9999-12-31/rideswithme-damaged.dump.enc',
        Body: bytes,
      }),
    );
    await expect(verify(SERVER, config, path.join(__dirname, '..', 'migrations'))).rejects.toThrow(
      /integrity check/,
    );
    await expect(
      verify(SERVER, { ...config, key: randomBytes(32) }, path.join(__dirname, '..', 'migrations')),
    ).rejects.toThrow(/integrity check/);
  });
});
