import { spawn } from 'node:child_process';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Client } from 'pg';

/**
 * Encrypted database backups.
 *
 * File format: "RWMB1" | 16-byte IV | AES-256-CTR ciphertext of a pg_dump
 * custom-format dump | 32-byte HMAC-SHA256 over everything before it. The
 * encryption and MAC keys are derived from BACKUP_ENCRYPTION_KEY (32 bytes,
 * base64) with HKDF. A backup is checked against its MAC before anything is
 * decrypted, so a damaged or tampered file is refused.
 */
const MAGIC = Buffer.from('RWMB1');
const MAC_LENGTH = 32;

export interface BackupConfig {
  bucket: string;
  prefix: string;
  key: Buffer;
  s3: S3Client;
  retentionDays: number;
}

export function backupConfigFromEnv(env = process.env): BackupConfig {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  const key = Buffer.from(need('BACKUP_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes, base64');
  return {
    bucket: need('BACKUP_S3_BUCKET'),
    prefix: (env.BACKUP_S3_PREFIX ?? 'postgres/').replace(/^\/+/, ''),
    key,
    retentionDays: Number(env.BACKUP_RETENTION_DAYS ?? 30),
    s3: new S3Client({
      region: env.BACKUP_S3_REGION ?? 'us-east-1',
      ...(env.BACKUP_S3_ENDPOINT && { endpoint: env.BACKUP_S3_ENDPOINT }),
      forcePathStyle: env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
    }),
  };
}

function keys(master: Buffer) {
  const derive = (info: string) =>
    Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  return { enc: derive('rideswithme-backup-encryption'), mac: derive('rideswithme-backup-mac') };
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${err.trim()}`)),
    );
  });
}

async function encryptFile(src: string, dest: string, master: Buffer) {
  const { enc, mac } = keys(master);
  const iv = randomBytes(16);
  const hmac = createHmac('sha256', mac).update(MAGIC).update(iv);
  const out = createWriteStream(dest);
  out.write(MAGIC);
  out.write(iv);
  const cipher = createCipheriv('aes-256-ctr', enc, iv);
  cipher.on('data', (chunk: Buffer) => hmac.update(chunk));
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) =>
    out.end(hmac.digest(), (err?: Error | null) => (err ? reject(err) : resolve())),
  );
}

async function decryptFile(src: string, dest: string, master: Buffer) {
  const { enc, mac } = keys(master);
  const size = statSync(src).size;
  if (size < MAGIC.length + 16 + MAC_LENGTH) throw new Error('Backup file is too short');
  const fh = await open(src, 'r');
  const head = Buffer.alloc(MAGIC.length + 16);
  await fh.read(head, 0, head.length, 0);
  const tag = Buffer.alloc(MAC_LENGTH);
  await fh.read(tag, 0, MAC_LENGTH, size - MAC_LENGTH);
  await fh.close();
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a RideswithMe backup');
  // Check the MAC over the whole file before decrypting anything.
  const hmac = createHmac('sha256', mac);
  await pipeline(createReadStream(src, { end: size - MAC_LENGTH - 1 }), async function* (source) {
    for await (const chunk of source) hmac.update(chunk as Buffer);
  });
  if (!timingSafeEqual(hmac.digest(), tag))
    throw new Error('Backup failed its integrity check (damaged or wrong key)');
  const iv = head.subarray(MAGIC.length);
  await pipeline(
    createReadStream(src, { start: head.length, end: size - MAC_LENGTH - 1 }),
    createDecipheriv('aes-256-ctr', enc, iv),
    createWriteStream(dest),
  );
}

/** Takes a backup and uploads it; deletes backups older than the retention period. Returns its key. */
export async function backup(
  databaseUrl: string,
  c: BackupConfig,
  now = new Date(),
): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'rwm-backup-'));
  try {
    const dump = path.join(dir, 'db.dump');
    await run('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${dump}`,
      databaseUrl,
    ]);
    const enc = `${dump}.enc`;
    await encryptFile(dump, enc, c.key);
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const key = `${c.prefix}${now.toISOString().slice(0, 10)}/rideswithme-${stamp}.dump.enc`;
    await c.s3.send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: key,
        Body: createReadStream(enc),
        ContentLength: statSync(enc).size,
        ContentType: 'application/octet-stream',
      }),
    );
    await prune(c, now);
    return key;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function list(c: BackupConfig) {
  const out: { key: string; at: Date }[] = [];
  let token: string | undefined;
  do {
    const r = await c.s3.send(
      new ListObjectsV2Command({ Bucket: c.bucket, Prefix: c.prefix, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? [])
      if (o.Key?.endsWith('.dump.enc') && o.LastModified)
        out.push({ key: o.Key, at: o.LastModified });
    token = r.NextContinuationToken;
  } while (token);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

async function prune(c: BackupConfig, now: Date) {
  const cutoff = now.getTime() - c.retentionDays * 86_400_000;
  const all = await list(c);
  // Never delete the newest backup, whatever its age.
  const old = all.slice(0, -1).filter((o) => o.at.getTime() < cutoff);
  if (old.length)
    await c.s3.send(
      new DeleteObjectsCommand({
        Bucket: c.bucket,
        Delete: { Objects: old.map((o) => ({ Key: o.key })) },
      }),
    );
}

export async function latestKey(c: BackupConfig): Promise<string> {
  const all = await list(c);
  const last = all.at(-1);
  if (!last) throw new Error('No backups found');
  return last.key;
}

async function download(c: BackupConfig, key: string, dest: string) {
  const r = await c.s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
  await pipeline(r.Body as Readable, createWriteStream(dest));
}

/** Restores a backup into an existing, empty database. */
export async function restore(targetUrl: string, c: BackupConfig, key: string): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'rwm-restore-'));
  try {
    await download(c, key, path.join(dir, 'b.enc'));
    await decryptFile(path.join(dir, 'b.enc'), path.join(dir, 'b.dump'), c.key);
    await run('pg_restore', [
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      `--dbname=${targetUrl}`,
      path.join(dir, 'b.dump'),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface VerifyReport {
  key: string;
  migrations: number;
  expectedMigrations: number;
  users: number;
  mismatchedWallets: number;
  ledgerSum: number;
  ok: boolean;
}

/**
 * The restore test: restores the newest backup into a scratch database on the
 * given server, checks it (all migrations present, ledger balanced, data
 * there), and drops it again.
 */
export async function verify(
  serverUrl: string,
  c: BackupConfig,
  migrationsDir: string,
): Promise<VerifyReport> {
  const key = await latestKey(c);
  const name = `rwm_restore_check_${Date.now()}`;
  const admin = new Client({
    connectionString: serverUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1'),
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const scratch = serverUrl.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  try {
    await restore(scratch, c, key);
    const db = new Client({ connectionString: scratch });
    await db.connect();
    try {
      const one = async (q: string) => Number((await db.query<{ n: string }>(q)).rows[0]?.n ?? 0);
      const expectedMigrations = readdirSync(migrationsDir).filter((f) =>
        f.endsWith('.sql'),
      ).length;
      const report = {
        key,
        migrations: await one('SELECT count(*) AS n FROM schema_migrations'),
        expectedMigrations,
        users: await one('SELECT count(*) AS n FROM users'),
        mismatchedWallets: await one('SELECT count(*) AS n FROM ledger_balance_mismatches()'),
        ledgerSum: await one('SELECT coalesce(sum(amount_kobo), 0) AS n FROM wallet_transactions'),
      };
      return {
        ...report,
        ok:
          report.migrations === expectedMigrations &&
          report.mismatchedWallets === 0 &&
          report.ledgerSum === 0,
      };
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}

/** Optional dead-man's switch (e.g. healthchecks.io): pinged after each success. */
export async function heartbeat(url: string | undefined) {
  if (!url) return;
  await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
