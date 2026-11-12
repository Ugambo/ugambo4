import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  flushRedis,
  resetDatabase,
  savePids,
  startApi,
  startNextStandalone,
  waitForHttp,
} from '@rideswithme/e2e-support';
import {
  ADMIN_PHONE,
  ADMIN_URL,
  API_LOG,
  API_URL,
  E2E_DATABASE_URL,
  OUT,
  SECOND_ADMIN_PHONE,
  adminEnv,
  apiEnv,
} from './env';
import { submitDriverApplication } from './support';

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  await resetDatabase(E2E_DATABASE_URL);

  const env = apiEnv();
  await flushRedis(env.REDIS_URL!);
  for (const phone of [ADMIN_PHONE, SECOND_ADMIN_PHONE]) {
    const r = spawnSync(
      'node',
      ['apps/api/dist/cli.js', 'grant-role', '--phone', phone, '--role', 'admin'],
      { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`grant-role failed: ${r.stderr}`);
  }

  const apiProc = startApi(env, API_LOG);
  const adminProc = startNextStandalone(
    'admin-dashboard',
    3101,
    adminEnv(),
    path.join(OUT, 'admin.log'),
  );
  savePids(path.join(OUT, 'pids.json'), [apiProc, adminProc]);

  await waitForHttp(`${API_URL}/health/live`, 'API', apiProc, OUT);
  await waitForHttp(`${ADMIN_URL}/login`, 'Admin dashboard', adminProc, OUT);

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
