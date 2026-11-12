import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { migrate } from '@rideswithme/database';
import {
  ADMIN_PHONE,
  ADMIN_URL,
  API_LOG,
  API_URL,
  E2E_DATABASE_URL,
  OUT,
  ROOT,
  SECOND_ADMIN_PHONE,
  adminEnv,
  apiEnv,
} from './env';
import { submitDriverApplication } from './support';

async function waitFor(url: string, name: string, proc: ChildProcess) {
  for (let i = 0; i < 120; i++) {
    if (proc.exitCode !== null)
      throw new Error(`${name} exited with code ${proc.exitCode}; see ${OUT}`);
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

async function resetDatabase() {
  const admin = new Client({ connectionString: E2E_DATABASE_URL.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  const dbName = new URL(E2E_DATABASE_URL).pathname.slice(1);
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  await migrate(E2E_DATABASE_URL);
}

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  await resetDatabase();

  const env = apiEnv();
  const cliEnv = { ...process.env, ...env };
  spawnSync('redis-cli', ['-n', '14', 'flushdb']);
  for (const [phone, role] of [
    [ADMIN_PHONE, 'admin'],
    [SECOND_ADMIN_PHONE, 'admin'],
  ] as const) {
    const r = spawnSync(
      'node',
      ['apps/api/dist/cli.js', 'grant-role', '--phone', phone, '--role', role],
      { cwd: ROOT, env: cliEnv, encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`grant-role failed: ${r.stderr}`);
  }

  const apiLog = openSync(API_LOG, 'w');
  const apiProc = spawn('node', ['apps/api/dist/main.js'], {
    cwd: ROOT,
    env: cliEnv,
    stdio: ['ignore', apiLog, apiLog],
  });
  const adminLog = openSync(path.join(OUT, 'admin.log'), 'w');
  // Run the standalone server, as the Docker image does. It needs the static assets beside it.
  const app = path.join(__dirname, '..');
  const standalone = path.join(app, '.next', 'standalone', 'apps', 'admin-dashboard');
  cpSync(path.join(app, '.next', 'static'), path.join(standalone, '.next', 'static'), {
    recursive: true,
  });
  const adminProc = spawn('node', [path.join(standalone, 'server.js')], {
    cwd: standalone,
    env: { ...process.env, ...adminEnv(), PORT: '3101', HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', adminLog, adminLog],
  });
  writeFileSync(path.join(OUT, 'pids.json'), JSON.stringify([apiProc.pid, adminProc.pid]));

  await waitFor(`${API_URL}/health/live`, 'API', apiProc);
  await waitFor(`${ADMIN_URL}/login`, 'Admin dashboard', adminProc);

  // Two submitted applications waiting in the queue.
  await submitDriverApplication({
    phone: '+2348031110001',
    fullName: 'Musa Abdullahi',
    nin: '12345678901',
    plate: 'KTN452XA',
  });
  await submitDriverApplication({
    phone: '+2348031110002',
    fullName: 'Hauwa Garba',
    nin: '12345678902',
    plate: 'KTN777AB',
    category: 'keke_napep',
  });
}
