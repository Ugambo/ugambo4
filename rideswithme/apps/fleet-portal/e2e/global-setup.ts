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
} from '@rideswithme/e2e-support';
import {
  API_LOG,
  API_URL,
  BUS_MANAGER_PHONE,
  DRIVER_PHONE,
  E2E_DATABASE_URL,
  MANAGER_PHONE,
  OTHER_DRIVER_PHONE,
  OTHER_MANAGER_PHONE,
  OUT,
  PORTAL_URL,
  STAFF_PHONE,
  STATE_FILE,
  apiEnv,
  portalEnv,
} from './env';
import { api, rides, totp } from './support';

/** Signs in and completes two-factor set-up through the API, as a staff member would. */
async function signInWithTotp(phone: string): Promise<string> {
  const { token } = await api.signIn(phone);
  const setup = await api.call<{ secret: string }>('/v1/auth/mfa/totp/setup', {
    method: 'POST',
    token,
  });
  await api.call('/v1/auth/mfa/totp/activate', {
    method: 'POST',
    token,
    body: { code: totp(setup.secret) },
  });
  return token;
}

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  await resetDatabase(E2E_DATABASE_URL);
  const env = apiEnv();
  await flushRedis(env.REDIS_URL!);
  const cli = (args: string[]) => {
    const r = spawnSync('node', ['apps/api/dist/cli.js', ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`cli ${args[0]} failed: ${r.stderr}`);
  };
  cli(['seed-city', '--key', 'kano', '--name', 'Kano', '--bbox', '8.40,11.90,8.62,12.10']);
  cli(['grant-role', '--phone', STAFF_PHONE, '--role', 'admin']);

  const apiProc = startApi(env, API_LOG);
  const portalProc = startNextStandalone(
    'fleet-portal',
    3303,
    portalEnv(),
    path.join(OUT, 'portal.log'),
  );
  savePids(path.join(OUT, 'pids.json'), [apiProc, portalProc]);
  await waitForHttp(`${API_URL}/health/live`, 'API', apiProc, OUT);
  await waitForHttp(`${PORTAL_URL}/login`, 'Fleet portal', portalProc, OUT);

  // Staff create two fleets, each with a manager.
  const staff = await signInWithTotp(STAFF_PHONE);
  await api.call('/v1/admin/fleets', {
    method: 'POST',
    token: staff,
    body: { name: 'Kano Express', managerPhone: MANAGER_PHONE },
  });
  await api.call('/v1/admin/fleets', {
    method: 'POST',
    token: staff,
    body: { name: 'Other Fleet', managerPhone: OTHER_MANAGER_PHONE },
  });
  const otherManagerToken = await signInWithTotp(OTHER_MANAGER_PHONE);

  const driver = await rides.approvedDriver({
    phone: DRIVER_PHONE,
    fullName: 'Aminu Bello',
    nin: '12345678911',
    plate: 'KAN100FL',
  });
  const otherDriver = await rides.approvedDriver({
    phone: OTHER_DRIVER_PHONE,
    fullName: 'Sani Musa',
    nin: '12345678912',
    plate: 'KAN200FL',
  });
  // The other fleet's driver joins the other fleet and does a trip there.
  await api.call('/v1/fleet/drivers', {
    method: 'POST',
    token: otherManagerToken,
    body: { phone: OTHER_DRIVER_PHONE },
  });
  const inv = await api.call<{ invitations: { id: string }[] }>('/v1/driver/fleet', {
    token: otherDriver.token,
  });
  await api.call(`/v1/driver/fleet-invitations/${inv.invitations[0]!.id}/accept`, {
    method: 'POST',
    token: otherDriver.token,
  });

  // A bus operator; its manager signs in through the portal in the tests.
  await api.call('/v1/admin/bus-operators', {
    method: 'POST',
    token: staff,
    body: { name: 'Kano Line', managerPhone: BUS_MANAGER_PHONE },
  });

  writeFileSync(STATE_FILE, JSON.stringify({ driver, otherDriver, otherManagerToken }));
}
