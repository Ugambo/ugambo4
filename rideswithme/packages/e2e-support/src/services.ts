import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { Client } from 'pg';
import { migrate } from '@rideswithme/database';

/** The monorepo root (this file is in packages/e2e-support/dist). */
export const ROOT = path.resolve(__dirname, '../../..');

/** Drops, recreates and migrates the test database. */
export async function resetDatabase(url: string): Promise<void> {
  const admin = new Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unexpected database name ${name}`);
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  await migrate(url);
}

/** Runs SQL against the test database (for shortcuts such as approving a driver). */
export async function withDatabase<T>(url: string, fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Clears one Redis database (rate-limit counters from earlier runs) without needing redis-cli. */
export function flushRedis(url: string): Promise<void> {
  const u = new URL(url);
  const db = u.pathname.slice(1) || '0';
  return new Promise((resolve, reject) => {
    const socket = connect(Number(u.port || 6379), u.hostname, () =>
      socket.write(`SELECT ${db}\r\nFLUSHDB\r\nQUIT\r\n`),
    );
    socket.on('error', reject);
    // Read (and ignore) the replies; an unread socket never sees the server close it.
    socket.on('data', () => undefined);
    socket.on('close', () => resolve());
  });
}

/** Waits until the URL answers with anything below 500, or the process exits. */
export async function waitForHttp(url: string, name: string, proc: ChildProcess, logs: string) {
  for (let i = 0; i < 120; i++) {
    if (proc.exitCode !== null)
      throw new Error(`${name} exited with code ${proc.exitCode}; see ${logs}`);
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not start at ${url}`);
}

/** Starts the built API (apps/api/dist/main.js), logging to `log`. */
export function startApi(env: Record<string, string>, log: string): ChildProcess {
  const out = openSync(log, 'w');
  return spawn('node', ['apps/api/dist/main.js'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', out, out],
  });
}

/**
 * Starts a Next.js app's standalone server, as the Docker image runs it. The
 * static assets have to be copied beside it first.
 */
export function startNextStandalone(
  app: string,
  port: number,
  env: Record<string, string>,
  log: string,
): ChildProcess {
  const appDir = path.join(ROOT, 'apps', app);
  const standalone = path.join(appDir, '.next', 'standalone', 'apps', app);
  cpSync(path.join(appDir, '.next', 'static'), path.join(standalone, '.next', 'static'), {
    recursive: true,
  });
  const out = openSync(log, 'w');
  return spawn('node', [path.join(standalone, 'server.js')], {
    cwd: standalone,
    env: { ...process.env, ...env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', out, out],
  });
}

export function savePids(file: string, procs: ChildProcess[]) {
  writeFileSync(file, JSON.stringify(procs.map((p) => p.pid)));
}

export function stopPids(file: string) {
  if (!existsSync(file)) return;
  for (const pid of JSON.parse(readFileSync(file, 'utf8')) as number[]) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}
