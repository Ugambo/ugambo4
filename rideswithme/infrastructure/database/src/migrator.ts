import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

export const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const NO_TRANSACTION = /^--\s*migrate:no-transaction\s*$/m;
const LOCK_KEY = 72_917_401; // arbitrary constant shared by every runner

export interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationLogger {
  info(message: string): void;
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  const migrations = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const match = FILE_PATTERN.exec(file);
      if (!match?.[1] || !match[2]) {
        throw new Error(`Migration file name must look like 0001_name.sql: ${file}`);
      }
      const sql = readFileSync(join(dir, file), 'utf8');
      return {
        version: match[1],
        name: match[2],
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
  const seen = new Set<string>();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Duplicate migration version ${m.version}`);
    seen.add(m.version);
  }
  return migrations;
}

/**
 * Applies pending migrations in order. Forward-only: to undo a change, write a
 * new migration. A session-level advisory lock stops two runners (for example
 * two containers starting together) from applying migrations at once.
 */
export async function migrate(
  databaseUrl: string,
  logger: MigrationLogger = { info: () => undefined },
  dir = MIGRATIONS_DIR,
): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        name       text NOT NULL,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const done = new Map(rows.map((r) => [r.version, r.checksum]));

    for (const m of loadMigrations(dir)) {
      const existing = done.get(m.version);
      if (existing) {
        if (existing !== m.checksum) {
          throw new Error(
            `Migration ${m.version}_${m.name} was changed after it was applied. ` +
              'Write a new migration instead of editing an applied one.',
          );
        }
        continue;
      }
      const useTransaction = !NO_TRANSACTION.test(m.sql);
      logger.info(`Applying ${m.version}_${m.name}`);
      try {
        if (useTransaction) await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        );
        if (useTransaction) await client.query('COMMIT');
      } catch (err) {
        if (useTransaction) await client.query('ROLLBACK');
        throw new Error(`Migration ${m.version}_${m.name} failed: ${(err as Error).message}`);
      }
      applied.push(`${m.version}_${m.name}`);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

export async function status(databaseUrl: string, dir = MIGRATIONS_DIR) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const exists = await client.query(`SELECT to_regclass('schema_migrations') AS t`);
    const appliedRows = exists.rows[0]?.t
      ? (
          await client.query<{ version: string; applied_at: Date }>(
            'SELECT version, applied_at FROM schema_migrations',
          )
        ).rows
      : [];
    const applied = new Map(appliedRows.map((r) => [r.version, r.applied_at]));
    return loadMigrations(dir).map((m) => ({
      migration: `${m.version}_${m.name}`,
      appliedAt: applied.get(m.version) ?? null,
    }));
  } finally {
    await client.end();
  }
}
