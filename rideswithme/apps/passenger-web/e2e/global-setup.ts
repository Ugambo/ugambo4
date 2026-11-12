import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  flushRedis,
  resetDatabase,
  savePids,
  startApi,
  startNextStandalone,
  waitForHttp,
  withDatabase,
} from '@rideswithme/e2e-support';
import {
  API_LOG,
  API_URL,
  DRIVER_FILE,
  DRIVER_PHONE,
  E2E_DATABASE_URL,
  OUT,
  WEB_URL,
  apiEnv,
  webEnv,
} from './env';
import { api } from './support';

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  await resetDatabase(E2E_DATABASE_URL);
  const env = apiEnv();
  await flushRedis(env.REDIS_URL!);

  // Kano with placeholder fares; the fake maps provider has Kano places.
  const seed = spawnSync(
    'node',
    [
      'apps/api/dist/cli.js',
      'seed-city',
      '--key',
      'kano',
      '--name',
      'Kano',
      '--bbox',
      '8.40,11.90,8.62,12.10',
    ],
    { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' },
  );
  if (seed.status !== 0) throw new Error(`seed-city failed: ${seed.stderr}`);

  const apiProc = startApi(env, API_LOG);
  const webProc = startNextStandalone('passenger-web', 3202, webEnv(), path.join(OUT, 'web.log'));
  savePids(path.join(OUT, 'pids.json'), [apiProc, webProc]);
  await waitForHttp(`${API_URL}/health/live`, 'API', apiProc, OUT);
  await waitForHttp(`${WEB_URL}/sign-in`, 'Passenger website', webProc, OUT);

  // One driver, approved through the database (the review flow has its own tests).
  const { token, userId } = await api.submitDriverApplication({
    phone: DRIVER_PHONE,
    fullName: 'Ibrahim Sani',
    nin: '12345678903',
    plate: 'KAN123AA',
  });
  await withDatabase(E2E_DATABASE_URL, async (db) => {
    await db.query(
      `UPDATE driver_documents SET status = 'approved', reviewed_at = now() WHERE driver_user_id = $1`,
      [userId],
    );
    await db.query(
      `UPDATE driver_profiles SET status = 'approved', approved_at = now(), reviewed_at = now() WHERE user_id = $1`,
      [userId],
    );
  });
  writeFileSync(DRIVER_FILE, JSON.stringify({ token }));
}
